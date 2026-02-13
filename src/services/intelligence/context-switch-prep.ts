import type { Signal, AnticipationContext, SignalSeverity } from '../../types/signals';
import type { CalendarEvent } from '../../types/schema';
import { v4 as uuid } from 'uuid';

/**
 * Context Switch Preparation Intelligence Service
 *
 * Prepares user for upcoming context switches based on calendar.
 * Detects:
 * - Upcoming events in different domains (context switches)
 * - Focus blocks requiring environment preparation
 * Severity escalates based on proximity (30min=info, 15min=attention, 5min=urgent)
 */

export function detectContextSwitchSignals(context: AnticipationContext): Signal[] {
  const signals: Signal[] = [];
  const { calendarEvents } = context;

  if (!calendarEvents || calendarEvents.length === 0) {
    return signals;
  }

  const now = new Date();
  const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);

  // Find upcoming events within the next 30 minutes
  const upcomingEvents = calendarEvents
    .map(event => ({
      event,
      startTime: new Date(event.start_time),
      endTime: new Date(event.end_time)
    }))
    .filter(({ startTime, endTime }) => {
      // Event hasn't ended yet and starts within 30 minutes
      return endTime > now && startTime <= thirtyMinutesFromNow && startTime > now;
    })
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  for (const { event, startTime } of upcomingEvents) {
    const minutesUntil = Math.floor((startTime.getTime() - now.getTime()) / (1000 * 60));
    const severity = getSeverityByProximity(minutesUntil);

    // Special handling for focus blocks
    if (event.is_focus_block) {
      signals.push({
        id: uuid(),
        type: 'context_switch_prep',
        severity,
        domain: 'personal_growth', // Deep work relates to personal productivity
        source: 'context-switch-prep',
        title: 'Deep work session approaching',
        context: `Focus block "${event.summary}" starts in ${minutesUntil} minutes at ${formatTime(startTime)}`,
        suggested_action: 'Prepare your environment: close distractions, silence notifications, gather materials',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [event.id],
        created_at: now.toISOString(),
      });
    } else {
      // Standard context switch preparation
      signals.push({
        id: uuid(),
        type: 'context_switch_prep',
        severity,
        domain: inferDomainFromEvent(event),
        source: 'context-switch-prep',
        title: 'Upcoming context switch',
        context: `"${event.summary}" starts in ${minutesUntil} minutes at ${formatTime(startTime)}`,
        suggested_action: getContextSwitchSuggestion(event, minutesUntil),
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [event.id],
        created_at: now.toISOString(),
      });
    }
  }

  return signals;
}

/**
 * Determine severity based on time until event
 * 5 min = urgent, 15 min = attention, 30 min = info
 */
function getSeverityByProximity(minutesUntil: number): SignalSeverity {
  if (minutesUntil <= 5) {
    return 'urgent';
  } else if (minutesUntil <= 15) {
    return 'attention';
  } else {
    return 'info';
  }
}

/**
 * Infer life domain from calendar event
 * Uses simple keyword matching on summary/description
 */
function inferDomainFromEvent(event: CalendarEvent): Signal['domain'] {
  const text = `${event.summary} ${event.description || ''}`.toLowerCase();

  if (text.match(/\b(deal|property|real estate|showing|inspection|closing)\b/)) {
    return 'business_re';
  }
  if (text.match(/\b(trade|trading|market|stock|portfolio|alpaca)\b/)) {
    return 'business_trading';
  }
  if (text.match(/\b(dev|development|code|coding|meeting|client|project)\b/)) {
    return 'business_tech';
  }
  if (text.match(/\b(family|kids|spouse|school|pickup|dropoff)\b/)) {
    return 'family';
  }
  if (text.match(/\b(workout|gym|doctor|health|fitness)\b/)) {
    return 'health_fitness';
  }
  if (text.match(/\b(social|dinner|coffee|drinks|hangout)\b/)) {
    return 'social';
  }
  if (text.match(/\b(church|prayer|meditation|spiritual)\b/)) {
    return 'spiritual';
  }
  if (text.match(/\b(creative|writing|music|art|hobby)\b/)) {
    return 'creative';
  }

  // Default to personal growth for unclassified events
  return 'personal_growth';
}

/**
 * Get context-aware suggestion based on event type and timing
 */
function getContextSwitchSuggestion(_event: CalendarEvent, minutesUntil: number): string {
  if (minutesUntil <= 5) {
    return 'Wrap up current task and prepare to transition';
  } else if (minutesUntil <= 15) {
    return 'Begin wrapping up current work and gather materials for upcoming event';
  } else {
    return 'Be aware of upcoming transition and plan accordingly';
  }
}

/**
 * Format time as HH:MM in UTC
 */
function formatTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
