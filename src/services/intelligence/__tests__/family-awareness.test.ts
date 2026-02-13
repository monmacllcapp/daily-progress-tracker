import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectFamilySignals } from '../family-awareness';
import type { AnticipationContext, FamilyEvent } from '../../../types/signals';
import type { CalendarEvent } from '../../../types/schema';

// Mock uuid to return predictable values
vi.mock('uuid', () => ({ v4: () => 'test-uuid' }));

/**
 * Helper to create minimal valid AnticipationContext
 */
function makeContext(overrides: Partial<AnticipationContext> = {}): AnticipationContext {
  const now = new Date('2026-02-13T10:00:00Z');
  const today = '2026-02-13';

  return {
    tasks: [],
    projects: [],
    categories: [],
    emails: [],
    calendarEvents: [],
    deals: [],
    signals: [],
    mcpData: {
      familyCalendars: [],
    },
    today,
    currentTime: '10:00',
    dayOfWeek: 'Thursday',
    historicalPatterns: [],
    ...overrides,
  };
}

describe('family-awareness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-13T10:00:00Z'));
  });

  it('returns empty when no family calendar data', () => {
    const context = makeContext();
    const signals = detectFamilySignals(context);
    expect(signals).toEqual([]);
  });

  it('returns empty when familyCalendars array is empty', () => {
    const context = makeContext({
      mcpData: { familyCalendars: [] },
    });
    const signals = detectFamilySignals(context);
    expect(signals).toEqual([]);
  });

  it('detects family event starting within 2 hours (urgent)', () => {
    const familyEvent: FamilyEvent = {
      id: 'fam-1',
      member: 'Sarah',
      summary: 'Soccer practice',
      start_time: '2026-02-13T11:30:00Z', // 1.5 hours from now
      end_time: '2026-02-13T13:00:00Z',
      source_calendar: 'sarah-calendar',
      created_at: '2026-02-13T09:00:00Z',
    };

    const context = makeContext({
      mcpData: { familyCalendars: [familyEvent] },
    });

    const signals = detectFamilySignals(context);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      type: 'family_awareness',
      severity: 'urgent',
      domain: 'family',
      source: 'family-awareness',
      title: "Sarah's event starting soon",
      auto_actionable: false,
      is_dismissed: false,
      is_acted_on: false,
      related_entity_ids: ['fam-1'],
    });
    expect(signals[0].context).toContain('Soccer practice');
    expect(signals[0].context).toContain('11:30');
  });

  it('detects family event today but more than 2 hours away (attention)', () => {
    const familyEvent: FamilyEvent = {
      id: 'fam-2',
      member: 'John',
      summary: 'Basketball game',
      start_time: '2026-02-13T18:00:00Z', // 8 hours from now
      end_time: '2026-02-13T20:00:00Z',
      source_calendar: 'john-calendar',
      created_at: '2026-02-13T09:00:00Z',
    };

    const context = makeContext({
      mcpData: { familyCalendars: [familyEvent] },
    });

    const signals = detectFamilySignals(context);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      type: 'family_awareness',
      severity: 'attention',
      domain: 'family',
      source: 'family-awareness',
      title: 'John has event today',
      auto_actionable: false,
      related_entity_ids: ['fam-2'],
    });
    expect(signals[0].context).toContain('Basketball game');
  });

  it('detects conflict between family and personal events (critical)', () => {
    const familyEvent: FamilyEvent = {
      id: 'fam-3',
      member: 'Sarah',
      summary: 'School recital',
      start_time: '2026-02-13T14:00:00Z',
      end_time: '2026-02-13T15:30:00Z',
      source_calendar: 'sarah-calendar',
      created_at: '2026-02-13T09:00:00Z',
    };

    const personalEvent: CalendarEvent = {
      id: 'cal-1',
      summary: 'Client meeting',
      start_time: '2026-02-13T14:30:00Z', // Overlaps with family event
      end_time: '2026-02-13T15:00:00Z',
      all_day: false,
      source: 'app',
    };

    const context = makeContext({
      mcpData: { familyCalendars: [familyEvent] },
      calendarEvents: [personalEvent],
    });

    const signals = detectFamilySignals(context);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      type: 'family_awareness',
      severity: 'critical',
      domain: 'family',
      source: 'family-awareness',
      title: 'Family event conflicts with your schedule',
      auto_actionable: false,
      related_entity_ids: ['fam-3', 'cal-1'],
    });
    expect(signals[0].context).toContain('School recital');
    expect(signals[0].context).toContain('Client meeting');
    expect(signals[0].suggested_action).toContain('Reschedule');
  });

  it('handles past family events (skips them)', () => {
    const pastEvent: FamilyEvent = {
      id: 'fam-4',
      member: 'Emma',
      summary: 'Dance class',
      start_time: '2026-02-13T08:00:00Z', // 2 hours ago
      end_time: '2026-02-13T09:00:00Z', // 1 hour ago
      source_calendar: 'emma-calendar',
      created_at: '2026-02-13T07:00:00Z',
    };

    const context = makeContext({
      mcpData: { familyCalendars: [pastEvent] },
    });

    const signals = detectFamilySignals(context);
    expect(signals).toEqual([]);
  });

  it('handles multiple family events with mixed timings', () => {
    const events: FamilyEvent[] = [
      {
        id: 'fam-5',
        member: 'Sarah',
        summary: 'Piano lesson',
        start_time: '2026-02-13T11:00:00Z', // 1 hour away (urgent)
        end_time: '2026-02-13T12:00:00Z',
        source_calendar: 'sarah-calendar',
        created_at: '2026-02-13T09:00:00Z',
      },
      {
        id: 'fam-6',
        member: 'John',
        summary: 'Math tutoring',
        start_time: '2026-02-13T16:00:00Z', // 6 hours away (attention)
        end_time: '2026-02-13T17:00:00Z',
        source_calendar: 'john-calendar',
        created_at: '2026-02-13T09:00:00Z',
      },
      {
        id: 'fam-7',
        member: 'Emma',
        summary: 'Art class',
        start_time: '2026-02-13T08:00:00Z', // Past (skip)
        end_time: '2026-02-13T09:00:00Z',
        source_calendar: 'emma-calendar',
        created_at: '2026-02-13T07:00:00Z',
      },
    ];

    const context = makeContext({
      mcpData: { familyCalendars: events },
    });

    const signals = detectFamilySignals(context);
    expect(signals).toHaveLength(2);
    expect(signals.find(s => s.severity === 'urgent')).toBeDefined();
    expect(signals.find(s => s.severity === 'attention')).toBeDefined();
    expect(signals.every(s => s.domain === 'family')).toBe(true);
  });
});
