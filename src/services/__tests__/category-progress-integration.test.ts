import { describe, it, expect, vi, beforeEach } from 'vitest';

// Integration test: task completion → category progress update → streak increment → radar reflects change

function mockDoc(data: Record<string, unknown>) {
    return {
        ...data,
        toJSON: () => ({ ...data }),
        patch: vi.fn().mockImplementation(async (update) => {
            Object.assign(data, update);
            return undefined;
        }),
        remove: vi.fn().mockResolvedValue(undefined),
    };
}

describe('Category Progress Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('completing a task should update category streak and progress', async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const category = mockDoc({
            id: 'cat-health', name: 'Health', color_theme: '#EF4444',
            streak_count: 3, last_active_date: yesterday.toISOString().split('T')[0],
            current_progress: 0.25, sort_order: 0,
        });

        const task = mockDoc({
            id: 'task-gym', title: 'Go to gym', category_id: 'cat-health',
            status: 'active', priority: 'high', source: 'morning_flow',
            created_date: new Date().toISOString().split('T')[0], sort_order: 0,
        });

        const completedTask = mockDoc({
            id: 'task-done', title: 'Morning run', category_id: 'cat-health',
            status: 'completed', priority: 'medium', source: 'morning_flow',
            created_date: new Date().toISOString().split('T')[0], sort_order: 1,
        });

        const db = {
            categories: {
                findOne: vi.fn((id: string) => ({
                    exec: vi.fn().mockResolvedValue(id === 'cat-health' ? category : null),
                })),
                find: vi.fn(() => ({
                    exec: vi.fn().mockResolvedValue([category]),
                })),
            },
            tasks: {
                findOne: vi.fn((id: string) => ({
                    exec: vi.fn().mockResolvedValue(
                        id === 'task-gym' ? task : id === 'task-done' ? completedTask : null
                    ),
                })),
                find: vi.fn((opts?: Record<string, unknown>) => ({
                    exec: vi.fn().mockResolvedValue(
                        (opts?.selector as Record<string, unknown>)?.category_id === 'cat-health'
                            ? [task, completedTask]
                            : (opts?.selector as Record<string, unknown>)?.status === 'completed'
                                ? [completedTask]
                                : [task, completedTask]
                    ),
                })),
            },
            projects: {
                find: vi.fn(() => ({
                    exec: vi.fn().mockResolvedValue([]),
                })),
            },
            sub_tasks: {
                find: vi.fn(() => ({
                    exec: vi.fn().mockResolvedValue([]),
                })),
            },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock DB for testing
        } as any;

        // Import streak service
        const { updateCategoryStreak, updateCategoryProgress } = await import('../streak-service');

        // Step 1: Update streak (simulating what completeTask does)
        const streakResult = await updateCategoryStreak(db, 'cat-health');

        // Streak should extend from 3 to 4 (yesterday → today)
        expect(streakResult.streak).toBe(4);
        expect(streakResult.isNew).toBe(true);
        expect(category.patch).toHaveBeenCalledWith(
            expect.objectContaining({
                streak_count: 4,
                last_active_date: new Date().toISOString().split('T')[0],
            })
        );

        // Step 2: Update progress
        const progress = await updateCategoryProgress(db, 'cat-health');

        // 1 completed task out of 2 total (no subtasks) = 0.5
        expect(progress).toBe(0.5);
    });

    it('radar data should reflect real-time progress from tasks', async () => {
        // Simulate what WheelOfLife.tsx does: calculate progress per category
        const categories = [
            { id: 'cat-a', name: 'Health', streak_count: 5 },
            { id: 'cat-b', name: 'Work', streak_count: 2 },
        ];

        const tasks = [
            { id: 't1', category_id: 'cat-a', status: 'completed' },
            { id: 't2', category_id: 'cat-a', status: 'active' },
            { id: 't3', category_id: 'cat-a', status: 'completed' },
            { id: 't4', category_id: 'cat-b', status: 'completed' },
            { id: 't5', category_id: 'cat-b', status: 'completed' },
            { id: 't6', category_id: 'cat-b', status: 'completed' },
            { id: 't7', category_id: 'cat-b', status: 'active' },
        ];

        const projects: Record<string, unknown>[] = [];
        const subtasks: Record<string, unknown>[] = [];

        // Calculate progress per category (matching WheelOfLife logic)
        const categoryProgress: Record<string, number> = {};
        for (const cat of categories) {
            const catProjects = projects.filter((p) => p.category_id === cat.id);
            const catSubtasks = subtasks.filter((st) =>
                catProjects.some((p) => p.id === st.project_id)
            );
            const catTasks = tasks.filter(t => t.category_id === cat.id);

            const totalItems = catSubtasks.length + catTasks.length;
            const completedItems = catSubtasks.filter((st) => st.is_completed).length
                + catTasks.filter(t => t.status === 'completed').length;

            categoryProgress[cat.id] = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
        }

        // Health: 2/3 completed = 66.67%
        expect(Math.round(categoryProgress['cat-a'])).toBe(67);

        // Work: 3/4 completed = 75%
        expect(Math.round(categoryProgress['cat-b'])).toBe(75);

        // Symmetry check (matching WheelOfLife logic)
        const values = categories.map(c => categoryProgress[c.id] || 0);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        const symmetryScore = Math.min(stdDev / Math.max(mean, 1), 1);

        // Both categories are fairly close (67% vs 75%), so symmetry should be low
        expect(symmetryScore).toBeLessThan(0.25);
    });

    it('streak should reset when checkStreakResets runs after missed day', async () => {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const staleCat = mockDoc({
            id: 'cat-stale', name: 'Stale', color_theme: '#999',
            streak_count: 15, last_active_date: threeDaysAgo.toISOString().split('T')[0],
        });

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const activeCat = mockDoc({
            id: 'cat-recent', name: 'Recent', color_theme: '#0F0',
            streak_count: 7, last_active_date: yesterday.toISOString().split('T')[0],
        });

        const db = {
            categories: {
                find: vi.fn(() => ({
                    exec: vi.fn().mockResolvedValue([staleCat, activeCat]),
                })),
            },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock DB for testing
        } as any;

        const { checkStreakResets } = await import('../streak-service');
        const resetIds = await checkStreakResets(db);

        // Only stale category should be reset
        expect(resetIds).toEqual(['cat-stale']);
        expect(staleCat.patch).toHaveBeenCalledWith(
            expect.objectContaining({ streak_count: 0 })
        );
        expect(activeCat.patch).not.toHaveBeenCalled();
    });
});
