import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMorningBrief } from '../morning-brief';
import type { AnticipationContext, Signal } from '../../../types/signals';
import type { CalendarEvent } from '../../../types/schema';

// Mock uuid to return predictable values
vi.mock('uuid', () => ({ v4: () => 'test-uuid' }));

/**
 * Helper to create minimal valid AnticipationContext
 */
function makeContext(overrides: Partial<AnticipationContext> = {}): AnticipationContext {
  const today = '2026-02-13';

  return {
    tasks: [],
    projects: [],
    categories: [],
    emails: [],
    calendarEvents: [],
    deals: [],
    signals: [],
    mcpData: {},
    today,
    currentTime: '08:00',
    dayOfWeek: 'Thursday',
    historicalPatterns: [],
    ...overrides,
  };
}

/**
 * Helper to create a test signal
 */
function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'signal-1',
    type: 'deadline_approaching',
    severity: 'attention',
    domain: 'business_tech',
    source: 'test',
    title: 'Test signal',
    context: 'Test context',
    auto_actionable: false,
    is_dismissed: false,
    is_acted_on: false,
    related_entity_ids: [],
    created_at: '2026-02-13T08:00:00Z',
    ...overrides,
  };
}

describe('morning-brief', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-13T08:00:00Z'));
  });

  it('generates brief with no data (empty context)', () => {
    const context = makeContext();
    const signals: Signal[] = [];

    const brief = generateMorningBrief(context, signals);

    expect(brief).toMatchObject({
      id: 'test-uuid',
      date: '2026-02-13',
      urgent_signals: [],
      attention_signals: [],
      portfolio_pulse: undefined,
      calendar_summary: [],
      family_summary: [],
      generated_at: '2026-02-13T08:00:00.000Z',
    });
    expect(brief.ai_insight).toContain('deep work');
  });

  it('separates urgent from attention signals correctly', () => {
    const signals: Signal[] = [
      makeSignal({ id: 's1', severity: 'critical', type: 'calendar_conflict' }),
      makeSignal({ id: 's2', severity: 'urgent', type: 'deadline_approaching' }),
      makeSignal({ id: 's3', severity: 'attention', type: 'pattern_insight' }),
      makeSignal({ id: 's4', severity: 'attention', type: 'family_awareness' }),
      makeSignal({ id: 's5', severity: 'info', type: 'context_switch_prep' }),
    ];

    const context = makeContext();
    const brief = generateMorningBrief(context, signals);

    expect(brief.urgent_signals).toHaveLength(2);
    expect(brief.urgent_signals.map(s => s.severity)).toEqual(['critical', 'urgent']);

    expect(brief.attention_signals).toHaveLength(2);
    expect(brief.attention_signals.every(s => s.severity === 'attention')).toBe(true);

    // Info severity should not be in either category
    expect(brief.urgent_signals.find(s => s.id === 's5')).toBeUndefined();
    expect(brief.attention_signals.find(s => s.id === 's5')).toBeUndefined();
  });

  it('builds portfolio pulse from alpaca data', () => {
    const context = makeContext({
      mcpData: {
        alpaca: {
          equity: 50000,
          dayPnl: 500,
          positions: [
            { symbol: 'AAPL', qty: 10, avg_price: 150, current_price: 155, pnl: 50 },
            { symbol: 'GOOGL', qty: 5, avg_price: 2800, current_price: 2850, pnl: 250 },
          ],
        },
      },
      deals: [
        {
          id: 'd1',
          address: '123 Main St',
          city: 'Austin',
          state: 'TX',
          zip: '78701',
          strategy: 'flip',
          status: 'under_contract',
          purchase_price: 300000,
          linked_email_ids: [],
          linked_task_ids: [],
          created_at: '2026-02-10T00:00:00Z',
        },
        {
          id: 'd2',
          address: '456 Oak Ave',
          city: 'Austin',
          state: 'TX',
          zip: '78702',
          strategy: 'rental',
          status: 'analyzing',
          purchase_price: 250000,
          linked_email_ids: [],
          linked_task_ids: [],
          created_at: '2026-02-11T00:00:00Z',
        },
        {
          id: 'd3',
          address: '789 Elm St',
          city: 'Austin',
          state: 'TX',
          zip: '78703',
          strategy: 'wholesale',
          status: 'closed', // Not active
          purchase_price: 200000,
          linked_email_ids: [],
          linked_task_ids: [],
          created_at: '2026-02-01T00:00:00Z',
        },
      ],
    });

    const brief = generateMorningBrief(context, []);

    expect(brief.portfolio_pulse).toEqual({
      equity: 50000,
      day_pnl: 500,
      day_pnl_pct: 1, // 500 / 50000 * 100 = 1%
      positions_count: 2,
      active_deals_count: 2, // Only under_contract and analyzing
      total_deal_value: 550000, // 300k + 250k (closed deal excluded)
    });
  });

  it('generates calendar summary', () => {
    const events: CalendarEvent[] = [
      {
        id: 'cal-1',
        summary: 'Morning standup',
        start_time: '2026-02-13T09:00:00Z',
        end_time: '2026-02-13T09:15:00Z',
        all_day: false,
        source: 'app',
      },
      {
        id: 'cal-2',
        summary: 'Client meeting',
        start_time: '2026-02-13T14:00:00Z',
        end_time: '2026-02-13T15:00:00Z',
        all_day: false,
        source: 'app',
      },
      {
        id: 'cal-3',
        summary: 'Property showing',
        start_time: '2026-02-13T16:30:00Z',
        end_time: '2026-02-13T17:00:00Z',
        all_day: false,
        source: 'app',
      },
    ];

    const context = makeContext({
      calendarEvents: events,
    });

    const brief = generateMorningBrief(context, []);

    expect(brief.calendar_summary).toHaveLength(3);
    expect(brief.calendar_summary[0]).toContain('09:00');
    expect(brief.calendar_summary[0]).toContain('Morning standup');
    expect(brief.calendar_summary[1]).toContain('14:00');
    expect(brief.calendar_summary[1]).toContain('Client meeting');
    expect(brief.calendar_summary[2]).toContain('16:30');
    expect(brief.calendar_summary[2]).toContain('Property showing');
  });

  it('generates family summary', () => {
    const context = makeContext({
      mcpData: {
        familyCalendars: [
          {
            id: 'fam-1',
            member: 'Sarah',
            summary: 'Soccer practice',
            start_time: '2026-02-13T17:00:00Z',
            end_time: '2026-02-13T18:30:00Z',
            source_calendar: 'sarah-calendar',
            created_at: '2026-02-13T08:00:00Z',
          },
          {
            id: 'fam-2',
            member: 'John',
            summary: 'Piano lesson',
            start_time: '2026-02-13T15:00:00Z',
            end_time: '2026-02-13T16:00:00Z',
            source_calendar: 'john-calendar',
            created_at: '2026-02-13T08:00:00Z',
          },
        ],
      },
    });

    const brief = generateMorningBrief(context, []);

    expect(brief.family_summary).toHaveLength(2);
    expect(brief.family_summary[0]).toContain('John');
    expect(brief.family_summary[0]).toContain('Piano lesson');
    expect(brief.family_summary[0]).toContain('15:00');
    expect(brief.family_summary[1]).toContain('Sarah');
    expect(brief.family_summary[1]).toContain('Soccer practice');
    expect(brief.family_summary[1]).toContain('17:00');
  });

  it('generates appropriate ai_insight based on signal count', () => {
    const context = makeContext();

    // Heavy day (5+ urgent)
    const heavySignals = Array.from({ length: 5 }, (_, i) =>
      makeSignal({ id: `s${i}`, severity: 'urgent' })
    );
    const heavyBrief = generateMorningBrief(context, heavySignals);
    expect(heavyBrief.ai_insight).toContain('High-priority day');
    expect(heavyBrief.ai_insight).toContain('5 urgent');

    // Moderate day (2-4 urgent)
    const moderateSignals = [
      makeSignal({ id: 's1', severity: 'urgent' }),
      makeSignal({ id: 's2', severity: 'critical' }),
      makeSignal({ id: 's3', severity: 'attention' }),
    ];
    const moderateBrief = generateMorningBrief(context, moderateSignals);
    expect(moderateBrief.ai_insight).toContain('2 urgent');
    expect(moderateBrief.ai_insight).toContain('Focus on these first');

    // Single urgent
    const singleUrgentSignals = [
      makeSignal({ id: 's1', severity: 'urgent', type: 'deadline_approaching' }),
      makeSignal({ id: 's2', severity: 'attention' }),
    ];
    const singleBrief = generateMorningBrief(context, singleUrgentSignals);
    expect(singleBrief.ai_insight).toContain('One urgent item');
    expect(singleBrief.ai_insight).toContain('deadline approaching');

    // Only attention items
    const attentionSignals = [
      makeSignal({ id: 's1', severity: 'attention' }),
      makeSignal({ id: 's2', severity: 'attention' }),
      makeSignal({ id: 's3', severity: 'attention' }),
    ];
    const attentionBrief = generateMorningBrief(context, attentionSignals);
    expect(attentionBrief.ai_insight).toContain('3 items on your radar');
    expect(attentionBrief.ai_insight).toContain('strategic work');

    // Light day
    const lightSignals = [makeSignal({ id: 's1', severity: 'attention' })];
    const lightBrief = generateMorningBrief(context, lightSignals);
    expect(lightBrief.ai_insight).toContain('deep work');
  });

  it('limits calendar summary to 5 events', () => {
    const events: CalendarEvent[] = Array.from({ length: 8 }, (_, i) => ({
      id: `cal-${i}`,
      summary: `Event ${i}`,
      start_time: `2026-02-13T${String(9 + i).padStart(2, '0')}:00:00Z`,
      end_time: `2026-02-13T${String(10 + i).padStart(2, '0')}:00:00Z`,
      all_day: false,
      source: 'app' as const,
    }));

    const context = makeContext({
      calendarEvents: events,
    });

    const brief = generateMorningBrief(context, []);

    expect(brief.calendar_summary).toHaveLength(5);
    expect(brief.calendar_summary[0]).toContain('Event 0');
    expect(brief.calendar_summary[4]).toContain('Event 4');
  });

  it('includes learned_suggestions when provided', () => {
    const context = makeContext();
    const signals: Signal[] = [];
    const suggestions = ['Your productivity peaks at 9am', 'Consider blocking Tuesday mornings for deep work'];

    const brief = generateMorningBrief(context, signals, suggestions);

    expect(brief.learned_suggestions).toEqual(suggestions);
    expect(brief.learned_suggestions).toHaveLength(2);
  });

  it('learned_suggestions is undefined when not provided', () => {
    const context = makeContext();
    const signals: Signal[] = [];

    const brief = generateMorningBrief(context, signals);

    expect(brief.learned_suggestions).toBeUndefined();
  });
});
