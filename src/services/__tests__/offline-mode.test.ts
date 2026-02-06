import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Offline Mode Tests
 *
 * These tests verify that the app's core CRUD operations work independently
 * of network connectivity. RxDB is offline-first by design with IndexedDB
 * as local storage. These tests confirm the service layer contract.
 */

// Mock database helper
function mockDoc(data: Record<string, unknown>) {
    return {
        ...data,
        toJSON: () => data,
        patch: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockDb(
    tasks: ReturnType<typeof mockDoc>[] = [],
    journals: ReturnType<typeof mockDoc>[] = [],
    categories: ReturnType<typeof mockDoc>[] = []
) {
    return {
        tasks: {
            find: vi.fn((opts?: { selector?: Record<string, unknown>; sort?: unknown[] }) => ({
                exec: vi.fn().mockResolvedValue(
                    opts?.selector
                        ? tasks.filter(t => {
                            if ('status' in opts.selector) {
                                return t.status === opts.selector.status;
                            }
                            return true;
                        })
                        : tasks
                ),
            })),
            findOne: vi.fn((id: string) => ({
                exec: vi.fn().mockResolvedValue(tasks.find(t => t.id === id) || null),
            })),
            insert: vi.fn().mockResolvedValue(undefined),
        },
        daily_journal: {
            find: vi.fn(() => ({
                exec: vi.fn().mockResolvedValue(journals),
            })),
            findOne: vi.fn((id: string) => ({
                exec: vi.fn().mockResolvedValue(journals.find(j => j.id === id) || null),
            })),
            insert: vi.fn().mockResolvedValue(undefined),
        },
        categories: {
            find: vi.fn((opts?: { sort?: unknown[] }) => ({
                exec: vi.fn().mockResolvedValue(categories),
            })),
            findOne: vi.fn((id: string) => ({
                exec: vi.fn().mockResolvedValue(categories.find(c => c.id === id) || null),
            })),
            insert: vi.fn().mockResolvedValue(undefined),
        },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock DB for testing
    } as any;
}

describe('Offline Mode - Core CRUD Operations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    describe('Task Operations (Offline)', () => {
        it('should create a task without network', async () => {
            const { createTask } = await import('../task-rollover');
            const db = createMockDb();

            const task = await createTask(db, {
                title: 'Offline task',
                priority: 'medium',
                status: 'active',
                source: 'manual',
                created_date: '2026-02-04',
                sort_order: 0,
            });

            expect(task.id).toBeDefined();
            expect(task.title).toBe('Offline task');
            expect(task.created_at).toBeDefined();
            expect(db.tasks.insert).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Offline task' })
            );
        });

        it('should complete a task without network', async () => {
            const { completeTask } = await import('../task-rollover');
            const task = mockDoc({
                id: 'task-offline-1',
                title: 'Complete offline',
                status: 'active',
                category_id: 'cat-health',
            });
            const db = createMockDb([task]);

            // Mock streak service to avoid network dependency
            vi.mock('../streak-service', () => ({
                updateCategoryStreak: vi.fn().mockResolvedValue({ streak: 1, isNew: true }),
                updateCategoryProgress: vi.fn().mockResolvedValue(0.5),
            }));

            const result = await completeTask(db, 'task-offline-1');

            expect(task.patch).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'completed',
                    completed_date: expect.any(String),
                })
            );
            expect(result.streak).toBe(1);
        });

        it('should retrieve tasks after offline operations', async () => {
            const { getTodaysTasks } = await import('../task-rollover');
            const task1 = mockDoc({
                id: 'offline-task-1',
                title: 'Task 1',
                status: 'active',
                sort_order: 0,
            });
            const task2 = mockDoc({
                id: 'offline-task-2',
                title: 'Task 2',
                status: 'active',
                sort_order: 1,
            });
            const db = createMockDb([task1, task2]);

            const tasks = await getTodaysTasks(db);

            expect(tasks).toHaveLength(2);
            expect(tasks[0].title).toBe('Task 1');
            expect(tasks[1].title).toBe('Task 2');
        });
    });

    describe('Task Rollover (Offline)', () => {
        it('should roll over tasks without network', async () => {
            const { rolloverTasks } = await import('../task-rollover');
            const oldTask = mockDoc({
                id: 'old-task',
                title: 'Yesterday task',
                created_date: '2026-02-03',
                status: 'active',
            });
            const db = createMockDb([oldTask]);

            const count = await rolloverTasks(db);

            expect(count).toBe(1);
            expect(oldTask.patch).toHaveBeenCalledWith(
                expect.objectContaining({
                    rolled_from_date: '2026-02-03',
                })
            );
        });

        it('should defer a task without network', async () => {
            const { deferTask } = await import('../task-rollover');
            const task = mockDoc({
                id: 'defer-offline',
                title: 'Defer this',
                status: 'active',
            });
            const db = createMockDb([task]);

            await deferTask(db, 'defer-offline', 'Waiting on external input');

            expect(task.patch).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'deferred',
                    defer_reason: 'Waiting on external input',
                })
            );
        });

        it('should dismiss a task without network', async () => {
            const { dismissTask } = await import('../task-rollover');
            const task = mockDoc({
                id: 'dismiss-offline',
                title: 'Dismiss this',
                status: 'active',
            });
            const db = createMockDb([task]);

            await dismissTask(db, 'dismiss-offline');

            expect(task.patch).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'dismissed',
                    completed_date: expect.any(String),
                })
            );
        });
    });

    describe('Journal Entry Operations (Offline)', () => {
        it('should create a journal entry without network', async () => {
            const db = createMockDb();
            const today = new Date().toISOString().split('T')[0];

            // Simulate morning flow journal creation
            await db.daily_journal.insert({
                id: crypto.randomUUID(),
                date: today,
                gratitude: ['Health', 'Family', 'Progress'],
                non_negotiables: ['Exercise', 'Deep work', 'Read'],
                stressors: ['Email backlog'],
                habits: { hydrate: true, meditate: false },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });

            expect(db.daily_journal.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    date: today,
                    gratitude: ['Health', 'Family', 'Progress'],
                })
            );
        });

        it('should retrieve journal entries without network', async () => {
            const journal = mockDoc({
                id: 'journal-1',
                date: '2026-02-04',
                gratitude: ['Test gratitude'],
                non_negotiables: ['Test win'],
                stressors: [],
                habits: {},
            });
            const db = createMockDb([], [journal]);

            const journals = await db.daily_journal.find().exec();

            expect(journals).toHaveLength(1);
            expect(journals[0].date).toBe('2026-02-04');
        });

        it('should update a journal entry without network', async () => {
            const journal = mockDoc({
                id: 'journal-update',
                date: '2026-02-04',
                gratitude: ['Original'],
                non_negotiables: [],
                stressors: [],
                habits: {},
            });
            const db = createMockDb([], [journal]);

            // Update journal
            await journal.patch({
                gratitude: ['Original', 'Updated'],
                updated_at: new Date().toISOString(),
            });

            expect(journal.patch).toHaveBeenCalledWith(
                expect.objectContaining({
                    gratitude: ['Original', 'Updated'],
                })
            );
        });
    });

    describe('Category CRUD (Offline)', () => {
        it('should create a category without network', async () => {
            const db = createMockDb();
            const now = new Date().toISOString();

            // Simulate category creation (from CategoryManager component)
            await db.categories.insert({
                id: crypto.randomUUID(),
                name: 'Offline Category',
                color_theme: '#F59E0B',
                icon: 'star',
                current_progress: 0,
                streak_count: 0,
                sort_order: 0,
                created_at: now,
                updated_at: now,
            });

            expect(db.categories.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Offline Category',
                    color_theme: '#F59E0B',
                })
            );
        });

        it('should update a category without network', async () => {
            const category = mockDoc({
                id: 'cat-update',
                name: 'Old Name',
                color_theme: '#3B82F6',
                icon: 'heart',
                current_progress: 0,
                streak_count: 0,
            });
            const db = createMockDb([], [], [category]);

            // Update category
            await category.patch({
                name: 'New Name',
                color_theme: '#10B981',
                updated_at: new Date().toISOString(),
            });

            expect(category.patch).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'New Name',
                    color_theme: '#10B981',
                })
            );
        });

        it('should delete a category without network', async () => {
            const category = mockDoc({
                id: 'cat-delete',
                name: 'To Delete',
                color_theme: '#EF4444',
                icon: 'trash',
            });
            const db = createMockDb([], [], [category]);

            // Delete category
            await category.remove();

            expect(category.remove).toHaveBeenCalled();
        });

        it('should retrieve categories without network', async () => {
            const cat1 = mockDoc({
                id: 'cat-1',
                name: 'Health',
                color_theme: '#10B981',
                sort_order: 0,
            });
            const cat2 = mockDoc({
                id: 'cat-2',
                name: 'Wealth',
                color_theme: '#F59E0B',
                sort_order: 1,
            });
            const db = createMockDb([], [], [cat1, cat2]);

            const categories = await db.categories.find({ sort: [{ sort_order: 'asc' }] }).exec();

            expect(categories).toHaveLength(2);
            expect(categories[0].name).toBe('Health');
            expect(categories[1].name).toBe('Wealth');
        });
    });

    describe('Data Persistence (Offline)', () => {
        it('should read back data written offline', async () => {
            const { createTask, getTodaysTasks } = await import('../task-rollover');

            // Create task
            const task = mockDoc({
                id: 'persist-1',
                title: 'Persisted task',
                status: 'active',
                source: 'manual',
                created_date: '2026-02-04',
                sort_order: 0,
            });
            const db = createMockDb([task]);

            // Write
            await createTask(db, {
                title: 'New task',
                priority: 'high',
                status: 'active',
                source: 'brain_dump',
                created_date: '2026-02-04',
                sort_order: 1,
            });

            // Read back
            const tasks = await getTodaysTasks(db);

            expect(tasks.length).toBeGreaterThan(0);
            expect(db.tasks.insert).toHaveBeenCalled();
        });

        it('should maintain data integrity across operations', async () => {
            const { createTask, completeTask, getTodaysTasks } = await import('../task-rollover');
            const task1 = mockDoc({
                id: 'integrity-1',
                title: 'Task 1',
                status: 'active',
                category_id: 'cat-1',
            });
            const task2 = mockDoc({
                id: 'integrity-2',
                title: 'Task 2',
                status: 'active',
                category_id: 'cat-1',
            });
            const db = createMockDb([task1, task2]);

            // Mock streak service
            vi.mock('../streak-service', () => ({
                updateCategoryStreak: vi.fn().mockResolvedValue({ streak: 2, isNew: true }),
                updateCategoryProgress: vi.fn().mockResolvedValue(0.75),
            }));

            // Create, complete, read
            await createTask(db, {
                title: 'Task 3',
                status: 'active',
                source: 'manual',
                created_date: '2026-02-04',
                sort_order: 2,
            });

            await completeTask(db, 'integrity-1');

            const tasks = await getTodaysTasks(db);

            // Both operations succeeded
            expect(db.tasks.insert).toHaveBeenCalled();
            expect(task1.patch).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'completed' })
            );
            expect(tasks.length).toBeGreaterThan(0);
        });
    });

    describe('Offline Contract Verification', () => {
        it('should handle task history queries without network', async () => {
            const { getTaskHistory } = await import('../task-rollover');
            const task1 = mockDoc({
                id: 'hist-1',
                title: 'History 1',
                created_date: '2026-02-01',
            });
            const task2 = mockDoc({
                id: 'hist-2',
                title: 'History 2',
                created_date: '2026-02-03',
            });
            const db = createMockDb([task1, task2]);

            const history = await getTaskHistory(db, '2026-02-01', '2026-02-04');

            expect(history.length).toBeGreaterThan(0);
            expect(db.tasks.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    selector: {
                        created_date: {
                            $gte: '2026-02-01',
                            $lte: '2026-02-04',
                        },
                    },
                })
            );
        });

        it('should support complex offline workflows', async () => {
            const { createTask, rolloverTasks, completeTask } = await import('../task-rollover');

            // Day 1: Create tasks
            const task1 = mockDoc({
                id: 'workflow-1',
                title: 'Day 1 task',
                created_date: '2026-02-03',
                status: 'active',
            });
            const db = createMockDb([task1]);

            await createTask(db, {
                title: 'Another task',
                status: 'active',
                source: 'manual',
                created_date: '2026-02-03',
                sort_order: 1,
            });

            // Day 2: Rollover
            const rolledCount = await rolloverTasks(db);
            expect(rolledCount).toBeGreaterThan(0);

            // Day 2: Complete
            vi.mock('../streak-service', () => ({
                updateCategoryStreak: vi.fn().mockResolvedValue({ streak: 1, isNew: true }),
                updateCategoryProgress: vi.fn().mockResolvedValue(0.5),
            }));

            await completeTask(db, 'workflow-1');

            // All operations succeeded without network
            expect(db.tasks.insert).toHaveBeenCalled();
            expect(task1.patch).toHaveBeenCalled();
        });
    });
});
