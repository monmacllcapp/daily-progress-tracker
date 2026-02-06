/**
 * Email Scoring Engine
 *
 * Computes a 0-100 priority score for each email based on
 * sender reputation, content signals, thread participation, and category.
 */

import type { TitanDatabase } from '../db';
import type { Email, EmailTier } from '../types/schema';

export interface SenderStats {
  totalEmails: number;
  repliedCount: number;
  archivedCount: number;
}

/**
 * Query the database for stats about a specific sender address.
 */
export async function computeSenderStats(
  db: TitanDatabase,
  senderAddress: string
): Promise<SenderStats> {
  const docs = await db.emails
    .find({ selector: { from: { $regex: senderAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } } })
    .exec();

  let repliedCount = 0;
  let archivedCount = 0;

  for (const doc of docs) {
    const email = doc.toJSON() as Email;
    if (email.status === 'replied') repliedCount++;
    if (email.status === 'archived') archivedCount++;
  }

  return {
    totalEmails: docs.length,
    repliedCount,
    archivedCount,
  };
}

/**
 * Pure function: compute a 0-100 score for an email.
 *
 * Breakdown:
 *   - Sender reputation (30 pts): reply ratio from stats
 *   - Content signals (25 pts): urgency keywords, question marks, re: depth
 *   - Thread participation (20 pts): bonus if email is in a replied thread
 *   - Category boost (30 pts): reply_urgent=30, reply_needed=22, to_review=15, important_not_urgent=10, unsure=8, social=3, unsubscribe=0
 */
export function calculateEmailScore(
  email: Email,
  senderStats: SenderStats
): number {
  let score = 0;

  // --- Sender reputation (0-30) ---
  if (senderStats.totalEmails > 0) {
    const replyRatio = senderStats.repliedCount / senderStats.totalEmails;
    score += Math.round(replyRatio * 30);
  }

  // --- Content signals (0-25) ---
  const subjectLower = (email.subject || '').toLowerCase();
  const snippetLower = (email.snippet || '').toLowerCase();
  const combined = subjectLower + ' ' + snippetLower;

  const urgencyKeywords = ['urgent', 'asap', 'deadline', 'critical', 'important', 'action required', 'time sensitive'];
  let contentScore = 0;
  for (const kw of urgencyKeywords) {
    if (combined.includes(kw)) {
      contentScore += 5;
      break; // cap at one keyword hit
    }
  }

  // Question marks suggest a question needing response
  const questionCount = (email.subject || '').split('?').length - 1;
  if (questionCount > 0) contentScore += Math.min(questionCount * 5, 10);

  // Re: depth indicates active conversation
  const reMatch = subjectLower.match(/^(re:\s*)+/);
  if (reMatch) {
    const depth = (reMatch[0].match(/re:/g) || []).length;
    contentScore += Math.min(depth * 3, 10);
  }

  score += Math.min(contentScore, 25);

  // --- Thread participation (0-20) ---
  if (email.status === 'replied') {
    score += 20;
  } else if (email.status === 'drafted') {
    score += 10;
  }

  // --- Category boost (0-25) ---
  const effectiveTier: EmailTier = email.tier_override || email.tier;
  const tierScores: Record<EmailTier, number> = {
    reply_urgent: 30,
    reply_needed: 22,
    to_review: 15,
    important_not_urgent: 10,
    unsure: 8,
    social: 3,
    unsubscribe: 0,
  };
  score += tierScores[effectiveTier] ?? 0;

  // --- Unreplied boost ---
  // Emails that have been checked but not yet replied to get priority bumped
  if (email.reply_checked_at && email.status !== 'replied' && email.status !== 'waiting') {
    if (effectiveTier === 'reply_urgent') score += 15;
    else if (effectiveTier === 'reply_needed') score += 10;
  }

  // Clamp 0-100
  return Math.max(0, Math.min(100, score));
}

/**
 * Score all emails that don't have a score yet.
 * Caches sender stats per unique sender address.
 * Returns the number of emails scored.
 */
export async function scoreAllEmails(db: TitanDatabase): Promise<number> {
  const docs = await db.emails.find().exec();
  const senderCache = new Map<string, SenderStats>();
  let count = 0;

  for (const doc of docs) {
    const email = doc.toJSON() as Email;
    if (email.score !== undefined && email.score !== null) continue;

    // Extract raw email address from "Name <addr>" format
    const addrMatch = email.from.match(/<([^>]+)>/);
    const senderAddress = addrMatch ? addrMatch[1] : email.from;

    if (!senderCache.has(senderAddress)) {
      senderCache.set(senderAddress, await computeSenderStats(db, senderAddress));
    }

    const stats = senderCache.get(senderAddress)!;
    const score = calculateEmailScore(email, stats);

    await doc.patch({ score, updated_at: new Date().toISOString() });
    count++;
  }

  console.log(`[EmailScorer] Scored ${count} emails`);
  return count;
}
