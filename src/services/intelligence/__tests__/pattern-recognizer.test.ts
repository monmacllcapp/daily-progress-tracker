import { describe, it, expect } from 'vitest';
import { detectPatternSignals, computeCompletionRate, findNeglectedCategories } from '../pattern-recognizer';
import type { AnticipationContext, ProductivityPattern } from '../../../types/signals';
import type { Task, Category } from '../../../types/schema';

function makeContext(overrides: Partial<AnticipationContext> = {}): AnticipationContext {
  return {
    tasks: [],
    projects: [],
    categories: [],
    emails: [],
    calendarEvents: [],
    deals: [],
    signals: [],
    mcpData: {},
    today: '2026-02-13',
    currentTime: '09:00',
    dayOfWeek: 'Thursday',
    historicalPatterns: [],
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-' + Math.random().toString(36).slice(2, 8),
    title: 'Test Task',
    priority: 'medium',
    status: 'active',
    source: 'manual',
    created_date: '2026-02-13',
    sort_order: 0,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-' + Math.random().toString(36).slice(2, 8),
    name: 'Test Category',
    color_theme: '#3b82f6',
    current_progress: 0.5,
    streak_count: 5,
    sort_order: 0,
    ...overrides,
  };
}

describe('pattern-recognizer', () => {
  describe('detectPatternSignals', () => {
    it('returns empty when no patterns or data', () => {
      const context = makeContext();
      const signals = detectPatternSignals(context);
      expect(signals).toEqual([]);
    });

    it('detects neglected categories', () => {
      const category = makeCategory({
        name: 'Health',
        last_active_date: '2026-02-01',
        streak_count: 3,
      });
      const context = makeContext({
        categories: [category],
        today: '2026-02-13',
      });

      const signals = detectPatternSignals(context);

      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('pattern_insight');
      expect(signals[0].severity).toBe('attention');
      expect(signals[0].title).toContain('Health category neglected');
      expect(signals[0].related_entity_ids).toContain(category.id);
    });

    it('generates peak hours signal when matching pattern exists', () => {
      const pattern: ProductivityPattern = {
        id: 'pattern-1',
        pattern_type: 'peak_hours',
        description: 'Peak hours pattern',
        data: { hours: [9, 10, 14, 15] },
        confidence: 0.85,
        week_start: '2026-02-10',
        created_at: '2026-02-13T00:00:00Z',
      };

      const context = makeContext({
        historicalPatterns: [pattern],
        currentTime: '09:00',
      });

      const signals = detectPatternSignals(context);

      expect(signals.length).toBeGreaterThan(0);
      const peakSignal = signals.find(s => s.title.includes('Peak productivity'));
      expect(peakSignal).toBeDefined();
      expect(peakSignal?.severity).toBe('info');
      expect(peakSignal?.suggested_action).toBeDefined();
    });

    it('detects completion rate decline', () => {
      const pattern: ProductivityPattern = {
        id: 'pattern-2',
        pattern_type: 'completion_rate',
        description: 'Historical completion rate',
        data: { rate: 5.0 },
        confidence: 0.9,
        week_start: '2026-02-03',
        created_at: '2026-02-10T00:00:00Z',
      };

      const tasks = [
        makeTask({ completed_date: '2026-02-12' }),
        makeTask({ completed_date: '2026-02-11' }),
      ];

      const context = makeContext({
        tasks,
        historicalPatterns: [pattern],
        today: '2026-02-13',
      });

      const signals = detectPatternSignals(context);

      const rateSignal = signals.find(s => s.title.includes('Completion rate'));
      expect(rateSignal).toBeDefined();
      expect(rateSignal?.severity).toBe('info');
    });
  });

  describe('computeCompletionRate', () => {
    it('calculates completion rate correctly', () => {
      const now = new Date();
      const tasks = [
        makeTask({ completed_date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() }),
        makeTask({ completed_date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() }),
        makeTask({ completed_date: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() }),
        makeTask({ completed_date: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString() }),
        makeTask({ completed_date: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString() }),
      ];

      const rate = computeCompletionRate(tasks, 7);

      expect(rate).toBeCloseTo(5 / 7, 2);
    });

    it('returns zero when no completed tasks', () => {
      const tasks = [
        makeTask({ status: 'active' }),
        makeTask({ status: 'active' }),
      ];

      const rate = computeCompletionRate(tasks, 7);

      expect(rate).toBe(0);
    });
  });

  describe('findNeglectedCategories', () => {
    it('returns stale categories', () => {
      const activeCategory = makeCategory({
        name: 'Active',
        last_active_date: '2026-02-12',
        streak_count: 5,
      });

      const staleCategory = makeCategory({
        name: 'Stale',
        last_active_date: '2026-02-01',
        streak_count: 3,
      });

      const categories = [activeCategory, staleCategory];
      const neglected = findNeglectedCategories(categories, '2026-02-13');

      expect(neglected).toHaveLength(1);
      expect(neglected[0].id).toBe(staleCategory.id);
    });

    it('skips unused categories in neglect detection', () => {
      const unusedCategory = makeCategory({
        name: 'Unused',
        streak_count: 0,
        current_progress: 0,
        last_active_date: undefined,
      });

      const categories = [unusedCategory];
      const neglected = findNeglectedCategories(categories, '2026-02-13');

      expect(neglected).toHaveLength(0);
    });

    it('includes categories with no last_active_date but have been used', () => {
      const category = makeCategory({
        name: 'Used but no date',
        streak_count: 5,
        current_progress: 0.3,
        last_active_date: undefined,
      });

      const categories = [category];
      const neglected = findNeglectedCategories(categories, '2026-02-13');

      expect(neglected).toHaveLength(1);
      expect(neglected[0].id).toBe(category.id);
    });
  });
});
