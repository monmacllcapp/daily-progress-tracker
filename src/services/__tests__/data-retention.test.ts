import { describe, it, expect } from 'vitest';
import {
  purgeExpiredSignals,
  purgeOldAnalytics,
  purgeStaleWeights,
  runRetentionCycle,
} from '../data-retention';
import type { Signal, SignalWeight } from '../../types/signals';
import type { AnalyticsEvent } from '../../types/schema';

/**
 * Mock TitanDatabase with collection find/remove methods
 */
function createMockDatabase(data: {
  signals?: Signal[];
  analytics_events?: AnalyticsEvent[];
  signal_weights?: SignalWeight[];
}) {
  const createMockCollection = <T extends { id: string }>(items: T[]) => {
    const mockItems = items.map(item => ({
      ...item,
      remove: async () => {
        const idx = items.findIndex(i => i.id === item.id);
        if (idx !== -1) items.splice(idx, 1);
      }
    }));

    return {
      find: (opts: { selector: Record<string, unknown> }) => ({
        exec: async () => {
          // Simple mock selector matching
          const selector = opts.selector;
          return mockItems.filter(item => {
            for (const [key, condition] of Object.entries(selector)) {
              if (typeof condition === 'object' && condition !== null) {
                const operator = Object.keys(condition)[0];
                const value = (condition as Record<string, string>)[operator];

                if (operator === '$lt') {
                  if (String((item as Record<string, unknown>)[key]) >= String(value)) return false;
                }
              } else {
                if ((item as Record<string, unknown>)[key] !== condition) return false;
              }
            }
            return true;
          });
        }
      })
    };
  };

  return {
    signals: createMockCollection(data.signals || []),
    analytics_events: createMockCollection(data.analytics_events || []),
    signal_weights: createMockCollection(data.signal_weights || []),
  };
}

/**
 * Helper to create a valid Signal with defaults.
 */
function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: `sig-${Math.random().toString(36).substr(2, 9)}`,
    type: 'aging_email',
    severity: 'attention',
    domain: 'business_re',
    source: 'aging-detector',
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

/**
 * Helper to create a valid AnalyticsEvent with defaults.
 */
