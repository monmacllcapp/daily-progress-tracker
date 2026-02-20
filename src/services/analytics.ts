import type { TitanDatabase } from '../db';
import type { AnalyticsEvent } from '../types/schema';

/**
 * Analytics Service - Privacy-First Local Usage Tracking
 *
 * Tracks anonymous usage metrics locally in RxDB. NO data leaves the device.
 * All events are stored locally and used to provide insights to the user about
 * their own usage patterns.
 *
 * PRIVACY GUARANTEE:
 * - All data stays on the user's device in IndexedDB
 * - No network calls, no external analytics services
 * - User can export or clear data at any time
 * - No personally identifiable information is tracked
 *
 * TRACKED EVENTS:
 * - app_open: User opens the app
 * - morning_flow_complete: User completes morning flow
 * - task_complete: User completes a task
 * - email_triage: User processes an email
 * - pomodoro_complete: User completes a pomodoro session
 * - habit_check: User checks off a habit
 * - calendar_schedule: User schedules a calendar event
 *
 * INTEGRATION POINTS:
 * - App.tsx: tracks app_open on database init
 * - MorningFlow.tsx: tracks morning_flow_complete
 * - task-rollover.ts: tracks task_complete
 * - pomodoroStore.ts: tracks pomodoro_complete
 * - habit-service.ts: tracks habit_check
 */

export type EventType =
    | 'app_open'
    | 'morning_flow_complete'
    | 'task_complete'
    | 'email_triage'
    | 'pomodoro_complete'
    | 'habit_check'
    | 'calendar_schedule';

export interface EventMetadata {
    [key: string]: string | number | boolean;
}

/**
 * Track a usage event. All events are stored locally — no network calls.
 * This function wraps tracking in try/catch to ensure it never breaks the main flow.
 */
export async function trackEvent(
    db: TitanDatabase,
    eventType: EventType,
    metadata?: EventMetadata
): Promise<void> {
    try {
        const now = new Date().toISOString();
        const event: AnalyticsEvent = {
            id: crypto.randomUUID(),
            event_type: eventType,
            metadata: metadata || {},
            timestamp: now,
        };

        await db.analytics_events.insert(event);
    } catch (err) {
        // Silent fail — analytics must never break the app
        console.warn('[Analytics] Failed to track event:', eventType, err);
    }
}

/**
 * Get usage statistics for a date range.
 * If no date range provided, returns stats for the last 30 days.
 */
export interface UsageStats {
    totalEvents: number;
    eventsByType: Record<EventType, number>;
    eventsByDay: Record<string, number>; // ISO date string -> count
    dailyActiveUsage: number; // days with at least one event
    morningFlowCompletionRate: number; // % of days with morning_flow_complete
    taskCompletionRate: number; // tasks completed / total events
    featureEngagement: {
        morningFlow: number;
        tasks: number;
        email: number;
        pomodoro: number;
        habits: number;
        calendar: number;
    };
    currentStreak: number; // consecutive days with at least one event
    longestStreak: number; // longest consecutive days with events
}

