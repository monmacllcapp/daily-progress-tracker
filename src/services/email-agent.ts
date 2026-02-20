/**
 * Email Agent — Background Intelligence Coordinator
 *
 * Runs autonomously to keep the inbox at zero. Coordinates:
 * - Auto-apply rules to new/existing emails
 * - Auto-archive stale social/unsubscribe emails (>24h untouched)
 * - Follow-up nudge engine for unreplied urgent emails
 * - Platform email auto-categorization (GitHub, Render, Supabase, etc.)
 * - AI draft generation for reply_urgent emails
 * - Snooze unsnooze checks
 *
 * Zero cost — uses local Ollama for all AI inference.
 */

import type { TitanDatabase } from '../db';
import type { Email, EmailTier } from '../types/schema';
import { isGoogleConnected } from './google-auth';
import { archiveMessage } from './gmail';
import { getRules, generatePendingActions, applyAllPending } from './email-rules-engine';
import { checkSnoozedEmails } from './email-snooze';
import { scoreAllEmails } from './email-scorer';
import { scanForUnrepliedEmails } from './email-reply-checker';
import { draftResponse } from './email-classifier';
import { detectPlatformEmail, type PlatformEmailResult } from './platform-email-detector';

// --- Types ---

export interface AgentStats {
  lastRun: string | null;
  rulesApplied: number;
  autoArchived: number;
  nudgesGenerated: number;
  draftsGenerated: number;
  platformCategorized: number;
  snoozesChecked: number;
  totalRuns: number;
}

export interface FollowUpNudge {
  emailId: string;
  from: string;
  subject: string;
  tier: EmailTier;
  receivedAt: string;
  hoursSinceReceived: number;
  message: string;
}

// --- State ---

let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let dbRef: TitanDatabase | null = null;

const AGENT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STALE_SOCIAL_HOURS = 24; // Auto-archive social/unsubscribe after 24h
const URGENT_NUDGE_HOURS = 4; // Nudge for unreplied reply_urgent after 4h
const NEEDED_NUDGE_HOURS = 24; // Nudge for unreplied reply_needed after 24h

const stats: AgentStats = {
  lastRun: null,
  rulesApplied: 0,
  autoArchived: 0,
  nudgesGenerated: 0,
  draftsGenerated: 0,
  platformCategorized: 0,
  snoozesChecked: 0,
  totalRuns: 0,
};

const nudges: FollowUpNudge[] = [];

// --- Core agent tasks ---

/**
 * Task 1: Auto-apply rules to inbox emails.
 * Scans all non-archived emails and applies matching rules.
 */
async function taskApplyRules(db: TitanDatabase): Promise<number> {
  const rules = getRules();
  if (rules.length === 0) return 0;

  const docs = await db.emails.find({
    selector: { status: { $nin: ['archived', 'snoozed'] } },
  }).exec();

  const emails = docs.map((d) => d.toJSON() as Email);
  const pending = generatePendingActions(emails);

  if (pending.length === 0) return 0;

  const applied = await applyAllPending(db, pending);
  console.log(`[EmailAgent] Applied ${applied} rules`);
  return applied;
}

/**
 * Task 2: Auto-archive stale social/unsubscribe emails.
 * Emails in social or unsubscribe tier that haven't been touched in 24h.
 */
async function taskAutoArchiveStale(db: TitanDatabase): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_SOCIAL_HOURS * 60 * 60 * 1000).toISOString();

  const docs = await db.emails.find({
    selector: {
      status: { $nin: ['archived', 'snoozed', 'replied'] },
      received_at: { $lt: cutoff },
    },
  }).exec();

  let archived = 0;
  for (const doc of docs) {
    const email = doc.toJSON() as Email;
    const effectiveTier: EmailTier = email.tier_override || email.tier;

    if (effectiveTier !== 'social' && effectiveTier !== 'unsubscribe') continue;

    // Archive in Gmail if connected
    if (isGoogleConnected()) {
      try {
        await archiveMessage(email.gmail_id);
      } catch (err) {
        console.warn(`[EmailAgent] Failed to archive in Gmail: ${email.gmail_id}`, err);
        continue;
      }
    }

    await doc.patch({ status: 'archived', updated_at: new Date().toISOString() });
    archived++;
  }

  if (archived > 0) {
    console.log(`[EmailAgent] Auto-archived ${archived} stale social/unsubscribe emails`);
  }
  return archived;
}

