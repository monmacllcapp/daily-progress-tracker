/**
 * Task Scheduler Service
 *
 * Converts tasks into calendar time blocks.
 * Creates local CalendarEvent entries and optionally pushes to Google Calendar.
 */

import type { TitanDatabase } from '../db';
import { pushEventToGoogle, calculateEndTime, getPriorityColor } from './google-calendar';
import { isGoogleConnected } from './google-auth';

export interface ScheduleOptions {
    taskId: string;
    startTime: string;     // ISO 8601 datetime
    durationMinutes?: number; // Override task estimate
    isFocusBlock?: boolean;
}

/**
 * Schedule a task as a time block on the calendar.
 * Creates a local CalendarEvent and optionally syncs to Google Calendar.
 */
export async function scheduleTask(
    db: TitanDatabase,
    options: ScheduleOptions
): Promise<string> {
    const task = await db.tasks.findOne(options.taskId).exec();
    if (!task) throw new Error(`Task not found: ${options.taskId}`);

    const duration = options.durationMinutes || task.time_estimate_minutes || 30;
    const endTime = calculateEndTime(options.startTime, duration);

    // Determine color from task priority
    const priority = task.priority as 'low' | 'medium' | 'high';
    const color = getPriorityColor(priority);

    // Create local calendar event
    const eventId = crypto.randomUUID();
    await db.calendar_events.insert({
        id: eventId,
        summary: task.title,
        description: task.description || '',
        start_time: options.startTime,
        end_time: endTime,
        all_day: false,
        linked_task_id: task.id,
        source: 'app',
        color,
        is_focus_block: options.isFocusBlock || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });

    // Push to Google Calendar if connected
    if (isGoogleConnected()) {
        try {
            await pushEventToGoogle(db, eventId);
        } catch (err) {
            console.warn('[Scheduler] Failed to push to Google Calendar:', err);
        }
    }

    console.log(`[Scheduler] Task "${task.title}" scheduled at ${options.startTime} for ${duration}min`);
    return eventId;
}

/**
 * Schedule a batch of quick-win tasks as a single power block.
 * Groups tasks <=5 min into a 30-minute calendar block.
 */
export async function schedulePowerBatch(
    db: TitanDatabase,
    taskIds: string[],
    startTime: string
): Promise<string> {
    const tasks = [];
    for (const id of taskIds) {
        const task = await db.tasks.findOne(id).exec();
        if (task && task.status === 'active') tasks.push(task);
    }

    if (tasks.length === 0) throw new Error('No valid tasks for power batch');

    const totalMinutes = tasks.reduce((sum, t) => sum + (t.time_estimate_minutes || 5), 0);
    const blockDuration = Math.max(totalMinutes, 30); // Minimum 30 min block
    const endTime = calculateEndTime(startTime, blockDuration);

    const titles = tasks.map(t => t.title).join(', ');
    const eventId = crypto.randomUUID();

    await db.calendar_events.insert({
        id: eventId,
        summary: `Power Batch (${tasks.length} tasks)`,
        description: titles,
        start_time: startTime,
        end_time: endTime,
        all_day: false,
        source: 'app',
        color: '5', // Yellow for power batch
        is_focus_block: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });

    // Push to Google Calendar if connected
    if (isGoogleConnected()) {
        try {
            await pushEventToGoogle(db, eventId);
        } catch (err) {
            console.warn('[Scheduler] Failed to push power batch to Google:', err);
        }
    }

    console.log(`[Scheduler] Power batch of ${tasks.length} tasks scheduled at ${startTime}`);
    return eventId;
}

/**
 * Schedule a deep work / focus block.
 */
export async function scheduleDeepWork(
    db: TitanDatabase,
    taskId: string,
    startTime: string,
    durationMinutes: number = 90
): Promise<string> {
    return scheduleTask(db, {
        taskId,
        startTime,
        durationMinutes,
        isFocusBlock: true,
    });
}

export interface LocalConflict {
    type: 'overlap' | 'back-to-back';
    eventId: string;
    eventTitle: string;
    eventStart: string;
    eventEnd: string;
    message: string;
}

/**
 * Check for conflicts between a proposed time block and existing local calendar events.
 */
export async function checkLocalConflicts(
    db: TitanDatabase,
    startTime: string,
    durationMinutes: number
): Promise<LocalConflict[]> {
    const proposedStart = new Date(startTime);
    const proposedEnd = new Date(proposedStart.getTime() + durationMinutes * 60000);
    const bufferMs = 15 * 60000; // 15-minute buffer for back-to-back

    // Query events on the same day
    const dayStart = new Date(proposedStart);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(proposedStart);
    dayEnd.setHours(23, 59, 59, 999);

    const events = await db.calendar_events.find({
        selector: {
            start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() },
            all_day: false,
        }
    }).exec();

    const conflicts: LocalConflict[] = [];

    for (const event of events) {
        const evStart = new Date(event.start_time);
        const evEnd = new Date(event.end_time);

        // Overlap: proposed overlaps with existing
        if (proposedStart < evEnd && proposedEnd > evStart) {
            conflicts.push({
                type: 'overlap',
                eventId: event.id,
                eventTitle: event.summary,
                eventStart: event.start_time,
                eventEnd: event.end_time,
                message: `Overlaps with "${event.summary}"`,
            });
        }
        // Back-to-back: gap less than 15 min
        else {
            const gapAfter = evStart.getTime() - proposedEnd.getTime();
            const gapBefore = proposedStart.getTime() - evEnd.getTime();
            if ((gapAfter >= 0 && gapAfter < bufferMs) || (gapBefore >= 0 && gapBefore < bufferMs)) {
                conflicts.push({
                    type: 'back-to-back',
                    eventId: event.id,
                    eventTitle: event.summary,
                    eventStart: event.start_time,
                    eventEnd: event.end_time,
                    message: `Less than 15min gap with "${event.summary}"`,
                });
            }
        }
    }

    return conflicts;
}

/**
 * Sync calendar events with task status.
 * - Past events with linked tasks: offer to mark task as completed.
 * - Completed tasks: update linked calendar event color.
 * Returns IDs of tasks that were auto-completed.
 */
export async function syncCalendarTaskStatus(
    db: TitanDatabase
): Promise<string[]> {
    const now = new Date();
    const completedTaskIds: string[] = [];

    // Find past calendar events with linked tasks
    const pastEvents = await db.calendar_events.find({
        selector: {
            end_time: { $lt: now.toISOString() },
            linked_task_id: { $exists: true, $ne: '' },
        }
    }).exec();

    for (const event of pastEvents) {
        if (!event.linked_task_id) continue;

        const task = await db.tasks.findOne(event.linked_task_id).exec();
        if (!task || task.status !== 'active') continue;

        // Mark the task as completed
        await task.patch({
            status: 'completed',
            completed_date: now.toISOString().split('T')[0],
            updated_at: now.toISOString(),
        });

        completedTaskIds.push(task.id);
        console.log(`[Scheduler] Auto-completed task "${task.title}" (event ended)`);
    }

    return completedTaskIds;
}
