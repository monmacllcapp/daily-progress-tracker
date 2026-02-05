import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalyticsEvent } from '../../types/schema';

// Mock database interactions
interface MockAnalyticsEvent extends Omit<AnalyticsEvent, 'toJSON' | 'remove'> {
    toJSON: () => Omit<MockAnalyticsEvent, 'toJSON' | 'remove'>;
    remove: ReturnType<typeof vi.fn>;
}

function createMockEvent(overrides: Partial<Omit<MockAnalyticsEvent, 'toJSON' | 'remove'>> = {}): MockAnalyticsEvent {
    const data = {
        id: crypto.randomUUID(),
        event_type: 'app_open' as const,
        metadata: {},
        timestamp: new Date().toISOString(),
        ...overrides,
    };
    return {
        ...data,
        toJSON: () => data,
        remove: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockDb(events: MockAnalyticsEvent[] = []) {
    return {
        analytics_events: {
            insert: vi.fn().mockResolvedValue(undefined),
            find: vi.fn((query?: { selector?: unknown; sort?: unknown }) => {
                let filteredEvents = [...events];

                // Apply selector filters if present
                if (query?.selector && typeof query.selector === 'object' && 'timestamp' in query.selector) {
                    const tsSelector = query.selector.timestamp as { $gte?: string; $lte?: string };
                    if (tsSelector.$gte) {
                        filteredEvents = filteredEvents.filter(e => e.timestamp >= tsSelector.$gte!);
                    }
                    if (tsSelector.$lte) {
                        filteredEvents = filteredEvents.filter(e => e.timestamp <= tsSelector.$lte!);
                    }
                }

                return {
                    exec: vi.fn().mockResolvedValue(filteredEvents),
                };
            }),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock DB for testing
    } as any;
}

describe('Analytics Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('trackEvent', () => {
        it('should track an event with metadata', async () => {
            const { trackEvent } = await import('../analytics');
            const db = createMockDb();

            await trackEvent(db, 'task_complete', { priority: 'high', source: 'morning_flow' });

            expect(db.analytics_events.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: expect.any(String),
                    event_type: 'task_complete',
                    metadata: { priority: 'high', source: 'morning_flow' },
                    timestamp: expect.any(String),
                })
            );
        });

        it('should track an event without metadata', async () => {
            const { trackEvent } = await import('../analytics');
            const db = createMockDb();

            await trackEvent(db, 'app_open');

            expect(db.analytics_events.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    event_type: 'app_open',
                    metadata: {},
                })
            );
        });

        it('should not throw on database error', async () => {
            const { trackEvent } = await import('../analytics');
            const db = createMockDb();
            db.analytics_events.insert.mockRejectedValue(new Error('DB error'));

            // Should not throw
            await expect(trackEvent(db, 'app_open')).resolves.not.toThrow();
        });
    });

    describe('getUsageStats', () => {
        it('should calculate basic usage stats', async () => {
            const { getUsageStats } = await import('../analytics');

            const now = new Date('2026-02-04T12:00:00Z');
            const events = [
                createMockEvent({ event_type: 'app_open', timestamp: '2026-02-01T08:00:00Z' }),
                createMockEvent({ event_type: 'task_complete', timestamp: '2026-02-01T09:00:00Z' }),
                createMockEvent({ event_type: 'morning_flow_complete', timestamp: '2026-02-02T08:00:00Z' }),
                createMockEvent({ event_type: 'task_complete', timestamp: '2026-02-02T10:00:00Z' }),
                createMockEvent({ event_type: 'habit_check', timestamp: '2026-02-03T08:00:00Z' }),
            ];

            const db = createMockDb(events);
            const stats = await getUsageStats(db, '2026-02-01T00:00:00Z', now.toISOString());

            expect(stats.totalEvents).toBe(5);
            expect(stats.dailyActiveUsage).toBe(3); // 3 days with events
            expect(stats.eventsByType['app_open']).toBe(1);
            expect(stats.eventsByType['task_complete']).toBe(2);
            expect(stats.eventsByType['morning_flow_complete']).toBe(1);
            expect(stats.eventsByType['habit_check']).toBe(1);
        });

        it('should calculate morning flow completion rate', async () => {
            const { getUsageStats } = await import('../analytics');

            const events = [
                createMockEvent({ event_type: 'morning_flow_complete', timestamp: '2026-02-01T08:00:00Z' }),
                createMockEvent({ event_type: 'task_complete', timestamp: '2026-02-02T10:00:00Z' }),
                createMockEvent({ event_type: 'morning_flow_complete', timestamp: '2026-02-03T08:00:00Z' }),
            ];

            const db = createMockDb(events);
            // 4-day range: 2 morning flows / 4 days = 50%
            const stats = await getUsageStats(db, '2026-02-01T00:00:00Z', '2026-02-04T23:59:59Z');

            expect(stats.morningFlowCompletionRate).toBeCloseTo(0.5);
        });

        it('should calculate task completion rate', async () => {
            const { getUsageStats } = await import('../analytics');

            const events = [
                createMockEvent({ event_type: 'task_complete', timestamp: '2026-02-01T09:00:00Z' }),
                createMockEvent({ event_type: 'app_open', timestamp: '2026-02-01T08:00:00Z' }),
                createMockEvent({ event_type: 'task_complete', timestamp: '2026-02-02T10:00:00Z' }),
                createMockEvent({ event_type: 'habit_check', timestamp: '2026-02-03T08:00:00Z' }),
            ];

            const db = createMockDb(events);
            const stats = await getUsageStats(db);

            // 2 task_complete / 4 total events = 0.5
            expect(stats.taskCompletionRate).toBe(0.5);
        });

        it('should calculate feature engagement counts', async () => {
            const { getUsageStats } = await import('../analytics');

            const events = [
                createMockEvent({ event_type: 'morning_flow_complete', timestamp: '2026-02-01T08:00:00Z' }),
                createMockEvent({ event_type: 'task_complete', timestamp: '2026-02-01T09:00:00Z' }),
                createMockEvent({ event_type: 'task_complete', timestamp: '2026-02-01T10:00:00Z' }),
                createMockEvent({ event_type: 'email_triage', timestamp: '2026-02-01T11:00:00Z' }),
                createMockEvent({ event_type: 'pomodoro_complete', timestamp: '2026-02-02T08:00:00Z' }),
                createMockEvent({ event_type: 'habit_check', timestamp: '2026-02-03T08:00:00Z' }),
                createMockEvent({ event_type: 'calendar_schedule', timestamp: '2026-02-03T09:00:00Z' }),
            ];

            const db = createMockDb(events);
            const stats = await getUsageStats(db);

            expect(stats.featureEngagement.morningFlow).toBe(1);
            expect(stats.featureEngagement.tasks).toBe(2);
            expect(stats.featureEngagement.email).toBe(1);
            expect(stats.featureEngagement.pomodoro).toBe(1);
            expect(stats.featureEngagement.habits).toBe(1);
            expect(stats.featureEngagement.calendar).toBe(1);
        });

        it('should calculate current streak correctly', async () => {
            const { getUsageStats } = await import('../analytics');

            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const events = [
                createMockEvent({ timestamp: `${twoDaysAgo}T08:00:00Z` }),
                createMockEvent({ timestamp: `${yesterday}T08:00:00Z` }),
                createMockEvent({ timestamp: `${today}T08:00:00Z` }),
            ];

            const db = createMockDb(events);
            const stats = await getUsageStats(db);

            expect(stats.currentStreak).toBe(3);
        });

        it('should calculate longest streak correctly', async () => {
            const { getUsageStats } = await import('../analytics');

            const events = [
                createMockEvent({ timestamp: '2026-02-01T08:00:00Z' }),
                createMockEvent({ timestamp: '2026-02-02T08:00:00Z' }),
                createMockEvent({ timestamp: '2026-02-03T08:00:00Z' }),
                // Gap here
                createMockEvent({ timestamp: '2026-02-05T08:00:00Z' }),
                createMockEvent({ timestamp: '2026-02-06T08:00:00Z' }),
            ];

            const db = createMockDb(events);
            const stats = await getUsageStats(db);

            expect(stats.longestStreak).toBe(3); // First streak is longest
        });

        it('should handle empty analytics data', async () => {
            const { getUsageStats } = await import('../analytics');

            const db = createMockDb([]);
            const stats = await getUsageStats(db);

            expect(stats.totalEvents).toBe(0);
            expect(stats.dailyActiveUsage).toBe(0);
            expect(stats.currentStreak).toBe(0);
            expect(stats.longestStreak).toBe(0);
        });

        it('should not throw on database error', async () => {
            const { getUsageStats } = await import('../analytics');

            const db = createMockDb();
            db.analytics_events.find.mockReturnValue({
                exec: vi.fn().mockRejectedValue(new Error('DB error')),
            });

            const stats = await getUsageStats(db);

            // Should return empty stats instead of throwing
            expect(stats.totalEvents).toBe(0);
        });
    });

    describe('exportAnalyticsData', () => {
        it('should export all analytics events', async () => {
            const { exportAnalyticsData } = await import('../analytics');

            const events = [
                createMockEvent({ event_type: 'app_open', timestamp: '2026-02-01T08:00:00Z' }),
                createMockEvent({ event_type: 'task_complete', timestamp: '2026-02-02T09:00:00Z' }),
            ];

            const db = createMockDb(events);
            const exported = await exportAnalyticsData(db);

            expect(exported).toHaveLength(2);
            expect(exported[0]).toMatchObject({
                id: expect.any(String),
                event_type: 'app_open',
                timestamp: '2026-02-01T08:00:00Z',
            });
        });

        it('should return empty array on database error', async () => {
            const { exportAnalyticsData } = await import('../analytics');

            const db = createMockDb();
            db.analytics_events.find.mockReturnValue({
                exec: vi.fn().mockRejectedValue(new Error('DB error')),
            });

            const exported = await exportAnalyticsData(db);

            expect(exported).toEqual([]);
        });
    });

    describe('clearAnalyticsData', () => {
        it('should delete all analytics events', async () => {
            const { clearAnalyticsData } = await import('../analytics');

            const events = [
                createMockEvent(),
                createMockEvent(),
                createMockEvent(),
            ];

            const db = createMockDb(events);
            const count = await clearAnalyticsData(db);

            expect(count).toBe(3);
            expect(events[0].remove).toHaveBeenCalled();
            expect(events[1].remove).toHaveBeenCalled();
            expect(events[2].remove).toHaveBeenCalled();
        });

        it('should return 0 on database error', async () => {
            const { clearAnalyticsData } = await import('../analytics');

            const db = createMockDb();
            db.analytics_events.find.mockReturnValue({
                exec: vi.fn().mockRejectedValue(new Error('DB error')),
            });

            const count = await clearAnalyticsData(db);

            expect(count).toBe(0);
        });
    });
});
