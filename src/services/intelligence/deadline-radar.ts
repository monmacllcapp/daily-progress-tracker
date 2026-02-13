import type { Signal, AnticipationContext } from '../../types/signals';
import { v4 as uuid } from 'uuid';

export function detectDeadlineSignals(context: AnticipationContext): Signal[] {
  const signals: Signal[] = [];
  const now = new Date(`${context.today}T${context.currentTime}`);
  const today = new Date(context.today);
  today.setHours(0, 0, 0, 0);

  for (const task of context.tasks) {
    if (task.status === 'completed' || task.status === 'dismissed') {
      continue;
    }

    if (!task.due_date) {
      continue;
    }

    const dueDate = new Date(task.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const daysUntil = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let severity: 'info' | 'attention' | 'urgent' | 'critical' | null = null;
    let titlePrefix = '';
    let contextMessage = '';

    if (daysUntil < 0) {
      severity = 'critical';
      titlePrefix = 'OVERDUE';
      contextMessage = `Task "${task.title}" was due ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} ago.`;
    } else if (daysUntil === 0) {
      severity = 'urgent';
      titlePrefix = 'Due today';
      contextMessage = `Task "${task.title}" is due today.`;
    } else if (daysUntil === 1) {
      severity = 'attention';
      titlePrefix = 'Due tomorrow';
      contextMessage = `Task "${task.title}" is due tomorrow.`;
    } else if (daysUntil <= 3) {
      severity = 'info';
      titlePrefix = `Due in ${daysUntil} days`;
      contextMessage = `Task "${task.title}" is due in ${daysUntil} days.`;
    }

    if (severity) {
      signals.push({
        id: uuid(),
        type: 'deadline_approaching',
        severity,
        domain: 'personal_growth',
        source: 'deadline-radar',
        title: `${titlePrefix}: ${task.title}`,
        context: contextMessage,
        suggested_action: daysUntil < 0 ? 'Address this overdue task immediately' : 'Schedule time to complete this task',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [task.id],
        created_at: new Date().toISOString(),
      });
    }
  }

  for (const project of context.projects) {
    if (project.status === 'completed') {
      continue;
    }

    if (!project.due_date) {
      continue;
    }

    const dueDate = new Date(project.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const daysUntil = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let severity: 'info' | 'attention' | 'urgent' | 'critical' | null = null;
    let titlePrefix = '';
    let contextMessage = '';

    if (daysUntil < 0) {
      severity = 'critical';
      titlePrefix = 'OVERDUE';
      contextMessage = `Project "${project.title}" was due ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} ago.`;
    } else if (daysUntil <= 3) {
      severity = 'urgent';
      titlePrefix = `Due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;
      contextMessage = `Project "${project.title}" is due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`;
    } else if (daysUntil <= 7) {
      severity = 'attention';
      titlePrefix = `Due in ${daysUntil} days`;
      contextMessage = `Project "${project.title}" is due in ${daysUntil} days.`;
    }

    if (severity) {
      signals.push({
        id: uuid(),
        type: 'deadline_approaching',
        severity,
        domain: 'personal_growth',
        source: 'deadline-radar',
        title: `${titlePrefix}: ${project.title}`,
        context: contextMessage,
        suggested_action: daysUntil < 0 ? 'Review and reschedule this overdue project' : 'Review project progress and plan next actions',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [project.id],
        created_at: new Date().toISOString(),
      });
    }
  }

  for (const event of context.calendarEvents) {
    if (event.all_day) {
      continue;
    }

    const eventStart = new Date(event.start_time);
    const minutesUntil = Math.floor((eventStart.getTime() - now.getTime()) / (1000 * 60));

    if (minutesUntil >= 0 && minutesUntil <= 30) {
      signals.push({
        id: uuid(),
        type: 'calendar_conflict',
        severity: 'attention',
        domain: 'personal_growth',
        source: 'deadline-radar',
        title: `Upcoming event in ${minutesUntil} min: ${event.summary}`,
        context: `Calendar event "${event.summary}" starts at ${eventStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`,
        suggested_action: 'Wrap up current work and prepare for this event',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [event.id],
        created_at: new Date().toISOString(),
      });
    }
  }

  return signals;
}
