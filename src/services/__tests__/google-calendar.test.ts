import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the google-auth module before importing google-calendar
vi.mock('../google-auth', () => ({
    googleFetch: vi.fn(),
    isGoogleConnected: vi.fn(),
}));

import {
    createGoogleEvent,
    updateGoogleEvent,
    deleteGoogleEvent,
    fetchGoogleEvents,
    syncCalendarEvents,
    pushEventToGoogle,
    getPriorityColor,
    calculateEndTime,
    isCalendarAvailable,
} from '../google-calendar';
import type { GoogleCalendarEvent } from '../google-calendar';
import { googleFetch, isGoogleConnected } from '../google-auth';

const mockGoogleFetch = googleFetch as ReturnType<typeof vi.fn>;
const mockIsGoogleConnected = isGoogleConnected as ReturnType<typeof vi.fn>;

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// Helper to create a mock Response
function mockResponse(body: unknown, status = 200, ok = true): Response {
    return {
        ok,
        status,
        json: vi.fn().mockResolvedValue(body),
        text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
        headers: new Headers(),
        redirected: false,
        statusText: ok ? 'OK' : 'Error',
        type: 'basic' as ResponseType,
        url: '',
        clone: vi.fn(),
        body: null,
        bodyUsed: false,
        arrayBuffer: vi.fn(),
        blob: vi.fn(),
        formData: vi.fn(),
        bytes: vi.fn(),
    } as unknown as Response;
}

