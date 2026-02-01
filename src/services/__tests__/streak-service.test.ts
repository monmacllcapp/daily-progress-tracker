import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock document helper
function mockDoc(data: Record<string, unknown>) {
    return {
        ...data,
        toJSON: () => data,
        patch: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
    } as Record<string, unknown> & { toJSON: () => Record<string, unknown>; patch: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
}

function createMockDb(categories: ReturnType<typeof mockDoc>[] = [], tasks: ReturnType<typeof mockDoc>[] = [], projects: ReturnType<typeof mockDoc>[] = [], subtasks: ReturnType<typeof mockDoc>[] = []) {
    return {
        categories: {
            findOne: vi.fn((id: string) => ({
                exec: vi.fn().mockResolvedValue(categories.find(c => c.id === id) || null),
            })),
            find: vi.fn((opts?: Record<string, Record<string, unknown>>) => ({
                exec: vi.fn().mockResolvedValue(
                    opts?.selector?.status ? categories.filter((c) => c.status === opts.selector.status) : categories
                ),
            })),
        },
        tasks: {
            find: vi.fn((opts?: Record<string, Record<string, unknown>>) => ({
                exec: vi.fn().mockResolvedValue(
                    opts?.selector
                        ? tasks.filter((t) => {
                            if (opts.selector.status && opts.selector.completed_date) {
                                return t.status === opts.selector.status && t.completed_date === opts.selector.completed_date;
                            }
                            if (opts.selector.category_id) {
                                return t.category_id === opts.selector.category_id;
                            }
                            return true;
                        })
                        : tasks
                ),
            })),
        },
        projects: {
            find: vi.fn((opts?: Record<string, Record<string, unknown>>) => ({
                exec: vi.fn().mockResolvedValue(
                    opts?.selector?.category_id
                        ? projects.filter((p) => p.category_id === opts.selector.category_id)
                        : projects
                ),
            })),
        },
        sub_tasks: {
            find: vi.fn(() => ({
                exec: vi.fn().mockResolvedValue(subtasks),
            })),
        },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock DB for testing
    } as any;
}

describe('StreakService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    describe('updateCategoryStreak', () => {
        it('should start a new streak on first activity', async () => {
            const cat = mockDoc({
                id: 'cat-1', name: 'Health', color_theme: '#F00',
                streak_count: 0, last_active_date: undefined, current_progress: 0,
            });
            const db = createMockDb([cat]);

            const { updateCategoryStreak } = await import('../streak-service');
            const result = await updateCategoryStreak(db, 'cat-1');

            expect(result.streak).toBe(1);
            expect(result.isNew).toBe(true);
            expect(cat.patch).toHaveBeenCalledWith(
                expect.objectContaining({ streak_count: 1 })
            );
        });

        it('should extend streak on consecutive day', async () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const cat = mockDoc({
                id: 'cat-2', name: 'Wealth', color_theme: '#0F0',
                streak_count: 5, last_active_date: yesterday.toISOString().split('T')[0],
                current_progress: 0.5,
            });
            const db = createMockDb([cat]);

            const { updateCategoryStreak } = await import('../streak-service');
            const result = await updateCategoryStreak(db, 'cat-2');

            expect(result.streak).toBe(6);
            expect(result.isNew).toBe(true);
        });

        it('should reset streak after gap of more than 1 day', async () => {
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 3);
            const cat = mockDoc({
                id: 'cat-3', name: 'Mind', color_theme: '#00F',
                streak_count: 10, last_active_date: twoDaysAgo.toISOString().split('T')[0],
                current_progress: 0.3,
            });
            const db = createMockDb([cat]);

            const { updateCategoryStreak } = await import('../streak-service');
            const result = await updateCategoryStreak(db, 'cat-3');

            expect(result.streak).toBe(1);
            expect(result.isNew).toBe(true);
        });

        it('should not double-count same-day activity', async () => {
            const today = new Date().toISOString().split('T')[0];
            const cat = mockDoc({
                id: 'cat-4', name: 'Fitness', color_theme: '#FF0',
                streak_count: 3, last_active_date: today,
                current_progress: 0.6,
            });
            const db = createMockDb([cat]);

            const { updateCategoryStreak } = await import('../streak-service');
            const result = await updateCategoryStreak(db, 'cat-4');

            expect(result.streak).toBe(3);
            expect(result.isNew).toBe(false);
            expect(cat.patch).not.toHaveBeenCalled();
        });

        it('should return 0 for non-existent category', async () => {
            const db = createMockDb([]);

            const { updateCategoryStreak } = await import('../streak-service');
            const result = await updateCategoryStreak(db, 'nonexistent');

            expect(result.streak).toBe(0);
            expect(result.isNew).toBe(false);
        });
    });

    describe('checkStreakResets', () => {
        it('should reset streaks for categories inactive for 2+ days', async () => {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            const cat = mockDoc({
                id: 'cat-reset', name: 'Stale', color_theme: '#AAA',
                streak_count: 7, last_active_date: threeDaysAgo.toISOString().split('T')[0],
            });
            const db = createMockDb([cat]);

            const { checkStreakResets } = await import('../streak-service');
            const resetIds = await checkStreakResets(db);

            expect(resetIds).toContain('cat-reset');
            expect(cat.patch).toHaveBeenCalledWith(
                expect.objectContaining({ streak_count: 0 })
            );
        });

        it('should NOT reset categories active yesterday', async () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const cat = mockDoc({
                id: 'cat-active', name: 'Active', color_theme: '#0F0',
                streak_count: 14, last_active_date: yesterday.toISOString().split('T')[0],
            });
            const db = createMockDb([cat]);

            const { checkStreakResets } = await import('../streak-service');
            const resetIds = await checkStreakResets(db);

            expect(resetIds).not.toContain('cat-active');
            expect(cat.patch).not.toHaveBeenCalled();
        });

        it('should NOT reset categories with zero streak', async () => {
            const cat = mockDoc({
                id: 'cat-zero', name: 'Zero', color_theme: '#CCC',
                streak_count: 0, last_active_date: undefined,
            });
            const db = createMockDb([cat]);

            const { checkStreakResets } = await import('../streak-service');
            const resetIds = await checkStreakResets(db);

            expect(resetIds).not.toContain('cat-zero');
            expect(cat.patch).not.toHaveBeenCalled();
        });
    });

    describe('getDailyProgress', () => {
        it('should count tasks completed today', async () => {
            const today = new Date().toISOString().split('T')[0];
            const tasks = [
                mockDoc({ id: 't1', status: 'completed', completed_date: today, category_id: 'cat-1' }),
                mockDoc({ id: 't2', status: 'completed', completed_date: today, category_id: 'cat-1' }),
                mockDoc({ id: 't3', status: 'completed', completed_date: today, category_id: 'cat-2' }),
            ];
            const categories = [
                mockDoc({ id: 'cat-1', name: 'Health', streak_count: 5 }),
                mockDoc({ id: 'cat-2', name: 'Work', streak_count: 3 }),
            ];
            const db = createMockDb(categories, tasks);

            const { getDailyProgress } = await import('../streak-service');
            const progress = await getDailyProgress(db);

            expect(progress.tasksCompleted).toBe(3);
            expect(progress.categoriesActive).toBe(2);
            expect(progress.longestStreak?.categoryName).toBe('Health');
            expect(progress.longestStreak?.count).toBe(5);
            expect(progress.totalStreak).toBe(8);
        });

        it('should handle empty state', async () => {
            const db = createMockDb([], []);

            const { getDailyProgress } = await import('../streak-service');
            const progress = await getDailyProgress(db);

            expect(progress.tasksCompleted).toBe(0);
            expect(progress.categoriesActive).toBe(0);
            expect(progress.totalStreak).toBe(0);
        });
    });

    describe('updateCategoryProgress', () => {
        it('should calculate progress from tasks and subtasks', async () => {
            const cat = mockDoc({
                id: 'cat-prog', name: 'Progress', color_theme: '#F00',
                current_progress: 0,
            });
            const tasks = [
                mockDoc({ id: 't1', category_id: 'cat-prog', status: 'completed' }),
                mockDoc({ id: 't2', category_id: 'cat-prog', status: 'active' }),
            ];
            const projects = [
                mockDoc({ id: 'p1', category_id: 'cat-prog' }),
            ];
            const subtasks = [
                mockDoc({ id: 's1', project_id: 'p1', is_completed: true }),
                mockDoc({ id: 's2', project_id: 'p1', is_completed: false }),
            ];
            const db = createMockDb([cat], tasks, projects, subtasks);

            const { updateCategoryProgress } = await import('../streak-service');
            const progress = await updateCategoryProgress(db, 'cat-prog');

            // 2 completed out of 4 total (1 task + 1 subtask completed, 2 task + 2 subtask total)
            expect(progress).toBe(0.5);
            expect(cat.patch).toHaveBeenCalledWith(
                expect.objectContaining({ current_progress: 0.5 })
            );
        });

        it('should return 0 for empty category', async () => {
            const cat = mockDoc({
                id: 'cat-empty', name: 'Empty', color_theme: '#000',
                current_progress: 0,
            });
            const db = createMockDb([cat], [], [], []);

            const { updateCategoryProgress } = await import('../streak-service');
            const progress = await updateCategoryProgress(db, 'cat-empty');

            expect(progress).toBe(0);
        });
    });
});
