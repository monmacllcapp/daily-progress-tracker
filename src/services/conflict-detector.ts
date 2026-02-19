import { generateContent, isOllamaConfigured } from './ollama-client';
import type { GoogleCalendarEvent as CalendarEvent } from './google-calendar';
import type { Project } from '../types/schema';
import { sanitizeForPrompt } from '../utils/sanitize-prompt';

export interface Conflict {
    type: 'overlap' | 'back-to-back' | 'overbooked';
    existingEvent: CalendarEvent;
    newProject: Project;
    suggestion: string;
    aiExplanation: string;
}

export class ConflictDetector {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_apiKey?: string) {
        // apiKey no longer needed; AI is handled by the shared Ollama client
    }

    /**
     * Detect conflicts between a new project and existing calendar events
     */
    async detectConflicts(
        newProject: Project,
        existingEvents: CalendarEvent[]
    ): Promise<Conflict[]> {
        if (!newProject.due_date) {
            return []; // No conflicts if no due date
        }

        const conflicts: Conflict[] = [];
        const projectStart = new Date(newProject.due_date);
        const projectEnd = new Date(
            projectStart.getTime() + (newProject.metrics.total_time_estimated * 60000)
        );

        for (const event of existingEvents) {
            if (!event.start.dateTime || !event.end.dateTime) continue;
            const eventStart = new Date(event.start.dateTime);
            const eventEnd = new Date(event.end.dateTime);

            // Check for overlap
            if (this.isOverlapping(projectStart, projectEnd, eventStart, eventEnd)) {
                const suggestion = await this.generateSuggestion(newProject, event);

                conflicts.push({
                    type: 'overlap',
                    existingEvent: event,
                    newProject,
                    suggestion: suggestion.suggestion,
                    aiExplanation: suggestion.explanation,
                });
            }
            // Check for back-to-back (less than 15 min buffer)
            else if (this.isBackToBack(projectStart, projectEnd, eventStart, eventEnd)) {
                conflicts.push({
                    type: 'back-to-back',
                    existingEvent: event,
                    newProject,
                    suggestion: 'Add 15-minute buffer between events',
                    aiExplanation: 'Back-to-back scheduling can lead to stress and delays.',
                });
            }
        }

        // Check for overbooked day (more than 8 hours)
        if (this.isDayOverbooked(projectStart, existingEvents, newProject.metrics.total_time_estimated)) {
            const firstEvent = existingEvents[0];
            if (firstEvent) {
                conflicts.push({
                    type: 'overbooked',
                    existingEvent: firstEvent,
                    newProject,
                    suggestion: 'Move to next available day',
                    aiExplanation: 'This day is already heavily scheduled. Consider spreading work across multiple days.',
                });
            }
        }

        return conflicts;
    }

    /**
     * Check if two time ranges overlap
     */
    private isOverlapping(
        start1: Date,
        end1: Date,
        start2: Date,
        end2: Date
    ): boolean {
        return start1 < end2 && end1 > start2;
    }

    /**
     * Check if events are back-to-back (less than 15 min buffer)
     */
    private isBackToBack(
        start1: Date,
        end1: Date,
        start2: Date,
        end2: Date
    ): boolean {
        const bufferMs = 15 * 60 * 1000; // 15 minutes
        const gap1 = Math.abs(end1.getTime() - start2.getTime());
        const gap2 = Math.abs(end2.getTime() - start1.getTime());
        return gap1 < bufferMs || gap2 < bufferMs;
    }

    /**
     * Check if a day is overbooked (more than 8 hours)
     */
    private isDayOverbooked(
        date: Date,
        events: CalendarEvent[],
        newDurationMinutes: number
    ): boolean {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        let totalMinutes = newDurationMinutes;

        for (const event of events) {
            if (!event.start.dateTime || !event.end.dateTime) continue;
            const eventStart = new Date(event.start.dateTime);
            const eventEnd = new Date(event.end.dateTime);

            if (eventStart >= dayStart && eventStart <= dayEnd) {
                const duration = (eventEnd.getTime() - eventStart.getTime()) / 60000;
                totalMinutes += duration;
            }
        }

        return totalMinutes > 480; // 8 hours = 480 minutes
    }

    /**
     * Generate AI-powered suggestion for conflict resolution
     */
    private async generateSuggestion(
        project: Project,
        conflictingEvent: CalendarEvent
    ): Promise<{ suggestion: string; explanation: string }> {
        if (!isOllamaConfigured()) {
            return {
                suggestion: 'Move to next available time slot',
                explanation: 'This project conflicts with an existing event.',
            };
        }

        try {
            const prompt = `
You are a scheduling assistant. A user is trying to schedule a project that conflicts with an existing calendar event.

New Project:
- Title: ${sanitizeForPrompt(project.title, 200)}
- Purpose: ${sanitizeForPrompt(project.motivation_payload.why, 300)}
- Estimated Duration: ${project.metrics.total_time_estimated} minutes
- Priority: ${project.priority || 'medium'}

Conflicting Event:
- Title: ${sanitizeForPrompt(conflictingEvent.summary, 200)}
- Start: ${conflictingEvent.start.dateTime}
- End: ${conflictingEvent.end.dateTime}

Provide:
1. A brief, actionable suggestion (max 10 words)
2. A one-sentence explanation

Format your response as JSON:
{
  "suggestion": "...",
  "explanation": "..."
}
`;

            const text = await generateContent(prompt);

            // Parse JSON response
            const parsed = JSON.parse(text);
            return parsed;
        } catch (error) {
            console.error('AI suggestion failed:', error);
            return {
                suggestion: 'Reschedule to avoid conflict',
                explanation: 'The AI assistant is currently unavailable.',
            };
        }
    }

    /**
     * Find next available time slot
     */
    findNextAvailableSlot(
        durationMinutes: number,
        existingEvents: CalendarEvent[],
        startSearchFrom: Date = new Date()
    ): Date {
        const timedEvents = existingEvents.filter(e => e.start.dateTime && e.end.dateTime);
        const sortedEvents = timedEvents.sort((a, b) =>
            new Date(a.start.dateTime!).getTime() - new Date(b.start.dateTime!).getTime()
        );

        let currentTime = new Date(startSearchFrom);
        currentTime.setMinutes(0, 0, 0); // Round to hour

        for (const event of sortedEvents) {
            const eventStart = new Date(event.start.dateTime!);
            const eventEnd = new Date(event.end.dateTime!);

            // Check if there's enough space before this event
            const availableTime = eventStart.getTime() - currentTime.getTime();
            const requiredTime = durationMinutes * 60000 + (15 * 60000); // Add 15 min buffer

            if (availableTime >= requiredTime) {
                return currentTime;
            }

            // Move to after this event
            currentTime = new Date(eventEnd.getTime() + (15 * 60000)); // 15 min buffer
        }

        // If no slot found, return time after last event
        return currentTime;
    }
}

// Singleton instance
let conflictDetector: ConflictDetector | null = null;

export function getConflictDetector(apiKey?: string): ConflictDetector {
    if (!conflictDetector) {
        conflictDetector = new ConflictDetector(apiKey);
    }
    return conflictDetector;
}
