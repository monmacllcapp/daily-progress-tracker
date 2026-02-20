/**
 * Jarvis AI — Central Intelligence
 *
 * Full-context AI assistant: calendar CRUD, task/habit/email advice,
 * briefings, and proactive suggestions. Powered by Ollama.
 */

import { generateContent, isOllamaConfigured } from './ollama-client';
import { isGoogleConnected } from './google-auth';
import {
    fetchGoogleEvents,
    createGoogleEvent,
    updateGoogleEvent,
    deleteGoogleEvent,
    type GoogleCalendarEvent,
} from './google-calendar';
import { gatherJarvisContext, formatContextForPrompt } from './jarvis-context';
import { sanitizeForPrompt } from '../utils/sanitize-prompt';

// --- Types ---

export interface ConflictInfo {
    eventId: string;
    summary: string;
    start: string;
    end: string;
}

export interface CalendarIntent {
    action: 'create' | 'move' | 'delete' | 'query' | 'unclear';
    eventTitle?: string;
    startTime?: string;
    endTime?: string;
    duration?: number;
    originalEventId?: string;
    conflicts?: ConflictInfo[];
    response: string;
    needsConfirmation?: boolean;
}

export interface JarvisIntent {
    action: CalendarIntent['action'] | 'advice' | 'briefing' | 'query_tasks' | 'query_habits' | 'query_email';
    response: string;
    suggestions?: string[];
    // Calendar fields (inherited from CalendarIntent when applicable)
    eventTitle?: string;
    startTime?: string;
    endTime?: string;
    duration?: number;
    originalEventId?: string;
    conflicts?: ConflictInfo[];
    needsConfirmation?: boolean;
}

export interface JarvisMessage {
    id: string;
    role: 'user' | 'jarvis';
    text: string;
    intent?: CalendarIntent;
    jarvisIntent?: JarvisIntent;
    timestamp: Date;
}

// --- Helpers ---

const TIMEZONE = 'America/Los_Angeles';

function nowPT(): string {
    return new Date().toLocaleString('en-US', { timeZone: TIMEZONE });
}

function todayISO(): string {
    const d = new Date();
    const pt = new Date(d.toLocaleString('en-US', { timeZone: TIMEZONE }));
    return pt.toISOString().split('T')[0];
}

async function getUpcomingEvents(): Promise<GoogleCalendarEvent[]> {
    if (!isGoogleConnected()) return [];
    const now = new Date();
    const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    try {
        return await fetchGoogleEvents(now, weekOut);
    } catch (err) {
        console.warn('[Maple] Failed to fetch upcoming events:', err);
        return [];
    }
}

function formatEventsForPrompt(events: GoogleCalendarEvent[]): string {
    if (events.length === 0) return 'No upcoming events found.';
    return events
        .map((e) => {
            const start = e.start.dateTime || e.start.date || '?';
            const end = e.end.dateTime || e.end.date || '?';
            return `- "${e.summary}" | ${start} → ${end} | id: ${e.id || 'n/a'}`;
        })
        .join('\n');
}

function formatConversationHistory(messages: JarvisMessage[]): string {
    const recent = messages.slice(-6);
    if (recent.length === 0) return '';
    return recent
        .map((m) => `${m.role === 'user' ? 'User' : 'Maple'}: ${m.text}`)
        .join('\n');
}

// --- Core Functions ---

