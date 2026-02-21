/**
 * Shared calendar utilities
 * Used by DailyAgenda and WeekView (and future CalendarPage)
 */

import type { CalendarEvent } from '../../types/schema';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Hours displayed on the timeline: 6 AM to 10 PM (inclusive) */
export const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

/** Pixels allocated per hour on the timeline */
export const HOUR_HEIGHT = 56;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimeBlock {
    type: 'event' | 'task';
    id: string;
    title: string;
    startHour: number;
    startMinute: number;
    durationMinutes: number;
    color: string;
    isFocusBlock?: boolean;
    linkedTaskId?: string;
}

export type PositionedTimeBlock = TimeBlock & { column: number; totalColumns: number };

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** Convert a 24-hour integer to a 12-hour label: 0 → "12 AM", 12 → "12 PM", 15 → "3 PM" */
export function formatHour(hour: number): string {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
}

/** "Monday, Feb 21" */
export function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/** ISO YYYY-MM-DD */
export function toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
}

// ─── Week / Month range helpers ───────────────────────────────────────────────

/**
 * Returns the Sunday-to-Saturday week that contains `date`.
 * Both `start` and `end` are set to midnight local time.
 */
export function getWeekRange(date: Date): { start: Date; end: Date } {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay()); // back to Sunday

    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}

/**
 * Returns the first and last day of the month containing `date`.
 * `start` is midnight on the 1st; `end` is 23:59:59.999 on the last day.
 */
export function getMonthRange(date: Date): { start: Date; end: Date } {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

// ─── Event → TimeBlock conversion ────────────────────────────────────────────

/** Convert a list of CalendarEvents into TimeBlocks, skipping all-day events. */
export function parseTimeBlocks(events: CalendarEvent[]): TimeBlock[] {
    const blocks: TimeBlock[] = [];

    for (const event of events) {
        if (event.all_day) continue;

        const start = new Date(event.start_time);
        const end = new Date(event.end_time);
        const duration = (end.getTime() - start.getTime()) / 60000;

        blocks.push({
            type: 'event',
            id: event.id,
            title: event.summary,
            startHour: start.getHours(),
            startMinute: start.getMinutes(),
            durationMinutes: duration,
            color: event.source === 'google' ? '#3b82f6' : '#8b5cf6',
            isFocusBlock: event.is_focus_block,
            linkedTaskId: event.linked_task_id,
        });
    }

    return blocks;
}

// ─── Column assignment (overlap layout) ──────────────────────────────────────

/**
 * Given a list of TimeBlocks for a single day, assigns each a `column` index and
 * `totalColumns` so that overlapping events are rendered side-by-side.
 */
export function assignColumns(blocks: TimeBlock[]): PositionedTimeBlock[] {
    if (blocks.length === 0) return [];

    // Sort by start time, then longest duration first
    const sorted = [...blocks].sort((a, b) => {
        const aStart = a.startHour * 60 + a.startMinute;
        const bStart = b.startHour * 60 + b.startMinute;
        if (aStart !== bStart) return aStart - bStart;
        return b.durationMinutes - a.durationMinutes;
    });

    const result: PositionedTimeBlock[] = [];
    const columnEnds: number[] = []; // when each column next becomes free (minutes from midnight)

    for (const block of sorted) {
        const blockStart = block.startHour * 60 + block.startMinute;
        const blockEnd = blockStart + block.durationMinutes;

        // Find first available column
        let col = 0;
        while (col < columnEnds.length && columnEnds[col] > blockStart) {
            col++;
        }

        if (col >= columnEnds.length) {
            columnEnds.push(blockEnd);
        } else {
            columnEnds[col] = blockEnd;
        }

        result.push({ ...block, column: col, totalColumns: 0 });
    }

    // Second pass: compute totalColumns for each block based on all blocks it overlaps
    for (let i = 0; i < result.length; i++) {
        const iStart = result[i].startHour * 60 + result[i].startMinute;
        const iEnd = iStart + result[i].durationMinutes;
        let maxCol = result[i].column;

        for (let j = 0; j < result.length; j++) {
            if (i === j) continue;
            const jStart = result[j].startHour * 60 + result[j].startMinute;
            const jEnd = jStart + result[j].durationMinutes;

            if (iStart < jEnd && jStart < iEnd) {
                maxCol = Math.max(maxCol, result[j].column);
            }
        }

        result[i].totalColumns = maxCol + 1;
    }

    return result;
}

// ─── Deduplication ───────────────────────────────────────────────────────────

/**
 * Remove duplicate calendar events that share the same `google_event_id`.
 * When duplicates exist, keep only the first occurrence.
 * Events without a `google_event_id` always pass through unchanged.
 */
export function deduplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
    const seenGoogleIds = new Set<string>();
    return events.filter(event => {
        if (!event.google_event_id) return true;
        if (seenGoogleIds.has(event.google_event_id)) return false;
        seenGoogleIds.add(event.google_event_id);
        return true;
    });
}
