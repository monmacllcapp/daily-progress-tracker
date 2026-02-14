import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeWorkRhythm,
  computeEstimationCalibration,
  computeCadence,
  computeDeepWorkRatio,
  computeCategoryBalance,
  computeCompletionRate,
} from '../pattern-learner';
import type { AnalyticsEvent, Task, SubTask, PomodoroSession, Category, EventType } from '../../../types/schema';

// Create helper to make mock events/tasks with required fields
function createMockEvent(timestamp: string, event_type: EventType): AnalyticsEvent {
  return {
    id: Math.random().toString(36),
    event_type,
    metadata: {},
    timestamp,
  };
}

function createMockTask(status: string, completed_date?: string, category_id?: string): Task {
  return {
    id: Math.random().toString(36),
    title: 'Test Task',
    category_id: category_id || 'cat-1',
    status,
    completed_date,
    created_date: new Date().toISOString(),
  } as Task;
}

function createMockSubTask(
  is_completed: boolean,
  time_estimate_minutes?: number,
  time_actual_minutes?: number
): SubTask {
  return {
    id: Math.random().toString(36),
    project_id: 'proj-1',
    title: 'Test SubTask',
    time_estimate_minutes,
    time_actual_minutes,
    is_completed,
  } as SubTask;
}

function createMockPomodoroSession(
  type: string,
  started_at: string,
  duration_minutes: number,
  status: string
): PomodoroSession {
  return {
    id: Math.random().toString(36),
    type,
    duration_minutes,
    started_at,
    completed_at: status === 'completed' ? new Date(new Date(started_at).getTime() + duration_minutes * 60000).toISOString() : undefined,
    status,
  } as PomodoroSession;
}

function createMockCategory(id: string, name: string): Category {
  return {
    id,
    name,
  } as Category;
}

