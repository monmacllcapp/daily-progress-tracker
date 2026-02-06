import type { Email, EmailTier } from '../types/schema';
import type { DetectedPattern } from './email-pattern-analyzer';
import type { TitanDatabase } from '../db';
import { archiveMessage } from './gmail';
import { isGoogleConnected } from './google-auth';

export interface EmailRule {
  id: string;
  createdAt: string;
  matchCriteria: {
    field: 'domain' | 'sender' | 'subject_contains';
    value: string;
  };
  action: 'archive' | 'reclassify';
  actionTier?: EmailTier;
  description: string;
  appliedCount: number;
  isActive: boolean;
}

export interface PendingAction {
  emailId: string;
  gmailId: string;
  from: string;
  subject: string;
  ruleId: string;
  ruleDescription: string;
  action: 'archive' | 'reclassify';
  actionTier?: EmailTier;
}

const STORAGE_KEY = 'titan_email_rules_v1';

function loadRules(): EmailRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRules(rules: EmailRule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function getRules(): EmailRule[] {
  return loadRules();
}

export function addRule(pattern: DetectedPattern): EmailRule {
  const rules = loadRules();
  // Avoid duplicating identical rules
  const existing = rules.find(
    r => r.matchCriteria.field === pattern.matchCriteria.field &&
      r.matchCriteria.value === pattern.matchCriteria.value &&
      r.action === pattern.suggestedAction
  );
  if (existing) {
    existing.isActive = true;
    saveRules(rules);
    return existing;
  }

  const rule: EmailRule = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    matchCriteria: { ...pattern.matchCriteria },
    action: pattern.suggestedAction,
    actionTier: pattern.suggestedTier,
    description: pattern.description,
    appliedCount: 0,
    isActive: true,
  };
  rules.push(rule);
  saveRules(rules);
  return rule;
}

export function deleteRule(ruleId: string): void {
  const rules = loadRules().filter(r => r.id !== ruleId);
  saveRules(rules);
}

export function toggleRule(ruleId: string): void {
  const rules = loadRules();
  const rule = rules.find(r => r.id === ruleId);
  if (rule) {
    rule.isActive = !rule.isActive;
    saveRules(rules);
  }
}

function extractSenderAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).toLowerCase().trim();
}

function extractDomainFromAddress(from: string): string {
  const addr = extractSenderAddress(from);
  const at = addr.lastIndexOf('@');
  return at >= 0 ? addr.slice(at + 1) : '';
}

function ruleMatchesEmail(rule: EmailRule, email: Email): boolean {
  switch (rule.matchCriteria.field) {
    case 'domain':
      return extractDomainFromAddress(email.from) === rule.matchCriteria.value;
    case 'sender':
      return extractSenderAddress(email.from) === rule.matchCriteria.value;
    case 'subject_contains':
      return email.subject.toLowerCase().includes(rule.matchCriteria.value.toLowerCase());
    default:
      return false;
  }
}

export function generatePendingActions(emails: Email[]): PendingAction[] {
  const rules = loadRules().filter(r => r.isActive);
  if (rules.length === 0) return [];

  const pending: PendingAction[] = [];
  const matched = new Set<string>();

  for (const email of emails) {
    // Skip already-processed emails
    if (email.status === 'archived' || email.status === 'snoozed') continue;

    for (const rule of rules) {
      // Skip if action would be redundant
      if (rule.action === 'archive' && email.status === 'archived') continue;
      if (rule.action === 'reclassify') {
        const effectiveTier = email.tier_override || email.tier;
        if (effectiveTier === rule.actionTier) continue;
      }

      if (ruleMatchesEmail(rule, email) && !matched.has(email.id)) {
        matched.add(email.id);
        pending.push({
          emailId: email.id,
          gmailId: email.gmail_id,
          from: email.from,
          subject: email.subject,
          ruleId: rule.id,
          ruleDescription: rule.description,
          action: rule.action,
          actionTier: rule.actionTier,
        });
        break; // one action per email, first matching rule wins
      }
    }
  }

  return pending;
}

export async function applyPendingAction(db: TitanDatabase, action: PendingAction): Promise<void> {
  const doc = await db.emails.findOne(action.emailId).exec();
  if (!doc) return;

  if (action.action === 'archive') {
    if (isGoogleConnected()) {
      await archiveMessage(action.gmailId);
    }
    await doc.patch({ status: 'archived', updated_at: new Date().toISOString() });
  } else if (action.action === 'reclassify' && action.actionTier) {
    await doc.patch({ tier_override: action.actionTier, updated_at: new Date().toISOString() });
  }

  // Increment applied count
  const rules = loadRules();
  const rule = rules.find(r => r.id === action.ruleId);
  if (rule) {
    rule.appliedCount++;
    saveRules(rules);
  }
}

export async function applyAllPending(db: TitanDatabase, actions: PendingAction[]): Promise<number> {
  let count = 0;
  for (const action of actions) {
    try {
      await applyPendingAction(db, action);
      count++;
    } catch (err) {
      console.error('[RulesEngine] Failed to apply action:', err);
    }
  }
  return count;
}
