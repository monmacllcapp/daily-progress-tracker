import type { Signal, AnticipationContext, FamilyEvent } from '../../types/signals';
import type { CalendarEvent } from '../../types/schema';
import { v4 as uuid } from 'uuid';

/**
 * Family Awareness Intelligence Service
 *
 * Monitors family calendar events and generates awareness signals.
 * Detects:
 * - Upcoming family events (within 2 hours = urgent, today = attention)
 * - Conflicts between family events and personal calendar
 */

export function detectFamilySignals(context: AnticipationContext): Signal[] {
  const signals: Signal[] = [];
  const { mcpData, calendarEvents } = context;

  // No family calendar data available
  if (!mcpData.familyCalendars || mcpData.familyCalendars.length === 0) {
    return signals;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  for (const familyEvent of mcpData.familyCalendars) {
    const eventStart = new Date(familyEvent.start_time);
    const eventEnd = new Date(familyEvent.end_time);

    // Skip past events
    if (eventEnd < now) {
      continue;
    }

    // Check for conflicts with personal calendar
    const conflict = findConflictingEvent(familyEvent, calendarEvents);
    if (conflict) {
      signals.push({
        id: uuid(),
        type: 'family_awareness',
        severity: 'critical',
        domain: 'family',
        source: 'family-awareness',
        title: `Family event conflicts with your schedule`,
        context: `${familyEvent.member}'s event "${familyEvent.summary}" at ${formatTime(eventStart)} overlaps with your "${conflict.summary}"`,
        suggested_action: `Reschedule "${conflict.summary}" or notify ${familyEvent.member}`,
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [familyEvent.id, conflict.id],
        created_at: now.toISOString(),
      });
      continue; // Don't create duplicate signals for this event
    }

    // Urgent: event starts within 2 hours
    if (eventStart <= twoHoursFromNow && eventStart > now) {
      signals.push({
        id: uuid(),
        type: 'family_awareness',
        severity: 'urgent',
        domain: 'family',
        source: 'family-awareness',
        title: `${familyEvent.member}'s event starting soon`,
        context: `"${familyEvent.summary}" starts at ${formatTime(eventStart)} (${getTimeUntil(now, eventStart)})`,
        suggested_action: 'Be aware and prepare to wrap up current work',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [familyEvent.id],
        created_at: now.toISOString(),
      });
    }
    // Attention: event is today but more than 2 hours away
    else if (eventStart >= todayStart && eventStart > twoHoursFromNow) {
      signals.push({
        id: uuid(),
        type: 'family_awareness',
        severity: 'attention',
        domain: 'family',
        source: 'family-awareness',
        title: `${familyEvent.member} has event today`,
        context: `"${familyEvent.summary}" at ${formatTime(eventStart)}`,
        suggested_action: 'Plan your day accordingly',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [familyEvent.id],
        created_at: now.toISOString(),
      });
    }
  }

  return signals;
}

/**
 * Find if a family event conflicts with any personal calendar events
 */
function findConflictingEvent(
  familyEvent: FamilyEvent,
  calendarEvents: CalendarEvent[]
): CalendarEvent | null {
  const familyStart = new Date(familyEvent.start_time);
  const familyEnd = new Date(familyEvent.end_time);

  for (const event of calendarEvents) {
    const eventStart = new Date(event.start_time);
    const eventEnd = new Date(event.end_time);

    // Check for time overlap
    if (eventStart < familyEnd && eventEnd > familyStart) {
      return event;
    }
  }

  return null;
}

/**
 * Format time as HH:MM in UTC
 */
function formatTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Get human-readable time until event
 */
function getTimeUntil(from: Date, to: Date): string {
  const diffMs = to.getTime() - from.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 60) {
    return `in ${diffMinutes} minutes`;
  }

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  if (minutes === 0) {
    return `in ${hours} hour${hours > 1 ? 's' : ''}`;
  }

  return `in ${hours}h ${minutes}m`;
}
