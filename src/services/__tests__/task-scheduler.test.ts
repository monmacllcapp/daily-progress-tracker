import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database — RxDB/IndexedDB not available in jsdom
interface MockDoc {
    id: string;
    [key: string]: unknown;
    toJSON: () => Record<string, unknown>;
    patch: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
}

function mockDoc(data: Record<string, unknown>): MockDoc {
    return {
        ...data,
        toJSON: () => data,
        patch: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
    } as MockDoc;
}

// Mock google-auth to always return disconnected
vi.mock('../google-auth', () => ({
    isGoogleConnected: () => false,
    getAccessToken: () => null,
}));

// Mock google-calendar helpers
vi.mock('../google-calendar', () => ({
    pushEventToGoogle: vi.fn().mockResolvedValue(null),
    calculateEndTime: (start: string, minutes: number) => {
        return new Date(new Date(start).getTime() + minutes * 60000).toISOString();
    },
    getPriorityColor: (priority: string) => {
        const map: Record<string, string> = { low: '9', medium: '1', high: '11' };
        return map[priority] || '1';
    },
}));

function createMockDb(tasks: MockDoc[], events: MockDoc[] = []) {
    return {
        tasks: {
            findOne: vi.fn((id: string) => ({
                exec: vi.fn().mockResolvedValue(tasks.find(t => t.id === id) || null),
            })),
            find: vi.fn((opts?: Record<string, Record<string, unknown>>) => ({
                exec: vi.fn().mockResolvedValue(
                    opts?.selector?.status === 'active'
                        ? tasks.filter(t => t.status === 'active')
                        : tasks
                ),
            })),
            insert: vi.fn().mockResolvedValue(undefined),
        },
        calendar_events: {
            findOne: vi.fn((id: string) => ({
                exec: vi.fn().mockResolvedValue(events.find(e => e.id === id) || null),
            })),
            find: vi.fn(() => ({
                exec: vi.fn().mockResolvedValue(events),
            })),
            insert: vi.fn().mockResolvedValue(undefined),
        },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock DB for testing
    } as any;
}