function makeAnalyticsEvent(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    id: `evt-${Math.random().toString(36).substr(2, 9)}`,
    event_type: 'task_complete',
    metadata: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Helper to create a valid SignalWeight with defaults.
 */
function makeSignalWeight(overrides: Partial<SignalWeight> = {}): SignalWeight {
  return {
    id: `wt-${Math.random().toString(36).substr(2, 9)}`,
    signal_type: 'aging_email',
    domain: 'business_re',
    total_generated: 10,
    total_dismissed: 2,
    total_acted_on: 5,
    effectiveness_score: 0.7,
    weight_modifier: 1.4,
    last_updated: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('data-retention', () => {
  describe('purgeExpiredSignals', () => {
    it('removes signals that are both expired AND dismissed', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      const signals: Signal[] = [
        makeSignal({ id: 'sig-1', expires_at: yesterday, is_dismissed: true }),
        makeSignal({ id: 'sig-2', expires_at: yesterday, is_dismissed: true }),
      ];

      const db = createMockDatabase({ signals });
      const count = await purgeExpiredSignals(db as never);

      expect(count).toBe(2);
      expect(signals.length).toBe(0);
    });

    it('keeps non-expired signals even if dismissed', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const signals: Signal[] = [
        makeSignal({ id: 'sig-1', expires_at: tomorrow, is_dismissed: true }),
      ];

      const db = createMockDatabase({ signals });
      const count = await purgeExpiredSignals(db as never);

      expect(count).toBe(0);
      expect(signals.length).toBe(1);
    });

    it('keeps expired signals that are NOT dismissed', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const signals: Signal[] = [
        makeSignal({ id: 'sig-1', expires_at: yesterday, is_dismissed: false }),
      ];

      const db = createMockDatabase({ signals });
      const count = await purgeExpiredSignals(db as never);

      expect(count).toBe(0);
      expect(signals.length).toBe(1);
    });

    it('handles empty collection', async () => {
      const db = createMockDatabase({ signals: [] });
      const count = await purgeExpiredSignals(db as never);

      expect(count).toBe(0);
    });
  });

  describe('purgeOldAnalytics', () => {
    it('removes events older than 90 days', async () => {
      const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();

      const events: AnalyticsEvent[] = [
        makeAnalyticsEvent({ id: 'evt-1', timestamp: ninetyOneDaysAgo }),
        makeAnalyticsEvent({ id: 'evt-2', timestamp: ninetyOneDaysAgo }),
      ];

      const db = createMockDatabase({ analytics_events: events });
      const count = await purgeOldAnalytics(db as never);

      expect(count).toBe(2);
      expect(events.length).toBe(0);
    });

    it('keeps events newer than 90 days', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const eightyNineDaysAgo = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString();

      const events: AnalyticsEvent[] = [
        makeAnalyticsEvent({ id: 'evt-1', timestamp: yesterday }),
        makeAnalyticsEvent({ id: 'evt-2', timestamp: eightyNineDaysAgo }),
      ];

      const db = createMockDatabase({ analytics_events: events });
      const count = await purgeOldAnalytics(db as never);

      expect(count).toBe(0);
      expect(events.length).toBe(2);
    });

    it('handles empty collection', async () => {
      const db = createMockDatabase({ analytics_events: [] });
      const count = await purgeOldAnalytics(db as never);

      expect(count).toBe(0);
    });
  });

  describe('purgeStaleWeights', () => {
    it('removes weights not updated in 30 days', async () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

      const weights: SignalWeight[] = [
        makeSignalWeight({ id: 'wt-1', last_updated: thirtyOneDaysAgo }),
        makeSignalWeight({ id: 'wt-2', last_updated: thirtyOneDaysAgo }),
      ];

      const db = createMockDatabase({ signal_weights: weights });
      const count = await purgeStaleWeights(db as never);

      expect(count).toBe(2);
      expect(weights.length).toBe(0);
    });

    it('keeps weights updated within 30 days', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();

      const weights: SignalWeight[] = [
        makeSignalWeight({ id: 'wt-1', last_updated: yesterday }),
        makeSignalWeight({ id: 'wt-2', last_updated: twentyNineDaysAgo }),
      ];

      const db = createMockDatabase({ signal_weights: weights });
      const count = await purgeStaleWeights(db as never);

      expect(count).toBe(0);
      expect(weights.length).toBe(2);
    });

    it('handles empty collection', async () => {
      const db = createMockDatabase({ signal_weights: [] });
      const count = await purgeStaleWeights(db as never);

      expect(count).toBe(0);
    });
  });

  describe('runRetentionCycle', () => {
    it('runs all retention tasks and returns correct counts', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

      const signals: Signal[] = [
        makeSignal({ id: 'sig-1', expires_at: yesterday, is_dismissed: true }),
        makeSignal({ id: 'sig-2', expires_at: yesterday, is_dismissed: true }),
      ];

      const events: AnalyticsEvent[] = [
        makeAnalyticsEvent({ id: 'evt-1', timestamp: ninetyOneDaysAgo }),
        makeAnalyticsEvent({ id: 'evt-2', timestamp: ninetyOneDaysAgo }),
        makeAnalyticsEvent({ id: 'evt-3', timestamp: ninetyOneDaysAgo }),
      ];

      const weights: SignalWeight[] = [
        makeSignalWeight({ id: 'wt-1', last_updated: thirtyOneDaysAgo }),
      ];

      const db = createMockDatabase({ signals, analytics_events: events, signal_weights: weights });
      const result = await runRetentionCycle(db as never);

      expect(result.expiredSignals).toBe(2);
      expect(result.oldAnalytics).toBe(3);
      expect(result.staleWeights).toBe(1);

      // Verify data was actually removed
      expect(signals.length).toBe(0);
      expect(events.length).toBe(0);
      expect(weights.length).toBe(0);
    });

    it('handles empty collections without errors', async () => {
      const db = createMockDatabase({
        signals: [],
        analytics_events: [],
        signal_weights: [],
      });

      const result = await runRetentionCycle(db as never);

      expect(result.expiredSignals).toBe(0);
      expect(result.oldAnalytics).toBe(0);
      expect(result.staleWeights).toBe(0);
    });

    it('runs tasks in parallel', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const signals: Signal[] = [
        makeSignal({ id: 'sig-1', expires_at: yesterday, is_dismissed: true }),
      ];

      const db = createMockDatabase({ signals });

      const startTime = Date.now();
      await runRetentionCycle(db as never);
      const duration = Date.now() - startTime;

      // Should complete quickly if running in parallel
      // This is a basic sanity check - actual parallel execution is hard to test precisely
      expect(duration).toBeLessThan(1000);
    });
  });
});
