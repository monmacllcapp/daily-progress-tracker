import type { TitanDatabase } from '../db';
import type { Habit } from '../types/schema';
import { updateCategoryStreak } from './streak-service';

/**
 * Calculate streak from sorted completions (most recent first not required,
 * we sort internally by date descending).
 */
export function getHabitStreak(completions: { date: string }[]): {
    current: number;
    longest: number;
    lastBreakDate?: string;
} {
    if (completions.length === 0) {
        return { current: 0, longest: 0 };
    }

    // Sort dates descending (most recent first)
    const dates = [...new Set(completions.map(c => c.date))].sort().reverse();

    const today = new Date().toISOString().split('T')[0];
    const yesterday = getDateString(-1);

    let current = 0;
    let longest = 0;
    let lastBreakDate: string | undefined;
    let runLength = 0;
    let expectedDate = dates[0] === today ? today : (dates[0] === yesterday ? yesterday : null);

    // If most recent completion isn't today or yesterday, current streak is 0
    if (!expectedDate) {
        // Still calculate longest
        runLength = 1;
        longest = 1;
        for (let i = 1; i < dates.length; i++) {
            if (daysBetween(dates[i], dates[i - 1]) === 1) {
                runLength++;
                longest = Math.max(longest, runLength);
            } else {
                runLength = 1;
            }
        }
        lastBreakDate = dates[0]; // last completion is effectively the break point
        return { current: 0, longest, lastBreakDate };
    }

    // Walk backwards from most recent date
    for (let i = 0; i < dates.length; i++) {
        if (i === 0) {
            runLength = 1;
            current = 1;
        } else {
            if (daysBetween(dates[i], dates[i - 1]) === 1) {
                runLength++;
                current = runLength;
            } else {
                if (!lastBreakDate) {
                    lastBreakDate = dates[i - 1];
                }
                // Start counting a new historical run
                current = runLength; // freeze current at what we had
                runLength = 1;
            }
        }
        longest = Math.max(longest, runLength);
    }

    // If current was never broken, it equals the full run
    if (!lastBreakDate && dates.length > 0) {
        current = runLength;
    }

    // Re-check: current streak only counts if connected to today/yesterday
    if (expectedDate === today || expectedDate === yesterday) {
        // Walk from index 0 for actual current streak
        let streak = 1;
        for (let i = 1; i < dates.length; i++) {
            if (daysBetween(dates[i], dates[i - 1]) === 1) {
                streak++;
            } else {
                break;
            }
        }
        current = streak;
    }

    return { current, longest, lastBreakDate };
}

/**
 * Check if a habit is due on a given date based on its frequency.
 */
export function isHabitDueToday(habit: Habit, date?: Date): boolean {
    const d = date ?? new Date();
    const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat

    switch (habit.frequency) {
        case 'daily':
            return true;
        case 'weekdays':
            return dayOfWeek >= 1 && dayOfWeek <= 5;
        case 'weekends':
            return dayOfWeek === 0 || dayOfWeek === 6;
        default:
            return true;
    }
}

/**
 * Toggle completion for a habit on a date (add or remove).
 * Returns true if completed, false if uncompleted.
 */
export async function toggleHabitCompletion(
    db: TitanDatabase,
    habitId: string,
    date: string
): Promise<boolean> {
    const existing = await db.habit_completions.find({
        selector: { habit_id: habitId, date }
    }).exec();

    if (existing.length > 0) {
        // Remove completion
        await Promise.all(existing.map(doc => doc.remove()));
        return false;
    }

    // Add completion
    await db.habit_completions.insert({
        id: crypto.randomUUID(),
        habit_id: habitId,
        date,
        completed_at: new Date().toISOString(),
    });

    return true;
}

/**
 * Get completions for a date range (for contribution grid).
 */
export async function getCompletionsInRange(
    db: TitanDatabase,
    habitId: string,
    startDate: string,
    endDate: string
): Promise<{ id: string; habit_id: string; date: string; completed_at: string }[]> {
    const results = await db.habit_completions.find({
        selector: {
            habit_id: habitId,
            date: { $gte: startDate, $lte: endDate },
        }
    }).exec();

    return results.map(doc => doc.toJSON());
}

/**
 * After completing a habit linked to a category, update category streak.
 */
export async function syncHabitCategoryStreak(
    db: TitanDatabase,
    habit: Habit
): Promise<void> {
    if (!habit.category_id) return;
    await updateCategoryStreak(db, habit.category_id);
}

// -- Helpers --

function getDateString(offsetDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
}

function daysBetween(dateA: string, dateB: string): number {
    const a = new Date(dateA);
    const b = new Date(dateB);
    return Math.abs(Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}