describe('Google Calendar Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsGoogleConnected.mockReturnValue(true);
    });

    // ========================================================
    // createGoogleEvent
    // ========================================================
    describe('createGoogleEvent', () => {
        it('should POST event to Google Calendar API and return the ID', async () => {
            mockGoogleFetch.mockResolvedValue(
                mockResponse({ id: 'gcal-event-123' })
            );

            const event: GoogleCalendarEvent = {
                summary: 'Team Meeting',
                start: { dateTime: '2026-02-01T10:00:00Z' },
                end: { dateTime: '2026-02-01T11:00:00Z' },
            };

            const id = await createGoogleEvent(event);

            expect(id).toBe('gcal-event-123');
            expect(mockGoogleFetch).toHaveBeenCalledTimes(1);

            const [url, options] = mockGoogleFetch.mock.calls[0];
            expect(url).toBe(`${CALENDAR_API}/calendars/primary/events`);
            expect(options.method).toBe('POST');
            expect(options.headers['Content-Type']).toBe('application/json');
            expect(JSON.parse(options.body)).toEqual(event);
        });

        it('should throw on non-ok response with error text', async () => {
            mockGoogleFetch.mockResolvedValue(
                mockResponse('Calendar quota exceeded', 429, false)
            );

            const event: GoogleCalendarEvent = {
                summary: 'Test',
                start: { dateTime: '2026-02-01T10:00:00Z' },
                end: { dateTime: '2026-02-01T11:00:00Z' },
            };

            await expect(createGoogleEvent(event)).rejects.toThrow(
                'Failed to create calendar event'
            );
        });
    });

    // ========================================================
    // updateGoogleEvent
    // ========================================================
    describe('updateGoogleEvent', () => {
        it('should PUT updated event to the correct endpoint', async () => {
            mockGoogleFetch.mockResolvedValue(mockResponse({}));

            const event: GoogleCalendarEvent = {
                summary: 'Updated Meeting',
                start: { dateTime: '2026-02-01T14:00:00Z' },
                end: { dateTime: '2026-02-01T15:00:00Z' },
            };

            await updateGoogleEvent('event-456', event);

            expect(mockGoogleFetch).toHaveBeenCalledTimes(1);
            const [url, options] = mockGoogleFetch.mock.calls[0];
            expect(url).toBe(`${CALENDAR_API}/calendars/primary/events/event-456`);
            expect(options.method).toBe('PUT');
            expect(JSON.parse(options.body)).toEqual(event);
        });

        it('should throw on non-ok response', async () => {
            mockGoogleFetch.mockResolvedValue(
                mockResponse('Not found', 404, false)
            );

            const event: GoogleCalendarEvent = {
                summary: 'Test',
                start: { dateTime: '2026-02-01T10:00:00Z' },
                end: { dateTime: '2026-02-01T11:00:00Z' },
            };

            await expect(updateGoogleEvent('bad-id', event)).rejects.toThrow(
                'Failed to update calendar event'
            );
        });
    });

    // ========================================================
    // deleteGoogleEvent
    // ========================================================
    describe('deleteGoogleEvent', () => {
        it('should send DELETE request to the correct endpoint', async () => {
            mockGoogleFetch.mockResolvedValue(mockResponse({}, 204, true));

            await deleteGoogleEvent('event-789');

            expect(mockGoogleFetch).toHaveBeenCalledTimes(1);
            const [url, options] = mockGoogleFetch.mock.calls[0];
            expect(url).toBe(`${CALENDAR_API}/calendars/primary/events/event-789`);
            expect(options.method).toBe('DELETE');
        });

        it('should not throw on 410 Gone response (already deleted)', async () => {
            mockGoogleFetch.mockResolvedValue(
                mockResponse('Gone', 410, false)
            );

            // Should NOT throw even though ok=false, because status is 410
            await expect(deleteGoogleEvent('event-gone')).resolves.toBeUndefined();
        });

        it('should throw on other non-ok responses', async () => {
            mockGoogleFetch.mockResolvedValue(
                mockResponse('Server error', 500, false)
            );

            await expect(deleteGoogleEvent('event-err')).rejects.toThrow(
                'Failed to delete calendar event'
            );
        });
    });

    // ========================================================
    // fetchGoogleEvents
    // ========================================================
    describe('fetchGoogleEvents', () => {
        it('should fetch events for a date range', async () => {
            const events: GoogleCalendarEvent[] = [
                {
                    id: 'ev-1',
                    summary: 'Meeting 1',
                    start: { dateTime: '2026-02-01T10:00:00Z' },
                    end: { dateTime: '2026-02-01T11:00:00Z' },
                },
                {
                    id: 'ev-2',
                    summary: 'Meeting 2',
                    start: { dateTime: '2026-02-01T14:00:00Z' },
                    end: { dateTime: '2026-02-01T15:00:00Z' },
                },
            ];

            mockGoogleFetch.mockResolvedValue(
                mockResponse({ items: events })
            );

            const startDate = new Date('2026-02-01T00:00:00Z');
            const endDate = new Date('2026-02-02T00:00:00Z');

            const result = await fetchGoogleEvents(startDate, endDate);

            expect(result).toHaveLength(2);
            expect(result[0].summary).toBe('Meeting 1');
            expect(result[1].summary).toBe('Meeting 2');

            const calledUrl = mockGoogleFetch.mock.calls[0][0] as string;
            expect(calledUrl).toContain('/calendars/primary/events?');
            expect(calledUrl).toContain('singleEvents=true');
            expect(calledUrl).toContain('orderBy=startTime');
            expect(calledUrl).toContain('maxResults=250');
        });

        it('should return empty array when no items in response', async () => {
            mockGoogleFetch.mockResolvedValue(mockResponse({}));

            const result = await fetchGoogleEvents(
                new Date('2026-02-01'),
                new Date('2026-02-02')
            );

            expect(result).toEqual([]);
        });

        it('should throw on non-ok response', async () => {
            mockGoogleFetch.mockResolvedValue(
                mockResponse('Unauthorized', 401, false)
            );

            await expect(
                fetchGoogleEvents(new Date(), new Date())
            ).rejects.toThrow('Failed to fetch calendar events');
        });
    });

    // ========================================================
    // syncCalendarEvents
    // ========================================================
    describe('syncCalendarEvents', () => {
        function makeMockDb() {
            return {
                calendar_events: {
                    find: vi.fn().mockReturnValue({
                        exec: vi.fn().mockResolvedValue([]),
                    }),
                    insert: vi.fn().mockResolvedValue({}),
                },
            };
        }

        it('should return 0 when not connected', async () => {
            mockIsGoogleConnected.mockReturnValue(false);
            const db = makeMockDb();

            const count = await syncCalendarEvents(
                db as never,
                new Date('2026-02-01'),
                new Date('2026-02-02')
            );

            expect(count).toBe(0);
            expect(mockGoogleFetch).not.toHaveBeenCalled();
        });

        it('should insert new events from Google', async () => {
            const db = makeMockDb();

            mockGoogleFetch.mockResolvedValue(
                mockResponse({
                    items: [
                        {
                            id: 'gcal-1',
                            summary: 'Synced Meeting',
                            description: 'A meeting from Google',
                            start: { dateTime: '2026-02-01T10:00:00Z' },
                            end: { dateTime: '2026-02-01T11:00:00Z' },
                            colorId: '5',
                            status: 'confirmed',
                        },
                    ],
                })
            );

            // Mock crypto.randomUUID
            const originalRandomUUID = crypto.randomUUID;
            crypto.randomUUID = vi.fn(() => 'uuid-sync-1') as typeof crypto.randomUUID;

            const count = await syncCalendarEvents(
                db as never,
                new Date('2026-02-01'),
                new Date('2026-02-02')
            );

            expect(count).toBe(1);
            expect(db.calendar_events.insert).toHaveBeenCalledTimes(1);

            const inserted = db.calendar_events.insert.mock.calls[0][0];
            expect(inserted.google_event_id).toBe('gcal-1');
            expect(inserted.summary).toBe('Synced Meeting');
            expect(inserted.description).toBe('A meeting from Google');
            expect(inserted.start_time).toBe('2026-02-01T10:00:00Z');
            expect(inserted.end_time).toBe('2026-02-01T11:00:00Z');
            expect(inserted.all_day).toBe(false);
            expect(inserted.source).toBe('google');
            expect(inserted.color).toBe('5');

            crypto.randomUUID = originalRandomUUID;
        });

        it('should update existing events instead of inserting', async () => {
            const mockPatch = vi.fn().mockResolvedValue({});
            const db = makeMockDb();
            db.calendar_events.find.mockReturnValue({
                exec: vi.fn().mockResolvedValue([{ patch: mockPatch }]),
            });

            mockGoogleFetch.mockResolvedValue(
                mockResponse({
                    items: [
                        {
                            id: 'gcal-existing',
                            summary: 'Updated Meeting',
                            description: 'Updated desc',
                            start: { dateTime: '2026-02-01T14:00:00Z' },
                            end: { dateTime: '2026-02-01T15:00:00Z' },
                        },
                    ],
                })
            );

            const count = await syncCalendarEvents(
                db as never,
                new Date('2026-02-01'),
                new Date('2026-02-02')
            );

            expect(count).toBe(1);
            expect(db.calendar_events.insert).not.toHaveBeenCalled();
            expect(mockPatch).toHaveBeenCalledTimes(1);
            expect(mockPatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    summary: 'Updated Meeting',
                    description: 'Updated desc',
                    start_time: '2026-02-01T14:00:00Z',
                    end_time: '2026-02-01T15:00:00Z',
                    all_day: false,
                })
            );
        });

        it('should handle all-day events (date instead of dateTime)', async () => {
            const db = makeMockDb();

            mockGoogleFetch.mockResolvedValue(
                mockResponse({
                    items: [
                        {
                            id: 'gcal-allday',
                            summary: 'All Day Event',
                            start: { date: '2026-02-01' },
                            end: { date: '2026-02-02' },
                        },
                    ],
                })
            );

            const originalRandomUUID = crypto.randomUUID;
            crypto.randomUUID = vi.fn(() => 'uuid-allday') as typeof crypto.randomUUID;

            await syncCalendarEvents(
                db as never,
                new Date('2026-02-01'),
                new Date('2026-02-03')
            );

            const inserted = db.calendar_events.insert.mock.calls[0][0];
            expect(inserted.all_day).toBe(true);
            expect(inserted.start_time).toBe('2026-02-01');
            expect(inserted.end_time).toBe('2026-02-02');

            crypto.randomUUID = originalRandomUUID;
        });

        it('should skip events without an id', async () => {
            const db = makeMockDb();

            mockGoogleFetch.mockResolvedValue(
                mockResponse({
                    items: [
                        {
                            summary: 'No ID Event',
                            start: { dateTime: '2026-02-01T10:00:00Z' },
                            end: { dateTime: '2026-02-01T11:00:00Z' },
                        },
                    ],
                })
            );

            const count = await syncCalendarEvents(
                db as never,
                new Date('2026-02-01'),
                new Date('2026-02-02')
            );

            expect(count).toBe(0);
            expect(db.calendar_events.insert).not.toHaveBeenCalled();
        });

        it('should use "(No title)" for events without a summary', async () => {
            const db = makeMockDb();

            mockGoogleFetch.mockResolvedValue(
                mockResponse({
                    items: [
                        {
                            id: 'gcal-notitle',
                            start: { dateTime: '2026-02-01T10:00:00Z' },
                            end: { dateTime: '2026-02-01T11:00:00Z' },
                        },
                    ],
                })
            );

            const originalRandomUUID = crypto.randomUUID;
            crypto.randomUUID = vi.fn(() => 'uuid-notitle') as typeof crypto.randomUUID;

            await syncCalendarEvents(
                db as never,
                new Date('2026-02-01'),
                new Date('2026-02-02')
            );

            const inserted = db.calendar_events.insert.mock.calls[0][0];
            expect(inserted.summary).toBe('(No title)');

            crypto.randomUUID = originalRandomUUID;
        });
    });

    // ========================================================
    // pushEventToGoogle
    // ========================================================
    describe('pushEventToGoogle', () => {
        function makeMockDb(localEvent: Record<string, unknown> | null) {
            return {
                calendar_events: {
                    findOne: vi.fn().mockReturnValue({
                        exec: vi.fn().mockResolvedValue(
                            localEvent
                                ? {
                                      ...localEvent,
                                      patch: vi.fn().mockResolvedValue({}),
                                  }
                                : null
                        ),
                    }),
                },
            };
        }

        it('should return null when not connected', async () => {
            mockIsGoogleConnected.mockReturnValue(false);
            const db = makeMockDb({ summary: 'Test' });

            const result = await pushEventToGoogle(db as never, 'local-1');
            expect(result).toBeNull();
        });

        it('should return null when event does not exist locally', async () => {
            const db = makeMockDb(null);

            const result = await pushEventToGoogle(db as never, 'nonexistent');
            expect(result).toBeNull();
        });

        it('should create a new Google event when no google_event_id exists', async () => {
            const localEvent = {
                summary: 'Local Meeting',
                description: 'A local event',
                start_time: '2026-02-01T10:00:00Z',
                end_time: '2026-02-01T11:00:00Z',
                all_day: false,
                color: '5',
                google_event_id: undefined,
            };
            const db = makeMockDb(localEvent);

            mockGoogleFetch.mockResolvedValue(
                mockResponse({ id: 'new-gcal-id' })
            );

            const result = await pushEventToGoogle(db as never, 'local-1');

            expect(result).toBe('new-gcal-id');
            expect(mockGoogleFetch).toHaveBeenCalledTimes(1);

            const [url, options] = mockGoogleFetch.mock.calls[0];
            expect(url).toBe(`${CALENDAR_API}/calendars/primary/events`);
            expect(options.method).toBe('POST');

            const sentEvent = JSON.parse(options.body);
            expect(sentEvent.summary).toBe('Local Meeting');
            expect(sentEvent.description).toBe('A local event');
            expect(sentEvent.start.dateTime).toBe('2026-02-01T10:00:00Z');
            expect(sentEvent.colorId).toBe('5');
        });

        it('should update an existing Google event when google_event_id exists', async () => {
            const localEvent = {
                summary: 'Existing Meeting',
                description: 'Updated',
                start_time: '2026-02-01T14:00:00Z',
                end_time: '2026-02-01T15:00:00Z',
                all_day: false,
                color: undefined,
                google_event_id: 'existing-gcal-id',
            };
            const db = makeMockDb(localEvent);

            mockGoogleFetch.mockResolvedValue(mockResponse({}));

            const result = await pushEventToGoogle(db as never, 'local-2');

            expect(result).toBe('existing-gcal-id');
            expect(mockGoogleFetch).toHaveBeenCalledTimes(1);

            const [url, options] = mockGoogleFetch.mock.calls[0];
            expect(url).toBe(
                `${CALENDAR_API}/calendars/primary/events/existing-gcal-id`
            );
            expect(options.method).toBe('PUT');
        });

        it('should format all-day events with date instead of dateTime', async () => {
            const localEvent = {
                summary: 'All Day',
                description: '',
                start_time: '2026-02-01T00:00:00Z',
                end_time: '2026-02-02T00:00:00Z',
                all_day: true,
                color: undefined,
                google_event_id: undefined,
            };
            const db = makeMockDb(localEvent);

            mockGoogleFetch.mockResolvedValue(
                mockResponse({ id: 'allday-gcal' })
            );

            await pushEventToGoogle(db as never, 'local-allday');

            const sentEvent = JSON.parse(mockGoogleFetch.mock.calls[0][1].body);
            expect(sentEvent.start.date).toBe('2026-02-01');
            expect(sentEvent.start.dateTime).toBeUndefined();
            expect(sentEvent.end.date).toBe('2026-02-02');
            expect(sentEvent.end.dateTime).toBeUndefined();
        });

        it('should patch local event with google_event_id after creation', async () => {
            const mockPatch = vi.fn().mockResolvedValue({});
            const localEvent = {
                summary: 'New Event',
                description: '',
                start_time: '2026-02-01T10:00:00Z',
                end_time: '2026-02-01T11:00:00Z',
                all_day: false,
                color: undefined,
                google_event_id: undefined,
                patch: mockPatch,
            };
            const db = {
                calendar_events: {
                    findOne: vi.fn().mockReturnValue({
                        exec: vi.fn().mockResolvedValue(localEvent),
                    }),
                },
            };

            mockGoogleFetch.mockResolvedValue(
                mockResponse({ id: 'created-gcal-id' })
            );

            await pushEventToGoogle(db as never, 'local-new');

            expect(mockPatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    google_event_id: 'created-gcal-id',
                })
            );
        });
    });

    // ========================================================
    // getPriorityColor
    // ========================================================
    describe('getPriorityColor', () => {
        it('should return "11" (Red) for high priority', () => {
            expect(getPriorityColor('high')).toBe('11');
        });

        it('should return "5" (Yellow) for medium priority', () => {
            expect(getPriorityColor('medium')).toBe('5');
        });

        it('should return "2" (Green) for low priority', () => {
            expect(getPriorityColor('low')).toBe('2');
        });
    });

    // ========================================================
    // calculateEndTime
    // ========================================================
    describe('calculateEndTime', () => {
        it('should add minutes to start time and return ISO string', () => {
            const start = '2026-02-01T10:00:00.000Z';
            const result = calculateEndTime(start, 30);
            expect(result).toBe('2026-02-01T10:30:00.000Z');
        });

        it('should handle crossing hour boundaries', () => {
            const start = '2026-02-01T10:45:00.000Z';
            const result = calculateEndTime(start, 30);
            expect(result).toBe('2026-02-01T11:15:00.000Z');
        });

        it('should handle 0 minutes', () => {
            const start = '2026-02-01T10:00:00.000Z';
            const result = calculateEndTime(start, 0);
            expect(result).toBe('2026-02-01T10:00:00.000Z');
        });

        it('should handle large durations crossing day boundaries', () => {
            const start = '2026-02-01T23:00:00.000Z';
            const result = calculateEndTime(start, 120);
            expect(result).toBe('2026-02-02T01:00:00.000Z');
        });
    });

    // ========================================================
    // isCalendarAvailable
    // ========================================================
    describe('isCalendarAvailable', () => {
        it('should return true when Google is connected', () => {
            mockIsGoogleConnected.mockReturnValue(true);
            expect(isCalendarAvailable()).toBe(true);
        });

        it('should return false when Google is not connected', () => {
            mockIsGoogleConnected.mockReturnValue(false);
            expect(isCalendarAvailable()).toBe(false);
        });
    });
});