/**
 * Task 3: Follow-up nudge engine.
 * Scans for unreplied emails and generates nudge signals.
 */
async function taskFollowUpNudges(db: TitanDatabase): Promise<number> {
  const now = Date.now();
  nudges.length = 0; // Clear previous nudges

  const docs = await db.emails.find({
    selector: {
      status: { $nin: ['archived', 'snoozed', 'replied', 'waiting'] },
    },
  }).exec();

  for (const doc of docs) {
    const email = doc.toJSON() as Email;
    const effectiveTier: EmailTier = email.tier_override || email.tier;
    const hoursSince = (now - new Date(email.received_at).getTime()) / (1000 * 60 * 60);

    if (effectiveTier === 'reply_urgent' && hoursSince >= URGENT_NUDGE_HOURS) {
      nudges.push({
        emailId: email.id,
        from: email.from,
        subject: email.subject,
        tier: effectiveTier,
        receivedAt: email.received_at,
        hoursSinceReceived: Math.round(hoursSince),
        message: `Urgent: "${email.subject}" from ${extractName(email.from)} — ${Math.round(hoursSince)}h without reply`,
      });
    } else if (effectiveTier === 'reply_needed' && hoursSince >= NEEDED_NUDGE_HOURS) {
      nudges.push({
        emailId: email.id,
        from: email.from,
        subject: email.subject,
        tier: effectiveTier,
        receivedAt: email.received_at,
        hoursSinceReceived: Math.round(hoursSince),
        message: `Needs reply: "${email.subject}" from ${extractName(email.from)} — ${Math.round(hoursSince)}h`,
      });
    }
  }

  // Sort urgent first, then by hours since received (oldest first)
  nudges.sort((a, b) => {
    if (a.tier === 'reply_urgent' && b.tier !== 'reply_urgent') return -1;
    if (b.tier === 'reply_urgent' && a.tier !== 'reply_urgent') return 1;
    return b.hoursSinceReceived - a.hoursSinceReceived;
  });

  if (nudges.length > 0) {
    console.log(`[EmailAgent] Generated ${nudges.length} follow-up nudges`);
  }
  return nudges.length;
}

/**
 * Task 4: Platform email categorization.
 * Detects GitHub, Render, Supabase, etc. notifications and auto-categorizes.
 */
async function taskPlatformCategorization(db: TitanDatabase): Promise<number> {
  const docs = await db.emails.find({
    selector: {
      status: { $nin: ['archived', 'snoozed'] },
      tier_override: { $exists: false },
    },
  }).exec();

  let categorized = 0;

  for (const doc of docs) {
    const email = doc.toJSON() as Email;
    const result = detectPlatformEmail(email.from, email.subject, email.snippet);

    if (!result) continue;

    // Auto-archive boilerplate platform emails
    if (result.autoArchive) {
      if (isGoogleConnected()) {
        try {
          await archiveMessage(email.gmail_id);
        } catch { /* continue even if Gmail archive fails */ }
      }
      await doc.patch({
        status: 'archived',
        tier_override: result.suggestedTier,
        updated_at: new Date().toISOString(),
      });
      categorized++;
    } else if (result.suggestedTier !== email.tier) {
      // Reclassify critical platform emails (e.g., deploy failures → reply_urgent)
      await doc.patch({
        tier_override: result.suggestedTier,
        updated_at: new Date().toISOString(),
      });
      categorized++;
    }
  }

  if (categorized > 0) {
    console.log(`[EmailAgent] Platform-categorized ${categorized} emails`);
  }
  return categorized;
}

/**
 * Task 5: Auto-draft responses for reply_urgent emails without drafts.
 */
