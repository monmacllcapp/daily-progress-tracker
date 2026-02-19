import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GoogleCalendarEvent } from '../google-calendar';
import type { Project } from '../../types/schema';

// We do NOT use vi.mock at the top level for this file since some tests
// need the real constructor (without API key) and some need the mocked AI path.
// Instead, tests that need AI mocking use vi.doMock + dynamic import.

function createEvent(overrides: Partial<GoogleCalendarEvent> & { startDateTime: string; endDateTime: string }): GoogleCalendarEvent {
    const { startDateTime, endDateTime, ...rest } = overrides;
    return {
        id: 'event-' + Math.random().toString(36).slice(2, 8),
        summary: 'Test Event',
        start: { dateTime: startDateTime },
        end: { endDateTime: endDateTime, dateTime: endDateTime },
        ...rest,
    } as GoogleCalendarEvent;
}

function createProject(overrides: Partial<Project> = {}): Project {
    return {
        id: 'proj-' + Math.random().toString(36).slice(2, 8),
        title: 'Test Project',
        status: 'active',
        motivation_payload: {
            why: 'To improve productivity',
            impact_positive: 'Better outcomes',
            impact_negative: 'Missed deadlines',
        },
        metrics: {
            total_time_estimated: 60, // 60 minutes
            total_time_spent: 0,
            optimism_ratio: 1,
        },
        due_date: '2026-01-31T10:00:00Z',
        priority: 'medium',
        ...overrides,
    };
}

