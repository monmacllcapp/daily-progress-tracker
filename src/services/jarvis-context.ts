/**
 * Jarvis Context — Data Aggregation Layer
 *
 * Gathers a concise snapshot from ALL 14 RxDB collections for Jarvis AI prompts.
 * Uses Promise.allSettled so one failed query never breaks everything.
 * 60-second cache avoids hammering RxDB on every message.
 */

import { createDatabase, type TitanDatabase } from '../db';
import { isGoogleConnected } from './google-auth';
import { fetchGoogleEvents } from './google-calendar';
import { getHabitStreak } from './habit-service';

// --- Types ---

export interface JarvisContextSnapshot {
  timestamp: string;
  todayISO: string;
  // Tasks
  activeTaskCount: number;
  highPriorityTasks: { title: string; due_date?: string; category?: string }[];
  completedTodayCount: number;
  overdueCount: number;
  // Calendar
  upcomingEvents: { summary: string; start: string; end: string }[];
  nextEvent?: { summary: string; minutesUntil: number };
  // Email
  urgentUnrepliedCount: number;
  totalUnreadCount: number;
  urgentEmails: { from: string; subject: string; snippet: string; tier: string }[];
  recentEmails: { from: string; subject: string; tier: string; status: string }[];
  // Habits
  habitsDueToday: number;
  habitsCompletedToday: number;
  topStreaks: { name: string; streak: number }[];
  // Categories, Projects, Pomodoro, Stressors, Gamification, Journal
  activeCategories: { name: string; progress: number; streak: number }[];
  activeProjects: { title: string; subTasksRemaining: number }[];
  pomodorosTodayCount: number;
  focusMinutesToday: number;
  todaysStressors: string[];
  level: number;
  xp: number;
  hasJournaledToday: boolean;
}

// --- Cache ---

let cachedSnapshot: JarvisContextSnapshot | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

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

// --- Core ---

