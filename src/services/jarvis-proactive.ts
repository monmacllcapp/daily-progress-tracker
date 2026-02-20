/**
 * Jarvis Proactive Engine — Rule-Based Nudges
 *
 * No AI calls — purely local data checks on a 30-minute interval.
 * Each nudge type fires at most once per session (deduplication by type).
 */

import { createDatabase } from '../db';
import { isGoogleConnected } from './google-auth';
import { fetchGoogleEvents } from './google-calendar';
import { getHabitStreak } from './habit-service';
import type { JarvisNudge } from '../store/jarvisStore';

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const firedTypes = new Set<string>();

function makeNudge(
  type: JarvisNudge['type'],
  title: string,
  message: string
): JarvisNudge {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    message,
    timestamp: new Date(),
    dismissed: false,
  };
}

async function checkRules(onNudge: (nudge: JarvisNudge) => void): Promise<void> {
  try {
    const db = await createDatabase();

    // Rule 1: Tomorrow's meetings preview (fire between 4:00-5:30 PM PT)
    if (!firedTypes.has('tomorrow_preview')) {
      const now = new Date();
      const ptHour = parseInt(
        now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false })
      );
      if (ptHour >= 16 && ptHour < 18) {
        if (isGoogleConnected()) {
          try {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            const tomorrowEnd = new Date(tomorrow);
            tomorrowEnd.setHours(23, 59, 59, 999);
            const events = await fetchGoogleEvents(tomorrow, tomorrowEnd);
            if (events.length > 0) {
              const first = events[0];
              const startStr = first.start?.dateTime || first.start?.date || '';
              const time = startStr
                ? new Date(startStr).toLocaleTimeString('en-US', {
                    timeZone: 'America/Los_Angeles',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : '';
              firedTypes.add('tomorrow_preview');
              onNudge(
                makeNudge(
                  'reminder',
                  'Tomorrow Preview',
                  `You have ${events.length} event${events.length > 1 ? 's' : ''} tomorrow. First: "${first.summary}" at ${time}`
                )
              );
              return; // one nudge per cycle
            }
          } catch { /* calendar unavailable */ }
        }
      }
    }

    // Rule 2: Urgent unreplied emails
    if (!firedTypes.has('urgent_emails')) {
      const urgentEmails = await db.emails
        .find({
          selector: {
            tier: { $in: ['reply_urgent', 'reply_needed'] },
            status: { $nin: ['replied', 'archived'] },
          },
        })
        .exec();
      if (urgentEmails.length > 0) {
        firedTypes.add('urgent_emails');
        onNudge(
          makeNudge(
            'warning',
            'Urgent Emails',
            `${urgentEmails.length} urgent email${urgentEmails.length > 1 ? 's' : ''} still need a response`
          )
        );
        return;
      }
    }

    // Rule 3: Streak at risk
    if (!firedTypes.has('streak_risk')) {
      const today = new Date().toISOString().split('T')[0];
      const habits = await db.habits.find({ selector: { is_archived: { $ne: true } } }).exec();
      const completions = await db.habit_completions.find().exec();
      const todayCompletions = new Set(
        completions.filter((c) => c.date === today).map((c) => c.habit_id)
      );

      for (const habit of habits) {
        if (todayCompletions.has(habit.id)) continue;
        const hCompletions = completions
          .filter((c) => c.habit_id === habit.id)
          .map((c) => ({ date: c.date }));
        const { current } = getHabitStreak(hCompletions);
        if (current >= 5) {
          firedTypes.add('streak_risk');
          onNudge(
            makeNudge(
              'warning',
              'Streak at Risk',
              `Your ${habit.name} streak (${current}d) is at risk — complete it today!`
            )
          );
          return;
        }
      }
    }

    // Rule 4: Overdue tasks
    if (!firedTypes.has('overdue_tasks')) {
      const today = new Date().toISOString().split('T')[0];
      const overdue = await db.tasks
        .find({
          selector: {
            status: 'active',
            due_date: { $lt: today, $gt: '' },
          },
        })
        .exec();
      if (overdue.length > 0) {
        firedTypes.add('overdue_tasks');
        onNudge(
          makeNudge(
            'warning',
            'Overdue Tasks',
            `${overdue.length} task${overdue.length > 1 ? 's are' : ' is'} overdue`
          )
        );
        return;
      }
    }

    // Rule 5: No journal today
    if (!firedTypes.has('no_journal')) {
      const today = new Date().toISOString().split('T')[0];
      const journals = await db.daily_journal.find({ selector: { date: today } }).exec();
      if (journals.length === 0) {
        firedTypes.add('no_journal');
        onNudge(
          makeNudge(
            'insight',
            'Morning Flow',
            "You haven't done your Morning Flow yet today"
          )
        );
      }
    }
  } catch (err) {
    console.warn('[Maple Proactive] Rule check failed:', err);
  }
}

export function startJarvisProactive(
  onNudge: (nudge: JarvisNudge) => void
): () => void {
  // Initial check after a short delay
  const initialTimer = setTimeout(() => checkRules(onNudge), 5000);

  // Recurring check
  const interval = setInterval(() => checkRules(onNudge), INTERVAL_MS);

  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
}
