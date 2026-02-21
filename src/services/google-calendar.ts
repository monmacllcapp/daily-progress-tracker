/**
 * Google Calendar Service
 *
 * Browser-compatible implementation using REST APIs + Google Identity Services.
 * Replaces the previous googleapis (Node.js) library approach.
 */

import { googleFetch, isGoogleConnected } from './google-auth';
import type { TitanDatabase } from '../db';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// Google Calendar API event shape
export interface GoogleCalendarEvent {
    id?: string;
    summary: string;
    description?: string;
    start: {
        dateTime?: string;
        date?: string;
        timeZone?: string;
    };
    end: {
        dateTime?: string;
        date?: string;
        timeZone?: string;
    };
    colorId?: string;
    status?: string;
    calendarId?: string;
}

// Google Calendar List Item
export interface GoogleCalendarListItem {
    id: string;
    summary: string;
    backgroundColor: string;
    selected?: boolean;
}

/**
 * Create a calendar event on Google Calendar
 */
export async function createGoogleEvent(event: GoogleCalendarEvent): Promise<string> {
    const response = await googleFetch(`${CALENDAR_API}/calendars/primary/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create calendar event: ${error}`);
    }

    const data = await response.json();
    return data.id;
}

/**
 * Update an existing calendar event
 */
export async function updateGoogleEvent(eventId: string, event: GoogleCalendarEvent): Promise<void> {
    const response = await googleFetch(`${CALENDAR_API}/calendars/primary/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to update calendar event: ${error}`);
    }
}

/**
 * Delete a calendar event
 */
export async function deleteGoogleEvent(eventId: string): Promise<void> {
    const response = await googleFetch(`${CALENDAR_API}/calendars/primary/events/${eventId}`, {
        method: 'DELETE',
    });

    if (!response.ok && response.status !== 410) {
        const error = await response.text();
        throw new Error(`Failed to delete calendar event: ${error}`);
    }
}

/**
 * Fetch all calendars visible to the user
 */
