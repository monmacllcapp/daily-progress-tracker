/**
 * Gmail API Service
 *
 * Browser-based Gmail integration using REST APIs.
 * Fetches, classifies, and manages emails via Google Identity Services auth.
 */

import { googleFetch, isGoogleConnected } from './google-auth';
import type { TitanDatabase } from '../db';
import type { Email, EmailTier, EmailStatus } from '../types/schema';
import { applyTitanLabel, readTitanLabelsFromMessage, fetchLabelMap } from './gmail-labels';
import { draftResponse } from './email-classifier';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailMessage {
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    payload: {
        headers: Array<{ name: string; value: string }>;
        mimeType: string;
        body?: { data?: string; size: number };
        parts?: Array<{
            mimeType: string;
            body?: { data?: string; size: number };
        }>;
    };
    internalDate: string;
}

interface GmailListResponse {
    messages?: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
    resultSizeEstimate: number;
}

function getHeader(msg: GmailMessage, name: string): string {
    return msg.payload.headers.find(
        h => h.name.toLowerCase() === name.toLowerCase()
    )?.value || '';
}

/**
 * Fetch a list of recent message IDs from Gmail.
 */
export async function listMessages(
    maxResults: number = 100,
    query: string = 'in:inbox'
): Promise<Array<{ id: string; threadId: string }>> {
    if (!isGoogleConnected()) return [];

    const params = new URLSearchParams({
        maxResults: String(maxResults),
        q: query,
    });

    const resp = await googleFetch(`${GMAIL_BASE}/messages?${params}`);
    if (!resp.ok) throw new Error(`Gmail list failed: ${resp.status}`);

    const data: GmailListResponse = await resp.json();
    return data.messages || [];
}

/**
 * Fetch full message details by ID.
 */
export async function getMessage(messageId: string): Promise<GmailMessage> {
    const resp = await googleFetch(`${GMAIL_BASE}/messages/${messageId}?format=full`);
    if (!resp.ok) throw new Error(`Gmail get message failed: ${resp.status}`);
    return resp.json();
}

/**
 * Decode a base64url-encoded string (as used in Gmail API).
 */
function decodeBase64Url(data: string): string {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(
        atob(base64)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
    );
}

/**
 * Extract the message body (HTML preferred, plain text fallback) from a GmailMessage payload.
 */
function extractBody(payload: GmailMessage['payload']): { html: string | null; text: string | null } {
    let html: string | null = null;
    let text: string | null = null;

    // Single-part message
    if (payload.body?.data && payload.body.size > 0) {
        const decoded = decodeBase64Url(payload.body.data);
        if (payload.mimeType === 'text/html') html = decoded;
        else text = decoded;
    }

    // Multi-part message — recurse into parts
    if (payload.parts) {
        for (const part of payload.parts) {
            if (part.body?.data && part.body.size > 0) {
                const decoded = decodeBase64Url(part.body.data);
                if (part.mimeType === 'text/html' && !html) html = decoded;
                else if (part.mimeType === 'text/plain' && !text) text = decoded;
            }
            // Handle nested multipart (e.g., multipart/alternative inside multipart/mixed)
            if ('parts' in part) {
                const nested = extractBody(part as unknown as GmailMessage['payload']);
                if (nested.html && !html) html = nested.html;
                if (nested.text && !text) text = nested.text;
            }
        }
    }

    return { html, text };
}

/**
 * Fetch the full body content of an email by its Gmail message ID.
 * Returns HTML if available, otherwise plain text.
 */
export async function getMessageBody(gmailId: string): Promise<{ html: string | null; text: string | null }> {
    if (!isGoogleConnected()) throw new Error('Not connected to Google');
    const msg = await getMessage(gmailId);
    return extractBody(msg.payload);
}

/**
 * Archive a message (remove INBOX label).
 */
