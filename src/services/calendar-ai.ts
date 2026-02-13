/**
 * Calendar AI Advisor
 *
 * Uses Gemini to analyze today's calendar events and tasks,
 * producing a daily briefing with conflict warnings and scheduling suggestions.
 * Follows the same pattern as ai-advisor.ts.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { CalendarEvent, Task } from '../types/schema';
import type { MeetingLoadStats, EventConflict } from './calendar-monitor';

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI | null {
    if (genAI) return genAI;
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) return null;
    genAI = new GoogleGenerativeAI(apiKey);
    return genAI;
}

export interface FreeSlot {
    startTime: string;
    endTime: string;
    durationMinutes: number;
    recommendation: string;
}

export interface CalendarBriefing {
    summary: string;
    conflicts: string[];
    suggestedSlots: FreeSlot[];
    insights: string[];
}

const WORKING_DAY_START_HOUR = 6;
const WORKING_DAY_END_HOUR = 22;

/**
 * Compute free time slots within the working day (6 AM - 10 PM).
 * Pure function — no AI needed.
 */
export function computeFreeSlots(events: CalendarEvent[], date: Date): FreeSlot[] {
    const dateStr = date.toISOString().split('T')[0];
    const workStart = new Date(dateStr + `T${String(WORKING_DAY_START_HOUR).padStart(2, '0')}:00:00`).getTime();
    const workEnd = new Date(dateStr + `T${String(WORKING_DAY_END_HOUR).padStart(2, '0')}:00:00`).getTime();

    const timedEvents = events
        .filter(e => !e.all_day)
        .map(e => ({
            start: Math.max(new Date(e.start_time).getTime(), workStart),
            end: Math.min(new Date(e.end_time).getTime(), workEnd),
        }))
        .filter(e => e.start < e.end)
        .sort((a, b) => a.start - b.start);

    // Merge overlapping intervals
    const merged: Array<{ start: number; end: number }> = [];
    for (const iv of timedEvents) {
        if (merged.length > 0 && iv.start <= merged[merged.length - 1].end) {
            merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
        } else {
            merged.push({ ...iv });
        }
    }

    // Extract free gaps
    const slots: FreeSlot[] = [];
    let cursor = workStart;

    for (const iv of merged) {
        const gap = (iv.start - cursor) / 60000;
        if (gap >= 15) {
            slots.push(buildSlot(cursor, iv.start, gap));
        }
        cursor = iv.end;
    }

    // Trailing free block
    const trailing = (workEnd - cursor) / 60000;
    if (trailing >= 15) {
        slots.push(buildSlot(cursor, workEnd, trailing));
    }

    return slots;
}

function buildSlot(startMs: number, endMs: number, durationMinutes: number): FreeSlot {
    const recommendation =
        durationMinutes >= 120 ? 'Great for deep work' :
        durationMinutes >= 60 ? 'Good for focused task' :
        durationMinutes >= 30 ? 'Quick task window' :
        'Short break';

    return {
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
        durationMinutes: Math.round(durationMinutes),
        recommendation,
    };
}

function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Generate an AI-powered calendar briefing using Gemini.
 * Returns null if no API key is configured.
 */
export async function generateCalendarBriefing(
    events: CalendarEvent[],
    tasks: Task[],
    meetingLoad: MeetingLoadStats,
    conflicts: EventConflict[]
): Promise<CalendarBriefing | null> {
    const ai = getGenAI();
    if (!ai) return null;

    try {
        const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const freeSlots = computeFreeSlots(events, new Date());

        const eventSummaries = events
            .filter(e => !e.all_day)
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
            .slice(0, 20)
            .map(e => `- ${formatTime(e.start_time)}-${formatTime(e.end_time)}: ${e.summary}`)
            .join('\n');

        const taskSummaries = tasks
            .filter(t => t.status === 'active')
            .slice(0, 10)
            .map(t => `- "${t.title}" (priority: ${t.priority}${t.time_estimate_minutes ? `, est: ${t.time_estimate_minutes}min` : ''})`)
            .join('\n');

        const conflictSummaries = conflicts
            .map(c => `- ${c.message}`)
            .join('\n');

        const slotSummaries = freeSlots
            .map(s => `- ${formatTime(s.startTime)}-${formatTime(s.endTime)} (${s.durationMinutes}min)`)
            .join('\n');

        const prompt = `You are a personal calendar advisor. Analyze today's schedule and provide actionable advice.

TODAY'S EVENTS:
${eventSummaries || '(No events today)'}

ACTIVE TASKS:
${taskSummaries || '(No active tasks)'}

MEETING LOAD:
- ${meetingLoad.meetingCount} meetings, ${Math.round(meetingLoad.totalMeetingMinutes / 60 * 10) / 10}h booked
- ${meetingLoad.percentBooked}% of working day booked
- Longest free block: ${meetingLoad.longestFreeBlock}min

CONFLICTS:
${conflictSummaries || '(No conflicts)'}

FREE SLOTS:
${slotSummaries || '(No free slots)'}

Respond as JSON with this exact structure:
{
  "summary": "One sentence overview of the day (mention meeting count, hours booked, largest free block)",
  "conflicts": ["Warning strings about scheduling conflicts or concerns"],
  "suggestedSlots": [{"time": "e.g. 2:00-4:00 PM", "recommendation": "What to do in this slot based on the tasks"}],
  "insights": ["1-2 pattern-based observations or tips for the day"]
}

Keep each field concise. If no conflicts exist, use an empty array. Focus on actionable advice.`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();

        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        const parsed = JSON.parse(jsonMatch[0]);

        return {
            summary: parsed.summary || '',
            conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
            suggestedSlots: freeSlots, // Use our computed slots (more reliable than AI-generated times)
            insights: Array.isArray(parsed.insights) ? parsed.insights : [],
        };
    } catch (err) {
        console.warn('[Calendar AI] Briefing generation failed:', err);
        return null;
    }
}
