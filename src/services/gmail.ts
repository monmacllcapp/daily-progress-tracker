/**
 * Gmail API Service
 *
 * Browser-based Gmail integration using REST APIs.
 * Fetches, classifies, and manages emails via Google Identity Services auth.
 */

import { googleFetch, isGoogleConnected } from './google-auth';
import type { TitanDatabase } from '../db';
import type { EmailTier, EmailStatus } from '../types/schema';
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
    maxResults: number = 20,
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
    maxResults: number = 20
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
            is_newsletter: isNewsletter,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        newCount++;
    }

    console.log(`[Gmail] Synced ${newCount} new emails from inbox`);
    return newCount;
}