export async function parseCalendarIntent(
    userMessage: string,
    conversationHistory: JarvisMessage[]
): Promise<CalendarIntent> {
    if (!isOllamaConfigured()) {
        return {
            action: 'unclear',
            response: 'AI is not configured. Please set the VITE_OLLAMA_BASE_URL environment variable.',
        };
    }

    if (!isGoogleConnected()) {
        return {
            action: 'unclear',
            response: 'Google Calendar is not connected. Please sign in with Google first.',
        };
    }

    const events = await getUpcomingEvents();
    const eventsContext = formatEventsForPrompt(events);
    const conversationContext = formatConversationHistory(conversationHistory);

    const prompt = `You are Maple, a calendar assistant. The current date/time in Pacific Time is: ${nowPT()}.
Today's date is ${todayISO()}.
Timezone: ${TIMEZONE}

The user's upcoming events (next 7 days):
${eventsContext}

${conversationContext ? `Recent conversation:\n${conversationContext}\n` : ''}

The user says: "${sanitizeForPrompt(userMessage, 500)}"

Analyze the user's request and respond with a JSON object (no markdown fencing). The JSON must have these fields:
{
  "action": "create" | "move" | "delete" | "query" | "unclear",
  "eventTitle": "string or null",
  "startTime": "ISO 8601 datetime string or null",
  "endTime": "ISO 8601 datetime string or null",
  "duration": number_in_minutes_or_null,
  "originalEventId": "google event id if moving/deleting, or null",
  "conflicts": [{"eventId": "id", "summary": "title", "start": "iso", "end": "iso"}] or [],
  "response": "natural language response to the user",
  "needsConfirmation": true_if_conflicts_or_destructive_action
}

Rules:
- For "create": set eventTitle, startTime, endTime (use duration default 60 min if no end given)
- For "move": set originalEventId, new startTime/endTime, eventTitle
- For "delete": set originalEventId, eventTitle
- For "query": just answer the question about their schedule in "response"
- Check for time conflicts with existing events. If a conflict exists, set needsConfirmation=true and list conflicts
- All times must be ISO 8601 with Pacific timezone offset (e.g. 2026-02-04T19:00:00-08:00)
- Be conversational and helpful in the "response" field
- If the request is ambiguous, set action="unclear" and ask for clarification in "response"`;

    try {
        const text = await generateContent(prompt);

        // Strip markdown code fences if present
        const jsonStr = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
        const parsed = JSON.parse(jsonStr) as CalendarIntent;

        // Ensure required fields
        if (!parsed.action) parsed.action = 'unclear';
        if (!parsed.response) parsed.response = "I'm not sure what you'd like me to do.";

        return parsed;
    } catch (err) {
        console.error('[Maple] Intent parsing failed:', err);
        return {
            action: 'unclear',
            response: "Sorry, I had trouble understanding that. Could you rephrase your request?",
        };
    }
}

export async function executeCalendarAction(intent: CalendarIntent): Promise<string> {
    try {
        switch (intent.action) {
            case 'create': {
                if (!intent.eventTitle || !intent.startTime) {
                    return "I need a title and time to create an event.";
                }

                const endTime = intent.endTime ||
                    new Date(new Date(intent.startTime).getTime() + (intent.duration || 60) * 60000).toISOString();

                const event: GoogleCalendarEvent = {
                    summary: intent.eventTitle,
                    start: { dateTime: intent.startTime, timeZone: TIMEZONE },
                    end: { dateTime: endTime, timeZone: TIMEZONE },
                };

                const eventId = await createGoogleEvent(event);
                return `Done! "${intent.eventTitle}" has been added to your calendar. (ID: ${eventId})`;
            }

            case 'move': {
                if (!intent.originalEventId) {
                    return "I can't find which event to move. Could you be more specific?";
                }
                if (!intent.startTime) {
                    return "I need a new time to move the event to.";
                }

                const endTime = intent.endTime ||
                    new Date(new Date(intent.startTime).getTime() + (intent.duration || 60) * 60000).toISOString();

                const event: GoogleCalendarEvent = {
                    summary: intent.eventTitle || 'Untitled Event',
                    start: { dateTime: intent.startTime, timeZone: TIMEZONE },
                    end: { dateTime: endTime, timeZone: TIMEZONE },
                };

                await updateGoogleEvent(intent.originalEventId, event);
                return `Done! "${intent.eventTitle}" has been moved to the new time.`;
            }

            case 'delete': {
                if (!intent.originalEventId) {
                    return "I can't find which event to delete. Could you be more specific?";
                }

                await deleteGoogleEvent(intent.originalEventId);
                return `Done! "${intent.eventTitle}" has been removed from your calendar.`;
            }

            case 'query':
                return intent.response;

            default:
                return intent.response;
        }
    } catch (err) {
        console.error('[Maple] Action execution failed:', err);
        return `Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`;
    }
}

export function isJarvisAvailable(): boolean {
    // Jarvis works with just an Ollama server — calendar is optional
    return isOllamaConfigured();
}

// --- Full-Context Intelligence ---

