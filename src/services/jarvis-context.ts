/**
 * Jarvis Context — Data Aggregation Layer
 *
 * Gathers a concise snapshot from ALL 30 RxDB collections for Maple AI prompts.
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
  // --- V2: Intelligence & Multi-Domain ---
  activeSignals: { severity: string; count: number; titles: string[] }[];
  dealsPipeline: { status: string; count: number; totalValue: number }[];
  familyEvents: { member: string; summary: string; start: string; end: string; conflict?: string }[];
  portfolioSnapshot: { equity: number; cash: number; dayPnl: number; positionsCount: number } | null;
  visionDeclarations: { declaration: string; purpose: string; category?: string }[];
  staffSummary: { activeCount: number; totalMonthlyCost: number } | null;
  financialSummary: { month: string; totalIncome: number; totalExpenses: number; netCashFlow: number; aiInsights: string } | null;
  subscriptionBurn: { totalMonthly: number; flaggedUnused: { merchant: string; amount: number }[] };
  productivityInsights: { patternType: string; description: string; confidence: number }[];
  latestBriefInsight: string | null;
  stressorMilestoneProgress: { stressorTitle: string; total: number; completed: number }[];
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
    // V2 collections
    signalsResult,
    dealsResult,
    familyEventsResult,
    portfolioResult,
    visionResult,
    staffMembersResult,
    staffPayResult,
    financialSummaryResult,
    subscriptionsResult,
    patternsResult,
    morningBriefsResult,
    stressorMilestonesResult,
  ] = await Promise.allSettled([
    // Original collections
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
    // V2 collections
    db.signals.find({ selector: { is_dismissed: false } }).exec(),
    db.deals.find().exec(),
    db.family_events.find().exec(),
    db.portfolio_snapshots.find().exec(),
    db.vision_board.find().exec(),
    db.staff_members.find({ selector: { is_active: true } }).exec(),
    db.staff_pay_periods.find().exec(),
    db.financial_monthly_summaries.find().exec(),
    db.financial_subscriptions.find({ selector: { is_active: true } }).exec(),
    db.productivity_patterns.find().exec(),
    db.morning_briefs.find().exec(),
    db.stressor_milestones.find().exec(),
  ]);

  // Extract original results
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

  // Extract V2 results
  const signals = signalsResult.status === 'fulfilled' ? signalsResult.value : [];
  const deals = dealsResult.status === 'fulfilled' ? dealsResult.value : [];
  const familyEventsRaw = familyEventsResult.status === 'fulfilled' ? familyEventsResult.value : [];
  const portfolioSnaps = portfolioResult.status === 'fulfilled' ? portfolioResult.value : [];
  const visionItems = visionResult.status === 'fulfilled' ? visionResult.value : [];
  const staffMembers = staffMembersResult.status === 'fulfilled' ? staffMembersResult.value : [];
  const payPeriods = staffPayResult.status === 'fulfilled' ? staffPayResult.value : [];
  const monthlySummaries = financialSummaryResult.status === 'fulfilled' ? financialSummaryResult.value : [];
  const subscriptions = subscriptionsResult.status === 'fulfilled' ? subscriptionsResult.value : [];
  const patterns = patternsResult.status === 'fulfilled' ? patternsResult.value : [];
  const morningBriefs = morningBriefsResult.status === 'fulfilled' ? morningBriefsResult.value : [];
  const milestones = stressorMilestonesResult.status === 'fulfilled' ? stressorMilestonesResult.value : [];

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

  // ═══ V2: Signals ═══
  const severityGroups: Record<string, { count: number; titles: string[] }> = {};
  for (const s of signals) {
    const sev = s.severity || 'info';
    if (!severityGroups[sev]) severityGroups[sev] = { count: 0, titles: [] };
    severityGroups[sev].count++;
    if (severityGroups[sev].titles.length < 3) {
      severityGroups[sev].titles.push(s.title);
    }
  }
  const activeSignals = Object.entries(severityGroups).map(([severity, data]) => ({
    severity, count: data.count, titles: data.titles,
  }));

  // ═══ V2: Deals ═══
  const dealGroups: Record<string, { count: number; totalValue: number }> = {};
  for (const d of deals) {
    const st = d.status || 'prospect';
    if (!dealGroups[st]) dealGroups[st] = { count: 0, totalValue: 0 };
    dealGroups[st].count++;
    dealGroups[st].totalValue += d.purchase_price || 0;
  }
  const dealsPipeline = Object.entries(dealGroups).map(([status, data]) => ({
    status, count: data.count, totalValue: data.totalValue,
  }));

  // ═══ V2: Family Events (next 7 days) ═══
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const nowISO = now.toISOString();
  const familyEvents = familyEventsRaw
    .filter((e) => e.start_time >= nowISO && e.start_time <= weekFromNow)
    .slice(0, 8)
    .map((e) => ({
      member: e.member, summary: e.summary,
      start: e.start_time, end: e.end_time,
      conflict: e.conflict_with || undefined,
    }));

  // ═══ V2: Portfolio Snapshot (latest) ═══
  const sortedPortfolio = [...portfolioSnaps].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const latestPortfolio = sortedPortfolio[0] || null;
  const portfolioSnapshot = latestPortfolio
    ? { equity: latestPortfolio.equity, cash: latestPortfolio.cash, dayPnl: latestPortfolio.day_pnl, positionsCount: latestPortfolio.positions_count }
    : null;

  // ═══ V2: Vision Board ═══
  const visionDeclarations = visionItems.slice(0, 5).map((v) => ({
    declaration: v.declaration, purpose: v.rpm_purpose, category: v.category_name,
  }));

  // ═══ V2: Staff Summary ═══
  const activeStaffCount = staffMembers.length;
  const sortedPay = [...payPeriods].sort((a, b) => (b.period_start || '').localeCompare(a.period_start || ''));
  const recentPay = sortedPay.slice(0, activeStaffCount);
  const totalMonthlyCost = recentPay.reduce((sum, p) => sum + (p.total_pay || 0), 0) * 2; // biweekly→monthly
  const staffSummary = activeStaffCount > 0
    ? { activeCount: activeStaffCount, totalMonthlyCost }
    : null;

  // ═══ V2: Financial Summary (latest month) ═══
  const sortedFinancial = [...monthlySummaries].sort((a, b) => (b.month || '').localeCompare(a.month || ''));
  const latestFinancial = sortedFinancial[0] || null;
  const financialSummary = latestFinancial
    ? { month: latestFinancial.month, totalIncome: latestFinancial.total_income || 0, totalExpenses: latestFinancial.total_expenses || 0, netCashFlow: latestFinancial.net_cash_flow || 0, aiInsights: latestFinancial.ai_insights || '' }
    : null;

  // ═══ V2: Subscription Burn ═══
  const totalSubscriptionMonthly = subscriptions.reduce((sum, s) => sum + (s.amount || 0), 0);
  const flaggedUnused = subscriptions
    .filter((s) => s.flagged_unused)
    .slice(0, 5)
    .map((s) => ({ merchant: s.merchant_name, amount: s.amount }));
  const subscriptionBurn = { totalMonthly: totalSubscriptionMonthly, flaggedUnused };

  // ═══ V2: Productivity Patterns ═══
  const sortedPatterns = [...patterns].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const productivityInsights = sortedPatterns
    .filter((p) => (p.confidence || 0) >= 0.6)
    .slice(0, 3)
    .map((p) => ({ patternType: p.pattern_type, description: p.description, confidence: p.confidence }));

  // ═══ V2: Morning Brief (latest insight) ═══
  const sortedBriefs = [...morningBriefs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const latestBriefInsight = sortedBriefs[0]?.ai_insight || null;

  // ═══ V2: Stressor Milestone Progress ═══
  const stressorMilestoneProgress = stressors.map((s) => {
    const ms = milestones.filter((m) => m.stressor_id === s.id);
    return {
      stressorTitle: s.title,
      total: ms.length,
      completed: ms.filter((m) => m.is_completed).length,
    };
  }).filter((s) => s.total > 0);

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
    // V2
    activeSignals,
    dealsPipeline,
    familyEvents,
    portfolioSnapshot,
    visionDeclarations,
    staffSummary,
    financialSummary,
    subscriptionBurn,
    productivityInsights,
    latestBriefInsight,
    stressorMilestoneProgress,
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
    `=== MAPLE CONTEXT (${ctx.timestamp}) ===`,
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

  // ═══ V2 Sections ═══

  if (ctx.activeSignals.length > 0) {
    lines.push('');
    lines.push('SIGNALS:');
    for (const g of ctx.activeSignals) {
      lines.push(`  ${g.severity.toUpperCase()}: ${g.count} active — ${g.titles.join(', ')}`);
    }
  }

  if (ctx.dealsPipeline.length > 0) {
    lines.push('');
    lines.push('REAL ESTATE DEALS:');
    for (const d of ctx.dealsPipeline) {
      lines.push(`  ${d.status}: ${d.count} deals${d.totalValue ? ` ($${(d.totalValue / 1000).toFixed(0)}k total)` : ''}`);
    }
  }

  if (ctx.familyEvents.length > 0) {
    lines.push('');
    lines.push('FAMILY EVENTS (next 7 days):');
    for (const e of ctx.familyEvents) {
      lines.push(`  - ${e.member}: "${e.summary}" | ${e.start}${e.conflict ? ' [CONFLICT]' : ''}`);
    }
  }

  if (ctx.portfolioSnapshot) {
    const p = ctx.portfolioSnapshot;
    lines.push('');
    lines.push(`PORTFOLIO: $${p.equity.toLocaleString()} equity, $${p.cash.toLocaleString()} cash, ${p.positionsCount} positions, day P&L: ${p.dayPnl >= 0 ? '+' : ''}$${p.dayPnl.toLocaleString()}`);
  }

  if (ctx.visionDeclarations.length > 0) {
    lines.push('');
    lines.push('VISION:');
    for (const v of ctx.visionDeclarations) {
      lines.push(`  - "${v.declaration}" (${v.category || 'general'}) — Why: ${v.purpose}`);
    }
  }

  if (ctx.staffSummary) {
    lines.push('');
    lines.push(`STAFF: ${ctx.staffSummary.activeCount} active, ~$${ctx.staffSummary.totalMonthlyCost.toLocaleString()}/mo total cost`);
  }

  if (ctx.financialSummary) {
    const f = ctx.financialSummary;
    lines.push('');
    lines.push(`FINANCES (${f.month}): Income $${f.totalIncome.toLocaleString()}, Expenses $${f.totalExpenses.toLocaleString()}, Net ${f.netCashFlow >= 0 ? '+' : ''}$${f.netCashFlow.toLocaleString()}`);
    if (f.aiInsights) lines.push(`  Insight: ${f.aiInsights}`);
  }

  if (ctx.subscriptionBurn.totalMonthly > 0) {
    lines.push('');
    lines.push(`SUBSCRIPTIONS: $${ctx.subscriptionBurn.totalMonthly.toFixed(0)}/mo total`);
    if (ctx.subscriptionBurn.flaggedUnused.length > 0) {
      lines.push('  Flagged unused: ' + ctx.subscriptionBurn.flaggedUnused.map((s) => `${s.merchant} ($${s.amount}/mo)`).join(', '));
    }
  }

  if (ctx.productivityInsights.length > 0) {
    lines.push('');
    lines.push('PRODUCTIVITY PATTERNS:');
    for (const p of ctx.productivityInsights) {
      lines.push(`  - ${p.description} (${(p.confidence * 100).toFixed(0)}% confidence)`);
    }
  }

  if (ctx.stressorMilestoneProgress.length > 0) {
    lines.push('');
    lines.push('STRESSOR PROGRESS:');
    for (const s of ctx.stressorMilestoneProgress) {
      lines.push(`  - "${s.stressorTitle}": ${s.completed}/${s.total} milestones done`);
    }
  }

  if (ctx.latestBriefInsight) {
    lines.push('');
    lines.push(`MORNING BRIEF INSIGHT: ${ctx.latestBriefInsight}`);
  }

  return lines.join('\n');
}
