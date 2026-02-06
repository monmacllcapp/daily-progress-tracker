/**
 * Email Reply Checker
 *
 * Detects whether emails have been replied to by checking Gmail thread labels.
 * Used to surface unreplied urgent emails for follow-up.
 */

import { getThread } from './gmail';
import { isGoogleConnected } from './google-auth';
import type { TitanDatabase } from '../db';
import type { Email } from '../types/schema';

export interface ReplyCheckResult {
    emailId: string;
    gmailId: string;
    threadId: string;
    hasReply: boolean;
}

/**
 * Check if a thread contains a sent message (indicating we replied).
 */
export async function checkThreadReplyStatus(threadId: string): Promise<boolean> {
    if (!isGoogleConnected()) return false;

    try {
        const thread = await getThread(threadId);
        return thread.messages.some(msg => msg.labelIds?.includes('SENT'));
    } catch {
        return false;
    }
}

/**
 * Batch check reply status for multiple emails.
 * Skips emails without thread_id or already checked recently.
 */
export async function batchCheckReplies(
    db: TitanDatabase,
    emails: Email[]
): Promise<ReplyCheckResult[]> {
    const results: ReplyCheckResult[] = [];
    const now = new Date().toISOString();

    for (const email of emails) {
        if (!email.thread_id) continue;

        // Skip if checked within the last 4 hours
        if (email.reply_checked_at) {
            const lastChecked = new Date(email.reply_checked_at).getTime();
            if (Date.now() - lastChecked < 4 * 60 * 60 * 1000) continue;
        }

        const hasReply = await checkThreadReplyStatus(email.thread_id);

        results.push({
            emailId: email.id,
            gmailId: email.gmail_id,
            threadId: email.thread_id,
            hasReply,
        });

        // Update DB with check timestamp and status
        const doc = await db.emails.findOne(email.id).exec();
        if (doc) {
            const patch: Record<string, unknown> = {
                reply_checked_at: now,
                updated_at: now,
            };
            if (hasReply && email.status !== 'replied') {
                patch.status = 'replied';
            }
            await doc.patch(patch);
        }
    }

    return results;
}

/**
 * Scan for unreplied emails that need follow-up.
 * Checks reply_urgent and reply_needed tiers from the last N days.
 */
export async function scanForUnrepliedEmails(
    db: TitanDatabase,
    daysBack: number = 7
): Promise<{ unreplied: Email[]; checkedCount: number; repliedCount: number }> {
    if (!isGoogleConnected()) return { unreplied: [], checkedCount: 0, repliedCount: 0 };

    const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    const docs = await db.emails.find({
        selector: {
            received_at: { $gte: cutoff },
            status: { $nin: ['archived', 'replied', 'snoozed'] },
        }
    }).exec();

    // Filter to reply tiers
    const replyEmails = docs
        .map(doc => doc.toJSON() as Email)
        .filter(e => {
            const effectiveTier = e.tier_override || e.tier;
            return effectiveTier === 'reply_urgent' || effectiveTier === 'reply_needed';
        });

    const results = await batchCheckReplies(db, replyEmails);

    const repliedCount = results.filter(r => r.hasReply).length;
    const unreplied = replyEmails.filter(e =>
        !results.find(r => r.emailId === e.id)?.hasReply
    );

    return {
        unreplied,
        checkedCount: results.length,
        repliedCount,
    };
}