describe('Pattern Learner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-13T14:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('computeWorkRhythm', () => {
    it('returns null for < 5 events', () => {
      const events = [
        createMockEvent('2026-02-13T09:00:00Z', 'task_complete'),
        createMockEvent('2026-02-13T10:00:00Z', 'task_complete'),
      ];

      const result = computeWorkRhythm(events);
      expect(result).toBeNull();
    });

    it('identifies peak hours correctly', () => {
      const events = [
        createMockEvent('2026-02-13T09:00:00Z', 'task_complete'),
        createMockEvent('2026-02-13T09:30:00Z', 'task_complete'),
        createMockEvent('2026-02-13T09:45:00Z', 'task_complete'),
        createMockEvent('2026-02-13T14:00:00Z', 'task_complete'),
        createMockEvent('2026-02-13T14:15:00Z', 'task_complete'),
        createMockEvent('2026-02-13T16:00:00Z', 'task_complete'),
      ];

      const result = computeWorkRhythm(events);
      expect(result).not.toBeNull();
      expect(result!.pattern_type).toBe('peak_hours');
      expect(result!.data.hours).toContain(9);
      expect(result!.data.hours).toContain(14);
      expect(result!.description).toContain('9:00');
    });

    it('confidence scales with sample size', () => {
      const fewEvents = Array.from({ length: 5 }, (_, i) =>
        createMockEvent(`2026-02-13T${String(i + 9).padStart(2, '0')}:00:00Z`, 'task_complete')
      );
      const manyEvents = Array.from({ length: 50 }, (_, i) =>
        createMockEvent(`2026-02-13T${String((i % 12) + 9).padStart(2, '0')}:00:00Z`, 'task_complete')
      );

      const resultFew = computeWorkRhythm(fewEvents);
      const resultMany = computeWorkRhythm(manyEvents);

      expect(resultFew!.confidence).toBeLessThan(resultMany!.confidence);
    });
  });

  describe('computeEstimationCalibration', () => {
    it('returns null with < 3 subtasks', () => {
      const subTasks = [
        createMockSubTask(true, 30, 35),
        createMockSubTask(true, 60, 55),
      ];

      const result = computeEstimationCalibration(subTasks);
      expect(result).toBeNull();
    });

    it('computes correct avg_ratio', () => {
      const subTasks = [
        createMockSubTask(true, 30, 60),  // 2.0 ratio
        createMockSubTask(true, 60, 90),  // 1.5 ratio
        createMockSubTask(true, 45, 45),  // 1.0 ratio
      ];

      const result = computeEstimationCalibration(subTasks);
      expect(result).not.toBeNull();
      expect(result!.pattern_type).toBe('task_estimation');
      expect(result!.data.avg_ratio).toBeCloseTo(1.5, 1);
      expect(result!.data.sample_size).toBe(3);
    });

    it('identifies underestimation', () => {
      const subTasks = [
        createMockSubTask(true, 30, 60),  // 2.0 ratio - underestimate
        createMockSubTask(true, 60, 90),  // 1.5 ratio - underestimate
        createMockSubTask(true, 45, 70),  // 1.55 ratio - underestimate
      ];

      const result = computeEstimationCalibration(subTasks);
      expect(result).not.toBeNull();
      expect(result!.data.underestimate_pct).toBeGreaterThan(90);
      expect(result!.description).toContain('longer than estimated');
    });
  });

  describe('computeCadence', () => {
    it('returns null for < 7 tasks', () => {
      const tasks = [
        createMockTask('completed', '2026-02-10T10:00:00Z'),
        createMockTask('completed', '2026-02-11T10:00:00Z'),
      ];

      const result = computeCadence(tasks);
      expect(result).toBeNull();
    });

    it('identifies most productive day', () => {
      const tasks = [
        createMockTask('completed', '2026-02-09T10:00:00Z'), // Monday
        createMockTask('completed', '2026-02-09T11:00:00Z'), // Monday
        createMockTask('completed', '2026-02-09T12:00:00Z'), // Monday
        createMockTask('completed', '2026-02-10T10:00:00Z'), // Tuesday
        createMockTask('completed', '2026-02-11T10:00:00Z'), // Wednesday
        createMockTask('completed', '2026-02-12T10:00:00Z'), // Thursday
        createMockTask('completed', '2026-02-13T10:00:00Z'), // Friday
      ];

      const result = computeCadence(tasks);
      expect(result).not.toBeNull();
      expect(result!.pattern_type).toBe('day_of_week');
      expect(result!.description).toContain('Monday');
    });
  });

  describe('computeDeepWorkRatio', () => {
    it('returns null for < 3 sessions', () => {
      const sessions = [
        createMockPomodoroSession('focus', '2026-02-13T09:00:00Z', 25, 'completed'),
        createMockPomodoroSession('short_break', '2026-02-13T09:30:00Z', 5, 'completed'),
      ];

      const result = computeDeepWorkRatio(sessions);
      expect(result).toBeNull();
    });

    it('computes correct ratio', () => {
      const sessions = [
        createMockPomodoroSession('focus', '2026-02-13T09:00:00Z', 25, 'completed'),
        createMockPomodoroSession('focus', '2026-02-13T10:00:00Z', 25, 'completed'),
        createMockPomodoroSession('focus', '2026-02-13T11:00:00Z', 25, 'completed'),
        createMockPomodoroSession('short_break', '2026-02-13T11:30:00Z', 5, 'completed'),
        createMockPomodoroSession('short_break', '2026-02-13T12:00:00Z', 5, 'completed'),
      ];

      const result = computeDeepWorkRatio(sessions);
      expect(result).not.toBeNull();
      expect(result!.pattern_type).toBe('deep_work_ratio');
      expect(result!.data.ratio).toBeCloseTo(0.6, 1);
      expect(result!.data.avg_focus_minutes).toBe(25);
      expect(result!.data.total_focus_minutes).toBe(75);
      expect(result!.description).toContain('60%');
    });
  });

  describe('computeCategoryBalance', () => {
    it('returns null for < 5 tasks', () => {
      const tasks = [
        createMockTask('completed', '2026-02-13T10:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-13T11:00:00Z', 'cat-2'),
      ];
      const categories = [
        createMockCategory('cat-1', 'Work'),
        createMockCategory('cat-2', 'Personal'),
      ];

      const result = computeCategoryBalance(tasks, categories);
      expect(result).toBeNull();
    });

    it('identifies neglected categories', () => {
      const tasks = [
        createMockTask('completed', '2026-02-13T10:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-13T11:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-13T12:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-13T13:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-13T14:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-13T15:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-13T16:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-13T17:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-13T18:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-13T19:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-13T20:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-12T10:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-11T10:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-10T10:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-09T10:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-08T10:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-07T10:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-06T10:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-05T10:00:00Z', 'cat-1'),
        createMockTask('completed', '2026-02-04T10:00:00Z', 'cat-2'), // Only 1 out of 20 = 5%
      ];
      const categories = [
        createMockCategory('cat-1', 'Work'),
        createMockCategory('cat-2', 'Health'),
      ];

      const result = computeCategoryBalance(tasks, categories);
      expect(result).not.toBeNull();
      expect(result!.pattern_type).toBe('domain_balance');
      expect(result!.data.neglected_categories).toContain('Health');
      expect(result!.description).toContain('Neglected areas');
    });
  });

  describe('computeCompletionRate', () => {
    it('computes daily rate', () => {
      const tasks = [
        createMockTask('completed', '2026-02-13T10:00:00Z'),
        createMockTask('completed', '2026-02-12T10:00:00Z'),
        createMockTask('completed', '2026-02-11T10:00:00Z'),
        createMockTask('completed', '2026-02-10T10:00:00Z'),
        createMockTask('completed', '2026-02-09T10:00:00Z'),
        createMockTask('completed', '2026-02-08T10:00:00Z'),
        createMockTask('completed', '2026-02-07T10:00:00Z'),
      ];

      const result = computeCompletionRate(tasks);
      expect(result).not.toBeNull();
      expect(result!.pattern_type).toBe('completion_rate');
      expect(result!.data.rate).toBe(1.0);
      expect(result!.data.completed_count).toBe(7);
      expect(result!.description).toContain('1.0 tasks per day');
    });

    it('handles zero completions', () => {
      const tasks = [
        createMockTask('active'),
        createMockTask('deferred'),
      ];

      const result = computeCompletionRate(tasks);
      expect(result).not.toBeNull();
      expect(result!.data.rate).toBe(0);
      expect(result!.data.completed_count).toBe(0);
    });
  });
});
