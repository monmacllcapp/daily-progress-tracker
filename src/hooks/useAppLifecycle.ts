import { useState, useEffect, useRef, useCallback } from 'react';
import { createDatabase } from '../db';
import { rolloverTasks } from '../services/task-rollover';
import { checkStreakResets } from '../services/streak-service';
import { checkSnoozedEmails } from '../services/email-snooze';
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

    // Check snoozed emails every 60 seconds
    const snoozeInterval = setInterval(async () => {
      try {
        const db = await createDatabase();
        const count = await checkSnoozedEmails(db);
        if (count > 0) {
          setToast(`${count} snoozed email${count > 1 ? 's' : ''} resurfaced`);
        }
      } catch (err) {
        console.error('Failed to check snoozed emails:', err);
      }
    }, 60_000);

    // Check for unreplied urgent emails every 4 hours
    const unrepliedInterval = setInterval(async () => {
      try {
        const db = await createDatabase();
        const { scanForUnrepliedEmails } = await import('../services/email-reply-checker');
        const result = await scanForUnrepliedEmails(db, 7);
        if (result.unreplied.length > 0) {
          setToast(`${result.unreplied.length} urgent email${result.unreplied.length > 1 ? 's' : ''} need a response`);
        }
      } catch (err) {
        console.error('Failed to check unreplied:', err);
      }
    }, 14_400_000);

    // Auto-sync calendar on app load + every 15 minutes
    const syncCalendar = async () => {
      try {
        const { isGoogleConnected } = await import('../services/google-auth');
        if (!isGoogleConnected()) return;
        const { syncCalendarEvents } = await import('../services/google-calendar');
        const db = await createDatabase();
        const now = new Date();
        const start = new Date(now);
        const end = new Date(now);

        // Set to start of current week (Sunday)
        const dayOfWeek = now.getDay(); // 0=Sunday
        start.setDate(now.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);

        // Set to end of current week (Saturday)
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        await syncCalendarEvents(db, start, end);
      } catch (err) {
        console.error('[Lifecycle] Calendar sync failed:', err);
      }
    };

    syncCalendar(); // Initial sync on app load
    const calendarInterval = setInterval(syncCalendar, 900_000); // 15 min

    // Auto-sync Gmail inbox on app load + every 15 minutes (matches calendar)
    const syncEmail = async () => {
      try {
        const { isGoogleConnected } = await import('../services/google-auth');
        if (!isGoogleConnected()) return;
        const { syncGmailInbox } = await import('../services/gmail');
        const { classifyEmail } = await import('../services/email-classifier');
        const db = await createDatabase();
        const { newCount } = await syncGmailInbox(db, classifyEmail, 50);
        if (newCount > 0) {
          console.log(`[Lifecycle] Auto-synced ${newCount} new emails`);
          const { scoreAllEmails } = await import('../services/email-scorer');
          const { detectNewsletters } = await import('../services/newsletter-detector');
          await scoreAllEmails(db);
          await detectNewsletters(db);
        }
      } catch (err) {
        console.error('[Lifecycle] Email sync failed:', err);
      }
    };

    syncEmail(); // Initial sync on app load
    const emailInterval = setInterval(syncEmail, 900_000); // 15 min

    // Jarvis proactive nudge engine
    let stopJarvis: (() => void) | undefined;
    Promise.all([
      import('../services/jarvis-proactive'),
      import('../store/jarvisStore'),
    ]).then(([{ startJarvisProactive }, { useJarvisStore }]) => {
      stopJarvis = startJarvisProactive((nudge) => {
        useJarvisStore.getState().setLatestNudge(nudge);
      });
    }).catch((err) => {
      console.warn('[Lifecycle] Maple proactive init failed:', err);
    });

    return () => {
      healthWorker.terminate();
      resetWorker.terminate();
      clearInterval(snoozeInterval);
      clearInterval(unrepliedInterval);
      clearInterval(calendarInterval);
      clearInterval(emailInterval);
      stopJarvis?.();
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