export async function processJarvisMessage(
    userMessage: string,
    conversationHistory: JarvisMessage[]
): Promise<JarvisIntent> {
    if (!isOllamaConfigured()) {
        return {
            action: 'unclear',
            response: 'AI is not configured. Please set the VITE_OLLAMA_BASE_URL environment variable.',
        };
    }

    try {
        // Gather full context (inside try-catch so DB failures don't crash)
        let contextBlock = '';
        try {
            const ctx = await gatherJarvisContext();
            contextBlock = formatContextForPrompt(ctx);
        } catch (ctxErr) {
            console.warn('[Maple] Context gathering failed, continuing without:', ctxErr);
            contextBlock = '(Context unavailable)';
        }

        const conversationContext = formatConversationHistory(conversationHistory);

        // If calendar is connected, also get events for calendar actions
        let eventsContext = '';
        if (isGoogleConnected()) {
            const events = await getUpcomingEvents();
            eventsContext = formatEventsForPrompt(events);
        }

        const prompt = `You are Maple, a proactive AI life assistant for Maple.
You see the user's COMPLETE data — tasks, calendar, emails, habits, projects, streaks, and more.
The current date/time in Pacific Time is: ${nowPT()}.
Today's date is ${todayISO()}.
Timezone: ${TIMEZONE}

${contextBlock}

${eventsContext ? `CALENDAR EVENTS (for scheduling actions):\n${eventsContext}\n` : ''}
${conversationContext ? `Recent conversation:\n${conversationContext}\n` : ''}
The user says: "${sanitizeForPrompt(userMessage, 500)}"

You MUST respond with ONLY a valid JSON object. No other text before or after. The JSON must have these fields:
{
  "action": "advice",
  "response": "your natural language response here",
  "suggestions": ["suggestion 1", "suggestion 2"]
}

Valid action values: "create", "move", "delete", "query", "advice", "briefing", "query_tasks", "query_habits", "query_email", "unclear"

For calendar actions (create/move/delete), also include: eventTitle, startTime (ISO 8601), endTime, duration (minutes), originalEventId, conflicts, needsConfirmation.

Rules:
- action="advice" for productivity tips, prioritization help, greetings, or general chat
- action="briefing" for daily summaries or status requests
- action="create"/"move"/"delete" ONLY for calendar operations
- Always include 1-3 actionable suggestions in "suggestions" array
- Be conversational, concise, and proactive
- All calendar times: ISO 8601 with Pacific timezone offset
- CRITICAL: NEVER fabricate or invent email content, subjects, senders, or any data. ONLY reference data that appears in the context above. If asked about an email, quote the real subject and sender from the context. If the data is not in the context, say you don't have that detail.

CONVERSATION STYLE — CRITICAL:
- DO NOT keep asking "Do you want me to...?" or "Should I...?" over and over. If the user confirms or says "yes"/"okay"/"sure", ACT immediately — perform the action and report the result.
- Give DIRECT, complete answers. If asked about an email, show the key details (sender, subject, summary) in ONE response rather than asking if the user wants to see it.
- NEVER repeat the same information the user already confirmed. Move the conversation FORWARD.
- Keep responses to 1-3 sentences. Use the "suggestions" array for follow-up options instead of asking questions in the response text.
- If you already have the data to answer, ANSWER. Don't ask for permission to show data you already have.`;

        const text = await generateContent(prompt);

        // Try to extract JSON from the response (handle markdown fences, extra text)
        let jsonStr = text;
        // Strip markdown code fences
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        // If there's text before/after the JSON object, extract just the JSON
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }

        const parsed = JSON.parse(jsonStr) as JarvisIntent;

        if (!parsed.action) parsed.action = 'advice';
        if (!parsed.response) parsed.response = "I'm not sure what you'd like me to do.";
        if (!parsed.suggestions) parsed.suggestions = [];

        return parsed;
    } catch (err) {
        console.error('[Maple] Message processing failed:', err);
        // Fallback: try a simpler non-JSON approach
        try {
            const fallbackPrompt = `You are Maple, a helpful AI assistant. The user said: "${sanitizeForPrompt(userMessage, 500)}". Reply conversationally in 1-3 sentences.`;
            const fallbackText = await generateContent(fallbackPrompt);
            return {
                action: 'advice',
                response: fallbackText,
                suggestions: [],
            };
        } catch {
            return {
                action: 'unclear',
                response: "Sorry, I'm having trouble connecting to AI right now. Please try again in a moment.",
                suggestions: [],
            };
        }
    }
}

export async function generateBriefing(): Promise<string> {
    if (!isOllamaConfigured()) return "Hey! I'm Maple, your AI assistant. Set up your Ollama server to unlock full intelligence.";

    try {
        const ctx = await gatherJarvisContext();
        const contextBlock = formatContextForPrompt(ctx);

        const prompt = `You are Maple, a proactive AI life assistant. Generate a brief, friendly greeting and status briefing based on this user's data. Keep it to 2-4 sentences. Be specific — reference their actual data (use REAL email subjects and senders from the context, REAL task names, REAL habit names). If something needs attention (overdue tasks, urgent emails, streaks at risk), mention it. End with a question or suggestion.

CRITICAL: NEVER fabricate or invent email content, subjects, senders, or any data. ONLY reference what appears in the context below.

${contextBlock}

Current time: ${nowPT()}

Respond with plain text only (no JSON, no markdown).`;

        const text = await generateContent(prompt);
        return text;
    } catch (err) {
        console.error('[Maple] Briefing generation failed:', err);
        return "Hey! I'm Maple, your AI assistant. I can help with tasks, calendar, habits, and more. What's on your mind?";
    }
}
