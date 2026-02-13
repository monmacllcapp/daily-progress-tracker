import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectContextSwitchSignals } from '../context-switch-prep';
import type { AnticipationContext } from '../../../types/signals';
import type { CalendarEvent } from '../../../types/schema';

// Mock uuid to return predictable values
vi.mock('uuid', () => ({ v4: () => 'test-uuid' }));

/**
 * Helper to create minimal valid AnticipationContext
 */
function makeContext(overrides: Partial<AnticipationContext> = {}): AnticipationContext {
  return {
    tasks: [],
    projects: [],
    categories: [],
    emails: [],
    calendarEvents: [],
    deals: [],
    signals: [],
    mcpData: {},
    today: '2026-02-13',
    currentTime: '10:00',
    dayOfWeek: 'Thursday',
    historicalPatterns: [],
    ...overrides,
  };
}

describe('context-switch-prep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-13T10:00:00Z'));
  });

  it('returns empty when no upcoming events', () => {
    const context = makeContext();
    const signals = detectContextSwitchSignals(context);
    expect(signals).toEqual([]);
  });

  it('returns empty when calendarEvents is empty', () => {
    const context = makeContext({ calendarEvents: [] });
    const signals = detectContextSwitchSignals(context);
    expect(signals).toEqual([]);
  });

  it('detects context switch for event in 15 minutes (attention)', () => {
    const event: CalendarEvent = {
      id: 'cal-1',
      summary: 'Client meeting',
      start_time: '2026-02-13T10:15:00Z', // 15 minutes from now
      end_time: '2026-02-13T11:00:00Z',
      all_day: false,
      source: 'app',
    };

    const context = makeContext({
      calendarEvents: [event],
    });

    const signals = detectContextSwitchSignals(context);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      type: 'context_switch_prep',
      severity: 'attention',
      source: 'context-switch-prep',
      title: 'Upcoming context switch',
      auto_actionable: false,
      is_dismissed: false,
      is_acted_on: false,
      related_entity_ids: ['cal-1'],
    });
    expect(signals[0].context).toContain('Client meeting');
    expect(signals[0].context).toContain('15 minutes');
  });

  it('detects focus block preparation with appropriate suggestion', () => {
    const event: CalendarEvent = {
      id: 'cal-2',
      summary: 'Deep work: Code review',
      start_time: '2026-02-13T10:20:00Z', // 20 minutes from now
      end_time: '2026-02-13T12:00:00Z',
      all_day: false,
      source: 'app',
      is_focus_block: true,
    };

    const context = makeContext({
      calendarEvents: [event],
    });

    const signals = detectContextSwitchSignals(context);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      type: 'context_switch_prep',
      severity: 'info', // 20 minutes = info
      domain: 'personal_growth',
      source: 'context-switch-prep',
      title: 'Deep work session approaching',
      auto_actionable: false,
      related_entity_ids: ['cal-2'],
    });
    expect(signals[0].context).toContain('Focus block');
    expect(signals[0].suggested_action).toContain('Prepare your environment');
    expect(signals[0].suggested_action).toContain('close distractions');
  });

  it('handles events more than 30 minutes away (skips them)', () => {
    const event: CalendarEvent = {
      id: 'cal-3',
      summary: 'Lunch meeting',
      start_time: '2026-02-13T12:00:00Z', // 2 hours from now
      end_time: '2026-02-13T13:00:00Z',
      all_day: false,
      source: 'app',
    };

    const context = makeContext({
      calendarEvents: [event],
    });

    const signals = detectContextSwitchSignals(context);
    expect(signals).toEqual([]);
  });

  it('severity escalation based on proximity', () => {
    const events: CalendarEvent[] = [
      {
        id: 'cal-4',
        summary: 'Event in 3 minutes',
        start_time: '2026-02-13T10:03:00Z',
        end_time: '2026-02-13T10:30:00Z',
        all_day: false,
        source: 'app',
      },
      {
        id: 'cal-5',
        summary: 'Event in 12 minutes',
        start_time: '2026-02-13T10:12:00Z',
        end_time: '2026-02-13T10:45:00Z',
        all_day: false,
        source: 'app',
      },
      {
        id: 'cal-6',
        summary: 'Event in 25 minutes',
        start_time: '2026-02-13T10:25:00Z',
        end_time: '2026-02-13T11:00:00Z',
        all_day: false,
        source: 'app',
      },
    ];

    const context = makeContext({
      calendarEvents: events,
    });

    const signals = detectContextSwitchSignals(context);
    expect(signals).toHaveLength(3);

    // 3 minutes = urgent (≤5 min)
    const urgentSignal = signals.find(s => s.related_entity_ids.includes('cal-4'));
    expect(urgentSignal?.severity).toBe('urgent');

    // 12 minutes = attention (≤15 min)
    const attentionSignal = signals.find(s => s.related_entity_ids.includes('cal-5'));
    expect(attentionSignal?.severity).toBe('attention');

    // 25 minutes = info (≤30 min)
    const infoSignal = signals.find(s => s.related_entity_ids.includes('cal-6'));
    expect(infoSignal?.severity).toBe('info');
  });

  it('handles past events (skips them)', () => {
    const pastEvent: CalendarEvent = {
      id: 'cal-7',
      summary: 'Morning standup',
      start_time: '2026-02-13T09:00:00Z', // 1 hour ago
      end_time: '2026-02-13T09:15:00Z',
      all_day: false,
      source: 'app',
    };

    const context = makeContext({
      calendarEvents: [pastEvent],
    });

    const signals = detectContextSwitchSignals(context);
    expect(signals).toEqual([]);
  });

  it('infers correct domain from event keywords', () => {
    const events: CalendarEvent[] = [
      {
        id: 'cal-8',
        summary: 'Property showing for new deal',
        start_time: '2026-02-13T10:15:00Z',
        end_time: '2026-02-13T11:00:00Z',
        all_day: false,
        source: 'app',
      },
      {
        id: 'cal-9',
        summary: 'Trading strategy review',
        start_time: '2026-02-13T10:20:00Z',
        end_time: '2026-02-13T11:00:00Z',
        all_day: false,
        source: 'app',
      },
      {
        id: 'cal-10',
        summary: 'Family dinner',
        start_time: '2026-02-13T10:25:00Z',
        end_time: '2026-02-13T11:30:00Z',
        all_day: false,
        source: 'app',
      },
    ];

    const context = makeContext({
      calendarEvents: events,
    });

    const signals = detectContextSwitchSignals(context);
    expect(signals).toHaveLength(3);

    const reSignal = signals.find(s => s.related_entity_ids.includes('cal-8'));
    expect(reSignal?.domain).toBe('business_re');

    const tradingSignal = signals.find(s => s.related_entity_ids.includes('cal-9'));
    expect(tradingSignal?.domain).toBe('business_trading');

    const familySignal = signals.find(s => s.related_entity_ids.includes('cal-10'));
    expect(familySignal?.domain).toBe('family');
  });
});
