import { describe, it, expect } from 'vitest';
import { synthesizePriorities, scoreSeverity, deduplicateSignals } from '../priority-synthesizer';
import type { Signal, AnticipationContext } from '../../../types/signals';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig-' + Math.random().toString(36).slice(2, 8),
    type: 'pattern_insight',
    severity: 'info',
    domain: 'personal_growth',
    source: 'test',
    title: 'Test Signal',
    context: 'Test context',
    auto_actionable: false,
    is_dismissed: false,
    is_acted_on: false,
    related_entity_ids: [],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

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
    currentTime: '09:00',
    dayOfWeek: 'Thursday',
    historicalPatterns: [],
    ...overrides,
  };
}

describe('priority-synthesizer', () => {
  describe('synthesizePriorities', () => {
    it('returns empty for empty input', () => {
      const context = makeContext();
      const result = synthesizePriorities([], context);
      expect(result).toEqual([]);
    });

    it('sorts signals by severity', () => {
      const signals = [
        makeSignal({ severity: 'critical', title: 'Critical signal', type: 'deadline_approaching' }),
        makeSignal({ severity: 'info', title: 'Info signal', type: 'pattern_insight' }),
        makeSignal({ severity: 'urgent', title: 'Urgent signal', type: 'aging_email' }),
      ];

      const context = makeContext();
      const result = synthesizePriorities(signals, context);

      expect(result).toHaveLength(3);
      expect(result[0].severity).toBe('critical');
      expect(result[1].severity).toBe('urgent');
      expect(result[2].severity).toBe('info');
    });

    it('deduplicates same type+entity', () => {
      const signals = [
        makeSignal({
          type: 'aging_email',
          severity: 'attention',
          related_entity_ids: ['email-1'],
        }),
        makeSignal({
          type: 'aging_email',
          severity: 'urgent',
          related_entity_ids: ['email-1'],
        }),
      ];

      const context = makeContext();
      const result = synthesizePriorities(signals, context);

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('urgent');
    });

    it('preserves unique signals', () => {
      const signals = [
        makeSignal({ type: 'pattern_insight', title: 'Signal 1' }),
        makeSignal({ type: 'aging_email', title: 'Signal 2' }),
        makeSignal({ type: 'deadline_approaching', title: 'Signal 3' }),
      ];

      const context = makeContext();
      const result = synthesizePriorities(signals, context);

      expect(result).toHaveLength(3);
    });

    it('boosts signals related to tasks with due dates', () => {
      const signals = [
        makeSignal({
          severity: 'info',
          title: 'Related to urgent task',
          related_entity_ids: ['task-1'],
        }),
        makeSignal({
          severity: 'info',
          title: 'No related task',
          related_entity_ids: [],
        }),
      ];

      const context = makeContext({
        tasks: [
          {
            id: 'task-1',
            title: 'Urgent Task',
            priority: 'urgent',
            status: 'active',
            source: 'manual',
            created_date: '2026-02-10',
            due_date: '2026-02-14',
            sort_order: 0,
          },
        ],
        today: '2026-02-13',
      });

      const result = synthesizePriorities(signals, context);

      expect(result[0].title).toBe('Related to urgent task');
    });
  });

  describe('scoreSeverity', () => {
    it('returns correct weights', () => {
      expect(scoreSeverity('critical')).toBe(100);
      expect(scoreSeverity('urgent')).toBe(75);
      expect(scoreSeverity('attention')).toBe(50);
      expect(scoreSeverity('info')).toBe(25);
    });
  });

  describe('deduplicateSignals', () => {
    it('keeps highest severity', () => {
      const signals = [
        makeSignal({
          type: 'aging_email',
          severity: 'attention',
          related_entity_ids: ['email-1'],
        }),
        makeSignal({
          type: 'aging_email',
          severity: 'urgent',
          related_entity_ids: ['email-1'],
        }),
        makeSignal({
          type: 'aging_email',
          severity: 'critical',
          related_entity_ids: ['email-1'],
        }),
      ];

      const result = deduplicateSignals(signals);

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('critical');
    });

    it('preserves signals with different keys', () => {
      const signals = [
        makeSignal({
          type: 'aging_email',
          related_entity_ids: ['email-1'],
        }),
        makeSignal({
          type: 'aging_email',
          related_entity_ids: ['email-2'],
        }),
        makeSignal({
          type: 'pattern_insight',
          related_entity_ids: ['email-1'],
        }),
      ];

      const result = deduplicateSignals(signals);

      expect(result).toHaveLength(3);
    });

    it('handles signals with no related entities', () => {
      const signals = [
        makeSignal({
          type: 'pattern_insight',
          severity: 'info',
          related_entity_ids: [],
        }),
        makeSignal({
          type: 'pattern_insight',
          severity: 'attention',
          related_entity_ids: [],
        }),
      ];

      const result = deduplicateSignals(signals);

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('attention');
    });
  });
});
