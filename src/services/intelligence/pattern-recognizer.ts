import type { Signal, AnticipationContext } from '../../types/signals';
import type { Task, Category } from '../../types/schema';
import { v4 as uuid } from 'uuid';

export function detectPatternSignals(context: AnticipationContext): Signal[] {
  const signals: Signal[] = [];
  const now = new Date(context.today);

  const completionRateSignal = checkCompletionRateTrend(context, now);
  if (completionRateSignal) signals.push(completionRateSignal);

  const peakHoursSignal = checkPeakHoursPattern(context);
  if (peakHoursSignal) signals.push(peakHoursSignal);

  const dayOfWeekSignal = checkDayOfWeekPattern(context);
  if (dayOfWeekSignal) signals.push(dayOfWeekSignal);

  const neglectSignals = checkCategoryNeglect(context, now);
  signals.push(...neglectSignals);

  return signals;
}

function checkCompletionRateTrend(context: AnticipationContext, now: Date): Signal | null {
  const currentRate = computeCompletionRate(context.tasks, 7);

  const completionRatePattern = context.historicalPatterns.find(
    p => p.pattern_type === 'completion_rate'
  );

  if (!completionRatePattern) return null;

  const historicalRate = (completionRatePattern.data.rate as number) || 0;

  if (currentRate < historicalRate * 0.8) {
    return {
      id: uuid(),
      type: 'pattern_insight',
      severity: 'info',
      domain: 'personal_growth',
      source: 'pattern-recognizer',
      title: 'Completion rate declining',
      context: `Your task completion rate has dropped to ${currentRate.toFixed(1)} tasks/day from ${historicalRate.toFixed(1)} tasks/day`,
      auto_actionable: false,
      is_dismissed: false,
      is_acted_on: false,
      related_entity_ids: [],
      created_at: now.toISOString(),
    };
  }

  return null;
}

function checkPeakHoursPattern(context: AnticipationContext): Signal | null {
  const peakHoursPattern = context.historicalPatterns.find(
    p => p.pattern_type === 'peak_hours'
  );

  if (!peakHoursPattern) return null;

  const currentHour = parseInt(context.currentTime.split(':')[0], 10);
  const peakHours = (peakHoursPattern.data.hours as number[]) || [];

  if (peakHours.includes(currentHour)) {
    return {
      id: uuid(),
      type: 'pattern_insight',
      severity: 'info',
      domain: 'personal_growth',
      source: 'pattern-recognizer',
      title: 'Peak productivity window',
      context: `You're in your peak productivity window (${context.currentTime}). Consider scheduling deep work now.`,
      suggested_action: 'Block time for your most demanding tasks',
      auto_actionable: false,
      is_dismissed: false,
      is_acted_on: false,
      related_entity_ids: [],
      created_at: new Date().toISOString(),
    };
  }

  return null;
}

function checkDayOfWeekPattern(context: AnticipationContext): Signal | null {
  const dayOfWeekPattern = context.historicalPatterns.find(
    p => p.pattern_type === 'day_of_week'
  );

  if (!dayOfWeekPattern) return null;

  const dayData = (dayOfWeekPattern.data[context.dayOfWeek.toLowerCase()] as { avgTasks?: number; avgCompletionRate?: number }) || {};

  if (dayData.avgTasks !== undefined && dayData.avgCompletionRate !== undefined) {
    return {
      id: uuid(),
      type: 'pattern_insight',
      severity: 'info',
      domain: 'personal_growth',
      source: 'pattern-recognizer',
      title: `${context.dayOfWeek} productivity pattern`,
      context: `Typically on ${context.dayOfWeek}s you complete ${dayData.avgTasks.toFixed(1)} tasks at ${(dayData.avgCompletionRate * 100).toFixed(0)}% rate`,
      auto_actionable: false,
      is_dismissed: false,
      is_acted_on: false,
      related_entity_ids: [],
      created_at: new Date().toISOString(),
    };
  }

  return null;
}

function checkCategoryNeglect(context: AnticipationContext, now: Date): Signal[] {
  const neglectedCategories = findNeglectedCategories(context.categories, context.today);

  return neglectedCategories.map(category => ({
    id: uuid(),
    type: 'pattern_insight' as const,
    severity: 'attention' as const,
    domain: mapCategoryToDomain(category.name),
    source: 'pattern-recognizer',
    title: `${category.name} category neglected`,
    context: `No activity in ${category.name} for 7+ days. Last active: ${category.last_active_date || 'never'}`,
    suggested_action: `Schedule a task in ${category.name} to maintain balance`,
    auto_actionable: false,
    is_dismissed: false,
    is_acted_on: false,
    related_entity_ids: [category.id],
    created_at: now.toISOString(),
  }));
}

function mapCategoryToDomain(categoryName: string): import('../../types/signals').LifeDomain {
  const lowerName = categoryName.toLowerCase();

  if (lowerName.includes('health') || lowerName.includes('fitness')) return 'health_fitness';
  if (lowerName.includes('family')) return 'family';
  if (lowerName.includes('finance') || lowerName.includes('money')) return 'finance';
  if (lowerName.includes('business') || lowerName.includes('work')) return 'business_tech';
  if (lowerName.includes('social')) return 'social';
  if (lowerName.includes('creative')) return 'creative';
  if (lowerName.includes('spiritual')) return 'spiritual';

  return 'personal_growth';
}

export function computeCompletionRate(tasks: Task[], days: number): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const completedCount = tasks.filter(task => {
    if (!task.completed_date) return false;
    const completedDate = new Date(task.completed_date);
    return completedDate >= cutoffDate;
  }).length;

  return completedCount / days;
}

export function findNeglectedCategories(categories: Category[], today: string): Category[] {
  const now = new Date(today);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return categories.filter(category => {
    if (category.streak_count === 0 && category.current_progress === 0) {
      return false;
    }

    if (!category.last_active_date) {
      return true;
    }

    const lastActiveDate = new Date(category.last_active_date);
    return lastActiveDate < sevenDaysAgo;
  });
}
