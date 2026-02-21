/**
 * Jarvis AI — Central Intelligence
 *
 * Full-context AI assistant: calendar CRUD, task/habit/email advice,
 * briefings, and proactive suggestions. Powered by Ollama.
 */

import { askAI, detectProvider } from './ai/ai-service';
import { buildSystemPrompt, BRIEFING_TEMPLATE } from './agent-prompts';
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
        .map((m) => `${m.role === 'user' ? 'User' : 'Pepper'}: ${m.text}`)
        .join('\n');
}

// --- Core Functions ---

export async function parseCalendarIntent(
    userMessage: string,
    conversationHistory: JarvisMessage[]
): Promise<CalendarIntent> {
    if (await detectProvider() === 'rules') {
        return {
            action: 'unclear',
            response: 'No AI provider configured. Set VITE_GEMINI_API_KEY or enable another provider.',
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

    const prompt = `You are Pepper, Quan's executive assistant and calendar manager. The current date/time in Pacific Time is: ${nowPT()}.
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
        const rawText = await askAI(prompt, undefined, { role: 'ea', agentId: 'ea-user' });
        if (!rawText) throw new Error('No response from AI');

        // Strip markdown code fences if present
        const jsonStr = rawText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
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

export async function isJarvisAvailable(): Promise<boolean> {
    const provider = await detectProvider();
    return provider !== 'rules';
}

// --- Full-Context Intelligence ---

export async function processJarvisMessage(
    userMessage: string,
    conversationHistory: JarvisMessage[]
): Promise<JarvisIntent> {
    if (await detectProvider() === 'rules') {
        return {
            action: 'unclear',
            response: 'No AI provider configured. Set VITE_GEMINI_API_KEY or enable another provider.',
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

        // Build elite system prompt with full user context
        const eliteIdentity = buildSystemPrompt(`${contextBlock}

Current date/time (Pacific): ${nowPT()}
Today: ${todayISO()} | Timezone: ${TIMEZONE}
${eventsContext ? `\nCALENDAR EVENTS (for scheduling actions):\n${eventsContext}` : '\nCALENDAR: NOT CONNECTED. Do NOT mention any calendar events, meetings, or schedule items. If the user asks about their calendar, tell them to connect Google Calendar first.'}`);

        const prompt = `${eliteIdentity}

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
- All calendar times: ISO 8601 with Pacific timezone offset
- CRITICAL: NEVER fabricate or invent data. ONLY reference data from the context above.
- If a data source is marked NOT CONNECTED, do NOT make up data for it. Say it's not connected and suggest the user connect it.
- NEVER invent meetings, emails, Slack messages, or any events that are not in the provided context.`;

        const text = await askAI(prompt, undefined, { role: 'ea', agentId: 'ea-user' });
        if (!text) throw new Error('No response from AI');

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
            const fallbackPrompt = `You are Pepper, Quan's executive assistant. The user said: "${sanitizeForPrompt(userMessage, 500)}". Reply conversationally in 1-3 sentences.`;
            const fallbackText = await askAI(fallbackPrompt, undefined, { role: 'ea', agentId: 'ea-user' });
            return {
                action: 'advice',
                response: fallbackText || "I'm having trouble connecting to AI right now. Please try again.",
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
    if (await detectProvider() === 'rules') return "Hey Quan! It's Pepper. Set up an AI provider to unlock full intelligence.";

    try {
        const ctx = await gatherJarvisContext();
        const contextBlock = formatContextForPrompt(ctx);

        const prompt = `${BRIEFING_TEMPLATE}

CRITICAL: NEVER fabricate data. ONLY reference what appears in the context below.

${contextBlock}

Current time: ${nowPT()}

Respond with plain text only (no JSON, no markdown).`;

        const text = await askAI(prompt, undefined, { role: 'ea', agentId: 'ea-user' });
        return text || "Hey Quan! It's Pepper. I couldn't generate a briefing right now, but I'm here to help.";
    } catch (err) {
        console.error('[Maple] Briefing generation failed:', err);
        return "Hey Quan! It's Pepper. I can help with tasks, calendar, habits, and more. What's on your mind?";
    }
}
