import type { TitanDatabase } from '../db';
import type { UserProfile } from '../types/schema';

const DEFAULT_USER_ID = 'default-user';

// XP rewards per action
const XP_TASK_COMPLETE = 10;
const XP_HABIT_CHECK = 5;
const XP_POMODORO_COMPLETE = 8;
const XP_MORNING_FLOW = 15;
const XP_PER_LEVEL = 100;

// Gold mirrors XP at 1:1 ratio
const GOLD_RATIO = 1;

/**
 * Get or create the singleton user profile.
 */
export async function getOrCreateProfile(db: TitanDatabase): Promise<UserProfile> {
    const existing = await db.user_profile.findOne(DEFAULT_USER_ID).exec();
    if (existing) return existing.toJSON() as UserProfile;

    const now = new Date().toISOString();
    await db.user_profile.insert({
        id: DEFAULT_USER_ID,
        xp: 0,
        level: 1,
        gold: 0,
        total_tasks_completed: 0,
        total_habits_checked: 0,
        total_pomodoros_completed: 0,
        longest_streak: 0,
        created_at: now,
        updated_at: now,
    });

    return db.user_profile.findOne(DEFAULT_USER_ID).exec().then(doc => doc!.toJSON() as UserProfile);
}

/**
 * Award XP and gold, auto-level if threshold crossed.
 * Returns the updated profile and whether a level-up occurred.
 */
async function awardXP(
    db: TitanDatabase,
    amount: number,
    streakMultiplier = 1
): Promise<{ profile: UserProfile; leveledUp: boolean }> {
    const doc = await db.user_profile.findOne(DEFAULT_USER_ID).exec();
    if (!doc) {
        await getOrCreateProfile(db);
        return awardXP(db, amount, streakMultiplier);
    }

    const profile = doc.toJSON() as UserProfile;
    const earnedXP = Math.round(amount * Math.max(1, streakMultiplier));
    const earnedGold = Math.round(earnedXP * GOLD_RATIO);

    const newXP = profile.xp + earnedXP;
    const newGold = profile.gold + earnedGold;
    const newLevel = Math.floor(newXP / XP_PER_LEVEL) + 1;
    const leveledUp = newLevel > profile.level;

    await doc.patch({
        xp: newXP,
        gold: newGold,
        level: newLevel,
        updated_at: new Date().toISOString(),
    });

    return {
        profile: { ...profile, xp: newXP, gold: newGold, level: newLevel },
        leveledUp,
    };
}

/**
 * Call when a task is completed.
 */
export async function onTaskComplete(
    db: TitanDatabase,
    streakCount = 0
): Promise<{ profile: UserProfile; leveledUp: boolean }> {
    const doc = await db.user_profile.findOne(DEFAULT_USER_ID).exec();
    if (doc) {
        const current = doc.toJSON() as UserProfile;
        await doc.patch({ total_tasks_completed: current.total_tasks_completed + 1 });
    }

    const multiplier = 1 + (streakCount * 0.1); // 10% bonus per streak day
    return awardXP(db, XP_TASK_COMPLETE, multiplier);
}

/**
 * Call when a habit is checked off.
 */
export async function onHabitCheck(
    db: TitanDatabase,
    streakCount = 0
): Promise<{ profile: UserProfile; leveledUp: boolean }> {
    const doc = await db.user_profile.findOne(DEFAULT_USER_ID).exec();
    if (doc) {
        const current = doc.toJSON() as UserProfile;
        await doc.patch({ total_habits_checked: current.total_habits_checked + 1 });
    }

    const multiplier = 1 + (streakCount * 0.1);
    return awardXP(db, XP_HABIT_CHECK, multiplier);
}

/**
 * Call when a Pomodoro session completes.
 */
export async function onPomodoroComplete(
    db: TitanDatabase
): Promise<{ profile: UserProfile; leveledUp: boolean }> {
    const doc = await db.user_profile.findOne(DEFAULT_USER_ID).exec();
    if (doc) {
        const current = doc.toJSON() as UserProfile;
        await doc.patch({ total_pomodoros_completed: current.total_pomodoros_completed + 1 });
    }

    return awardXP(db, XP_POMODORO_COMPLETE);
}

/**
 * Call when morning flow is completed.
 */
export async function onMorningFlowComplete(
    db: TitanDatabase
): Promise<{ profile: UserProfile; leveledUp: boolean }> {
    return awardXP(db, XP_MORNING_FLOW);
}

/**
 * Update longest streak if current streak exceeds it.
 */
export async function updateLongestStreak(
    db: TitanDatabase,
    currentStreak: number
): Promise<void> {
    const doc = await db.user_profile.findOne(DEFAULT_USER_ID).exec();
    if (!doc) return;

    const profile = doc.toJSON() as UserProfile;
    if (currentStreak > profile.longest_streak) {
        await doc.patch({
            longest_streak: currentStreak,
            updated_at: new Date().toISOString(),
        });
    }
}

/**
 * Calculate XP progress within current level (0-100).
 */
export function getLevelProgress(xp: number): number {
    return (xp % XP_PER_LEVEL);
}

/**
 * XP needed to reach next level.
 */
export function getXPToNextLevel(xp: number): number {
    return XP_PER_LEVEL - (xp % XP_PER_LEVEL);
}
