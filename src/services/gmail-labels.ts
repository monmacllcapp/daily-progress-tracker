/**
 * Gmail Label Service
 *
 * Manages bidirectional label sync between Titan and Gmail.
 * Maps Titan tiers/statuses to Gmail label names and vice versa.
 */

import { googleFetch, isGoogleConnected } from './google-auth';
import type { EmailTier, EmailStatus } from '../types/schema';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Maps Titan tier/status keys to Gmail label names */
export const TITAN_TO_GMAIL_LABEL: Record<string, string> = {
    // Tiers (classification)
    reply_urgent: '1 REPLY-URGENT',
    reply_needed: '1.5 TO REPLY NON-URGENT',
    to_review: '2 TO REVIEW',
    important_not_urgent: '2.5 NON URGENT-IMPORTANT',
    unsure: '6 NOT SURE',
    unsubscribe: '7 UNSUBSCRIBE',
    social: '8 SOCIAL',
    // Statuses (workflow)
    waiting: "3 I'M WAITING FOR RESPONSE",
    replied: '4 REPLIED',
    archived: '5 ARCHIVE',
    reviewed: '5 REVIEWED',
};

/** Reverse mapping: Gmail label name → Titan field + value */
export const GMAIL_LABEL_TO_TITAN: Record<string, { field: 'tier' | 'status'; value: string }> = {
    '1 REPLY-URGENT': { field: 'tier', value: 'reply_urgent' },
    '1.5 TO REPLY NON-URGENT': { field: 'tier', value: 'reply_needed' },
    '2 TO REVIEW': { field: 'tier', value: 'to_review' },
    '2.5 NON URGENT-IMPORTANT': { field: 'tier', value: 'important_not_urgent' },
    '6 NOT SURE': { field: 'tier', value: 'unsure' },
    '7 UNSUBSCRIBE': { field: 'tier', value: 'unsubscribe' },
    '8 SOCIAL': { field: 'tier', value: 'social' },
    "3 I'M WAITING FOR RESPONSE": { field: 'status', value: 'waiting' },
    '4 REPLIED': { field: 'status', value: 'replied' },
    '5 ARCHIVE': { field: 'status', value: 'archived' },
    '5 REVIEWED': { field: 'status', value: 'reviewed' },
};

/** All Titan-managed Gmail label names */
const TITAN_LABEL_NAMES = new Set(Object.values(TITAN_TO_GMAIL_LABEL));

/** Label ID cache: Gmail label name → label ID */
let labelCache: Map<string, string> | null = null;

interface GmailLabel {
    id: string;
    name: string;
    type?: string;
}

/** Fetch all Gmail labels and build name→ID cache */
export async function fetchLabelMap(): Promise<Map<string, string>> {
    if (!isGoogleConnected()) throw new Error('Not connected to Google');

    const resp = await googleFetch(`${GMAIL_BASE}/labels`);
    if (!resp.ok) throw new Error(`Gmail labels fetch failed: ${resp.status}`);

    const data: { labels: GmailLabel[] } = await resp.json();
    const map = new Map<string, string>();

    for (const label of data.labels) {
        map.set(label.name, label.id);
    }

    labelCache = map;
    return map;
}

/** Get label ID by name. Creates the label in Gmail if it doesn't exist. */
export async function getLabelId(labelName: string): Promise<string> {
    if (!labelCache) await fetchLabelMap();

    const cached = labelCache!.get(labelName);
    if (cached) return cached;

    // Create the label in Gmail
    const resp = await googleFetch(`${GMAIL_BASE}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: labelName,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
        }),
    });

    if (!resp.ok) throw new Error(`Gmail create label failed: ${resp.status}`);

    const created: GmailLabel = await resp.json();
    labelCache!.set(created.name, created.id);
    return created.id;
}

/** Apply a Titan label to a Gmail message */
export async function applyTitanLabel(
    messageId: string,
    titanKey: string
): Promise<void> {
    const labelName = TITAN_TO_GMAIL_LABEL[titanKey];
    if (!labelName) {
        console.warn(`[GmailLabels] No Gmail label mapping for key: ${titanKey}`);
        return;
    }

    const labelId = await getLabelId(labelName);

    const resp = await googleFetch(`${GMAIL_BASE}/messages/${messageId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addLabelIds: [labelId] }),
    });

    if (!resp.ok) throw new Error(`Gmail apply label failed: ${resp.status}`);
}

/** Remove all Titan-managed labels from a Gmail message */
export async function clearTitanLabels(
    messageId: string,
    currentLabelIds: string[]
): Promise<void> {
    if (!labelCache) await fetchLabelMap();

    // Find which of the current labels are Titan-managed
    const titanLabelIds: string[] = [];
    for (const [name, id] of labelCache!.entries()) {
        if (TITAN_LABEL_NAMES.has(name) && currentLabelIds.includes(id)) {
            titanLabelIds.push(id);
        }
    }

    if (titanLabelIds.length === 0) return;

    const resp = await googleFetch(`${GMAIL_BASE}/messages/${messageId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: titanLabelIds }),
    });

    if (!resp.ok) throw new Error(`Gmail clear labels failed: ${resp.status}`);
}

/** Read Gmail labels on a message and determine Titan tier/status */
export function readTitanLabelsFromMessage(
    gmailLabelIds: string[]
): { tier?: EmailTier; status?: EmailStatus } | null {
    if (!labelCache) return null;

    // Build reverse ID→name map from cache
    const idToName = new Map<string, string>();
    for (const [name, id] of labelCache.entries()) {
        idToName.set(id, name);
    }

    let tier: EmailTier | undefined;
    let status: EmailStatus | undefined;

    for (const labelId of gmailLabelIds) {
        const labelName = idToName.get(labelId);
        if (!labelName) continue;

        const mapping = GMAIL_LABEL_TO_TITAN[labelName];
        if (!mapping) continue;

        if (mapping.field === 'tier') {
            tier = mapping.value as EmailTier;
        } else if (mapping.field === 'status') {
            status = mapping.value as EmailStatus;
        }
    }

    if (!tier && !status) return null;
    return { tier, status };
}

/** Move an email through the pipeline: remove old label, apply new */
export async function transitionLabel(
    messageId: string,
    fromKey: string,
    toKey: string
): Promise<void> {
    const fromLabel = TITAN_TO_GMAIL_LABEL[fromKey];
    const toLabel = TITAN_TO_GMAIL_LABEL[toKey];

    if (!toLabel) {
        console.warn(`[GmailLabels] No Gmail label mapping for target key: ${toKey}`);
        return;
    }

    const toId = await getLabelId(toLabel);
    const removeLabelIds: string[] = [];

    if (fromLabel) {
        if (!labelCache) await fetchLabelMap();
        const fromId = labelCache!.get(fromLabel);
        if (fromId) removeLabelIds.push(fromId);
    }

    const resp = await googleFetch(`${GMAIL_BASE}/messages/${messageId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            addLabelIds: [toId],
            removeLabelIds,
        }),
    });

    if (!resp.ok) throw new Error(`Gmail transition label failed: ${resp.status}`);
}

/** Invalidate the label cache (e.g., after creating/deleting labels) */
export function invalidateLabelCache(): void {
    labelCache = null;
}
