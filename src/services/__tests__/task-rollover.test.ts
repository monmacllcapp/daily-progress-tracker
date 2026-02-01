import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the streak-service module
vi.mock('../streak-service', () => ({
    updateCategoryStreak: vi.fn().mockResolvedValue({ streak: 3, isNew: true }),
    updateCategoryProgress: vi.fn().mockResolvedValue(0.5),
}));

// Mock the database interactions
// Since RxDB requires IndexedDB (not available in jsdom), we mock at the module level

interface MockTask {
    id: string;
    title: string;
    status: string;
    source: string;
    created_date: string;
    rolled_from_date?: string;
    category_id?: string;
    sort_order: number;
    toJSON: () => Omit<MockTask, 'toJSON' | 'patch'>;
    patch: ReturnType<typeof vi.fn>;
}

function createMockTask(overrides: Partial<Omit<MockTask, 'toJSON' | 'patch'>> = {}): MockTask {
    const data = {
        id: crypto.randomUUID(),
        title: 'Test task',
        status: 'active',
        source: 'manual' as const,
        created_date: '2026-01-30',
        sort_order: 0,
        ...overrides,
    };
    return {
        ...data,
        toJSON: () => data,
        patch: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockDb(tasks: MockTask[]) {
    return {
        tasks: {
            find: vi.fn().mockReturnValue({
                exec: vi.fn().mockResolvedValue(tasks),
            }),
            findOne: vi.fn((id: string) => ({
                exec: vi.fn().mockResolvedValue(tasks.find(t => t.id === id) || null),
            })),
            insert: vi.fn().mockResolvedValue(undefined),
        },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock DB for testing
    } as any;
}

describe('TaskRolloverService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-31T08:00:00Z'));
        vi.clearAllMocks();
    });

    it('should roll over active tasks from previous days', async () => {
        const { rolloverTasks } = await import('../task-rollover');

        const oldTask = createMockTask({
            created_date: '2026-01-29',
            status: 'active',
        });
        const db = createMockDb([oldTask]);

        const count = await rolloverTasks(db);

        expect(count).toBe(1);
        expect(oldTask.patch).toHaveBeenCalledWith(
            expect.objectContaining({
                rolled_from_date: '2026-01-29',
            })
        );
    });

    it('should not roll over tasks already rolled today', async () => {
        const { rolloverTasks } = await import('../task-rollover');

        const task = createMockTask({
            created_date: '2026-01-29',
            rolled_from_date: '2026-01-29',
            status: 'active',
        });
        const db = createMockDb([task]);

        const count = await rolloverTasks(db);

        expect(count).toBe(0);
        expect(task.patch).not.toHaveBeenCalled();
    });

    it('should not roll over completed tasks', async () => {
        const { rolloverTasks } = await import('../task-rollover');

        // Completed tasks won't be returned by the query (status: 'active' filter)
        const db = createMockDb([]);

        const count = await rolloverTasks(db);
        expect(count).toBe(0);
    });

    it('should create a task with all required fields', async () => {
        const { createTask } = await import('../task-rollover');

        const db = createMockDb([]);
        const task = await createTask(db, {
            title: 'New task',
            priority: 'high',
            status: 'active',
            source: 'brain_dump',
            created_date: '2026-01-31',
            sort_order: 0,
        });

        expect(task.id).toBeDefined();
        expect(task.title).toBe('New task');
        expect(task.priority).toBe('high');
        expect(task.source).toBe('brain_dump');
        expect(task.created_at).toBeDefined();
        expect(db.tasks.insert).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'New task' })
        );
    });

    it('should complete a task with timestamp', async () => {
        const { completeTask } = await import('../task-rollover');

        const task = createMockTask({ id: 'task-1' });
        const db = createMockDb([task]);

        await completeTask(db, 'task-1');

        expect(task.patch).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'completed',
                completed_date: '2026-01-31',
            })
        );
    });

    it('should dismiss a task', async () => {
        const { dismissTask } = await import('../task-rollover');

        const task = createMockTask({ id: 'task-2' });
        const db = createMockDb([task]);

        await dismissTask(db, 'task-2');

        expect(task.patch).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'dismissed',
            })
        );
    });

    it('should defer a task with reason', async () => {
        const { deferTask } = await import('../task-rollover');

        const task = createMockTask({ id: 'task-3' });
        const db = createMockDb([task]);

        await deferTask(db, 'task-3', 'Waiting on client feedback');

        expect(task.patch).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'deferred',
                defer_reason: 'Waiting on client feedback',
            })
        );
    });

    it('should handle completing a non-existent task gracefully', async () => {
        const { completeTask } = await import('../task-rollover');

        const db = createMockDb([]);

        // Should not throw
        const result = await completeTask(db, 'nonexistent');
        expect(result).toEqual({});
    });

    // ---- New tests for uncovered branches ----

    describe('completeTask — streak and category progress', () => {
        it('should update streak and progress when task has category_id', async () => {
            const { updateCategoryStreak, updateCategoryProgress } = await import('../streak-service');
            const { completeTask } = await import('../task-rollover');

            const task = createMockTask({
                id: 'task-with-cat',
                category_id: 'cat-health',
            });
            const db = createMockDb([task]);

            const result = await completeTask(db, 'task-with-cat');

            expect(task.patch).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'completed',
                    completed_date: '2026-01-31',
                })
            );
            expect(updateCategoryStreak).toHaveBeenCalledWith(db, 'cat-health');
            expect(updateCategoryProgress).toHaveBeenCalledWith(db, 'cat-health');
            expect(result.streak).toBe(3);
            expect(result.isNewStreak).toBe(true);
        });

        it('should return empty object when task has no category_id', async () => {
            const { updateCategoryStreak, updateCategoryProgress } = await import('../streak-service');
            const { completeTask } = await import('../task-rollover');

            const task = createMockTask({
                id: 'task-no-cat',
                // no category_id
            });
            const db = createMockDb([task]);

            const result = await completeTask(db, 'task-no-cat');

            expect(result).toEqual({});
            expect(updateCategoryStreak).not.toHaveBeenCalled();
            expect(updateCategoryProgress).not.toHaveBeenCalled();
        });

        it('should return empty object for non-existent task (completeTask)', async () => {
            const { completeTask } = await import('../task-rollover');

            const db = createMockDb([]);

            const result = await completeTask(db, 'ghost-task');
            expect(result).toEqual({});
        });
    });

    describe('dismissTask — edge cases', () => {
        it('should handle dismissing a non-existent task gracefully', async () => {
            const { dismissTask } = await import('../task-rollover');

            const db = createMockDb([]);

            // Should not throw
            await expect(dismissTask(db, 'nonexistent')).resolves.toBeUndefined();
        });

        it('should set completed_date and updated_at on dismiss', async () => {
            const { dismissTask } = await import('../task-rollover');

            const task = createMockTask({ id: 'dismiss-task' });
            const db = createMockDb([task]);

            await dismissTask(db, 'dismiss-task');

            expect(task.patch).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'dismissed',
                    completed_date: '2026-01-31',
                    updated_at: expect.stringContaining('2026-01-31'),
                })
            );
        });
    });

    describe('deferTask — edge cases', () => {
        it('should handle deferring a non-existent task gracefully', async () => {
            const { deferTask } = await import('../task-rollover');

            const db = createMockDb([]);

            // Should not throw
            await expect(deferTask(db, 'nonexistent', 'Some reason')).resolves.toBeUndefined();
        });

        it('should set updated_at on defer', async () => {
            const { deferTask } = await import('../task-rollover');

            const task = createMockTask({ id: 'defer-task' });
            const db = createMockDb([task]);

            await deferTask(db, 'defer-task', 'Need more information');

            expect(task.patch).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'deferred',
                    defer_reason: 'Need more information',
                    updated_at: expect.stringContaining('2026-01-31'),
                })
            );
        });

        it('should accept empty string as defer reason', async () => {
            const { deferTask } = await import('../task-rollover');

            const task = createMockTask({ id: 'defer-empty' });
            const db = createMockDb([task]);

            await deferTask(db, 'defer-empty', '');

            expect(task.patch).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'deferred',
                    defer_reason: '',
                })
            );
        });
    });

    describe('getTodaysTasks', () => {
        it('should return all active tasks as plain objects', async () => {
            const { getTodaysTasks } = await import('../task-rollover');

            const task1 = createMockTask({ id: 'today-1', title: 'Task 1', sort_order: 0 });
            const task2 = createMockTask({ id: 'today-2', title: 'Task 2', sort_order: 1 });
            const db = createMockDb([task1, task2]);

            const tasks = await getTodaysTasks(db);

            expect(tasks).toHaveLength(2);
            expect(tasks[0].title).toBe('Task 1');
            expect(tasks[1].title).toBe('Task 2');
            // Verify tasks are plain objects (toJSON called)
            expect(tasks[0]).not.toHaveProperty('patch');
            expect(tasks[0]).not.toHaveProperty('toJSON');
        });

        it('should return empty array when no active tasks', async () => {
            const { getTodaysTasks } = await import('../task-rollover');

            const db = createMockDb([]);
            const tasks = await getTodaysTasks(db);

            expect(tasks).toEqual([]);
        });

        it('should call find with active status and sort by sort_order', async () => {
            const { getTodaysTasks } = await import('../task-rollover');

            const db = createMockDb([]);
            await getTodaysTasks(db);

            expect(db.tasks.find).toHaveBeenCalledWith({
                selector: { status: 'active' },
                sort: [{ sort_order: 'asc' }],
            });
        });
    });

    describe('getTaskHistory', () => {
        it('should return tasks within a date range', async () => {
            const { getTaskHistory } = await import('../task-rollover');

            const task1 = createMockTask({ id: 'hist-1', title: 'History Task 1', created_date: '2026-01-25' });
            const task2 = createMockTask({ id: 'hist-2', title: 'History Task 2', created_date: '2026-01-28' });
            const db = createMockDb([task1, task2]);

            const tasks = await getTaskHistory(db, '2026-01-20', '2026-01-31');

            expect(tasks).toHaveLength(2);
            expect(tasks[0].title).toBe('History Task 1');
            // Verify tasks are plain objects
            expect(tasks[0]).not.toHaveProperty('patch');
        });

        it('should call find with correct date range selector', async () => {
            const { getTaskHistory } = await import('../task-rollover');

            const db = createMockDb([]);
            await getTaskHistory(db, '2026-01-01', '2026-01-31');

            expect(db.tasks.find).toHaveBeenCalledWith({
                selector: {
                    created_date: {
                        $gte: '2026-01-01',
                        $lte: '2026-01-31',
                    },
                },
                sort: [{ created_date: 'desc' }],
            });
        });

        it('should return empty array when no tasks in date range', async () => {
            const { getTaskHistory } = await import('../task-rollover');

            const db = createMockDb([]);
            const tasks = await getTaskHistory(db, '2026-01-01', '2026-01-10');

            expect(tasks).toEqual([]);
        });
    });

    describe('rolloverTasks — additional edge cases', () => {
        it('should roll over multiple tasks from different dates', async () => {
            const { rolloverTasks } = await import('../task-rollover');

            const task1 = createMockTask({ created_date: '2026-01-25', status: 'active' });
            const task2 = createMockTask({ created_date: '2026-01-28', status: 'active' });
            const task3 = createMockTask({ created_date: '2026-01-30', status: 'active' });
            const db = createMockDb([task1, task2, task3]);

            const count = await rolloverTasks(db);

            expect(count).toBe(3);
            expect(task1.patch).toHaveBeenCalled();
            expect(task2.patch).toHaveBeenCalled();
            expect(task3.patch).toHaveBeenCalled();
        });

        it('should preserve existing rolled_from_date on re-rollover', async () => {
            const { rolloverTasks } = await import('../task-rollover');

            // Task was originally created on Jan 25, rolled from Jan 25 on a previous day
            // but rolled_from_date !== created_date means it has been updated already
            const task = createMockTask({
                created_date: '2026-01-25',
                rolled_from_date: '2026-01-28', // different from created_date
                status: 'active',
            });
            const db = createMockDb([task]);

            const count = await rolloverTasks(db);

            expect(count).toBe(1);
            expect(task.patch).toHaveBeenCalledWith(
                expect.objectContaining({
                    rolled_from_date: '2026-01-28', // preserves existing rolled_from_date
                })
            );
        });

        it('should set updated_at timestamp on rollover', async () => {
            const { rolloverTasks } = await import('../task-rollover');

            const task = createMockTask({
                created_date: '2026-01-29',
                status: 'active',
            });
            const db = createMockDb([task]);

            await rolloverTasks(db);

            expect(task.patch).toHaveBeenCalledWith(
                expect.objectContaining({
                    updated_at: expect.stringContaining('2026-01-31'),
                })
            );
        });

        it('should handle empty task list without errors', async () => {
            const { rolloverTasks } = await import('../task-rollover');

            const db = createMockDb([]);
            const count = await rolloverTasks(db);

            expect(count).toBe(0);
        });
    });

    describe('createTask — additional tests', () => {
        it('should generate a unique UUID for the task', async () => {
            const { createTask } = await import('../task-rollover');

            const db = createMockDb([]);
            const task1 = await createTask(db, {
                title: 'Task A',
                priority: 'low',
                status: 'active',
                source: 'manual',
                created_date: '2026-01-31',
                sort_order: 0,
            });
            const task2 = await createTask(db, {
                title: 'Task B',
                priority: 'low',
                status: 'active',
                source: 'manual',
                created_date: '2026-01-31',
                sort_order: 1,
            });

            expect(task1.id).toBeDefined();
            expect(task2.id).toBeDefined();
            expect(task1.id).not.toBe(task2.id);
        });

        it('should set both created_at and updated_at timestamps', async () => {
            const { createTask } = await import('../task-rollover');

            const db = createMockDb([]);
            const task = await createTask(db, {
                title: 'Timestamped task',
                priority: 'medium',
                status: 'active',
                source: 'brain_dump',
                created_date: '2026-01-31',
                sort_order: 0,
            });

            expect(task.created_at).toBeDefined();
            expect(task.updated_at).toBeDefined();
            expect(task.created_at).toBe(task.updated_at);
        });

        it('should preserve optional fields from input', async () => {
            const { createTask } = await import('../task-rollover');

            const db = createMockDb([]);
            const task = await createTask(db, {
                title: 'Detailed task',
                description: 'A task with all optional fields',
                priority: 'urgent',
                status: 'active',
                source: 'rpm_wizard',
                created_date: '2026-01-31',
                sort_order: 5,
                category_id: 'cat-1',
                goal_id: 'proj-1',
                time_estimate_minutes: 45,
                tags: ['relief', 'quick-win'],
            });

            expect(task.title).toBe('Detailed task');
            expect(task.description).toBe('A task with all optional fields');
            expect(task.priority).toBe('urgent');
            expect(task.category_id).toBe('cat-1');
            expect(task.goal_id).toBe('proj-1');
            expect(task.time_estimate_minutes).toBe(45);
            expect(task.tags).toEqual(['relief', 'quick-win']);
        });
    });
});