export async function fetchAllCalendars(): Promise<GoogleCalendarListItem[]> {
    const response = await googleFetch(`${CALENDAR_API}/users/me/calendarList`);

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to fetch calendar list: ${error}`);
    }

    const data = await response.json();
    const calendars = data.items || [];

    // Filter to only selected calendars (visible in Google Calendar)
    return calendars.filter((cal: GoogleCalendarListItem) => cal.selected === true);
}

/**
 * Fetch events from Google Calendar for a date range
 * Now queries ALL selected calendars, not just primary
 */
export async function fetchGoogleEvents(
    startDate: Date,
    endDate: Date
): Promise<GoogleCalendarEvent[]> {
    // Fetch all selected calendars
    const calendars = await fetchAllCalendars();
    console.log(`[Calendar] Fetching events from ${calendars.length} calendar(s)`);

    const allEvents: GoogleCalendarEvent[] = [];
    const eventIds = new Set<string>();

    for (const calendar of calendars) {
        const params = new URLSearchParams({
            timeMin: startDate.toISOString(),
            timeMax: endDate.toISOString(),
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: '250',
        });

        try {
            const response = await googleFetch(
                `${CALENDAR_API}/calendars/${encodeURIComponent(calendar.id)}/events?${params}`
            );

            if (!response.ok) {
                const error = await response.text();
                console.warn(`[Calendar] Failed to fetch events from ${calendar.summary}: ${error}`);
                continue;
            }

            const data = await response.json();
            const events = data.items || [];

            for (const event of events) {
                // Deduplicate by event ID
                if (event.id && !eventIds.has(event.id)) {
                    eventIds.add(event.id);
                    // Add calendar metadata
                    event.calendarId = calendar.id;
                    // Store calendar color (will be used in sync)
                    if (!event.colorId) {
                        event.colorId = calendar.backgroundColor;
                    }
                    allEvents.push(event);
                }
            }
        } catch (err) {
            console.warn(`[Calendar] Error fetching from ${calendar.summary}:`, err);
        }
    }

    console.log(`[Calendar] Fetched ${allEvents.length} total event(s) across all calendars`);
    return allEvents;
}

/**
 * Normalize existing RxDB calendar_events that have timezone-offset timestamps
 * (e.g. "2026-02-21T07:45:00-08:00") to UTC ISO format ("2026-02-21T15:45:00.000Z").
 * All-day events stored as "YYYY-MM-DD" are left untouched.
 * Returns the number of events patched.
 */
export async function normalizeEventTimes(db: TitanDatabase): Promise<number> {
    if (!db.calendar_events) return 0;
    const allEvents = await db.calendar_events.find().exec();
    let fixed = 0;
    for (const event of allEvents) {
        const st = event.start_time;
        const et = event.end_time;
        // Check if time has timezone offset (contains + or - after T, doesn't end with Z)
        const needsFixStart = st && /T.*[+-]\d{2}:\d{2}$/.test(st);
        const needsFixEnd = et && /T.*[+-]\d{2}:\d{2}$/.test(et);
        if (needsFixStart || needsFixEnd) {
            await event.patch({
                start_time: needsFixStart ? new Date(st).toISOString() : st,
                end_time: needsFixEnd ? new Date(et).toISOString() : et,
                updated_at: new Date().toISOString(),
            });
            fixed++;
        }
    }
    if (fixed > 0) console.log(`[Calendar] Normalized ${fixed} events to UTC`);
    return fixed;
}

/**
 * Sync Google Calendar events into the local RxDB collection.
 * Performs a one-way pull: Google → local.
 * Local-only events (source: 'app') are preserved.
 * Now includes per-event error handling and calendar color storage.
 */
export async function syncCalendarEvents(
    db: TitanDatabase,
    startDate: Date,
    endDate: Date
): Promise<number> {
    if (!isGoogleConnected()) return 0;

    if (!db.calendar_events) {
        console.warn('[Calendar] calendar_events collection not available — skipping sync');
        return 0;
    }

    await normalizeEventTimes(db);

    const googleEvents = await fetchGoogleEvents(startDate, endDate);
    let synced = 0;

    for (const ge of googleEvents) {
        if (!ge.id) continue;

        try {
            const rawStart = ge.start.dateTime || ge.start.date || '';
            const startTime = ge.start.dateTime ? new Date(rawStart).toISOString() : rawStart;
            const rawEnd = ge.end.dateTime || ge.end.date || '';
            const endTime = ge.end.dateTime ? new Date(rawEnd).toISOString() : rawEnd;
            const allDay = !ge.start.dateTime;

            // Check if we already have this event locally
            const existing = await db.calendar_events.find({
                selector: { google_event_id: ge.id }
            }).exec();

            if (existing.length > 0) {
                // Update existing local event
                await existing[0].patch({
                    summary: ge.summary || '',
                    description: ge.description || '',
                    start_time: startTime,
                    end_time: endTime,
                    all_day: allDay,
                    color: ge.colorId || undefined,
                    updated_at: new Date().toISOString(),
                });
                synced++;
            } else {
                // Insert new local event
                await db.calendar_events.insert({
                    id: crypto.randomUUID(),
                    google_event_id: ge.id,
                    linked_task_id: '',
                    summary: ge.summary || '(No title)',
                    description: ge.description || '',
                    start_time: startTime,
                    end_time: endTime,
                    all_day: allDay,
                    source: 'google',
                    color: ge.colorId || undefined,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });
                synced++;
            }
        } catch (err) {
            console.error(`[Calendar] Failed to sync event ${ge.id} (${ge.summary}):`, err);
            // Continue with next event instead of failing entire batch
        }
    }

    console.log(`[Calendar] Synced ${synced} events from Google Calendar`);
    return synced;
}

/**
 * Push a local calendar event to Google Calendar.
 * Updates the local event with the google_event_id.
 */
export async function pushEventToGoogle(
    db: TitanDatabase,
    localEventId: string
): Promise<string | null> {
    if (!isGoogleConnected()) return null;

    const event = await db.calendar_events.findOne(localEventId).exec();
    if (!event) return null;

    const googleEvent: GoogleCalendarEvent = {
        summary: event.summary,
        description: event.description || '',
        start: event.all_day
            ? { date: event.start_time.split('T')[0] }
            : { dateTime: event.start_time, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        end: event.all_day
            ? { date: event.end_time.split('T')[0] }
            : { dateTime: event.end_time, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        colorId: event.color || undefined,
    };

    if (event.google_event_id) {
        // Update existing Google event
        await updateGoogleEvent(event.google_event_id, googleEvent);
        return event.google_event_id;
    } else {
        // Create new Google event
        const googleId = await createGoogleEvent(googleEvent);
        await event.patch({
            google_event_id: googleId,
            updated_at: new Date().toISOString(),
        });
        return googleId;
    }
}

/**
 * Convert priority to Google Calendar color ID
 */
export function getPriorityColor(priority: 'low' | 'medium' | 'high'): string {
    switch (priority) {
        case 'high': return '11'; // Red
        case 'medium': return '5'; // Yellow
        case 'low': return '2'; // Green
        default: return '1'; // Blue
    }
}

/**
 * Calculate end time based on estimated minutes
 */
export function calculateEndTime(startTime: string, estimatedMinutes: number): string {
    const start = new Date(startTime);
    const end = new Date(start.getTime() + estimatedMinutes * 60000);
    return end.toISOString();
}

/**
 * Check if calendar features are available
 */
export function isCalendarAvailable(): boolean {
    return isGoogleConnected();
}