export async function getUsageStats(
    db: TitanDatabase,
    startDate?: string,
    endDate?: string
): Promise<UsageStats> {
    try {
        const now = new Date();
        // When no endDate provided, use end-of-today to include all events from today
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);
        const end = endDate || endOfToday.toISOString();
        const start = startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const events = await db.analytics_events.find({
            selector: {
                timestamp: {
                    $gte: start,
                    $lte: end,
                }
            },
            sort: [{ timestamp: 'asc' }]
        }).exec();

        const eventDocs = events.map(e => e.toJSON() as AnalyticsEvent);

        // Calculate stats
        const eventsByType: Record<string, number> = {};
        const eventsByDay: Record<string, number> = {};
        const daysWithMorningFlow = new Set<string>();

        for (const event of eventDocs) {
            // Count by type
            eventsByType[event.event_type] = (eventsByType[event.event_type] || 0) + 1;

            // Count by day
            const day = event.timestamp.split('T')[0];
            eventsByDay[day] = (eventsByDay[day] || 0) + 1;

            // Track morning flow completion
            if (event.event_type === 'morning_flow_complete') {
                daysWithMorningFlow.add(day);
            }
        }

        const totalEvents = eventDocs.length;
        const dailyActiveUsage = Object.keys(eventsByDay).length;

        // Calculate completion rates
        const taskCompletes = eventsByType['task_complete'] || 0;
        const taskCompletionRate = totalEvents > 0 ? taskCompletes / totalEvents : 0;

        const totalDaysInRange = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000));
        const morningFlowCompletionRate = totalDaysInRange > 0 ? daysWithMorningFlow.size / totalDaysInRange : 0;

        // Calculate streaks
        const { currentStreak, longestStreak } = calculateStreaks(eventsByDay);

        // Feature engagement (percentage of total events)
        const featureEngagement = {
            morningFlow: eventsByType['morning_flow_complete'] || 0,
            tasks: eventsByType['task_complete'] || 0,
            email: eventsByType['email_triage'] || 0,
            pomodoro: eventsByType['pomodoro_complete'] || 0,
            habits: eventsByType['habit_check'] || 0,
            calendar: eventsByType['calendar_schedule'] || 0,
        };

        return {
            totalEvents,
            eventsByType: eventsByType as Record<EventType, number>,
            eventsByDay,
            dailyActiveUsage,
            morningFlowCompletionRate,
            taskCompletionRate,
            featureEngagement,
            currentStreak,
            longestStreak,
        };
    } catch (err) {
        console.warn('[Analytics] Failed to get usage stats:', err);
        // Return empty stats on error
        return {
            totalEvents: 0,
            eventsByType: {} as Record<EventType, number>,
            eventsByDay: {},
            dailyActiveUsage: 0,
            morningFlowCompletionRate: 0,
            taskCompletionRate: 0,
            featureEngagement: {
                morningFlow: 0,
                tasks: 0,
                email: 0,
                pomodoro: 0,
                habits: 0,
                calendar: 0,
            },
            currentStreak: 0,
            longestStreak: 0,
        };
    }
}

/**
 * Calculate current and longest streaks from event days.
 */
function calculateStreaks(eventsByDay: Record<string, number>): { currentStreak: number; longestStreak: number } {
    const sortedDays = Object.keys(eventsByDay).sort();
    if (sortedDays.length === 0) return { currentStreak: 0, longestStreak: 0 };

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Calculate longest streak
    for (let i = 1; i < sortedDays.length; i++) {
        const prevDate = new Date(sortedDays[i - 1]);
        const currDate = new Date(sortedDays[i]);
        const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000));

        if (diffDays === 1) {
            tempStreak++;
        } else {
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
        }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // Calculate current streak (must include today or yesterday)
    const lastDay = sortedDays[sortedDays.length - 1];
    if (lastDay === today || lastDay === yesterday) {
        currentStreak = 1;
        for (let i = sortedDays.length - 2; i >= 0; i--) {
            const prevDate = new Date(sortedDays[i]);
            const currDate = new Date(sortedDays[i + 1]);
            const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000));

            if (diffDays === 1) {
                currentStreak++;
            } else {
                break;
            }
        }
    }

    return { currentStreak, longestStreak };
}

/**
 * Export all analytics data as JSON for the user to review or backup.
 */
export async function exportAnalyticsData(db: TitanDatabase): Promise<AnalyticsEvent[]> {
    try {
        const events = await db.analytics_events.find({
            sort: [{ timestamp: 'desc' }]
        }).exec();

        return events.map(e => e.toJSON() as AnalyticsEvent);
    } catch (err) {
        console.warn('[Analytics] Failed to export analytics data:', err);
        return [];
    }
}

/**
 * Clear all analytics data (privacy control).
 */
export async function clearAnalyticsData(db: TitanDatabase): Promise<number> {
    try {
        const events = await db.analytics_events.find().exec();
        let deletedCount = 0;

        for (const event of events) {
            await event.remove();
            deletedCount++;
        }

        console.log(`[Analytics] Cleared ${deletedCount} analytics events`);
        return deletedCount;
    } catch (err) {
        console.warn('[Analytics] Failed to clear analytics data:', err);
        return 0;
    }
}
