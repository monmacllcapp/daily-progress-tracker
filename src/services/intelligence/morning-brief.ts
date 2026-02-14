import type {
  Signal,
  AnticipationContext,
  MorningBrief,
  PortfolioPulse
} from '../../types/signals';
import { v4 as uuid } from 'uuid';

/**
 * Morning Brief Intelligence Service
 *
 * Generates the daily morning brief — a synthesized intelligence report
 * containing urgent/attention signals, portfolio pulse, calendar summary,
 * family events, and AI-generated insights.
 */

export function generateMorningBrief(
  context: AnticipationContext,
  signals: Signal[],
  learnedSuggestions?: string[]
): MorningBrief {
  const now = new Date();
  const today = context.today;

  // Separate signals by severity
  const urgentSignals = signals.filter(
    s => s.severity === 'critical' || s.severity === 'urgent'
  );
  const attentionSignals = signals.filter(s => s.severity === 'attention');

  // Build portfolio pulse if Alpaca data available
  const portfolioPulse = buildPortfolioPulse(context);

  // Generate calendar summary
  const calendarSummary = buildCalendarSummary(context);

  // Generate family summary
  const familySummary = buildFamilySummary(context);

  // Generate AI insight
  const aiInsight = generateAiInsight(urgentSignals, attentionSignals, context);

  return {
    id: uuid(),
    date: today,
    urgent_signals: urgentSignals,
    attention_signals: attentionSignals,
    portfolio_pulse: portfolioPulse,
    calendar_summary: calendarSummary,
    family_summary: familySummary,
    ai_insight: aiInsight,
    learned_suggestions: learnedSuggestions,
    generated_at: now.toISOString(),
  };
}

/**
 * Build portfolio pulse from Alpaca data and active deals
 */
function buildPortfolioPulse(context: AnticipationContext): PortfolioPulse | undefined {
  const { mcpData, deals } = context;

  if (!mcpData.alpaca) {
    return undefined;
  }

  const alpaca = mcpData.alpaca;
  const activeDealStatuses = ['prospect', 'analyzing', 'offer', 'under_contract'];
  const activeDeals = deals.filter(d => activeDealStatuses.includes(d.status));
  const totalDealValue = activeDeals.reduce((sum, d) => sum + (d.purchase_price || 0), 0);

  const dayPnlPct = alpaca.equity > 0 ? (alpaca.dayPnl / alpaca.equity) * 100 : 0;

  return {
    equity: alpaca.equity,
    day_pnl: alpaca.dayPnl,
    day_pnl_pct: dayPnlPct,
    positions_count: alpaca.positions.length,
    active_deals_count: activeDeals.length,
    total_deal_value: totalDealValue,
  };
}

/**
 * Build calendar summary — first 5 events today
 */
function buildCalendarSummary(context: AnticipationContext): string[] {
  const { calendarEvents, today } = context;
  const todayStart = new Date(today + 'T00:00:00');
  const todayEnd = new Date(today + 'T23:59:59');

  const todayEvents = calendarEvents
    .filter(event => {
      const start = new Date(event.start_time);
      return start >= todayStart && start <= todayEnd;
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, 5); // Limit to first 5 events

  return todayEvents.map(event => {
    const start = new Date(event.start_time);
    const time = formatTime(start);
    return `${time} - ${event.summary}`;
  });
}

/**
 * Build family summary — family events today
 */
function buildFamilySummary(context: AnticipationContext): string[] {
  const { mcpData, today } = context;

  if (!mcpData.familyCalendars || mcpData.familyCalendars.length === 0) {
    return [];
  }

  const todayStart = new Date(today + 'T00:00:00');
  const todayEnd = new Date(today + 'T23:59:59');

  const todayFamilyEvents = mcpData.familyCalendars
    .filter(event => {
      const start = new Date(event.start_time);
      return start >= todayStart && start <= todayEnd;
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  return todayFamilyEvents.map(event => {
    const start = new Date(event.start_time);
    const time = formatTime(start);
    return `${event.member}: ${event.summary} at ${time}`;
  });
}

/**
 * Generate AI insight based on signal counts and context
 */
function generateAiInsight(
  urgentSignals: Signal[],
  attentionSignals: Signal[],
  context: AnticipationContext
): string {
  const urgentCount = urgentSignals.length;
  const attentionCount = attentionSignals.length;
  const totalSignals = urgentCount + attentionCount;

  // Heavy day
  if (urgentCount >= 5) {
    return `High-priority day ahead: ${urgentCount} urgent items requiring immediate attention. Prioritize ruthlessly and delegate where possible.`;
  }

  // Moderate urgency
  if (urgentCount >= 2) {
    return `${urgentCount} urgent items need your attention today. Focus on these first, then address ${attentionCount} attention-level items.`;
  }

  // Single urgent item
  if (urgentCount === 1) {
    const urgentType = urgentSignals[0].type.replace(/_/g, ' ');
    return `One urgent item (${urgentType}) needs your attention. Otherwise, ${attentionCount > 0 ? `${attentionCount} items to be aware of` : 'clear day ahead'}.`;
  }

  // Only attention items
  if (attentionCount >= 3) {
    return `${attentionCount} items on your radar today. No urgent fires — good opportunity to make progress on strategic work.`;
  }

  // Light day
  if (totalSignals <= 2) {
    const hasEvents = context.calendarEvents.length > 0;
    if (hasEvents) {
      return 'Clear day ahead — focus on deep work between scheduled commitments.';
    }
    return 'Ideal conditions for deep work — minimal distractions, clear calendar. Make it count.';
  }

  // Default
  return `${totalSignals} items to track today. Balance attention between signals and proactive work.`;
}

/**
 * Format time as HH:MM in UTC
 */
function formatTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