async function buildSnapshot(db: TitanDatabase): Promise<JarvisContextSnapshot> {
  const today = todayISO();
  const now = new Date();

  const [
    tasksResult,
    projectsResult,
    subTasksResult,
    journalResult,
    categoriesResult,
    stressorsResult,
    _calendarResult,
    emailsResult,
    pomodorosResult,
    habitsResult,
    habitCompletionsResult,
    profileResult,
    googleEventsResult,
  ] = await Promise.allSettled([
    db.tasks.find().exec(),
    db.projects.find({ selector: { status: 'active' } }).exec(),
    db.sub_tasks.find().exec(),
    db.daily_journal.find({ selector: { date: today } }).exec(),
    db.categories.find().exec(),
    db.stressors.find({ selector: { is_today: true } }).exec(),
    db.calendar_events.find().exec(),
    db.emails.find().exec(),
    db.pomodoro_sessions.find().exec(),
    db.habits.find().exec(),
    db.habit_completions.find().exec(),
    db.user_profile.find().exec(),
    isGoogleConnected()
      ? fetchGoogleEvents(now, new Date(now.getTime() + 30 * 60 * 60 * 1000)).catch(() => [])
      : Promise.resolve([]),
  ]);

  const tasks = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
  const projects = projectsResult.status === 'fulfilled' ? projectsResult.value : [];
  const subTasks = subTasksResult.status === 'fulfilled' ? subTasksResult.value : [];
  const journals = journalResult.status === 'fulfilled' ? journalResult.value : [];
  const categories = categoriesResult.status === 'fulfilled' ? categoriesResult.value : [];
  const stressors = stressorsResult.status === 'fulfilled' ? stressorsResult.value : [];
  const emails = emailsResult.status === 'fulfilled' ? emailsResult.value : [];
  const pomodoros = pomodorosResult.status === 'fulfilled' ? pomodorosResult.value : [];
  const habits = habitsResult.status === 'fulfilled' ? habitsResult.value : [];
  const habitCompletions = habitCompletionsResult.status === 'fulfilled' ? habitCompletionsResult.value : [];
  const profiles = profileResult.status === 'fulfilled' ? profileResult.value : [];
  const googleEvents = googleEventsResult.status === 'fulfilled' ? googleEventsResult.value : [];

  // --- Tasks ---
  const activeTasks = tasks.filter((t) => t.status === 'active');
  const highPriority = activeTasks
    .filter((t) => t.priority === 'high' || t.priority === 'urgent')
    .slice(0, 5)
    .map((t) => ({ title: t.title, due_date: t.due_date, category: t.category_id }));
  const completedToday = tasks.filter((t) => t.completed_date === today).length;
  const overdue = activeTasks.filter((t) => t.due_date && t.due_date < today).length;

  // --- Calendar (from Google) ---
  const upcomingEvents = googleEvents.slice(0, 8).map((e) => ({
    summary: e.summary || 'Untitled',
    start: e.start?.dateTime || e.start?.date || '',
    end: e.end?.dateTime || e.end?.date || '',
  }));

  let nextEvent: JarvisContextSnapshot['nextEvent'] = undefined;
  if (googleEvents.length > 0) {
    const first = googleEvents[0];
    const startStr = first.start?.dateTime || first.start?.date;
    if (startStr) {
      const startDate = new Date(startStr);
      const minutesUntil = Math.round((startDate.getTime() - now.getTime()) / 60000);
      if (minutesUntil > -30 && minutesUntil < 360) {
        nextEvent = { summary: first.summary || 'Untitled', minutesUntil };
      }
    }
  }

  // --- Email ---
  const urgentUnrepliedEmails = emails.filter(
    (e) =>
      (e.tier === 'reply_urgent' || e.tier === 'reply_needed') &&
      e.status !== 'replied' &&
      e.status !== 'archived'
  );
  const urgentUnreplied = urgentUnrepliedEmails.length;
  const totalUnread = emails.filter((e) => e.status === 'unread').length;

  // Include actual email details so AI doesn't hallucinate content
  const urgentEmailDetails = urgentUnrepliedEmails
    .slice(0, 5)
    .map((e) => ({
      from: e.from,
      subject: e.subject,
      snippet: e.snippet?.slice(0, 120) || '',
      tier: e.tier,
    }));
  const recentEmailDetails = emails
    .filter((e) => e.status !== 'archived')
    .sort((a, b) => (b.received_at || '').localeCompare(a.received_at || ''))
    .slice(0, 8)
    .map((e) => ({
      from: e.from,
      subject: e.subject,
      tier: e.tier,
      status: e.status,
    }));

  // --- Habits ---
  const activeHabits = habits.filter((h) => !h.is_archived);
  const todayCompletions = habitCompletions.filter((c) => c.date === today);
  const completedHabitIds = new Set(todayCompletions.map((c) => c.habit_id));

  const streaks: { name: string; streak: number }[] = [];
  for (const habit of activeHabits) {
    const hCompletions = habitCompletions
      .filter((c) => c.habit_id === habit.id)
      .map((c) => ({ date: c.date }));
    const { current } = getHabitStreak(hCompletions);
    if (current > 0) {
      streaks.push({ name: habit.name, streak: current });
    }
  }
  streaks.sort((a, b) => b.streak - a.streak);

  // --- Categories ---
  const activeCategories = categories.slice(0, 6).map((c) => ({
    name: c.name,
    progress: c.current_progress ?? 0,
    streak: c.streak_count ?? 0,
  }));

  // --- Projects ---
  const activeProjects = projects.slice(0, 5).map((p) => {
    const remaining = subTasks.filter(
      (st) => st.project_id === p.id && !st.is_completed
    ).length;
    return { title: p.title, subTasksRemaining: remaining };
  });

  // --- Pomodoro ---
  const todayPomodoros = pomodoros.filter(
    (p) => p.started_at?.startsWith(today) && p.status === 'completed' && p.type === 'focus'
  );
  const focusMinutes = todayPomodoros.reduce((sum, p) => sum + (p.duration_minutes || 0), 0);

  // --- Profile ---
  const profile = profiles[0];

  return {
    timestamp: nowPT(),
    todayISO: today,
    activeTaskCount: activeTasks.length,
    highPriorityTasks: highPriority,
    completedTodayCount: completedToday,
    overdueCount: overdue,
    upcomingEvents,
    nextEvent,
    urgentUnrepliedCount: urgentUnreplied,
    totalUnreadCount: totalUnread,
    urgentEmails: urgentEmailDetails,
    recentEmails: recentEmailDetails,
    habitsDueToday: activeHabits.length,
    habitsCompletedToday: completedHabitIds.size,
    topStreaks: streaks.slice(0, 3),
    activeCategories,
    activeProjects,
    pomodorosTodayCount: todayPomodoros.length,
    focusMinutesToday: focusMinutes,
    todaysStressors: stressors.map((s) => s.title),
    level: profile?.level ?? 1,
    xp: profile?.xp ?? 0,
    hasJournaledToday: journals.length > 0,
  };
}

