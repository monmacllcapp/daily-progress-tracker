import { describe, it, expect } from 'vitest';
import { detectDeadlineSignals } from '../deadline-radar';
import type { AnticipationContext } from '../../../types/signals';

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
    ...overrides
  };
}

function makeTask(overrides: Partial<any> = {}) {
  return {
    id: 'task-1',
    title: 'Test task',
    priority: 'medium' as const,
    status: 'active' as const,
    source: 'manual' as const,
    created_date: '2026-02-10',
    sort_order: 0,
    ...overrides
  };
}

function makeProject(overrides: Partial<any> = {}) {
  return {
    id: 'proj-1',
    title: 'Test project',
    status: 'active' as const,
    motivation_payload: { why: '', impact_positive: '', impact_negative: '' },
    metrics: { total_time_estimated: 0, total_time_spent: 0, optimism_ratio: 1 },
    ...overrides
  };
}

describe('deadline-radar', () => {
  it('returns empty when no deadlines', () => {
    const context = makeContext({
      tasks: [makeTask({ due_date: undefined })]
    });
    const signals = detectDeadlineSignals(context);
    expect(signals).toEqual([]);
  });

  it('detects overdue task', () => {
    const yesterday = '2026-02-12';
    const context = makeContext({
      today: '2026-02-13',
      tasks: [makeTask({ due_date: yesterday, title: 'Overdue task' })]
    });
    const signals = detectDeadlineSignals(context);
    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe('critical');
    expect(signals[0].title).toContain('OVERDUE');
    expect(signals[0].context).toContain('1 day ago');
  });

  it('detects task due today', () => {
    const context = makeContext({
      today: '2026-02-13',
      tasks: [makeTask({ due_date: '2026-02-13', title: 'Today task' })]
    });
    const signals = detectDeadlineSignals(context);
    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe('urgent');
    expect(signals[0].title).toContain('Due today');
  });

  it('detects task due tomorrow', () => {
    const tomorrow = '2026-02-14';
    const context = makeContext({
      today: '2026-02-13',
      tasks: [makeTask({ due_date: tomorrow, title: 'Tomorrow task' })]
    });
    const signals = detectDeadlineSignals(context);
    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe('attention');
    expect(signals[0].title).toContain('Due tomorrow');
  });

  it('skips completed tasks', () => {
    const yesterday = '2026-02-12';
    const context = makeContext({
      today: '2026-02-13',
      tasks: [makeTask({ due_date: yesterday, status: 'completed' })]
    });
    const signals = detectDeadlineSignals(context);
    expect(signals).toEqual([]);
  });

  it('detects approaching project deadline', () => {
    const twoDaysOut = '2026-02-15';
    const context = makeContext({
      today: '2026-02-13',
      projects: [makeProject({ due_date: twoDaysOut, title: 'Project deadline' })]
    });
    const signals = detectDeadlineSignals(context);
    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe('urgent');
    expect(signals[0].type).toBe('deadline_approaching');
    expect(signals[0].title).toContain('Due in 2 days');
  });
});
