import { useState, useEffect, useRef, useCallback } from 'react';
import { createDatabase } from '../db';
import { rolloverTasks } from '../services/task-rollover';
import { checkStreakResets } from '../services/streak-service';
import type { NudgeType } from '../components/HealthNudge';

export function useAppLifecycle() {
  const [toast, setToast] = useState<string | null>(null);
  const [showPatternInterrupt, setShowPatternInterrupt] = useState(false);
  const [celebration, setCelebration] = useState<{ show: boolean; message?: string }>({ show: false });
  const [activeNudge, setActiveNudge] = useState<NudgeType | null>(null);
  const healthWorkerRef = useRef<Worker | null>(null);

  const handleTaskRollover = useCallback(async () => {
    try {
      const db = await createDatabase();
      const count = await rolloverTasks(db);
      await checkStreakResets(db);
      if (count > 0) {
        setToast(`${count} task${count > 1 ? 's' : ''} rolled to today`);
      }
    } catch (err) {
      console.error('Failed to rollover tasks:', err);
    }
  }, []);

  const clearTodaysStressors = useCallback(async () => {
    try {
      const db = await createDatabase();
      const stressors = await db.stressors?.find({ selector: { is_today: true } }).exec();
      if (stressors) {
        await Promise.all(stressors.map(doc => doc.patch({ is_today: false })));
      }
    } catch (err) {
      console.error('Failed to clear stressors:', err);
    }
  }, []);

  useEffect(() => {
    // Clear legacy layout caches
    localStorage.removeItem('titan_glass_layout_v1');
    localStorage.removeItem('titan_glass_layout_v2');
    localStorage.removeItem('titan_glass_layout_v3');
    localStorage.removeItem('dashboard_panels');

    // Health worker
    const healthWorker = new Worker(
      new URL('../workers/health-worker.ts', import.meta.url),
      { type: 'module' }
    );

    healthWorker.onmessage = (e) => {
      const msgType = e.data.type;
      if (msgType === 'HYDRATE' || msgType === 'STRETCH' || msgType === 'EYE_BREAK') {
        setActiveNudge(msgType as NudgeType);
      } else if (msgType === 'PATTERN_INTERRUPT') {
        setShowPatternInterrupt(true);
      }
    };

    healthWorkerRef.current = healthWorker;
    healthWorker.postMessage({ type: 'START' });

    // Daily reset worker
    const resetWorker = new Worker(
      new URL('../workers/daily-reset-worker.ts', import.meta.url),
      { type: 'module' }
    );

    resetWorker.onmessage = (e) => {
      if (e.data.type === 'RESET_MORNING_FLOW') {
        localStorage.removeItem('morning_flow_completed');
      } else if (e.data.type === 'RESET_STRESSORS') {
        clearTodaysStressors();
      } else if (e.data.type === 'ROLLOVER_TASKS') {
        handleTaskRollover();
      }
    };

    const lastResetDate = localStorage.getItem('last_reset_date');
    resetWorker.postMessage({ type: 'START', lastResetDate });

    return () => {
      healthWorker.terminate();
      resetWorker.terminate();
    };
  }, [handleTaskRollover, clearTodaysStressors]);

  const snoozeNudge = useCallback((nudgeType: NudgeType) => {
    setActiveNudge(null);
    healthWorkerRef.current?.postMessage({ type: 'SNOOZE', nudgeType });
  }, []);

  return {
    toast,
    setToast,
    showPatternInterrupt,
    setShowPatternInterrupt,
    celebration,
    setCelebration,
    activeNudge,
    setActiveNudge,
    snoozeNudge,
  };
}
