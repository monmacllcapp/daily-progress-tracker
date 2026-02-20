import type { EmailTier } from '../types/schema';
import type { EmailAction } from './email-action-logger';

export interface DetectedPattern {
  id: string;
  type: 'domain-action' | 'sender-action' | 'subject-keyword-action';
  description: string;
  matchCriteria: {
    field: 'domain' | 'sender' | 'subject_contains';
    value: string;
  };
  suggestedAction: 'archive' | 'reclassify';
  suggestedTier?: EmailTier;
  confidence: number;
  evidenceCount: number;
  totalForCriteria: number;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'are', 'was',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'your', 'you', 'we', 'our', 'my',
  'me', 'i', 're', 'fwd', 'fw', 'no', 'not', 'all', 'new', 'get',
  'just', 'about', 'up', 'out', 'if', 'so', 'can', 'one', 'been',
  'more', 'when', 'who', 'what', 'how', 'now', 'than', 'its',
]);

function extractSenderAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).toLowerCase().trim();
}

function majorityAction(actions: EmailAction[]): { action: 'archive' | 'reclassify'; tier?: EmailTier; count: number } | null {
  const counts: Record<string, number> = {};
  const tierCounts: Record<string, Record<string, number>> = {};

  for (const a of actions) {
    if (a.action === 'archive' || a.action === 'reclassify') {
      counts[a.action] = (counts[a.action] || 0) + 1;
      if (a.action === 'reclassify' && a.newTier) {
        if (!tierCounts[a.action]) tierCounts[a.action] = {};
        tierCounts[a.action][a.newTier] = (tierCounts[a.action][a.newTier] || 0) + 1;
      }
    }
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [action, count] of Object.entries(counts)) {
    if (count > bestCount) { best = action; bestCount = count; }
  }

  if (!best || bestCount < 2) return null;

  if (best === 'reclassify' && tierCounts['reclassify']) {
    let bestTier: string | null = null;
    let bestTierCount = 0;
    for (const [tier, count] of Object.entries(tierCounts['reclassify'])) {
      if (count > bestTierCount) { bestTier = tier; bestTierCount = count; }
    }
    return { action: 'reclassify', tier: bestTier as EmailTier, count: bestCount };
  }

  return { action: best as 'archive' | 'reclassify', count: bestCount };
}

function detectDomainPatterns(actions: EmailAction[]): DetectedPattern[] {
  const byDomain = new Map<string, EmailAction[]>();
  for (const a of actions) {
    if (!a.domain) continue;
    const arr = byDomain.get(a.domain) || [];
    arr.push(a);
    byDomain.set(a.domain, arr);
  }

  const patterns: DetectedPattern[] = [];
  for (const [domain, domainActions] of byDomain) {
    const result = majorityAction(domainActions);
    if (!result) continue;

    const actionLabel = result.action === 'archive'
      ? `Archive all emails from ${domain}`
      : `Move all emails from ${domain} to ${result.tier}`;

    patterns.push({
      id: crypto.randomUUID(),
      type: 'domain-action',
      description: actionLabel,
      matchCriteria: { field: 'domain', value: domain },
      suggestedAction: result.action,
      suggestedTier: result.tier,
      confidence: result.count / domainActions.length,
      evidenceCount: result.count,
      totalForCriteria: domainActions.length,
    });
  }
  return patterns;
}

function detectSenderPatterns(actions: EmailAction[]): DetectedPattern[] {
  const bySender = new Map<string, EmailAction[]>();
  for (const a of actions) {
    const addr = extractSenderAddress(a.from);
    const arr = bySender.get(addr) || [];
    arr.push(a);
    bySender.set(addr, arr);
  }

  const patterns: DetectedPattern[] = [];
  for (const [sender, senderActions] of bySender) {
    const result = majorityAction(senderActions);
    if (!result) continue;

    const actionLabel = result.action === 'archive'
      ? `Archive all emails from ${sender}`
      : `Move all emails from ${sender} to ${result.tier}`;

    patterns.push({
      id: crypto.randomUUID(),
      type: 'sender-action',
      description: actionLabel,
      matchCriteria: { field: 'sender', value: sender },
      suggestedAction: result.action,
      suggestedTier: result.tier,
      confidence: result.count / senderActions.length,
      evidenceCount: result.count,
      totalForCriteria: senderActions.length,
    });
  }
  return patterns;
}

function detectSubjectKeywordPatterns(actions: EmailAction[]): DetectedPattern[] {
  const actionable = actions.filter(a => a.action === 'archive' || a.action === 'reclassify');
  if (actionable.length < 3) return [];

  const wordCounts = new Map<string, { archive: number; reclassify: number; tier?: EmailTier; subjects: Set<string> }>();

  for (const a of actionable) {
    const words = a.subject.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
    const unique = new Set(words);
    for (const word of unique) {
      const entry = wordCounts.get(word) || { archive: 0, reclassify: 0, subjects: new Set() };
      if (a.action === 'archive') entry.archive++;
      if (a.action === 'reclassify') { entry.reclassify++; entry.tier = a.newTier; }
      entry.subjects.add(a.subject);
      wordCounts.set(word, entry);
    }
  }

  const patterns: DetectedPattern[] = [];
  for (const [word, counts] of wordCounts) {
    const total = counts.archive + counts.reclassify;
    if (total < 3) continue;

    const action = counts.archive >= counts.reclassify ? 'archive' : 'reclassify';
    const count = action === 'archive' ? counts.archive : counts.reclassify;

    const actionLabel = action === 'archive'
      ? `Archive emails with "${word}" in subject`
      : `Move emails with "${word}" in subject to ${counts.tier}`;

    patterns.push({
      id: crypto.randomUUID(),
      type: 'subject-keyword-action',
      description: actionLabel,
      matchCriteria: { field: 'subject_contains', value: word },
      suggestedAction: action,
      suggestedTier: action === 'reclassify' ? counts.tier : undefined,
      confidence: count / total,
      evidenceCount: count,
      totalForCriteria: total,
    });
  }
  return patterns;
}

function deduplicatePatterns(patterns: DetectedPattern[]): DetectedPattern[] {
  // If a sender pattern and domain pattern cover the same criteria,
  // prefer the sender pattern (more specific)
  return patterns.filter(p => {
    if (p.type === 'domain-action') {
      // Remove domain pattern if a sender pattern exists for a sender on that domain
      const domainCoveredBySender = patterns.some(
        sp => sp.type === 'sender-action' &&
          sp.matchCriteria.value.endsWith('@' + p.matchCriteria.value) &&
          sp.suggestedAction === p.suggestedAction
      );
      // Only remove if ALL senders on this domain are covered
      return !domainCoveredBySender || p.evidenceCount > 2;
    }
    return true;
  });
}

export function analyzeSession(actions: EmailAction[]): DetectedPattern[] {
  if (actions.length === 0) return [];

  const senderPatterns = detectSenderPatterns(actions);
  const domainPatterns = detectDomainPatterns(actions);
  const subjectPatterns = detectSubjectKeywordPatterns(actions);

  const all = [...senderPatterns, ...domainPatterns, ...subjectPatterns];
  const deduped = deduplicatePatterns(all);

  // Sort by confidence desc, then evidence count desc
  deduped.sort((a, b) => b.confidence - a.confidence || b.evidenceCount - a.evidenceCount);

  return deduped;
}
