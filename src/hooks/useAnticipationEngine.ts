import { useEffect, useState, useCallback } from 'react';
import { anticipationWorker } from '../workers/anticipation-worker';
import { useSignalStore } from '../store/signalStore';

interface AnticipationEngineState {
  isActive: boolean;
  isRunning: boolean;
  lastRunAt: string | null;
  signalCount: number;
}

export function useAnticipationEngine(autoStart = true) {
  const [state, setState] = useState<AnticipationEngineState>({
    isActive: false,
    isRunning: false,
    lastRunAt: null,
    signalCount: 0,
  });

  const signalCount = useSignalStore(s => s.signals.length);

  const refreshStatus = useCallback(() => {
    const status = anticipationWorker.getStatus();
    setState({
      isActive: status.isActive,
      isRunning: status.isRunning,
      lastRunAt: status.lastRunAt,
      signalCount,
    });
  }, [signalCount]);

  useEffect(() => {
    if (autoStart) {
      anticipationWorker.start().catch(console.error);
    }

    // Poll status every 10 seconds
    const statusInterval = setInterval(refreshStatus, 10000);
    refreshStatus();

    return () => {
      clearInterval(statusInterval);
      anticipationWorker.stop();
    };
  }, [autoStart, refreshStatus]);

  const triggerCycle = useCallback(async () => {
    await anticipationWorker.runCycle();
    refreshStatus();
  }, [refreshStatus]);

  return {
    ...state,
    triggerCycle,
    start: () => anticipationWorker.start(),
    stop: () => anticipationWorker.stop(),
  };
}