describe('Task Scheduler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('scheduleTask', () => {
        it('should create a calendar event linked to the task', async () => {
            const task = mockDoc({
                id: 'task-1', title: 'Write report', priority: 'high',
                status: 'active', time_estimate_minutes: 45,
            });
            const db = createMockDb([task]);

            const { scheduleTask } = await import('../task-scheduler');
            const eventId = await scheduleTask(db, {
                taskId: 'task-1',
                startTime: '2026-01-31T10:00:00.000Z',
            });

            expect(eventId).toBeTruthy();
            expect(db.calendar_events.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    summary: 'Write report',
                    linked_task_id: 'task-1',
                    start_time: '2026-01-31T10:00:00.000Z',
                    is_focus_block: false,
                })
            );
        });

        it('should use task time estimate as duration', async () => {
            const task = mockDoc({
                id: 'task-2', title: 'Quick task', priority: 'medium',
                status: 'active', time_estimate_minutes: 20,
            });
            const db = createMockDb([task]);

            const { scheduleTask } = await import('../task-scheduler');
            await scheduleTask(db, { taskId: 'task-2', startTime: '2026-01-31T14:00:00.000Z' });

            const insertCall = db.calendar_events.insert.mock.calls[0][0];
            const start = new Date('2026-01-31T14:00:00.000Z');
            const end = new Date(insertCall.end_time);
            expect((end.getTime() - start.getTime()) / 60000).toBe(20);
        });

        it('should default to 30 min when no time estimate', async () => {
            const task = mockDoc({
                id: 'task-3', title: 'No estimate', priority: 'low',
                status: 'active',
            });
            const db = createMockDb([task]);

            const { scheduleTask } = await import('../task-scheduler');
            await scheduleTask(db, { taskId: 'task-3', startTime: '2026-01-31T16:00:00.000Z' });

            const insertCall = db.calendar_events.insert.mock.calls[0][0];
            const start = new Date('2026-01-31T16:00:00.000Z');
            const end = new Date(insertCall.end_time);
            expect((end.getTime() - start.getTime()) / 60000).toBe(30);
        });

        it('should throw if task not found', async () => {
            const db = createMockDb([]);

            const { scheduleTask } = await import('../task-scheduler');
            await expect(
                scheduleTask(db, { taskId: 'nonexistent', startTime: '2026-01-31T10:00:00.000Z' })
            ).rejects.toThrow('Task not found');
        });

        it('should allow duration override', async () => {
            const task = mockDoc({
                id: 'task-4', title: 'Override', priority: 'medium',
                status: 'active', time_estimate_minutes: 45,
            });
            const db = createMockDb([task]);

            const { scheduleTask } = await import('../task-scheduler');
            await scheduleTask(db, {
                taskId: 'task-4',
                startTime: '2026-01-31T10:00:00.000Z',
                durationMinutes: 60,
            });

            const insertCall = db.calendar_events.insert.mock.calls[0][0];
            const start = new Date('2026-01-31T10:00:00.000Z');
            const end = new Date(insertCall.end_time);
            expect((end.getTime() - start.getTime()) / 60000).toBe(60);
        });
    });

    describe('scheduleDeepWork', () => {
        it('should create a focus block', async () => {
            const task = mockDoc({
                id: 'deep-1', title: 'Deep work', priority: 'high', status: 'active',
            });
            const db = createMockDb([task]);

            const { scheduleDeepWork } = await import('../task-scheduler');
            await scheduleDeepWork(db, 'deep-1', '2026-01-31T09:00:00.000Z', 120);

            expect(db.calendar_events.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    is_focus_block: true,
                })
            );

            const insertCall = db.calendar_events.insert.mock.calls[0][0];
            const start = new Date('2026-01-31T09:00:00.000Z');
            const end = new Date(insertCall.end_time);
            expect((end.getTime() - start.getTime()) / 60000).toBe(120);
        });

        it('should default to 90min', async () => {
            const task = mockDoc({
                id: 'deep-2', title: 'Default deep', priority: 'high', status: 'active',
            });
            const db = createMockDb([task]);

            const { scheduleDeepWork } = await import('../task-scheduler');
            await scheduleDeepWork(db, 'deep-2', '2026-01-31T09:00:00.000Z');

            const insertCall = db.calendar_events.insert.mock.calls[0][0];
            const start = new Date('2026-01-31T09:00:00.000Z');
            const end = new Date(insertCall.end_time);
            expect((end.getTime() - start.getTime()) / 60000).toBe(90);
        });
    });

    describe('schedulePowerBatch', () => {
        it('should group tasks into a single event', async () => {
            const tasks = [
                mockDoc({ id: 'qw-1', title: 'Quick 1', status: 'active', time_estimate_minutes: 3 }),
                mockDoc({ id: 'qw-2', title: 'Quick 2', status: 'active', time_estimate_minutes: 5 }),
                mockDoc({ id: 'qw-3', title: 'Quick 3', status: 'active', time_estimate_minutes: 2 }),
            ];
            const db = createMockDb(tasks);

            const { schedulePowerBatch } = await import('../task-scheduler');
            await schedulePowerBatch(db, ['qw-1', 'qw-2', 'qw-3'], '2026-01-31T08:00:00.000Z');

            expect(db.calendar_events.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    summary: expect.stringMatching(/Power Batch.*3 tasks/),
                })
            );
        });

        it('should use minimum 30min block', async () => {
            const tasks = [
                mockDoc({ id: 'qw-tiny', title: 'Tiny', status: 'active', time_estimate_minutes: 2 }),
            ];
            const db = createMockDb(tasks);

            const { schedulePowerBatch } = await import('../task-scheduler');
            await schedulePowerBatch(db, ['qw-tiny'], '2026-01-31T08:00:00.000Z');

            const insertCall = db.calendar_events.insert.mock.calls[0][0];
            const start = new Date('2026-01-31T08:00:00.000Z');
            const end = new Date(insertCall.end_time);
            expect((end.getTime() - start.getTime()) / 60000).toBeGreaterThanOrEqual(30);
        });

        it('should skip non-active tasks', async () => {
            const tasks = [
                mockDoc({ id: 'qw-done', title: 'Done', status: 'completed', time_estimate_minutes: 3 }),
            ];
            const db = createMockDb(tasks);

            const { schedulePowerBatch } = await import('../task-scheduler');
            await expect(
                schedulePowerBatch(db, ['qw-done'], '2026-01-31T08:00:00.000Z')
            ).rejects.toThrow('No valid tasks');
        });
    });

    describe('checkLocalConflicts', () => {
        it('should detect overlapping events', async () => {
            const events = [
                mockDoc({
                    id: 'ev-1', summary: 'Meeting',
                    start_time: '2026-01-31T10:00:00.000Z',
                    end_time: '2026-01-31T11:00:00.000Z',
                    all_day: false,
                }),
            ];
            const db = createMockDb([], events);

            const { checkLocalConflicts } = await import('../task-scheduler');
            const conflicts = await checkLocalConflicts(db, '2026-01-31T10:30:00.000Z', 30);

            expect(conflicts.length).toBe(1);
            expect(conflicts[0].type).toBe('overlap');
            expect(conflicts[0].eventTitle).toBe('Meeting');
        });

        it('should detect back-to-back events (< 15min gap)', async () => {
            const events = [
                mockDoc({
                    id: 'ev-2', summary: 'Prior event',
                    start_time: '2026-01-31T09:00:00.000Z',
                    end_time: '2026-01-31T09:55:00.000Z',
                    all_day: false,
                }),
            ];
            const db = createMockDb([], events);

            const { checkLocalConflicts } = await import('../task-scheduler');
            const conflicts = await checkLocalConflicts(db, '2026-01-31T10:00:00.000Z', 30);

            expect(conflicts.length).toBe(1);
            expect(conflicts[0].type).toBe('back-to-back');
        });

        it('should return empty for non-conflicting times', async () => {
            const events = [
                mockDoc({
                    id: 'ev-3', summary: 'Morning event',
                    start_time: '2026-01-31T08:00:00.000Z',
                    end_time: '2026-01-31T09:00:00.000Z',
                    all_day: false,
                }),
            ];
            const db = createMockDb([], events);

            const { checkLocalConflicts } = await import('../task-scheduler');
            const conflicts = await checkLocalConflicts(db, '2026-01-31T14:00:00.000Z', 60);

            expect(conflicts.length).toBe(0);
        });
    });

    describe('syncCalendarTaskStatus', () => {
        it('should auto-complete tasks whose events have ended', async () => {
            const task = mockDoc({
                id: 'sync-task-1', title: 'Synced task',
                status: 'active', priority: 'medium',
            });
            const pastEnd = new Date(Date.now() - 3600000).toISOString();
            const pastStart = new Date(Date.now() - 7200000).toISOString();
            const event = mockDoc({
                id: 'past-ev-1', summary: 'Synced task',
                start_time: pastStart, end_time: pastEnd,
                linked_task_id: 'sync-task-1', all_day: false,
            });
            const db = createMockDb([task], [event]);

            const { syncCalendarTaskStatus } = await import('../task-scheduler');
            const completed = await syncCalendarTaskStatus(db);

            expect(completed).toContain('sync-task-1');
            expect(task.patch).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'completed' })
            );
        });

        it('should not touch already completed tasks', async () => {
            const task = mockDoc({
                id: 'already-done', title: 'Already done',
                status: 'completed', priority: 'medium',
            });
            const pastEnd = new Date(Date.now() - 3600000).toISOString();
            const pastStart = new Date(Date.now() - 7200000).toISOString();
            const event = mockDoc({
                id: 'past-ev-2', summary: 'Already done',
                start_time: pastStart, end_time: pastEnd,
                linked_task_id: 'already-done', all_day: false,
            });
            const db = createMockDb([task], [event]);

            const { syncCalendarTaskStatus } = await import('../task-scheduler');
            const completed = await syncCalendarTaskStatus(db);

            expect(completed).not.toContain('already-done');
            expect(task.patch).not.toHaveBeenCalled();
        });
    });
});
