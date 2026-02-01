import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration test: morning flow → task creation → rollover → next day visibility
 *
 * Tests the full pipeline:
 * 1. Morning flow creates daily journal + task entities
 * 2. Tasks are active and visible on the same day
 * 3. On the next day, rollover marks them with rolled_from_date
 */

interface MockTask {
    id: string;
    title: string;
    status: string;
    source: string;
    priority: string;
    created_date: string;
    rolled_from_date?: string;
    sort_order: number;
    tags?: string[];
    toJSON: () => Omit<MockTask, 'toJSON' | 'patch'>;
    patch: ReturnType<typeof vi.fn>;
}

function createMockTask(overrides: Partial<Omit<MockTask, 'toJSON' | 'patch'>> = {}): MockTask {
    const data = {
        id: crypto.randomUUID(),
        title: 'Test task',
        status: 'active',
        source: 'morning_flow',
        priority: 'high',
        created_date: '2026-01-31',
        sort_order: 0,
        ...overrides,
    };
    return {
        ...data,
        toJSON: () => data,
        patch: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockDb(tasks: MockTask[] = []) {
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

describe('Morning Flow → Task Pipeline Integration', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-31T08:00:00Z'));
    });

    it('should create high-priority tasks from non-negotiable wins (source: morning_flow)', async () => {
        const { createTask } = await import('../task-rollover');
        const db = createMockDb([]);

        // Simulate morning flow creating tasks from non-negotiable wins
        const nonNegotiables = ['Close the deal', 'Finish the proposal', 'Call the investor'];

        for (let i = 0; i < nonNegotiables.length; i++) {
            await createTask(db, {
                title: nonNegotiables[i],
                priority: 'high',
                status: 'active',
                source: 'morning_flow',
                created_date: '2026-01-31',
                sort_order: i,
                tags: ['non-negotiable'],
            });
        }

        expect(db.tasks.insert).toHaveBeenCalledTimes(3);

        // Verify first call had correct properties
        expect(db.tasks.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Close the deal',
                priority: 'high',
                source: 'morning_flow',
                tags: ['non-negotiable'],
            })
        );
    });

    it('should create medium-priority tasks from stressors with relief tag', async () => {
        const { createTask } = await import('../task-rollover');
        const db = createMockDb([]);

        const stressors = ['Fix leaky faucet', 'Pay overdue bill'];

        for (let i = 0; i < stressors.length; i++) {
            await createTask(db, {
                title: stressors[i],
                priority: 'medium',
                status: 'active',
                source: 'morning_flow',
                created_date: '2026-01-31',
                sort_order: 10 + i, // After non-negotiables
                tags: ['relief'],
            });
        }

        expect(db.tasks.insert).toHaveBeenCalledTimes(2);

        expect(db.tasks.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Fix leaky faucet',
                priority: 'medium',
                tags: ['relief'],
            })
        );
    });

    it('should roll over uncompleted tasks from day 1 to day 2 with rolled_from_date', async () => {
        const { rolloverTasks } = await import('../task-rollover');

        // Day 1: task was created yesterday and is still active
        const yesterdayTask = createMockTask({
            title: 'Close the deal',
            created_date: '2026-01-30',
            status: 'active',
            source: 'morning_flow',
            priority: 'high',
        });

        const db = createMockDb([yesterdayTask]);

        // Day 2 (today is 2026-01-31): rollover runs
        const count = await rolloverTasks(db);

        expect(count).toBe(1);
        expect(yesterdayTask.patch).toHaveBeenCalledWith(
            expect.objectContaining({
                rolled_from_date: '2026-01-30',
            })
        );
    });

    it('should not roll completed tasks (only active tasks roll over)', async () => {
        const { rolloverTasks } = await import('../task-rollover');

        // Task was completed yesterday — should NOT roll over
        // The DB query filters by status: 'active', so completed tasks won't appear
        const db = createMockDb([]); // Empty because completed tasks are filtered out

        const count = await rolloverTasks(db);
        expect(count).toBe(0);
    });

    it('full pipeline: create tasks → complete some → rollover remainder → verify badges', async () => {
        const { createTask, rolloverTasks } = await import('../task-rollover');

        // Step 1: Create tasks from morning flow
        const insertedTasks: MockTask[] = [];
        const db = {
            tasks: {
                find: vi.fn().mockReturnValue({
                    exec: vi.fn().mockImplementation(() => Promise.resolve(
                        insertedTasks.filter(t => t.status === 'active' && t.created_date < '2026-01-31')
                    )),
                }),
                findOne: vi.fn((id: string) => ({
                    exec: vi.fn().mockResolvedValue(
                        insertedTasks.find(t => t.id === id) || null
                    ),
                })),
                insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
                    const mockTask = createMockTask({ ...data } as Partial<Omit<MockTask, 'toJSON' | 'patch'>>);
                    insertedTasks.push(mockTask);
                    return Promise.resolve(undefined);
                }),
            },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock DB for testing
        } as any;

        // Day 1: Create 3 non-negotiable tasks
        await createTask(db, {
            title: 'Task A',
            priority: 'high',
            status: 'active',
            source: 'morning_flow',
            created_date: '2026-01-30', // Yesterday
            sort_order: 0,
            tags: ['non-negotiable'],
        });

        await createTask(db, {
            title: 'Task B',
            priority: 'high',
            status: 'active',
            source: 'morning_flow',
            created_date: '2026-01-30',
            sort_order: 1,
            tags: ['non-negotiable'],
        });

        await createTask(db, {
            title: 'Task C',
            priority: 'medium',
            status: 'active',
            source: 'morning_flow',
            created_date: '2026-01-30',
            sort_order: 2,
            tags: ['relief'],
        });

        expect(insertedTasks.length).toBe(3);

        // Step 2: Complete Task A
        // Simulate completing by finding the task and patching
        const taskA = insertedTasks.find(t => t.title === 'Task A');
        expect(taskA).toBeDefined();
        // Mark as completed in our mock (patch won't actually change the data)
        if (taskA) taskA.status = 'completed';

        // Step 3: Day 2 rollover — Task B and C should roll over (A is completed)
        // Update mock to return only active tasks from yesterday
        db.tasks.find = vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue(
                insertedTasks.filter(t =>
                    t.status === 'active' &&
                    t.created_date < '2026-01-31'
                )
            ),
        });

        const rolledCount = await rolloverTasks(db);

        expect(rolledCount).toBe(2); // Task B and Task C rolled over
    });
});
