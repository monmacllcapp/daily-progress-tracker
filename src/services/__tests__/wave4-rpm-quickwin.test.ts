import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task } from '../../types/schema';


// -- Mock DB helpers (matching the pattern from task-rollover.test.ts) --

interface MockTask {
    id: string;
    title: string;
    status: string;
    source: string;
    created_date: string;
    goal_id?: string;
    category_id?: string;
    time_estimate_minutes?: number;
    sort_order: number;
    tags?: string[];
    toJSON: () => Omit<MockTask, 'toJSON' | 'patch'>;
    patch: ReturnType<typeof vi.fn>;
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

// -- RPM Wizard Task Creation Tests --

describe('RPM Wizard Task Creation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-31T08:00:00Z'));
    });

    it('should create a task with source=rpm_wizard and goal_id', async () => {
        const { createTask } = await import('../task-rollover');
        const db = createMockDb([]);

        const task = await createTask(db, {
            title: 'Design landing page',
            priority: 'medium',
            status: 'active',
            source: 'rpm_wizard',
            created_date: '2026-01-31',
            sort_order: 0,
            goal_id: 'project-123',
            category_id: 'cat-health',
            tags: ['rpm-action'],
        });

        expect(task.source).toBe('rpm_wizard');
        expect(task.goal_id).toBe('project-123');
        expect(task.category_id).toBe('cat-health');
        expect(task.tags).toContain('rpm-action');
        expect(db.tasks.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'rpm_wizard',
                goal_id: 'project-123',
                category_id: 'cat-health',
            })
        );
    });

    it('should create a task with time estimate from subtask', async () => {
        const { createTask } = await import('../task-rollover');
        const db = createMockDb([]);

        const task = await createTask(db, {
            title: 'Write unit tests',
            priority: 'medium',
            status: 'active',
            source: 'rpm_wizard',
            created_date: '2026-01-31',
            sort_order: 1,
            goal_id: 'project-123',
            time_estimate_minutes: 120, // 2 hours converted to minutes
        });

        expect(task.time_estimate_minutes).toBe(120);
        expect(db.tasks.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                time_estimate_minutes: 120,
            })
        );
    });

    it('should create multiple tasks with sequential sort orders', async () => {
        const { createTask } = await import('../task-rollover');
        const db = createMockDb([]);

        const task1 = await createTask(db, {
            title: 'Step 1',
            priority: 'medium',
            status: 'active',
            source: 'rpm_wizard',
            created_date: '2026-01-31',
            sort_order: 5,
            goal_id: 'project-123',
        });

        const task2 = await createTask(db, {
            title: 'Step 2',
            priority: 'medium',
            status: 'active',
            source: 'rpm_wizard',
            created_date: '2026-01-31',
            sort_order: 6,
            goal_id: 'project-123',
        });

        expect(task1.sort_order).toBe(5);
        expect(task2.sort_order).toBe(6);
        expect(db.tasks.insert).toHaveBeenCalledTimes(2);
    });
});

// -- Quick-Win Detection Tests --

describe('Quick-Win Detection (Power Batch)', () => {
    // This mirrors the logic used in TaskDashboard for Power Batch grouping
    function getQuickWins(tasks: Partial<Task>[]): Partial<Task>[] {
        return tasks.filter(
            t => t.status === 'active' && t.time_estimate_minutes && t.time_estimate_minutes <= 5
        );
    }

    it('should identify tasks with estimate <= 5 minutes as quick wins', () => {
        const tasks: Partial<Task>[] = [
            { id: '1', title: 'Quick call', status: 'active', time_estimate_minutes: 3 },
            { id: '2', title: 'Long meeting', status: 'active', time_estimate_minutes: 60 },
            { id: '3', title: 'Send email', status: 'active', time_estimate_minutes: 2 },
            { id: '4', title: 'Exact 5min', status: 'active', time_estimate_minutes: 5 },
        ];

        const quickWins = getQuickWins(tasks);
        expect(quickWins).toHaveLength(3);
        expect(quickWins.map(t => t.id)).toEqual(['1', '3', '4']);
    });

    it('should exclude completed tasks from quick wins', () => {
        const tasks: Partial<Task>[] = [
            { id: '1', title: 'Quick call', status: 'active', time_estimate_minutes: 3 },
            { id: '2', title: 'Done task', status: 'completed', time_estimate_minutes: 2 },
        ];

        const quickWins = getQuickWins(tasks);
        expect(quickWins).toHaveLength(1);
        expect(quickWins[0].id).toBe('1');
    });

    it('should exclude tasks with no time estimate', () => {
        const tasks: Partial<Task>[] = [
            { id: '1', title: 'No estimate', status: 'active' },
            { id: '2', title: 'Has estimate', status: 'active', time_estimate_minutes: 4 },
        ];

        const quickWins = getQuickWins(tasks);
        expect(quickWins).toHaveLength(1);
        expect(quickWins[0].id).toBe('2');
    });

    it('should return empty array when no quick wins exist', () => {
        const tasks: Partial<Task>[] = [
            { id: '1', title: 'Big project', status: 'active', time_estimate_minutes: 120 },
            { id: '2', title: 'Medium task', status: 'active', time_estimate_minutes: 30 },
        ];

        const quickWins = getQuickWins(tasks);
        expect(quickWins).toHaveLength(0);
    });

    it('should calculate total time for power batch', () => {
        const tasks: Partial<Task>[] = [
            { id: '1', status: 'active', time_estimate_minutes: 3 },
            { id: '2', status: 'active', time_estimate_minutes: 5 },
            { id: '3', status: 'active', time_estimate_minutes: 2 },
        ];

        const quickWins = getQuickWins(tasks);
        const totalMinutes = quickWins.reduce((sum, t) => sum + (t.time_estimate_minutes || 0), 0);
        expect(totalMinutes).toBe(10);
    });

    it('should not include 6-minute tasks as quick wins', () => {
        const tasks: Partial<Task>[] = [
            { id: '1', status: 'active', time_estimate_minutes: 6 },
            { id: '2', status: 'active', time_estimate_minutes: 5 },
        ];

        const quickWins = getQuickWins(tasks);
        expect(quickWins).toHaveLength(1);
        expect(quickWins[0].id).toBe('2');
    });
});
