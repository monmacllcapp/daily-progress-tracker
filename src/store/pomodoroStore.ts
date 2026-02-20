import { create } from 'zustand';
import type { PomodoroType } from '../types/schema';
import { createDatabase } from '../db';
import { onPomodoroComplete } from '../services/gamification';
import { trackEvent } from '../services/analytics';

interface PomodoroState {
    isRunning: boolean;
    isPaused: boolean;
    sessionType: PomodoroType | null;
    totalSeconds: number;
    remainingSeconds: number;
    linkedTaskId: string | null;
    linkedCategoryId: string | null;
    sessionStartedAt: string | null;

    // Actions
    startSession: (type: PomodoroType, taskId?: string, categoryId?: string) => void;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    tick: (remaining: number, elapsed: number, total: number) => void;
    complete: () => void;
}

const DURATION_MAP: Record<PomodoroType, number> = {
    focus: 25 * 60,
    short_break: 5 * 60,
    long_break: 15 * 60,
};

let worker: Worker | null = null;

function terminateWorker() {
    if (worker) {
        worker.postMessage({ type: 'STOP' });
        worker.terminate();
        worker = null;
    }
}

export const usePomodoroStore = create<PomodoroState>((set, get) => ({
    isRunning: false,
    isPaused: false,
    sessionType: null,
    totalSeconds: 0,
    remainingSeconds: 0,
    linkedTaskId: null,
    linkedCategoryId: null,
    sessionStartedAt: null,

    startSession: (type, taskId, categoryId) => {
        terminateWorker();

        const durationSeconds = DURATION_MAP[type];

        worker = new Worker(
            new URL('../workers/pomodoro-worker.ts', import.meta.url),
            { type: 'module' }
        );

        worker.onmessage = (e: MessageEvent) => {
            const { type: msgType } = e.data;

            if (msgType === 'TICK') {
                get().tick(e.data.remaining, e.data.elapsed, e.data.total);
            }
            if (msgType === 'COMPLETE') {
                get().complete();
            }
        };

        worker.postMessage({ type: 'START', durationSeconds });

        set({
            isRunning: true,
            isPaused: false,
            sessionType: type,
            totalSeconds: durationSeconds,
            remainingSeconds: durationSeconds,
            linkedTaskId: taskId ?? null,
            linkedCategoryId: categoryId ?? null,
            sessionStartedAt: new Date().toISOString(),
        });
    },

    pause: () => {
        if (worker && get().isRunning && !get().isPaused) {
            worker.postMessage({ type: 'PAUSE' });
            set({ isPaused: true });
        }
    },

    resume: () => {
        if (worker && get().isRunning && get().isPaused) {
            worker.postMessage({ type: 'RESUME' });
            set({ isPaused: false });
        }
    },

    stop: () => {
        terminateWorker();
        set({
            isRunning: false,
            isPaused: false,
            sessionType: null,
            totalSeconds: 0,
            remainingSeconds: 0,
            linkedTaskId: null,
            linkedCategoryId: null,
            sessionStartedAt: null,
        });
    },

    tick: (remaining, _elapsed, _total) => {
        set({ remainingSeconds: remaining });
    },

    complete: () => {
        const state = get();
        const sessionType = state.sessionType;
        const totalSeconds = state.totalSeconds;
        const startedAt = state.sessionStartedAt;

        terminateWorker();
        // Keep state briefly for the overlay to show completion
        set({ isRunning: false, isPaused: false, remainingSeconds: 0 });

        // Save completed session to DB
        if (sessionType && startedAt) {
            (async () => {
                try {
                    const db = await createDatabase();
                    await db.pomodoro_sessions.insert({
                        id: crypto.randomUUID(),
                        type: sessionType,
                        duration_minutes: Math.round(totalSeconds / 60),
                        started_at: startedAt,
                        completed_at: new Date().toISOString(),
                        status: 'completed',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    });

                    // Award XP only for focus sessions
                    if (sessionType === 'focus') {
                        onPomodoroComplete(db).catch(err =>
                            console.warn('[Gamification] Failed to award XP for pomodoro:', err)
                        );

                        // Track pomodoro completion (analytics)
                        trackEvent(db, 'pomodoro_complete', {
                            duration_minutes: Math.round(totalSeconds / 60),
                            has_linked_task: !!state.linkedTaskId,
                        }).catch(err =>
                            console.warn('[Analytics] Failed to track pomodoro completion:', err)
                        );
                    }
                } catch (err) {
                    console.error('[PomodoroStore] Failed to save completed session:', err);
                }
            })();
        }
    },
}));
