import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnticipationContext } from '../../../types/signals';

vi.mock('../aging-detector', () => ({ detectAgingSignals: vi.fn(() => []) }));
vi.mock('../streak-guardian', () => ({ detectStreakSignals: vi.fn(() => []) }));
vi.mock('../deadline-radar', () => ({ detectDeadlineSignals: vi.fn(() => []) }));
vi.mock('../pattern-recognizer', () => ({ detectPatternSignals: vi.fn(() => []) }));
vi.mock('../claude-insight-engine', () => ({ generateClaudeInsights: vi.fn(() => []) }));
vi.mock('../priority-synthesizer', () => ({ synthesizePriorities: vi.fn((signals) => signals) }));

import { runAnticipationCycle, getDefaultContext } from '../anticipation-engine';
import { detectAgingSignals } from '../aging-detector';
import { detectStreakSignals } from '../streak-guardian';
import { detectDeadlineSignals } from '../deadline-radar';
import { detectPatternSignals } from '../pattern-recognizer';

const mockContext: AnticipationContext = {
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
};

describe('anticipation-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs all detectors in parallel', async () => {
    await runAnticipationCycle(mockContext);

    expect(detectAgingSignals).toHaveBeenCalledWith(mockContext);
    expect(detectStreakSignals).toHaveBeenCalledWith(mockContext);
    expect(detectDeadlineSignals).toHaveBeenCalledWith(mockContext);
    expect(detectPatternSignals).toHaveBeenCalledWith(mockContext);
  });

  it('collects signals from all detectors', async () => {
    vi.mocked(detectAgingSignals).mockReturnValue([
      {
        id: 's1',
        type: 'aging_email',
        severity: 'urgent',
        domain: 'business_tech',
        source: 'aging-detector',
        title: 'Test signal 1',
        context: 'Test context 1',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: '2026-02-13T09:00:00Z',
      },
      {
        id: 's2',
        type: 'aging_email',
        severity: 'attention',
        domain: 'business_tech',
        source: 'aging-detector',
        title: 'Test signal 2',
        context: 'Test context 2',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: '2026-02-13T09:00:00Z',
      },
    ]);

    vi.mocked(detectStreakSignals).mockReturnValue([
      {
        id: 's3',
        type: 'streak_at_risk',
        severity: 'critical',
        domain: 'health_fitness',
        source: 'streak-guardian',
        title: 'Test signal 3',
        context: 'Test context 3',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: '2026-02-13T09:00:00Z',
      },
    ]);

    const result = await runAnticipationCycle(mockContext);

    expect(result.signals).toHaveLength(3);
    expect(result.prioritizedSignals).toHaveLength(3);
  });

  it('handles detector failures gracefully', async () => {
    vi.mocked(detectAgingSignals).mockImplementationOnce(() => {
      throw new Error('Aging detector failed');
    });

    vi.mocked(detectStreakSignals).mockReturnValueOnce([
      {
        id: 's1',
        type: 'streak_at_risk',
        severity: 'attention',
        domain: 'health_fitness',
        source: 'streak-guardian',
        title: 'Test signal',
        context: 'Test context',
        auto_actionable: false,
        is_dismissed: false,
        is_acted_on: false,
        related_entity_ids: [],
        created_at: '2026-02-13T09:00:00Z',
      },
    ]);

    const result = await runAnticipationCycle(mockContext);

    expect(result.signals).toHaveLength(1);
    expect(result.servicesRun).not.toContain('aging-detector');
    expect(result.servicesRun).toContain('streak-guardian');
  });

  it('includes timing information', async () => {
    const result = await runAnticipationCycle(mockContext);

    expect(result.runDuration).toBeGreaterThan(0);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('servicesRun lists successful services', async () => {
    const result = await runAnticipationCycle(mockContext);

    expect(result.servicesRun).toContain('aging-detector');
    expect(result.servicesRun).toContain('streak-guardian');
    expect(result.servicesRun).toContain('deadline-radar');
    expect(result.servicesRun).toContain('pattern-recognizer');
  });

  it('getDefaultContext returns today info', () => {
    const context = getDefaultContext();

    expect(context.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(context.currentTime).toMatch(/^\d{2}:\d{2}$/);
    expect(context.dayOfWeek).toMatch(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/);
  });

  it('includes claude-insight-engine in detectors', async () => {
    const result = await runAnticipationCycle(mockContext);

    expect(result.servicesRun).toContain('claude-insight-engine');
    expect(result.servicesRun).toHaveLength(5); // Now 5 detectors total
  });
});
