/**
 * Calendar Conflict Monitor
 *
 * Detects overlapping events, back-to-back meetings, and computes
 * meeting load statistics for a given day.
 */

import type { TitanDatabase } from '../db';
import type { CalendarEvent } from '../types/schema';

export interface EventConflict {
  type: 'overlap' | 'back-to-back';
  eventA: CalendarEvent;
  eventB: CalendarEvent;
  message: string;
  suggestedResolution?: string;
}

export interface MeetingLoadStats {
  totalMeetingMinutes: number;
  totalFreeMinutes: number;
  meetingCount: number;
  backToBackCount: number;
  overlapCount: number;
  percentBooked: number;
  longestFreeBlock: number;
}

const BACK_TO_BACK_THRESHOLD_MINUTES = 15;
const WORKING_DAY_START_HOUR = 6;
const WORKING_DAY_END_HOUR = 22;
const WORKING_DAY_MINUTES = (WORKING_DAY_END_HOUR - WORKING_DAY_START_HOUR) * 60; // 960 min

/**
 * Detect all conflicts (overlaps and back-to-back) for a given date.
 */
export async function detectAllConflicts(
  db: TitanDatabase,
  date: Date
): Promise<EventConflict[]> {
  const dateStr = date.toISOString().split('T')[0];
  const dayStart = new Date(dateStr + 'T00:00:00');
  const dayEnd = new Date(dateStr + 'T23:59:59');

  const docs = await db.calendar_events.find({
    selector: {
      start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() }
    }
  }).exec();

  const events = docs
    .map(d => d.toJSON() as CalendarEvent)
    .filter(e => !e.all_day)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const conflicts: EventConflict[] = [];

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];

      const aEnd = new Date(a.end_time).getTime();
      const bStart = new Date(b.start_time).getTime();
      const gapMinutes = (bStart - aEnd) / 60000;

      if (gapMinutes < 0) {
        // Overlap
        conflicts.push({
          type: 'overlap',
          eventA: a,
          eventB: b,
          message: `"${a.summary}" overlaps with "${b.summary}"`,
          suggestedResolution: 'Consider rescheduling one of these events',
        });
      } else if (gapMinutes < BACK_TO_BACK_THRESHOLD_MINUTES) {
        // Back-to-back
        conflicts.push({
          type: 'back-to-back',
          eventA: a,
          eventB: b,
          message: `"${a.summary}" → "${b.summary}" with only ${Math.round(gapMinutes)}min gap`,
          suggestedResolution: gapMinutes === 0
            ? 'No break between meetings — consider adding a 15min buffer'
            : `Only ${Math.round(gapMinutes)}min break — consider extending the gap`,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Compute meeting load statistics for a day within the working window (6AM-10PM).
 */
export async function getMeetingLoadStats(
  db: TitanDatabase,
  date: Date
): Promise<MeetingLoadStats> {
  const dateStr = date.toISOString().split('T')[0];
  const dayStart = new Date(dateStr + 'T00:00:00');
  const dayEnd = new Date(dateStr + 'T23:59:59');

  const docs = await db.calendar_events.find({
    selector: {
      start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() }
    }
  }).exec();

  const events = docs
    .map(d => d.toJSON() as CalendarEvent)
    .filter(e => !e.all_day)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  let totalMeetingMinutes = 0;
  let backToBackCount = 0;
  let overlapCount = 0;

  const workStart = new Date(dateStr + `T${String(WORKING_DAY_START_HOUR).padStart(2, '0')}:00:00`).getTime();
  const workEnd = new Date(dateStr + `T${String(WORKING_DAY_END_HOUR).padStart(2, '0')}:00:00`).getTime();

  // Track occupied intervals to compute free time accurately
  const intervals: Array<{ start: number; end: number }> = [];

  for (const event of events) {
    const start = Math.max(new Date(event.start_time).getTime(), workStart);
    const end = Math.min(new Date(event.end_time).getTime(), workEnd);
    if (start >= end) continue;

    const duration = (end - start) / 60000;
    totalMeetingMinutes += duration;
    intervals.push({ start, end });
  }

  // Detect conflicts from sorted events
  for (let i = 0; i < events.length - 1; i++) {
    const aEnd = new Date(events[i].end_time).getTime();
    const bStart = new Date(events[i + 1].start_time).getTime();
    const gap = (bStart - aEnd) / 60000;
    if (gap < 0) overlapCount++;
    else if (gap < BACK_TO_BACK_THRESHOLD_MINUTES) backToBackCount++;
  }

  // Merge overlapping intervals, then find free blocks
  intervals.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const iv of intervals) {
    if (merged.length > 0 && iv.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }

  // Find longest free block
  let longestFreeBlock = 0;
  let cursor = workStart;
  for (const iv of merged) {
    const freeGap = (iv.start - cursor) / 60000;
    if (freeGap > longestFreeBlock) longestFreeBlock = freeGap;
    cursor = iv.end;
  }
  // After last event
  const trailingFree = (workEnd - cursor) / 60000;
  if (trailingFree > longestFreeBlock) longestFreeBlock = trailingFree;

  const totalFreeMinutes = WORKING_DAY_MINUTES - totalMeetingMinutes;
  const percentBooked = WORKING_DAY_MINUTES > 0
    ? Math.round((totalMeetingMinutes / WORKING_DAY_MINUTES) * 100)
    : 0;

  return {
    totalMeetingMinutes: Math.round(totalMeetingMinutes),
    totalFreeMinutes: Math.max(0, Math.round(totalFreeMinutes)),
    meetingCount: events.length,
    backToBackCount,
    overlapCount,
    percentBooked,
    longestFreeBlock: Math.round(longestFreeBlock),
  };
}

/**
 * Pure function: find the next free slot of the requested duration (+ 15min buffer)
 * among sorted events within a working day.
 * Returns ISO datetime or null if no slot fits.
 */
export function findNextFreeSlot(
  events: CalendarEvent[],
  durationMinutes: number,
  searchDate: Date
): string | null {
  const dateStr = searchDate.toISOString().split('T')[0];
  const workStart = new Date(dateStr + `T${String(WORKING_DAY_START_HOUR).padStart(2, '0')}:00:00`).getTime();
  const workEnd = new Date(dateStr + `T${String(WORKING_DAY_END_HOUR).padStart(2, '0')}:00:00`).getTime();

  const sorted = events
    .filter(e => !e.all_day)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const neededMs = (durationMinutes + 15) * 60000; // duration + 15min buffer
  let cursor = workStart;

  for (const event of sorted) {
    const eventStart = new Date(event.start_time).getTime();
    const eventEnd = new Date(event.end_time).getTime();

    if (eventStart - cursor >= neededMs) {
      return new Date(cursor).toISOString();
    }

    cursor = Math.max(cursor, eventEnd);
  }

  // Check trailing slot
  if (workEnd - cursor >= neededMs) {
    return new Date(cursor).toISOString();
  }

  return null;
}
