import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, X } from 'lucide-react';
import { usePomodoroStore } from '../store/pomodoroStore';
import { createDatabase } from '../db';
import type { PomodoroType } from '../types/schema';

const TYPE_STYLES: Record<PomodoroType, { label: string; ring: string; badge: string }> = {
    focus: { label: 'Focus', ring: 'stroke-indigo-400', badge: 'bg-indigo-500/20 text-indigo-300' },
    short_break: { label: 'Short Break', ring: 'stroke-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300' },
    long_break: { label: 'Long Break', ring: 'stroke-teal-400', badge: 'bg-teal-500/20 text-teal-300' },
};

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function PomodoroTimer() {
    const { isRunning, isPaused, sessionType, totalSeconds, remainingSeconds, sessionStartedAt, linkedTaskId, linkedCategoryId, pause, resume, stop } = usePomodoroStore();
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const justCompletedRef = useRef(false);

    // Auto-dismiss after completion
    useEffect(() => {
        if (!isRunning && sessionType && remainingSeconds === 0 && sessionStartedAt) {
            // Session just completed - save to DB
            justCompletedRef.current = true;
            const sessionData = {
                sessionType,
                sessionStartedAt,
                linkedTaskId,
                linkedCategoryId,
                totalSeconds,
            };

            (async () => {
                try {
                    const db = await createDatabase();
                    const durationMinutes = Math.round(sessionData.totalSeconds / 60);
                    await db.pomodoro_sessions.insert({
                        id: crypto.randomUUID(),
                        type: sessionData.sessionType!,
                        duration_minutes: durationMinutes,
                        started_at: sessionData.sessionStartedAt!,
                        completed_at: new Date().toISOString(),
                        status: 'completed',
                        task_id: sessionData.linkedTaskId ?? undefined,
                        category_id: sessionData.linkedCategoryId ?? undefined,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    });
                } catch (err) {
                    console.error('[Pomodoro] Failed to save session:', err);
                }
            })();

            dismissTimerRef.current = setTimeout(() => {
                stop();
                justCompletedRef.current = false;
            }, 3000);
        }

        return () => {
            if (dismissTimerRef.current) {
                clearTimeout(dismissTimerRef.current);
            }
        };
    }, [isRunning, sessionType, remainingSeconds, sessionStartedAt, linkedTaskId, linkedCategoryId, totalSeconds, stop]);

    const handleStop = () => {
        // If actively running, save as abandoned
        if (isRunning && sessionStartedAt && sessionType) {
            (async () => {
                try {
                    const db = await createDatabase();
                    await db.pomodoro_sessions.insert({
                        id: crypto.randomUUID(),
                        type: sessionType,
                        duration_minutes: Math.round(totalSeconds / 60),
                        started_at: sessionStartedAt,
                        completed_at: new Date().toISOString(),
                        status: 'abandoned',
                        task_id: linkedTaskId ?? undefined,
                        category_id: linkedCategoryId ?? undefined,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    });
                } catch (err) {
                    console.error('[Pomodoro] Failed to save abandoned session:', err);
                }
            })();
        }
        stop();
    };

    const showOverlay = isRunning || (sessionType && remainingSeconds === 0 && justCompletedRef.current);
    if (!showOverlay) return null;

    const style = sessionType ? TYPE_STYLES[sessionType] : TYPE_STYLES.focus;
    const progress = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 0;
    const isComplete = !isRunning && remainingSeconds === 0;

    // SVG progress ring
    const radius = 16;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference * (1 - progress);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: -60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -60, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
            >
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/40">
                    {/* Progress ring with countdown */}
                    <div className="relative w-10 h-10 flex-shrink-0">
                        <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                            <circle cx="20" cy="20" r={radius} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/10" />
                            <circle
                                cx="20" cy="20" r={radius}
                                fill="none"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                className={`${style.ring} transition-[stroke-dashoffset] duration-1000 ease-linear`}
                            />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-white">
                            {isComplete ? '00:00' : formatTime(remainingSeconds)}
                        </span>
                    </div>

                    {/* Session type badge */}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.badge}`}>
                        {isComplete ? 'Done!' : style.label}
                    </span>

                    {/* Controls */}
                    {!isComplete && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={isPaused ? resume : pause}
                                className="w-7 h-7 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                                title={isPaused ? 'Resume' : 'Pause'}
                            >
                                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                            </button>
                            <button
                                onClick={handleStop}
                                className="w-7 h-7 rounded-full flex items-center justify-center text-white/70 hover:text-red-400 hover:bg-white/10 transition-colors"
                                title="Stop"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
