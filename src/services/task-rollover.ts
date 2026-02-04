import type { TitanDatabase } from '../db';
import type { Task } from '../types/schema';
import { updateCategoryStreak, updateCategoryProgress } from './streak-service';
import { onTaskComplete } from './gamification';
import { trackEvent } from './analytics';

/**
 * TaskRolloverService
 *
 * At daily reset (6 AM), queries all tasks with status='active' that have
 * a created_date before today. These are "rolled over" — they stay active
 * but get their rolled_from_date updated so the UI can show
 * "rolled from [date]" badges.
 */

export async function rolloverTasks(db: TitanDatabase): Promise<number> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Find all active tasks from previous days
    const activeTasks = await db.tasks.find({
        selector: {
            status: 'active',
            created_date: { $lt: today }
        }
    }).exec();

    let rolledCount = 0;

    for (const task of activeTasks) {
        const taskData = task.toJSON() as Task;
        // Only update if not already rolled today
        if (taskData.rolled_from_date !== taskData.created_date) {
            await task.patch({
                rolled_from_date: taskData.rolled_from_date || taskData.created_date,
                updated_at: new Date().toISOString()
            });
            rolledCount++;
        }
    }

    console.log(`[TaskRollover] Rolled ${rolledCount} tasks to ${today}`);
    return rolledCount;
}

/**
 * Gets today's active tasks (including rolled-over ones)
 */
export async function getTodaysTasks(db: TitanDatabase): Promise<Task[]> {
    const tasks = await db.tasks.find({
        selector: {
            status: 'active'
        },
        sort: [{ sort_order: 'asc' }]
    }).exec();

    return tasks.map(t => t.toJSON() as Task);
}

/**
 * Creates a new task in the database
 */
export async function createTask(
    db: TitanDatabase,
    task: Omit<Task, 'id' | 'created_at' | 'updated_at'>
): Promise<Task> {
    const now = new Date().toISOString();
    const newTask: Task = {
        ...task,
        id: crypto.randomUUID(),
        category_id: task.category_id || '',
        created_at: now,
        updated_at: now,
    };

    await db.tasks.insert(newTask);
    return newTask;
}

/**
 * Completes a task and updates category streak/progress.
 * Returns streak info if the task had a category.
 */
export async function completeTask(db: TitanDatabase, taskId: string): Promise<{ streak?: number; isNewStreak?: boolean }> {
    const task = await db.tasks.findOne(taskId).exec();
    if (!task) return {};

    const taskData = task.toJSON() as Task;
    await task.patch({
        status: 'completed',
        completed_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
    });

    let streakCount = 0;

    // Update category streak and progress if task has a category
    if (taskData.category_id) {
        const streakResult = await updateCategoryStreak(db, taskData.category_id);
        await updateCategoryProgress(db, taskData.category_id);
        streakCount = streakResult.streak;

        // Award XP for task completion
        onTaskComplete(db, streakCount).catch(err =>
            console.warn('[Gamification] Failed to award XP for task completion:', err)
        );

        // Track task completion (analytics)
        trackEvent(db, 'task_complete', {
            priority: taskData.priority,
            source: taskData.source,
            has_category: true,
            time_estimate: taskData.time_estimate_minutes || 0,
        }).catch(err =>
            console.warn('[Analytics] Failed to track task completion:', err)
        );

        return { streak: streakResult.streak, isNewStreak: streakResult.isNew };
    }

    // Award XP even if no category
    onTaskComplete(db, streakCount).catch(err =>
        console.warn('[Gamification] Failed to award XP for task completion:', err)
    );

    // Track task completion (analytics)
    trackEvent(db, 'task_complete', {
        priority: taskData.priority,
        source: taskData.source,
        has_category: false,
        time_estimate: taskData.time_estimate_minutes || 0,
    }).catch(err =>
        console.warn('[Analytics] Failed to track task completion:', err)
    );

    return {};
}

/**
 * Dismisses a task
 */
export async function dismissTask(db: TitanDatabase, taskId: string): Promise<void> {
    const task = await db.tasks.findOne(taskId).exec();
    if (!task) return;

    await task.patch({
        status: 'dismissed',
        completed_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
    });
}

/**
 * Defers a task with a reason
 */
export async function deferTask(db: TitanDatabase, taskId: string, reason: string): Promise<void> {
    const task = await db.tasks.findOne(taskId).exec();
    if (!task) return;

    await task.patch({
        status: 'deferred',
        defer_reason: reason,
        updated_at: new Date().toISOString()
    });
}

/**
 * Gets task history for a specific date range
 */
export async function getTaskHistory(
    db: TitanDatabase,
    startDate: string,
    endDate: string
): Promise<Task[]> {
    const tasks = await db.tasks.find({
        selector: {
            created_date: {
                $gte: startDate,
                $lte: endDate
            }
        },
        sort: [{ created_date: 'desc' }]
    }).exec();

    return tasks.map(t => t.toJSON() as Task);
}
