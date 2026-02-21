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
import { useApiSpendStore } from '../store/apiSpendStore';
import { claudeClient } from './ai/claude-client';
import { kimiClient } from './ai/kimi-client';
import { deepseekClient } from './ai/deepseek-client';
import { isOllamaConfigured } from './ollama-client';

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
  // V3: Full visibility
  signalEffectiveness: { signalType: string; actedRate: number; weight: number }[];
  staffExpenses: { month: string; totalSpend: number; topCategory: string; avgCostPerLead: number | null }[];
  staffKpis: { month: string; totalBurn: number; totalLeads: number; avgCostPerLead: number } | null;
  financialAccounts: { institution: string; name: string; type: string; balance: number }[];
  recentTransactions: { date: string; merchant: string; amount: number; category: string }[];
  apiSpend: { month: string; totalCost: number; callCount: number; topProvider: string; topProviderCost: number } | null;
  connectionStatus: { google: boolean; plaid: boolean; claude: boolean; ollama: boolean; kimi: boolean; deepseek: boolean };
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
    // V3 collections
    signalWeightsResult,
    staffExpensesResult,
    staffKpiResult,
    financialAccountsResult,
    financialTransactionsResult,
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
    // V3 collections
    db.signal_weights.find().exec(),
    db.staff_expenses.find().exec(),
    db.staff_kpi_summaries.find().exec(),
    db.financial_accounts.find().exec(),
    db.financial_transactions.find().exec(),
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

  // Extract V3 results
  const signalWeightsRaw = signalWeightsResult.status === 'fulfilled' ? signalWeightsResult.value : [];
  const staffExpensesRaw = staffExpensesResult.status === 'fulfilled' ? staffExpensesResult.value : [];
  const staffKpiRaw = staffKpiResult.status === 'fulfilled' ? staffKpiResult.value : [];
  const financialAccountsRaw = financialAccountsResult.status === 'fulfilled' ? financialAccountsResult.value : [];
  const financialTransactionsRaw = financialTransactionsResult.status === 'fulfilled' ? financialTransactionsResult.value : [];

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

  // ═══ V3: Signal Effectiveness ═══
  const signalEffectiveness = [...signalWeightsRaw]
    .sort((a, b) => (b.effectiveness_score || 0) - (a.effectiveness_score || 0))
    .slice(0, 5)
    .map((w) => ({
      signalType: w.signal_type,
      actedRate: w.total_acted_on / Math.max(w.total_generated, 1),
      weight: w.weight_modifier || 1,
    }));

  // ═══ V3: Staff Expenses (latest 2 months) ═══
  const expensesByMonth: Record<string, { total: number; byCat: Record<string, number>; leads: number }> = {};
  for (const e of staffExpensesRaw) {
    const m = e.month || 'unknown';
    if (!expensesByMonth[m]) expensesByMonth[m] = { total: 0, byCat: {}, leads: 0 };
    expensesByMonth[m].total += e.amount || 0;
    expensesByMonth[m].byCat[e.category] = (expensesByMonth[m].byCat[e.category] || 0) + (e.amount || 0);
    expensesByMonth[m].leads += e.leads_generated || 0;
  }
  const staffExpenses = Object.entries(expensesByMonth)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 2)
    .map(([month, data]) => {
      const topCat = Object.entries(data.byCat).sort((a, b) => b[1] - a[1])[0];
      return {
        month,
        totalSpend: data.total,
        topCategory: topCat?.[0] || 'none',
        avgCostPerLead: data.leads > 0 ? data.total / data.leads : null,
      };
    });

  // ═══ V3: Staff KPIs (latest month) ═══
  const sortedKpis = [...staffKpiRaw].sort((a, b) => (b.month || '').localeCompare(a.month || ''));
  const latestKpi = sortedKpis[0] || null;
  const staffKpis = latestKpi
    ? { month: latestKpi.month, totalBurn: latestKpi.total_burn, totalLeads: latestKpi.total_leads, avgCostPerLead: latestKpi.avg_cost_per_lead }
    : null;

  // ═══ V3: Financial Accounts ═══
  const financialAccounts = financialAccountsRaw.slice(0, 10).map((a) => ({
    institution: a.institution_name,
    name: a.account_name,
    type: a.type,
    balance: a.current_balance || 0,
  }));

  // ═══ V3: Recent Transactions (14 days) ═══
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const recentTransactions = [...financialTransactionsRaw]
    .filter((t) => t.date >= fourteenDaysAgo)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 15)
    .map((t) => ({
      date: t.date,
      merchant: t.merchant_name || t.description || 'Unknown',
      amount: t.amount,
      category: t.category || 'other',
    }));

  // ═══ V3: API Spend ═══
  let apiSpend: JarvisContextSnapshot['apiSpend'] = null;
  try {
    const spend = useApiSpendStore.getState().monthlySpend;
    if (spend.callCount > 0) {
      const topEntry = Object.entries(spend.byProvider).sort((a, b) => b[1] - a[1])[0];
      apiSpend = {
        month: spend.month,
        totalCost: spend.totalCost,
        callCount: spend.callCount,
        topProvider: topEntry?.[0] || 'none',
        topProviderCost: topEntry?.[1] || 0,
      };
    }
  } catch { /* store not ready */ }

  // ═══ V3: Connection Status ═══
  const claudeAvailable = await claudeClient.isAvailable().catch(() => false);
  const connectionStatus = {
    google: isGoogleConnected(),
    plaid: financialAccountsRaw.length > 0,
    claude: claudeAvailable,
    ollama: isOllamaConfigured(),
    kimi: kimiClient.isAvailable(),
    deepseek: deepseekClient.isAvailable(),
  };

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
    // V3
    signalEffectiveness,
    staffExpenses,
    staffKpis,
    financialAccounts,
    recentTransactions,
    apiSpend,
    connectionStatus,
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
  if (ctx.urgentEmails.length > 0 || ctx.recentEmails.length > 0) {
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
  } else {
    lines.push('EMAIL: No emails loaded — do not fabricate email data or Slack messages');
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

  lines.push('');
  if (ctx.activeProjects.length > 0) {
    lines.push('PROJECTS:');
    for (const p of ctx.activeProjects) {
      lines.push(`  - "${p.title}" (${p.subTasksRemaining} subtasks remaining)`);
    }
  } else {
    lines.push('PROJECTS: No active projects');
  }

  lines.push('');
  lines.push(
    `FOCUS: ${ctx.pomodorosTodayCount} pomodoros, ${ctx.focusMinutesToday} min today`
  );

  lines.push('');
  if (ctx.todaysStressors.length > 0) {
    lines.push(`STRESSORS: ${ctx.todaysStressors.join(', ')}`);
  } else {
    lines.push('STRESSORS: None flagged for today');
  }

  lines.push('');
  lines.push(`GAMIFICATION: Level ${ctx.level}, ${ctx.xp} XP`);
  lines.push(`JOURNAL: ${ctx.hasJournaledToday ? 'Done today' : 'Not yet today'}`);

  // ═══ V2 Sections (with anti-hallucination guards) ═══

  lines.push('');
  if (ctx.activeSignals.length > 0) {
    lines.push('SIGNALS:');
    for (const g of ctx.activeSignals) {
      lines.push(`  ${g.severity.toUpperCase()}: ${g.count} active — ${g.titles.join(', ')}`);
    }
  } else {
    lines.push('SIGNALS: No active signals — do not fabricate alerts');
  }

  lines.push('');
  if (ctx.dealsPipeline.length > 0) {
    lines.push('REAL ESTATE DEALS:');
    for (const d of ctx.dealsPipeline) {
      lines.push(`  ${d.status}: ${d.count} deals${d.totalValue ? ` ($${(d.totalValue / 1000).toFixed(0)}k total)` : ''}`);
    }
  } else {
    lines.push('REAL ESTATE DEALS: No deals in pipeline — do not invent deal data');
  }

  lines.push('');
  if (ctx.familyEvents.length > 0) {
    lines.push('FAMILY EVENTS (next 7 days):');
    for (const e of ctx.familyEvents) {
      lines.push(`  - ${e.member}: "${e.summary}" | ${e.start}${e.conflict ? ' [CONFLICT]' : ''}`);
    }
  } else {
    lines.push('FAMILY EVENTS: No family events this week — do not fabricate family activities');
  }

  lines.push('');
  if (ctx.portfolioSnapshot) {
    const p = ctx.portfolioSnapshot;
    lines.push(`PORTFOLIO: $${p.equity.toLocaleString()} equity, $${p.cash.toLocaleString()} cash, ${p.positionsCount} positions, day P&L: ${p.dayPnl >= 0 ? '+' : ''}$${p.dayPnl.toLocaleString()}`);
  } else {
    lines.push('PORTFOLIO: No portfolio data — do not invent stock positions or P&L');
  }

  lines.push('');
  if (ctx.visionDeclarations.length > 0) {
    lines.push('VISION:');
    for (const v of ctx.visionDeclarations) {
      lines.push(`  - "${v.declaration}" (${v.category || 'general'}) — Why: ${v.purpose}`);
    }
  } else {
    lines.push('VISION: No vision declarations set — do not fabricate goals');
  }

  lines.push('');
  if (ctx.staffSummary) {
    lines.push(`STAFF: ${ctx.staffSummary.activeCount} active, ~$${ctx.staffSummary.totalMonthlyCost.toLocaleString()}/mo total cost`);
  } else {
    lines.push('STAFF: No staff members — do not invent team data');
  }

  lines.push('');
  if (ctx.financialSummary) {
    const f = ctx.financialSummary;
    lines.push(`FINANCES (${f.month}): Income $${f.totalIncome.toLocaleString()}, Expenses $${f.totalExpenses.toLocaleString()}, Net ${f.netCashFlow >= 0 ? '+' : ''}$${f.netCashFlow.toLocaleString()}`);
    if (f.aiInsights) lines.push(`  Insight: ${f.aiInsights}`);
  } else {
    lines.push('FINANCES: No monthly summary data — do not fabricate income or expense figures');
  }

  lines.push('');
  if (ctx.subscriptionBurn.totalMonthly > 0) {
    lines.push(`SUBSCRIPTIONS: $${ctx.subscriptionBurn.totalMonthly.toFixed(0)}/mo total`);
    if (ctx.subscriptionBurn.flaggedUnused.length > 0) {
      lines.push('  Flagged unused: ' + ctx.subscriptionBurn.flaggedUnused.map((s) => `${s.merchant} ($${s.amount}/mo)`).join(', '));
    }
  } else {
    lines.push('SUBSCRIPTIONS: No subscription data tracked');
  }

  lines.push('');
  if (ctx.productivityInsights.length > 0) {
    lines.push('PRODUCTIVITY PATTERNS:');
    for (const p of ctx.productivityInsights) {
      lines.push(`  - ${p.description} (${(p.confidence * 100).toFixed(0)}% confidence)`);
    }
  } else {
    lines.push('PRODUCTIVITY PATTERNS: No patterns detected yet');
  }

  lines.push('');
  if (ctx.stressorMilestoneProgress.length > 0) {
    lines.push('STRESSOR PROGRESS:');
    for (const s of ctx.stressorMilestoneProgress) {
      lines.push(`  - "${s.stressorTitle}": ${s.completed}/${s.total} milestones done`);
    }
  } else {
    lines.push('STRESSOR PROGRESS: No stressor milestones tracked');
  }

  lines.push('');
  if (ctx.latestBriefInsight) {
    lines.push(`MORNING BRIEF INSIGHT: ${ctx.latestBriefInsight}`);
  } else {
    lines.push('MORNING BRIEF: No previous briefing insight');
  }

  // ═══ V3 Sections ═══

  lines.push('');
  lines.push('--- CONNECTION STATUS ---');
  const cs = ctx.connectionStatus;
  lines.push(`  Google Calendar/Email: ${cs.google ? 'CONNECTED' : 'NOT CONNECTED'}`);
  lines.push(`  Plaid (Banking): ${cs.plaid ? 'CONNECTED' : 'NOT CONNECTED'}`);
  lines.push(`  Claude AI: ${cs.claude ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
  lines.push(`  Kimi AI: ${cs.kimi ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
  lines.push(`  DeepSeek AI: ${cs.deepseek ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
  lines.push(`  Ollama (Local): ${cs.ollama ? 'AVAILABLE' : 'NOT AVAILABLE'}`);

  lines.push('');
  if (ctx.signalEffectiveness.length > 0) {
    lines.push('SIGNAL EFFECTIVENESS (top signals by performance):');
    for (const s of ctx.signalEffectiveness) {
      lines.push(`  - ${s.signalType}: ${(s.actedRate * 100).toFixed(0)}% acted-on rate, weight: ${s.weight.toFixed(2)}`);
    }
  } else {
    lines.push('SIGNAL EFFECTIVENESS: No signal weight data yet');
  }

  lines.push('');
  if (ctx.staffExpenses.length > 0) {
    lines.push('STAFF EXPENSES:');
    for (const e of ctx.staffExpenses) {
      lines.push(`  - ${e.month}: $${e.totalSpend.toLocaleString()} total, top category: ${e.topCategory}${e.avgCostPerLead !== null ? `, avg CPL: $${e.avgCostPerLead.toFixed(0)}` : ''}`);
    }
  } else {
    lines.push('STAFF EXPENSES: No expense data — do not fabricate marketing spend');
  }

  lines.push('');
  if (ctx.staffKpis) {
    const k = ctx.staffKpis;
    lines.push(`STAFF KPIs (${k.month}): Total burn $${k.totalBurn.toLocaleString()}, ${k.totalLeads} leads, avg CPL $${k.avgCostPerLead.toFixed(0)}`);
  } else {
    lines.push('STAFF KPIs: No KPI summary data');
  }

  lines.push('');
  if (ctx.financialAccounts.length > 0) {
    lines.push('FINANCIAL ACCOUNTS:');
    for (const a of ctx.financialAccounts) {
      lines.push(`  - ${a.institution} — ${a.name} (${a.type}): $${a.balance.toLocaleString()}`);
    }
  } else {
    lines.push('FINANCIAL ACCOUNTS: NOT CONNECTED — Plaid not linked. Do not fabricate bank balances.');
  }

  lines.push('');
  if (ctx.recentTransactions.length > 0) {
    lines.push('RECENT TRANSACTIONS (14 days):');
    for (const t of ctx.recentTransactions) {
      lines.push(`  - ${t.date}: ${t.merchant} — $${t.amount.toFixed(2)} [${t.category}]`);
    }
  } else {
    lines.push('RECENT TRANSACTIONS: No transaction data — do not invent spending activity');
  }

  lines.push('');
  if (ctx.apiSpend) {
    const a = ctx.apiSpend;
    lines.push(`API SPEND (${a.month}): $${a.totalCost.toFixed(4)} total, ${a.callCount} calls, top provider: ${a.topProvider} ($${a.topProviderCost.toFixed(4)})`);
  } else {
    lines.push('API SPEND: No AI API calls logged this month');
  }

  return lines.join('\n');
}
