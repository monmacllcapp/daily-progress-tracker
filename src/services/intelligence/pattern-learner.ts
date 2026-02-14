import { v4 as uuid } from 'uuid';
import type { TitanDatabase } from '../../db';
import type { ProductivityPattern } from '../../types/signals';
import type { Task, SubTask, Category, AnalyticsEvent, PomodoroSession } from '../../types/schema';

// Helper: get Monday of current week
function getCurrentWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysToMonday = (dayOfWeek + 6) % 7; // 0 for Monday, 6 for Sunday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

// Helper: compute confidence from sample size
function computeConfidence(sampleSize: number): number {
  if (sampleSize < 5) return 0.1;
  if (sampleSize < 20) return 0.3 + (sampleSize / 20) * 0.2;
  if (sampleSize < 100) return 0.5 + ((sampleSize - 20) / 80) * 0.4;
  return 0.9;
}

// 1. Peak hours — group task_complete analytics events by hour
export function computeWorkRhythm(events: AnalyticsEvent[]): ProductivityPattern | null {
  const taskCompleteEvents = events.filter(e => e.event_type === 'task_complete');
  if (taskCompleteEvents.length < 5) return null;

  const hourCounts: Record<number, number> = {};
  for (const event of taskCompleteEvents) {
    const hour = new Date(event.timestamp).getUTCHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }

  // Find top 3 hours
  const sortedHours = Object.entries(hourCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([hour]) => parseInt(hour, 10));

  return {
    id: uuid(),
    pattern_type: 'peak_hours',
    description: `Peak productivity hours: ${sortedHours.map(h => `${h}:00`).join(', ')}`,
    data: { hours: sortedHours, distribution: hourCounts },
    confidence: computeConfidence(taskCompleteEvents.length),
    week_start: getCurrentWeekStart(),
    created_at: new Date().toISOString(),
  };
}

// 2. Estimation calibration — compare estimate vs actual from subtasks
export function computeEstimationCalibration(subTasks: SubTask[]): ProductivityPattern | null {
  const calibrationData = subTasks.filter(
    st => st.is_completed && st.time_estimate_minutes && st.time_estimate_minutes > 0 && st.time_actual_minutes && st.time_actual_minutes > 0
  );
  if (calibrationData.length < 3) return null;

  let totalRatio = 0;
  let underestimateCount = 0;
  let overestimateCount = 0;

  for (const st of calibrationData) {
    const ratio = st.time_actual_minutes! / st.time_estimate_minutes!;
    totalRatio += ratio;
    if (ratio > 1.1) underestimateCount++;
    else if (ratio < 0.9) overestimateCount++;
  }

  const avgRatio = totalRatio / calibrationData.length;

  return {
    id: uuid(),
    pattern_type: 'task_estimation',
    description: avgRatio > 1.1 ? `Tasks take ${((avgRatio - 1) * 100).toFixed(0)}% longer than estimated` : avgRatio < 0.9 ? `Tasks take ${((1 - avgRatio) * 100).toFixed(0)}% less time than estimated` : 'Task estimates are well-calibrated',
    data: {
      avg_ratio: avgRatio,
      underestimate_pct: (underestimateCount / calibrationData.length) * 100,
      overestimate_pct: (overestimateCount / calibrationData.length) * 100,
      sample_size: calibrationData.length,
    },
    confidence: computeConfidence(calibrationData.length),
    week_start: getCurrentWeekStart(),
    created_at: new Date().toISOString(),
  };
}

// 3. Cadence — group task completions by day of week
export function computeCadence(tasks: Task[]): ProductivityPattern | null {
  const completedTasks = tasks.filter(t => t.status === 'completed' && t.completed_date);
  if (completedTasks.length < 7) return null;

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayCounts: Record<string, number> = {};
  const dayWeeks: Record<string, Set<string>> = {};

  for (const day of dayNames) {
    dayCounts[day] = 0;
    dayWeeks[day] = new Set();
  }

  for (const task of completedTasks) {
    const date = new Date(task.completed_date!);
    const dayName = dayNames[date.getUTCDay()];
    dayCounts[dayName]++;
    dayWeeks[dayName].add(task.completed_date!.slice(0, 10));
  }

  // Compute per-day averages (tasks per unique week the day appears)
  const dayAverages: Record<string, { avgTasks: number; avgCompletionRate: number }> = {};
  const totalTasks = completedTasks.length;

  for (const day of dayNames) {
    const weekCount = Math.max(dayWeeks[day].size, 1);
    dayAverages[day] = {
      avgTasks: dayCounts[day] / weekCount,
      avgCompletionRate: totalTasks > 0 ? dayCounts[day] / totalTasks : 0,
    };
  }

  // Find the most productive day
  const bestDay = dayNames.reduce((best, day) => dayCounts[day] > dayCounts[best] ? day : best, dayNames[0]);

  return {
    id: uuid(),
    pattern_type: 'day_of_week',
    description: `Most productive day: ${bestDay.charAt(0).toUpperCase() + bestDay.slice(1)}`,
    data: dayAverages,
    confidence: computeConfidence(completedTasks.length),
    week_start: getCurrentWeekStart(),
    created_at: new Date().toISOString(),
  };
}

