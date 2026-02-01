import type { TitanDatabase } from '../db';

/**
 * StreakService — Calculates and updates category streaks.
 *
 * A "streak" = consecutive days where at least one task in the category
 * was completed. Streaks reset to 0 if a day is missed.
 */

/**
 * Update a category's streak after task completion.
 * Call this whenever a task with a category_id is completed.
 */
export async function updateCategoryStreak(
    db: TitanDatabase,
    categoryId: string
): Promise<{ streak: number; isNew: boolean }> {
    const categoryDoc = await db.categories.findOne(categoryId).exec();
    if (!categoryDoc) return { streak: 0, isNew: false };

    const category = categoryDoc.toJSON();
    const today = new Date().toISOString().split('T')[0];

    // Already active today — streak already counted
    if (category.last_active_date === today) {
        return { streak: category.streak_count, isNew: false };
    }

    const yesterday = getYesterday();

    let newStreak: number;
    if (category.last_active_date === yesterday) {
        // Consecutive day — extend streak
        newStreak = (category.streak_count || 0) + 1;
    } else if (!category.last_active_date) {
        // First activity ever
        newStreak = 1;
    } else {
        // Gap > 1 day — reset streak
        newStreak = 1;
    }

    await categoryDoc.patch({
        streak_count: newStreak,
        last_active_date: today,
        updated_at: new Date().toISOString(),
    });

    return { streak: newStreak, isNew: true };
}

/**
 * Check all categories for broken streaks (daily reset).
 * Call this at 6 AM reset or app startup.
 * Categories that had activity yesterday keep their streak.
 * Categories that missed yesterday get reset to 0.
 */
export async function checkStreakResets(db: TitanDatabase): Promise<string[]> {
    const yesterday = getYesterday();

    const categories = await db.categories.find().exec();
    const resetIds: string[] = [];

    for (const doc of categories) {
        const cat = doc.toJSON();
        // If category had a streak but last activity was before yesterday, reset it
        if (cat.streak_count > 0 && cat.last_active_date && cat.last_active_date < yesterday) {
            await doc.patch({
                streak_count: 0,
                updated_at: new Date().toISOString(),
            });
            resetIds.push(cat.id);
        }
    }

    return resetIds;
}

/**
 * Get daily progress summary.
 */
export async function getDailyProgress(db: TitanDatabase): Promise<{
    tasksCompleted: number;
    categoriesActive: number;
    totalStreak: number;
    longestStreak: { categoryName: string; count: number } | null;
}> {
    const today = new Date().toISOString().split('T')[0];

    // Tasks completed today
    const allTasks = await db.tasks.find({
        selector: {
            status: 'completed',
            completed_date: today,
        }
    }).exec();

    // Unique categories active today
    const categoryIds = new Set(
        allTasks.map(t => t.toJSON().category_id).filter(Boolean) as string[]
    );

    // All categories for streak info
    const categories = await db.categories.find().exec();
    const catData = categories.map(d => d.toJSON());

    const totalStreak = catData.reduce((sum, c) => sum + (c.streak_count || 0), 0);
    const longest = catData.reduce<{ categoryName: string; count: number } | null>(
        (best, c) => {
            if ((c.streak_count || 0) > (best?.count || 0)) {
                return { categoryName: c.name, count: c.streak_count };
            }
            return best;
        },
        null
    );

    return {
        tasksCompleted: allTasks.length,
        categoriesActive: categoryIds.size,
        totalStreak,
        longestStreak: longest,
    };
}

/**
 * Update category progress score based on current task/milestone completion.
 */
export async function updateCategoryProgress(
    db: TitanDatabase,
    categoryId: string
): Promise<number> {
    const catDoc = await db.categories.findOne(categoryId).exec();
    if (!catDoc) return 0;

    // Get tasks for this category
    const catTasks = await db.tasks.find({
        selector: { category_id: categoryId }
    }).exec();

    // Get projects for this category
    const catProjects = await db.projects.find({
        selector: { category_id: categoryId }
    }).exec();

    // Get subtasks for those projects
    const projectIds = catProjects.map(p => p.toJSON().id);
    const allSubtasks = await db.sub_tasks.find().exec();
    const catSubtasks = allSubtasks.filter(st => projectIds.includes(st.toJSON().project_id));

    const totalItems = catTasks.length + catSubtasks.length;
    let completedItems = 0;

    completedItems += catTasks.filter(t => t.toJSON().status === 'completed').length;
    completedItems += catSubtasks.filter(st => st.toJSON().is_completed).length;

    const progress = totalItems > 0 ? completedItems / totalItems : 0;

    await catDoc.patch({
        current_progress: Math.round(progress * 100) / 100, // 2 decimal places
        updated_at: new Date().toISOString(),
    });

    return progress;
}

function getYesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}