async function taskAutoDraft(db: TitanDatabase): Promise<number> {
  const docs = await db.emails.find({
    selector: {
      status: { $nin: ['archived', 'snoozed', 'replied'] },
    },
  }).exec();

  let drafted = 0;

  for (const doc of docs) {
    const email = doc.toJSON() as Email;
    if (email.ai_draft) continue; // Already has a draft

    const effectiveTier: EmailTier = email.tier_override || email.tier;
    if (effectiveTier !== 'reply_urgent') continue;

    try {
      const draft = await draftResponse(email.from, email.subject, email.snippet);
      if (draft) {
        await doc.patch({ ai_draft: draft, updated_at: new Date().toISOString() });
        drafted++;
      }
    } catch {
      // AI unavailable — skip silently
    }
  }

  if (drafted > 0) {
    console.log(`[EmailAgent] Auto-drafted ${drafted} responses`);
  }
  return drafted;
}

// --- Helpers ---

function extractName(from: string): string {
  const match = from.match(/^([^<]+)</);
  return match ? match[1].trim().replace(/"/g, '') : from.split('@')[0];
}

// --- Agent lifecycle ---

/**
 * Run all agent tasks in sequence.
 */
async function runAgentCycle(): Promise<void> {
  if (isRunning || !dbRef) return;
  isRunning = true;

  const db = dbRef;

  try {
    console.log('[EmailAgent] Starting intelligence cycle...');

    // Check snoozed emails first (lightweight)
    const unsnoozed = await checkSnoozedEmails(db);
    stats.snoozesChecked += unsnoozed;

    // Platform categorization (before rules, so rules see updated tiers)
    const platformCount = await taskPlatformCategorization(db);
    stats.platformCategorized += platformCount;

    // Apply user-defined rules
    const rulesApplied = await taskApplyRules(db);
    stats.rulesApplied += rulesApplied;

    // Auto-archive stale social/unsubscribe
    const autoArchived = await taskAutoArchiveStale(db);
    stats.autoArchived += autoArchived;

    // Score any unscored emails
    await scoreAllEmails(db);

    // Follow-up nudges
    const nudgeCount = await taskFollowUpNudges(db);
    stats.nudgesGenerated = nudgeCount; // Replace, not accumulate (current snapshot)

    // Auto-draft for urgent emails (only if AI available)
    const drafts = await taskAutoDraft(db);
    stats.draftsGenerated += drafts;

    stats.lastRun = new Date().toISOString();
    stats.totalRuns++;

    console.log(`[EmailAgent] Cycle #${stats.totalRuns} complete: ${rulesApplied} rules, ${autoArchived} archived, ${nudgeCount} nudges, ${drafts} drafts`);
  } catch (err) {
    console.error('[EmailAgent] Cycle failed:', err);
  } finally {
    isRunning = false;
  }
}

// --- Public API ---

/**
 * Start the email agent background loop.
 * Safe to call multiple times — only one instance runs.
 */
export function startEmailAgent(db: TitanDatabase): void {
  if (intervalId) return; // Already running

  dbRef = db;
  console.log('[EmailAgent] Starting background intelligence (every 5 min)');

  // Run first cycle after a brief delay (let app settle)
  setTimeout(() => {
    runAgentCycle();
  }, 10_000);

  // Then run on interval
  intervalId = setInterval(runAgentCycle, AGENT_INTERVAL_MS);
}

/**
 * Stop the email agent background loop.
 */
export function stopEmailAgent(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  dbRef = null;
  isRunning = false;
  console.log('[EmailAgent] Stopped');
}

/**
 * Force-run a single agent cycle immediately.
 */
export async function runEmailAgentNow(db: TitanDatabase): Promise<void> {
  dbRef = db;
  await runAgentCycle();
}

/**
 * Get current agent stats.
 */
export function getAgentStats(): Readonly<AgentStats> {
  return { ...stats };
}

/**
 * Get current follow-up nudges.
 */
export function getFollowUpNudges(): readonly FollowUpNudge[] {
  return nudges;
}

/**
 * Check if the agent is currently running a cycle.
 */
export function isAgentRunning(): boolean {
  return isRunning;
}

/**
 * Check if the agent background loop is active.
 */
export function isAgentStarted(): boolean {
  return intervalId !== null;
}