export async function gatherJarvisContext(): Promise<JarvisContextSnapshot> {
  const now = Date.now();
  if (cachedSnapshot && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  const db = await createDatabase();
  const snapshot = await buildSnapshot(db);
  cachedSnapshot = snapshot;
  cacheTimestamp = now;
  return snapshot;
}

export function formatContextForPrompt(ctx: JarvisContextSnapshot): string {
  const lines: string[] = [
    `=== ANDIE CONTEXT (${ctx.timestamp}) ===`,
    '',
    `TASKS: ${ctx.activeTaskCount} active (${ctx.highPriorityTasks.length} high priority, ${ctx.overdueCount} overdue), ${ctx.completedTodayCount} completed today`,
  ];

  if (ctx.highPriorityTasks.length > 0) {
    lines.push(
      '  Priority: ' +
        ctx.highPriorityTasks.map((t) => `"${t.title}"${t.due_date ? ` (due ${t.due_date})` : ''}`).join(', ')
    );
  }

  if (ctx.upcomingEvents.length > 0) {
    lines.push('');
    lines.push('CALENDAR:');
    for (const e of ctx.upcomingEvents) {
      lines.push(`  - ${e.summary} | ${e.start} → ${e.end}`);
    }
    if (ctx.nextEvent) {
      const label =
        ctx.nextEvent.minutesUntil <= 0
          ? 'NOW'
          : ctx.nextEvent.minutesUntil < 60
            ? `in ${ctx.nextEvent.minutesUntil} min`
            : `in ${Math.round(ctx.nextEvent.minutesUntil / 60)}h`;
      lines.push(`  Next up: "${ctx.nextEvent.summary}" ${label}`);
    }
  } else {
    lines.push('');
    lines.push('CALENDAR: No upcoming events');
  }

  lines.push('');
  lines.push(`EMAIL: ${ctx.urgentUnrepliedCount} urgent unreplied, ${ctx.totalUnreadCount} total unread`);
  if (ctx.urgentEmails.length > 0) {
    lines.push('  Urgent/needs reply:');
    for (const e of ctx.urgentEmails) {
      lines.push(`    - From: ${e.from} | Subject: "${e.subject}" | ${e.snippet}`);
    }
  }
  if (ctx.recentEmails.length > 0) {
    lines.push('  Recent emails:');
    for (const e of ctx.recentEmails) {
      lines.push(`    - From: ${e.from} | "${e.subject}" [${e.tier}/${e.status}]`);
    }
  }

  lines.push('');
  lines.push(
    `HABITS: ${ctx.habitsCompletedToday}/${ctx.habitsDueToday} done today`
  );
  if (ctx.topStreaks.length > 0) {
    lines.push(
      '  Streaks: ' +
        ctx.topStreaks.map((s) => `${s.name} ${s.streak}d`).join(', ')
    );
  }

  if (ctx.activeProjects.length > 0) {
    lines.push('');
    lines.push('PROJECTS:');
    for (const p of ctx.activeProjects) {
      lines.push(`  - "${p.title}" (${p.subTasksRemaining} subtasks remaining)`);
    }
  }

  lines.push('');
  lines.push(
    `FOCUS: ${ctx.pomodorosTodayCount} pomodoros, ${ctx.focusMinutesToday} min today`
  );

  if (ctx.todaysStressors.length > 0) {
    lines.push('');
    lines.push(`STRESSORS: ${ctx.todaysStressors.join(', ')}`);
  }

  lines.push('');
  lines.push(`GAMIFICATION: Level ${ctx.level}, ${ctx.xp} XP`);
  lines.push(`JOURNAL: ${ctx.hasJournaledToday ? 'Done today' : 'Not yet today'}`);

  return lines.join('\n');
}
