import { v4 as uuid } from 'uuid';
import type { Signal, ProductivityPattern, AnticipationContext, SignalSeverity, LifeDomain } from '../../types/signals';

interface ClaudeInsight {
  title: string;
  context: string;
  suggested_action: string;
  severity: 'info' | 'attention';
  domain: string;
}

const SYSTEM_PROMPT = `You are an intelligent personal productivity advisor analyzing behavior patterns for the MAPLE Life OS app.

Given the user's productivity patterns and recent signals, generate 1-3 actionable insights.

Each insight must have:
- title: short descriptive title (max 60 chars)
- context: 1-2 sentence explanation of the insight
- suggested_action: specific actionable recommendation
- severity: "info" for general observations, "attention" for actionable items
- domain: one of "business_re", "business_trading", "business_tech", "personal_growth", "health_fitness", "family", "finance", "social", "creative", "spiritual"

Focus on:
- Cross-domain correlations (e.g., exercise patterns affecting productivity)
- Non-obvious patterns the user might not notice
- Timing-based suggestions based on detected rhythms
- Balance warnings across life domains

Return ONLY a JSON array of insight objects. No explanation text.`;

function buildInsightPrompt(
  patterns: ProductivityPattern[],
  recentSignals: Signal[],
  context: AnticipationContext
): string {
  const patternSummary = patterns.map(p =>
    `- ${p.pattern_type}: ${p.description} (confidence: ${(p.confidence * 100).toFixed(0)}%)`
  ).join('\n');

  // Summarize recent signals (last 24h)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = recentSignals.filter(s => s.created_at > twentyFourHoursAgo);

  const signalsByType: Record<string, number> = {};
  const signalsByDomain: Record<string, number> = {};
  for (const s of recent) {
    signalsByType[s.type] = (signalsByType[s.type] || 0) + 1;
    signalsByDomain[s.domain] = (signalsByDomain[s.domain] || 0) + 1;
  }

  const signalSummary = Object.entries(signalsByType)
    .map(([type, count]) => `  ${type}: ${count}`)
    .join('\n');

  const domainSummary = Object.entries(signalsByDomain)
    .map(([domain, count]) => `  ${domain}: ${count}`)
    .join('\n');

  return `## Current Date & Time
${context.dayOfWeek}, ${context.today} at ${context.currentTime}

## Detected Productivity Patterns
${patternSummary || 'No patterns detected yet.'}

## Recent Signals (last 24h): ${recent.length} total
By type:
${signalSummary || '  None'}
By domain:
${domainSummary || '  None'}

## Active Context
- Tasks: ${context.tasks.length} total
- Calendar events today: ${context.calendarEvents.length}
- Active projects: ${context.projects.filter(p => p.status === 'active').length}

Generate 1-3 proactive insights based on these patterns.`;
}

function isValidDomain(domain: string): domain is LifeDomain {
  const validDomains = ['business_re', 'business_trading', 'business_tech', 'personal_growth', 'health_fitness', 'family', 'finance', 'social', 'creative', 'spiritual'];
  return validDomains.includes(domain);
}

function isValidSeverity(severity: string): severity is SignalSeverity {
  return severity === 'info' || severity === 'attention';
}

export function parseClaudeInsights(raw: unknown): ClaudeInsight[] {
  if (!raw || !Array.isArray(raw)) return [];

  return raw
    .filter((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const obj = item as Record<string, unknown>;
      return typeof obj.title === 'string' && typeof obj.context === 'string';
    })
    .slice(0, 3) // Cap at 3
    .map((item: unknown) => {
      const obj = item as Record<string, unknown>;
      return {
        title: String(obj.title).slice(0, 60),
        context: String(obj.context),
        suggested_action: String(obj.suggested_action || ''),
        severity: isValidSeverity(String(obj.severity)) ? String(obj.severity) as 'info' | 'attention' : 'info',
        domain: isValidDomain(String(obj.domain)) ? String(obj.domain) : 'personal_growth',
      };
    });
}

export function insightsToSignals(insights: ClaudeInsight[]): Signal[] {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  return insights.map(insight => ({
    id: uuid(),
    type: 'learned_suggestion' as const,
    severity: insight.severity as SignalSeverity,
    domain: insight.domain as LifeDomain,
    source: 'claude-insight-engine',
    title: insight.title,
    context: insight.context,
    suggested_action: insight.suggested_action || undefined,
    auto_actionable: false,
    is_dismissed: false,
    is_acted_on: false,
    related_entity_ids: [],
    created_at: now.toISOString(),
    expires_at: expiresAt,
  }));
}

export function buildWeeklyDigest(patterns: ProductivityPattern[]): string {
  if (patterns.length === 0) return 'Not enough data yet to generate a weekly digest.';

  const lines: string[] = ['Based on your patterns this week:'];

  for (const pattern of patterns) {
    if (pattern.confidence >= 0.3) {
      lines.push(`• ${pattern.description}`);
    }
  }

  if (lines.length === 1) return 'Not enough confident patterns to generate a digest.';

  return lines.join('\n');
}

export async function generateClaudeInsights(
  context: AnticipationContext,
  patterns: ProductivityPattern[],
  recentSignals: Signal[]
): Promise<Signal[]> {
  // Skip if no patterns — nothing for AI to reason about
  if (patterns.length === 0) return [];

  try {
    const { askAIJSON } = await import('../ai/ai-service');

    const prompt = buildInsightPrompt(patterns, recentSignals, context);
    const response = await askAIJSON<ClaudeInsight[]>(prompt, SYSTEM_PROMPT);

    const insights = parseClaudeInsights(response);
    return insightsToSignals(insights);
  } catch (error) {
    console.warn('[Claude Insight Engine] Failed to generate insights:', error);
    return [];
  }
}