// 4. Deep work ratio from pomodoro sessions
export function computeDeepWorkRatio(sessions: PomodoroSession[]): ProductivityPattern | null {
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);

  const recentSessions = sessions.filter(s => s.status === 'completed' && new Date(s.started_at) >= last30Days);
  if (recentSessions.length < 3) return null;

  const focusSessions = recentSessions.filter(s => s.type === 'focus');
  const totalFocusMinutes = focusSessions.reduce((sum, s) => sum + s.duration_minutes, 0);
  const ratio = focusSessions.length / recentSessions.length;
  const avgFocusMinutes = focusSessions.length > 0 ? totalFocusMinutes / focusSessions.length : 0;

  return {
    id: uuid(),
    pattern_type: 'deep_work_ratio',
    description: `Deep work ratio: ${(ratio * 100).toFixed(0)}% of sessions are focus sessions`,
    data: {
      ratio,
      avg_focus_minutes: avgFocusMinutes,
      total_focus_minutes: totalFocusMinutes,
      sessions_count: recentSessions.length,
    },
    confidence: computeConfidence(recentSessions.length),
    week_start: getCurrentWeekStart(),
    created_at: new Date().toISOString(),
  };
}

// 5. Category balance — distribution of tasks across categories
export function computeCategoryBalance(tasks: Task[], categories: Category[]): ProductivityPattern | null {
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);

  const completedTasks = tasks.filter(t => t.status === 'completed' && t.completed_date && new Date(t.completed_date) >= last30Days);
  if (completedTasks.length < 5) return null;

  const categoryCounts: Record<string, number> = {};
  for (const task of completedTasks) {
    const catId = task.category_id || 'uncategorized';
    categoryCounts[catId] = (categoryCounts[catId] || 0) + 1;
  }

  // Build distribution with names
  const distribution: Record<string, { count: number; percent: number; name: string }> = {};
  const total = completedTasks.length;

  for (const [catId, count] of Object.entries(categoryCounts)) {
    const cat = categories.find(c => c.id === catId);
    distribution[catId] = {
      count,
      percent: (count / total) * 100,
      name: cat?.name || 'Uncategorized',
    };
  }

  // Find neglected (< 5%)
  const neglected = Object.values(distribution).filter(d => d.percent <= 5).map(d => d.name);

  return {
    id: uuid(),
    pattern_type: 'domain_balance',
    description: neglected.length > 0 ? `Neglected areas: ${neglected.join(', ')}` : 'Life categories are well-balanced',
    data: { distribution, neglected_categories: neglected, total_tasks: total },
    confidence: computeConfidence(completedTasks.length),
    week_start: getCurrentWeekStart(),
    created_at: new Date().toISOString(),
  };
}

// 6. Completion rate — rolling 7-day average
export function computeCompletionRate(tasks: Task[]): ProductivityPattern | null {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentCompleted = tasks.filter(t => t.status === 'completed' && t.completed_date && new Date(t.completed_date) >= sevenDaysAgo);

  // Calculate actual day span (handle users with < 7 days of data)
  let daySpan = 7;
  if (recentCompleted.length > 0) {
    const sortedByDate = recentCompleted.sort((a, b) =>
      new Date(a.completed_date!).getTime() - new Date(b.completed_date!).getTime()
    );
    const earliestDate = sortedByDate[0].completed_date!;
    const actualSpan = Math.ceil((Date.now() - new Date(earliestDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    daySpan = Math.min(7, actualSpan);
  }

  const rate = recentCompleted.length / daySpan;

  return {
    id: uuid(),
    pattern_type: 'completion_rate',
    description: `Completing ${rate.toFixed(1)} tasks per day (7-day average)`,
    data: { rate, completed_count: recentCompleted.length, period_days: daySpan },
    confidence: computeConfidence(recentCompleted.length),
    week_start: getCurrentWeekStart(),
    created_at: new Date().toISOString(),
  };
}

// Persist patterns to RxDB (upsert by pattern_type)
export async function persistPatterns(db: TitanDatabase, patterns: ProductivityPattern[]): Promise<void> {
  for (const pattern of patterns) {
    // Find existing pattern of same type
    const existing = await db.productivity_patterns.findOne({
      selector: { pattern_type: pattern.pattern_type }
    }).exec();

    if (existing) {
      await existing.patch({
        description: pattern.description,
        data: pattern.data,
        confidence: pattern.confidence,
        week_start: pattern.week_start,
        created_at: pattern.created_at,
      });
    } else {
      await db.productivity_patterns.insert(pattern);
    }
  }
}

// Main entry point — compute all patterns and persist them
export async function learnPatterns(db: TitanDatabase): Promise<ProductivityPattern[]> {
  console.info('[Pattern Learner] Starting learning cycle...');

  // Fetch data from collections
  const [taskDocs, subTaskDocs, categoryDocs, eventDocs, sessionDocs] = await Promise.all([
    db.tasks.find().exec(),
    db.sub_tasks.find().exec(),
    db.categories.find().exec(),
    db.analytics_events.find().exec(),
    db.pomodoro_sessions.find().exec(),
  ]);

  const tasks = taskDocs.map(d => d.toJSON() as Task);
  const subTasks = subTaskDocs.map(d => d.toJSON() as SubTask);
  const categories = categoryDocs.map(d => d.toJSON() as Category);
  const events = eventDocs.map(d => d.toJSON() as AnalyticsEvent);
  const sessions = sessionDocs.map(d => d.toJSON() as PomodoroSession);

  // Compute all patterns
  const patterns: ProductivityPattern[] = [];

  const workRhythm = computeWorkRhythm(events);
  if (workRhythm) patterns.push(workRhythm);

  const estimation = computeEstimationCalibration(subTasks);
  if (estimation) patterns.push(estimation);

  const cadence = computeCadence(tasks);
  if (cadence) patterns.push(cadence);

  const deepWork = computeDeepWorkRatio(sessions);
  if (deepWork) patterns.push(deepWork);

  const balance = computeCategoryBalance(tasks, categories);
  if (balance) patterns.push(balance);

  const completionRate = computeCompletionRate(tasks);
  if (completionRate) patterns.push(completionRate);

  // Persist
  await persistPatterns(db, patterns);

  console.info(`[Pattern Learner] Learned ${patterns.length} patterns`);
  return patterns;
}
