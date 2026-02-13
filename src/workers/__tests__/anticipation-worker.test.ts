import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { anticipationWorker, AnticipationWorkerConfig } from '../anticipation-worker';
import type { AnticipationResult } from '../../services/intelligence/anticipation-engine';
import type { Signal } from '../../types/signals';

// Mock dependencies
vi.mock('../../services/intelligence/anticipation-engine', () => ({
  runAnticipationCycle: vi.fn(),
  getDefaultContext: vi.fn(() => ({
    today: '2026-02-13',
    currentTime: '10:00',
    dayOfWeek: 'Thursday',
  })),
}));

vi.mock('../../store/signalStore', () => ({
  useSignalStore: {
    getState: vi.fn(() => ({
      signals: [],
      addSignals: vi.fn(),
      clearExpired: vi.fn(),
    })),
  },
}));

import { runAnticipationCycle } from '../../services/intelligence/anticipation-engine';
import { useSignalStore } from '../../store/signalStore';

describe('AnticipationWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    anticipationWorker.stop();
    // Reset worker state completely
    (anticipationWorker as any).lastRunAt = null;
    (anticipationWorker as any).isRunning = false;
  });

  afterEach(() => {
    anticipationWorker.stop();
  });

  const makeMockResult = (signals: Signal[] = []): AnticipationResult => ({
    signals,
    prioritizedSignals: signals,
    runDuration: 123,
    timestamp: '2026-02-13T10:00:00.000Z',
    servicesRun: ['aging-detector', 'streak-guardian'],
  });

  const makeMockSignal = (overrides: Partial<Signal> = {}): Signal => ({
    id: 'sig-123',
    type: 'deadline_approaching',
    severity: 'attention',
    domain: 'business_re',
    source: 'deadline-radar',
    title: 'Test Signal',
    context: 'Test context',
    auto_actionable: false,
    is_dismissed: false,
    is_acted_on: false,
    related_entity_ids: [],
    created_at: '2026-02-13T10:00:00Z',
    ...overrides,
  });

  it('should start interval and run initial cycle', async () => {
    vi.mocked(runAnticipationCycle).mockResolvedValue(makeMockResult());

    await anticipationWorker.start();

    expect(runAnticipationCycle).toHaveBeenCalledOnce();
    expect(anticipationWorker.getStatus().isActive).toBe(true);
  });

  it('should stop and clear interval', async () => {
    vi.mocked(runAnticipationCycle).mockResolvedValue(makeMockResult());

    await anticipationWorker.start();
    expect(anticipationWorker.getStatus().isActive).toBe(true);

    anticipationWorker.stop();
    expect(anticipationWorker.getStatus().isActive).toBe(false);
  });

  it('should call runAnticipationCycle with context', async () => {
    const mockResult = makeMockResult([makeMockSignal()]);
    vi.mocked(runAnticipationCycle).mockResolvedValue(mockResult);

    await anticipationWorker.runCycle();

    expect(runAnticipationCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks: [],
        projects: [],
        categories: [],
        emails: [],
        calendarEvents: [],
        deals: [],
        signals: [],
        mcpData: {},
        today: '2026-02-13',
        currentTime: '10:00',
        dayOfWeek: 'Thursday',
        historicalPatterns: [],
      })
    );
  });

  it('should push signals to store after cycle', async () => {
    const mockSignals = [makeMockSignal({ id: 'sig-1' }), makeMockSignal({ id: 'sig-2' })];
    const mockResult = makeMockResult(mockSignals);
    vi.mocked(runAnticipationCycle).mockResolvedValue(mockResult);

    const mockAddSignals = vi.fn();
    vi.mocked(useSignalStore.getState).mockReturnValue({
      signals: [],
      addSignals: mockAddSignals,
      clearExpired: vi.fn(),
    } as any);

    await anticipationWorker.runCycle();

    expect(mockAddSignals).toHaveBeenCalledWith(mockSignals);
  });

  it('should skip runCycle if already running (isRunning guard)', async () => {
    vi.mocked(runAnticipationCycle).mockImplementation(() => {
      return new Promise(resolve => setTimeout(() => resolve(makeMockResult()), 100));
    });

    const cycle1 = anticipationWorker.runCycle();
    const cycle2 = anticipationWorker.runCycle(); // Should skip

    await Promise.all([cycle1, cycle2]);

    // Should only be called once (second call skipped due to guard)
    expect(runAnticipationCycle).toHaveBeenCalledOnce();
  });

  it('should return correct status from getStatus', async () => {
    vi.mocked(runAnticipationCycle).mockResolvedValue(makeMockResult());

    const initialStatus = anticipationWorker.getStatus();
    expect(initialStatus.isActive).toBe(false);
    expect(initialStatus.isRunning).toBe(false);
    expect(initialStatus.lastRunAt).toBeNull();

    await anticipationWorker.start();

    const activeStatus = anticipationWorker.getStatus();
    expect(activeStatus.isActive).toBe(true);
    expect(activeStatus.lastRunAt).toBe('2026-02-13T10:00:00.000Z');
  });

  it('should restart with new config via updateConfig', async () => {
    vi.mocked(runAnticipationCycle).mockResolvedValue(makeMockResult());

    await anticipationWorker.start();
    expect(anticipationWorker.getStatus().config.intervalMs).toBe(300000);

    await anticipationWorker.updateConfig({ intervalMs: 60000 });

    const status = anticipationWorker.getStatus();
    expect(status.config.intervalMs).toBe(60000);
    expect(status.isActive).toBe(true);
  });

  it('should use contextProvider when set', async () => {
    const mockContext = {
      tasks: [],
      projects: [],
      categories: [],
      emails: [],
      calendarEvents: [],
      deals: [],
      signals: [],
      mcpData: { alpaca: { equity: 50000, positions: [], dayPnl: 123 } },
      today: '2026-02-13',
      currentTime: '14:30',
      dayOfWeek: 'Thursday',
      historicalPatterns: [],
    };

    const contextProvider = vi.fn().mockResolvedValue(mockContext);
    anticipationWorker.setContextProvider(contextProvider);

    vi.mocked(runAnticipationCycle).mockResolvedValue(makeMockResult());

    await anticipationWorker.runCycle();

    expect(contextProvider).toHaveBeenCalledOnce();
    expect(runAnticipationCycle).toHaveBeenCalledWith(mockContext);
  });

  it('should handle runCycle errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(runAnticipationCycle).mockRejectedValue(new Error('Cycle failed'));

    await anticipationWorker.runCycle();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Anticipation Worker] Cycle failed:',
      expect.any(Error)
    );

    // Should still mark isRunning as false after error
    expect(anticipationWorker.getStatus().isRunning).toBe(false);

    consoleErrorSpy.mockRestore();
  });

  it('should call clearExpired after each cycle', async () => {
    const mockClearExpired = vi.fn();
    vi.mocked(useSignalStore.getState).mockReturnValue({
      signals: [],
      addSignals: vi.fn(),
      clearExpired: mockClearExpired,
    } as any);

    vi.mocked(runAnticipationCycle).mockResolvedValue(makeMockResult());

    await anticipationWorker.runCycle();

    expect(mockClearExpired).toHaveBeenCalledOnce();
  });
});