describe('ConflictDetector', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    describe('detectConflicts', () => {
        it('should return empty array when project has no due_date', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            const project = createProject({ due_date: undefined });
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T09:00:00Z',
                    endDateTime: '2026-01-31T10:00:00Z',
                }),
            ];

            const conflicts = await detector.detectConflicts(project, events);
            expect(conflicts).toEqual([]);
        });

        it('should detect overlapping events', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            // Project: 10:00 - 11:00
            const project = createProject({
                due_date: '2026-01-31T10:00:00Z',
                metrics: { total_time_estimated: 60, total_time_spent: 0, optimism_ratio: 1 },
            });

            // Event: 10:30 - 11:30 (overlaps with project)
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T10:30:00Z',
                    endDateTime: '2026-01-31T11:30:00Z',
                    summary: 'Team Meeting',
                }),
            ];

            const conflicts = await detector.detectConflicts(project, events);

            expect(conflicts.length).toBe(1);
            expect(conflicts[0].type).toBe('overlap');
            expect(conflicts[0].existingEvent.summary).toBe('Team Meeting');
            expect(conflicts[0].suggestion).toBe('Move to next available time slot');
            expect(conflicts[0].aiExplanation).toBe('This project conflicts with an existing event.');
        });

        it('should detect when event starts before project ends', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            // Project: 10:00 - 11:00
            const project = createProject({
                due_date: '2026-01-31T10:00:00Z',
                metrics: { total_time_estimated: 60, total_time_spent: 0, optimism_ratio: 1 },
            });

            // Event: 9:30 - 10:30 (overlaps beginning of project)
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T09:30:00Z',
                    endDateTime: '2026-01-31T10:30:00Z',
                }),
            ];

            const conflicts = await detector.detectConflicts(project, events);
            expect(conflicts.length).toBe(1);
            expect(conflicts[0].type).toBe('overlap');
        });

        it('should detect events with exact same start time as overlap', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            // Project: 10:00 - 11:00
            const project = createProject({
                due_date: '2026-01-31T10:00:00Z',
                metrics: { total_time_estimated: 60, total_time_spent: 0, optimism_ratio: 1 },
            });

            // Event: 10:00 - 10:30 (same start time)
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T10:00:00Z',
                    endDateTime: '2026-01-31T10:30:00Z',
                }),
            ];

            const conflicts = await detector.detectConflicts(project, events);
            expect(conflicts.length).toBe(1);
            expect(conflicts[0].type).toBe('overlap');
        });

        it('should detect back-to-back events (less than 15 min gap)', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            // Project: 10:00 - 11:00
            const project = createProject({
                due_date: '2026-01-31T10:00:00Z',
                metrics: { total_time_estimated: 60, total_time_spent: 0, optimism_ratio: 1 },
            });

            // Event: 11:05 - 12:00 (only 5 min after project ends)
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T11:05:00Z',
                    endDateTime: '2026-01-31T12:00:00Z',
                }),
            ];

            const conflicts = await detector.detectConflicts(project, events);
            expect(conflicts.length).toBe(1);
            expect(conflicts[0].type).toBe('back-to-back');
            expect(conflicts[0].suggestion).toBe('Add 15-minute buffer between events');
            expect(conflicts[0].aiExplanation).toBe('Back-to-back scheduling can lead to stress and delays.');
        });

        it('should detect back-to-back events when event ends just before project starts', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            // Project: 10:00 - 11:00
            const project = createProject({
                due_date: '2026-01-31T10:00:00Z',
                metrics: { total_time_estimated: 60, total_time_spent: 0, optimism_ratio: 1 },
            });

            // Event: 09:00 - 09:50 (only 10 min before project starts)
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T09:00:00Z',
                    endDateTime: '2026-01-31T09:50:00Z',
                }),
            ];

            const conflicts = await detector.detectConflicts(project, events);
            expect(conflicts.length).toBe(1);
            expect(conflicts[0].type).toBe('back-to-back');
        });

        it('should not detect conflict when events have sufficient gap (>15 min)', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            // Project: 10:00 - 11:00
            const project = createProject({
                due_date: '2026-01-31T10:00:00Z',
                metrics: { total_time_estimated: 60, total_time_spent: 0, optimism_ratio: 1 },
            });

            // Event: 11:30 - 12:00 (30 min gap, no conflict)
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T11:30:00Z',
                    endDateTime: '2026-01-31T12:00:00Z',
                }),
            ];

            const conflicts = await detector.detectConflicts(project, events);
            expect(conflicts).toEqual([]);
        });

        it('should detect overbooked day (more than 8 hours of events)', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            // Project: 60 min estimated
            const project = createProject({
                due_date: '2026-01-31T17:00:00Z',
                metrics: { total_time_estimated: 60, total_time_spent: 0, optimism_ratio: 1 },
            });

            // Events totaling 8 hours on the same day (should trigger overbooked with the 60-min project)
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T08:00:00Z',
                    endDateTime: '2026-01-31T12:00:00Z', // 4 hours
                    summary: 'Morning Block',
                }),
                createEvent({
                    startDateTime: '2026-01-31T13:00:00Z',
                    endDateTime: '2026-01-31T17:00:00Z', // 4 hours
                    summary: 'Afternoon Block',
                }),
            ];

            const conflicts = await detector.detectConflicts(project, events);

            // Should have overbooked conflict (480 existing + 60 project = 540 > 480)
            const overbookedConflict = conflicts.find(c => c.type === 'overbooked');
            expect(overbookedConflict).toBeDefined();
            expect(overbookedConflict!.suggestion).toBe('Move to next available day');
            expect(overbookedConflict!.existingEvent.summary).toBe('Morning Block');
        });

        it('should not detect overbooked when total time is under 8 hours', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            // Project: 30 min
            const project = createProject({
                due_date: '2026-01-31T15:00:00Z',
                metrics: { total_time_estimated: 30, total_time_spent: 0, optimism_ratio: 1 },
            });

            // 2 hours of events (well under 8 hours even with 30 min project)
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T08:00:00Z',
                    endDateTime: '2026-01-31T10:00:00Z', // 2 hours
                }),
            ];

            const conflicts = await detector.detectConflicts(project, events);
            const overbookedConflict = conflicts.find(c => c.type === 'overbooked');
            expect(overbookedConflict).toBeUndefined();
        });

        it('should detect multiple conflicts simultaneously', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            // Project: 10:00 - 11:00
            const project = createProject({
                due_date: '2026-01-31T10:00:00Z',
                metrics: { total_time_estimated: 60, total_time_spent: 0, optimism_ratio: 1 },
            });

            const events = [
                // Overlapping event
                createEvent({
                    startDateTime: '2026-01-31T10:30:00Z',
                    endDateTime: '2026-01-31T11:30:00Z',
                    summary: 'Overlapping',
                }),
                // Back-to-back event (5 min gap after project)
                createEvent({
                    startDateTime: '2026-01-31T11:05:00Z',
                    endDateTime: '2026-01-31T12:00:00Z',
                    summary: 'Back-to-back',
                }),
            ];

            const conflicts = await detector.detectConflicts(project, events);
            expect(conflicts.length).toBeGreaterThanOrEqual(2);
            expect(conflicts.some(c => c.type === 'overlap')).toBe(true);
            expect(conflicts.some(c => c.type === 'back-to-back')).toBe(true);
        });

        it('should handle zero duration project', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            // Project with 0 duration
            const project = createProject({
                due_date: '2026-01-31T10:00:00Z',
                metrics: { total_time_estimated: 0, total_time_spent: 0, optimism_ratio: 1 },
            });

            // Event that starts at the same time
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T10:00:00Z',
                    endDateTime: '2026-01-31T11:00:00Z',
                }),
            ];

            // Zero duration: projectStart = projectEnd = 10:00
            // isOverlapping: 10:00 < 11:00 && 10:00 > 10:00 -> false
            // But back-to-back check: gap1 = |10:00 - 10:00| = 0 < 15min -> true
            const conflicts = await detector.detectConflicts(project, events);
            expect(conflicts.length).toBeGreaterThanOrEqual(1);
        });

        it('should return no conflicts with an empty events list', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            const project = createProject({
                due_date: '2026-01-31T10:00:00Z',
            });

            const conflicts = await detector.detectConflicts(project, []);
            expect(conflicts).toEqual([]);
        });
    });

    describe('detectConflicts with AI suggestions', () => {
        const mockGenerateContent = vi.fn();

        beforeEach(() => {
            vi.resetModules();
            mockGenerateContent.mockReset();

            vi.doMock('../ollama-client', () => ({
                generateContent: mockGenerateContent,
                isOllamaConfigured: () => true,
            }));
        });

        it('should use AI suggestions when API key is provided', async () => {
            mockGenerateContent.mockResolvedValue(JSON.stringify({
                suggestion: 'Reschedule to afternoon',
                explanation: 'The afternoon slot aligns better with your energy levels.',
            }));

            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector('test-api-key');

            const project = createProject({
                due_date: '2026-01-31T10:00:00Z',
                metrics: { total_time_estimated: 60, total_time_spent: 0, optimism_ratio: 1 },
            });

            const events = [
                createEvent({
                    startDateTime: '2026-01-31T10:30:00Z',
                    endDateTime: '2026-01-31T11:30:00Z',
                    summary: 'Conflicting Meeting',
                }),
            ];

            const conflicts = await detector.detectConflicts(project, events);
            expect(conflicts.length).toBeGreaterThanOrEqual(1);
            const overlap = conflicts.find(c => c.type === 'overlap');
            expect(overlap).toBeDefined();
            expect(overlap!.suggestion).toBe('Reschedule to afternoon');
            expect(overlap!.aiExplanation).toBe('The afternoon slot aligns better with your energy levels.');
        });

        it('should fall back to default suggestion when AI fails', async () => {
            mockGenerateContent.mockRejectedValue(new Error('API error'));

            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector('test-api-key');

            const project = createProject({
                due_date: '2026-01-31T10:00:00Z',
                metrics: { total_time_estimated: 60, total_time_spent: 0, optimism_ratio: 1 },
            });

            const events = [
                createEvent({
                    startDateTime: '2026-01-31T10:30:00Z',
                    endDateTime: '2026-01-31T11:30:00Z',
                }),
            ];

            const conflicts = await detector.detectConflicts(project, events);
            const overlap = conflicts.find(c => c.type === 'overlap');
            expect(overlap).toBeDefined();
            expect(overlap!.suggestion).toBe('Reschedule to avoid conflict');
            expect(overlap!.aiExplanation).toBe('The AI assistant is currently unavailable.');
        });
    });

    describe('findNextAvailableSlot', () => {
        it('should return start time when no events exist', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            const startFrom = new Date('2026-01-31T10:30:00Z');
            const result = detector.findNextAvailableSlot(60, [], startFrom);

            // Should round to the hour
            expect(result.getUTCMinutes()).toBe(0);
            expect(result.getUTCHours()).toBe(10);
        });

        it('should find slot before the first event if there is enough time', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            const startFrom = new Date('2026-01-31T08:00:00Z');
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T12:00:00Z',
                    endDateTime: '2026-01-31T13:00:00Z',
                }),
            ];

            // 60 min + 15 min buffer = 75 min needed. From 08:00 to 12:00 = 240 min. Plenty of space.
            const result = detector.findNextAvailableSlot(60, events, startFrom);
            expect(result.getTime()).toBe(startFrom.getTime());
        });

        it('should skip past events when there is not enough time before them', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            const startFrom = new Date('2026-01-31T10:00:00Z');
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T10:30:00Z',
                    endDateTime: '2026-01-31T11:00:00Z',
                }),
                createEvent({
                    startDateTime: '2026-01-31T11:15:00Z',
                    endDateTime: '2026-01-31T12:00:00Z',
                }),
            ];

            // 60 min + 15 min buffer = 75 min. Only 30 min before first event, skip.
            // After first event (11:00 + 15 min buffer = 11:15), only 0 min before second event. Skip.
            // After second event: 12:00 + 15 min = 12:15
            const result = detector.findNextAvailableSlot(60, events, startFrom);
            expect(result.getTime()).toBe(new Date('2026-01-31T12:15:00Z').getTime());
        });

        it('should return time after last event when no gaps are large enough', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            const startFrom = new Date('2026-01-31T10:00:00Z');
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T10:10:00Z',
                    endDateTime: '2026-01-31T11:00:00Z',
                }),
                createEvent({
                    startDateTime: '2026-01-31T11:05:00Z',
                    endDateTime: '2026-01-31T12:00:00Z',
                }),
            ];

            const result = detector.findNextAvailableSlot(60, events, startFrom);
            // After last event: 12:00 + 15 min buffer = 12:15
            expect(result.getTime()).toBe(new Date('2026-01-31T12:15:00Z').getTime());
        });

        it('should sort events before searching for gaps', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            const startFrom = new Date('2026-01-31T08:00:00Z');
            // Events in reverse order
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T12:00:00Z',
                    endDateTime: '2026-01-31T13:00:00Z',
                }),
                createEvent({
                    startDateTime: '2026-01-31T09:00:00Z',
                    endDateTime: '2026-01-31T10:00:00Z',
                }),
            ];

            // After sorting: 09:00-10:00, 12:00-13:00
            // From 08:00 to 09:00 = 60 min, but need 60 + 15 = 75 min. Not enough.
            // After 10:00 + 15 min = 10:15 to 12:00 = 105 min. Enough for 75 min!
            const result = detector.findNextAvailableSlot(60, events, startFrom);
            expect(result.getTime()).toBe(new Date('2026-01-31T10:15:00Z').getTime());
        });

        it('should handle short duration tasks (e.g., 5 minutes)', async () => {
            const { ConflictDetector } = await import('../conflict-detector');
            const detector = new ConflictDetector();

            const startFrom = new Date('2026-01-31T10:00:00Z');
            const events = [
                createEvent({
                    startDateTime: '2026-01-31T10:10:00Z',
                    endDateTime: '2026-01-31T10:30:00Z',
                }),
            ];

            // 5 min + 15 min buffer = 20 min. Available: 10:00 to 10:10 = 10 min. Not enough.
            // After event: 10:30 + 15 = 10:45
            const result = detector.findNextAvailableSlot(5, events, startFrom);
            expect(result.getTime()).toBe(new Date('2026-01-31T10:45:00Z').getTime());
        });
    });

    describe('getConflictDetector (singleton)', () => {
        it('should return a ConflictDetector instance', async () => {
            const { getConflictDetector, ConflictDetector } = await import('../conflict-detector');
            const detector = getConflictDetector();
            expect(detector).toBeInstanceOf(ConflictDetector);
        });

        it('should return the same instance on subsequent calls', async () => {
            const { getConflictDetector } = await import('../conflict-detector');
            const detector1 = getConflictDetector();
            const detector2 = getConflictDetector();
            expect(detector1).toBe(detector2);
        });
    });
});
