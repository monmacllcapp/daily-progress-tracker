import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAnticipationEngine } from '../useAnticipationEngine';

// Mock the worker
vi.mock('../../workers/anticipation-worker', () => ({
  anticipationWorker: {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    runCycle: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn(() => ({
      isActive: false,
      isRunning: false,
      lastRunAt: null,
      config: { intervalMs: 300000, enabled: true },
    })),
  },
}));

// Mock the signal store
vi.mock('../../store/signalStore', () => ({
  useSignalStore: vi.fn((selector) => {
    const mockState = { signals: [] };
    return selector ? selector(mockState) : mockState;
  }),
}));

import { anticipationWorker } from '../../workers/anticipation-worker';
import { useSignalStore } from '../../store/signalStore';

describe('useAnticipationEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset worker status to defaults
    vi.mocked(anticipationWorker.getStatus).mockReturnValue({
      isActive: false,
      isRunning: false,
      lastRunAt: null,
      config: { intervalMs: 300000, enabled: true },
      cachedWeightsCount: 0,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should auto-start worker on mount', async () => {
    const { unmount } = renderHook(() => useAnticipationEngine(true));

    await waitFor(() => {
      expect(anticipationWorker.start).toHaveBeenCalledOnce();
    });

    unmount();
  });

  it('should stop worker on unmount', async () => {
    const { unmount } = renderHook(() => useAnticipationEngine(true));

    await waitFor(() => {
      expect(anticipationWorker.start).toHaveBeenCalled();
    });

    unmount();

    expect(anticipationWorker.stop).toHaveBeenCalledOnce();
  });

  it('should return correct initial state', () => {
    const { result } = renderHook(() => useAnticipationEngine(true));

    expect(result.current.isActive).toBe(false);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.lastRunAt).toBeNull();
    expect(result.current.signalCount).toBe(0);
  });

  it('should call worker.runCycle when triggerCycle is invoked', async () => {
    const { result } = renderHook(() => useAnticipationEngine(true));

    await result.current.triggerCycle();

    expect(anticipationWorker.runCycle).toHaveBeenCalledOnce();
  });

  it('should not auto-start when autoStart is false', async () => {
    renderHook(() => useAnticipationEngine(false));

    // Wait a bit to ensure start is not called
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(anticipationWorker.start).not.toHaveBeenCalled();
  });

  it('should return signal count from store', () => {
    const mockSignals = [
      { id: 'sig-1', type: 'deadline_approaching' },
      { id: 'sig-2', type: 'streak_at_risk' },
    ];

    vi.mocked(useSignalStore).mockImplementation((selector: any) => {
      const mockState = { signals: mockSignals };
      return selector ? selector(mockState) : mockState;
    });

    const { result } = renderHook(() => useAnticipationEngine(false));

    expect(result.current.signalCount).toBe(2);
  });
});