export async function archiveMessage(messageId: string): Promise<void> {
    const resp = await googleFetch(`${GMAIL_BASE}/messages/${messageId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
    });
    if (!resp.ok) throw new Error(`Gmail archive failed: ${resp.status}`);
}

/**
 * Send an email reply.
 */
export async function sendReply(
    threadId: string,
    to: string,
    subject: string,
    body: string,
    inReplyTo?: string
): Promise<string> {
    const headers = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset=utf-8`,
    ];
    if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);

    const raw = headers.join('\r\n') + '\r\n\r\n' + body;
    const encoded = btoa(unescape(encodeURIComponent(raw)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const resp = await googleFetch(`${GMAIL_BASE}/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encoded, threadId }),
    });
    if (!resp.ok) throw new Error(`Gmail send failed: ${resp.status}`);
    const data = await resp.json();
    return data.id;
}

/**
 * Extract unsubscribe link from email headers.
 */
export function extractUnsubscribeLink(msg: GmailMessage): string | null {
    const header = getHeader(msg, 'List-Unsubscribe');
    if (!header) return null;

    // Extract URL from <url> or mailto: format
    const urlMatch = header.match(/<(https?:\/\/[^>]+)>/);
    return urlMatch ? urlMatch[1] : null;
}

/**
 * Fetch a Gmail thread (metadata only) for reply detection.
 */
export async function getThread(threadId: string): Promise<{ id: string; messages: Array<{ id: string; labelIds: string[] }> }> {
    const resp = await googleFetch(`${GMAIL_BASE}/threads/${threadId}?format=metadata&metadataHeaders=From`);
    if (!resp.ok) throw new Error(`Gmail get thread failed: ${resp.status}`);
    return resp.json();
}

/**
 * Sync Gmail inbox to local RxDB.
 * Label-first classification: reads existing Gmail labels, falls back to AI classify.
 * Auto-drafts replies for reply_urgent emails.
 * Returns count of new emails added.
 */
export async function syncGmailInbox(
    db: TitanDatabase,
    classifyFn: (from: string, subject: string, snippet: string, labels: string[]) => Promise<EmailTier>,
    maxResults: number = 100
): Promise<number> {
    // Ensure label cache is populated for bidirectional sync
    try { await fetchLabelMap(); } catch { /* not connected or labels fail — proceed without */ }

    const messageRefs = await listMessages(maxResults);
    let newCount = 0;

    for (const ref of messageRefs) {
        // Skip if already stored
        const existing = await db.emails.findOne({
            selector: { gmail_id: ref.id }
        }).exec();
        if (existing) continue;

        const msg = await getMessage(ref.id);
        const from = getHeader(msg, 'From');
        const subject = getHeader(msg, 'Subject');
        const gmailLabelIds = msg.labelIds || [];

        // Label-first: check if user already labeled in Gmail
        const titanMapping = readTitanLabelsFromMessage(gmailLabelIds);

        let tier: EmailTier;
        if (titanMapping?.tier) {
            tier = titanMapping.tier;
        } else {
            // AI classify → apply Gmail label
            tier = await classifyFn(from, subject, msg.snippet, gmailLabelIds);
            await applyTitanLabel(ref.id, tier).catch(() => {});
        }

        let status: EmailStatus = titanMapping?.status || (gmailLabelIds.includes('UNREAD') ? 'unread' : 'read');
        let aiDraft: string | undefined;

        // Auto-draft for reply_urgent emails
        if (tier === 'reply_urgent') {
            const draft = await draftResponse(from, subject, msg.snippet).catch(() => null);
            if (draft) {
                aiDraft = draft;
                status = 'drafted';
            }
        }

        // Extract newsletter headers
        const listId = getHeader(msg, 'List-ID') || undefined;
        const listUnsubscribe = getHeader(msg, 'List-Unsubscribe');
        let unsubscribeUrl: string | undefined;
        let unsubscribeMailto: string | undefined;
        if (listUnsubscribe) {
            const urlMatch = listUnsubscribe.match(/<(https?:\/\/[^>]+)>/);
            if (urlMatch) unsubscribeUrl = urlMatch[1];
            const mailtoMatch = listUnsubscribe.match(/<(mailto:[^>]+)>/);
            if (mailtoMatch) unsubscribeMailto = mailtoMatch[1];
        }
        const isNewsletter = !!(listId || unsubscribeUrl || unsubscribeMailto);

        // RFC 8058: List-Unsubscribe-Post header indicates one-click support
        const listUnsubscribePost = getHeader(msg, 'List-Unsubscribe-Post');
        const unsubscribeOneClick = !!listUnsubscribePost && listUnsubscribePost.toLowerCase().includes('list-unsubscribe=one-click');

        await db.emails.insert({
            id: crypto.randomUUID(),
            gmail_id: ref.id,
            thread_id: ref.threadId,
            from,
            subject,
            snippet: msg.snippet,
            tier,
            status,
            ai_draft: aiDraft,
            received_at: new Date(parseInt(msg.internalDate)).toISOString(),
            labels: gmailLabelIds,
            list_id: listId,
            unsubscribe_url: unsubscribeUrl,
            unsubscribe_mailto: unsubscribeMailto,
            unsubscribe_one_click: unsubscribeOneClick,
            is_newsletter: isNewsletter,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        newCount++;
    }

    console.log(`[Gmail] Synced ${newCount} new emails from inbox`);
    return newCount;
}

/**
 * Resync Gmail labels for existing emails.
 * Checks if the user reclassified emails in Gmail and applies those changes locally.
 * This enables bidirectional learning — organize in Gmail, and the app picks it up.
 * Returns count of emails updated.
 */
export async function resyncGmailLabels(db: TitanDatabase): Promise<number> {
    if (!isGoogleConnected()) return 0;

    // Ensure label cache is populated
    try { await fetchLabelMap(); } catch { return 0; }

    const docs = await db.emails.find().exec();
    let updateCount = 0;

    for (const doc of docs) {
        const email = doc.toJSON() as Email;
        if (!email.gmail_id) continue;

        try {
            // Fetch current labels from Gmail (metadata only, lightweight)
            const resp = await googleFetch(`${GMAIL_BASE}/messages/${email.gmail_id}?format=metadata&metadataHeaders=From`);
            if (!resp.ok) continue;

            const msg: { labelIds?: string[] } = await resp.json();
            const gmailLabelIds = msg.labelIds || [];

            const titanMapping = readTitanLabelsFromMessage(gmailLabelIds);
            if (!titanMapping) continue;

            const currentTier = email.tier_override || email.tier;
            const currentStatus = email.status;
            const patch: Record<string, unknown> = {};

            // If Gmail labels indicate a different tier, update the override
            if (titanMapping.tier && titanMapping.tier !== currentTier) {
                patch.tier_override = titanMapping.tier;
            }

            // If Gmail labels indicate a different status, update it
            // But don't override local workflow states like 'drafted' or 'snoozed'
            if (titanMapping.status && titanMapping.status !== currentStatus &&
                !['drafted', 'snoozed'].includes(currentStatus)) {
                patch.status = titanMapping.status;
            }

            if (Object.keys(patch).length > 0) {
                patch.updated_at = new Date().toISOString();
                await doc.patch(patch);
                updateCount++;
            }
        } catch {
            // Skip individual message errors (deleted, permission issues, etc.)
            continue;
        }
    }

    console.log(`[Gmail] Label resync updated ${updateCount} emails from Gmail labels`);
    return updateCount;
}
