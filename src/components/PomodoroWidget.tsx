import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, X, Timer, Coffee, TreePine, Clock } from 'lucide-react';
import { usePomodoroStore } from '../store/pomodoroStore';
import { createDatabase } from '../db';
import type { PomodoroSession, PomodoroType } from '../types/schema';
import { formatDistanceToNow } from 'date-fns';

const TYPE_CONFIG: Record<PomodoroType, { label: string; short: string; icon: typeof Timer; color: string; minutes: number }> = {
    focus: { label: 'Focus 25m', short: 'Focus', icon: Timer, color: 'text-indigo-400', minutes: 25 },
    short_break: { label: 'Short 5m', short: 'Short', icon: Coffee, color: 'text-emerald-400', minutes: 5 },
    long_break: { label: 'Long 15m', short: 'Long', icon: TreePine, color: 'text-teal-400', minutes: 15 },
};

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function PomodoroWidget() {
    const { isRunning, isPaused, sessionType, totalSeconds, remainingSeconds, startSession, pause, resume, stop } = usePomodoroStore();
    const [sessions, setSessions] = useState<PomodoroSession[]>([]);
    const [todayStats, setTodayStats] = useState({ count: 0, focusMinutes: 0 });
    const [weeklyMinutes, setWeeklyMinutes] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

    useEffect(() => {
        let sub: { unsubscribe: () => void } | null = null;

        const init = async () => {
            const db = await createDatabase();
            sub = db.pomodoro_sessions.find({
                sort: [{ started_at: 'desc' }],
            }).$.subscribe(docs => {
                const all = docs.map(d => d.toJSON() as PomodoroSession);
                setSessions(all);

                // Today's stats
                const today = new Date().toISOString().split('T')[0];
                const todaySessions = all.filter(s =>
                    s.status === 'completed' && s.type === 'focus' && s.started_at.startsWith(today)
                );
                setTodayStats({
                    count: todaySessions.length,
                    focusMinutes: todaySessions.reduce((sum, s) => sum + s.duration_minutes, 0),
                });

                // Weekly minutes (7 days, index 0 = 6 days ago, index 6 = today)
                const dayMinutes = [0, 0, 0, 0, 0, 0, 0];
                for (let i = 0; i < 7; i++) {
                    const d = new Date();
                    d.setDate(d.getDate() - (6 - i));
                    const dateStr = d.toISOString().split('T')[0];
                    dayMinutes[i] = all
                        .filter(s => s.status === 'completed' && s.type === 'focus' && s.started_at.startsWith(dateStr))
                        .reduce((sum, s) => sum + s.duration_minutes, 0);
                }
                setWeeklyMinutes(dayMinutes);
            });
        };

        init();
        return () => sub?.unsubscribe();
    }, []);

    const progress = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 0;
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference * (1 - progress);

    const maxWeekly = Math.max(...weeklyMinutes, 1);
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    // Shift labels so index 6 = today
    const todayDow = new Date().getDay();
    const shiftedLabels = Array.from({ length: 7 }, (_, i) => {
        const dow = (todayDow - 6 + i + 7) % 7;
        return dayLabels[dow === 0 ? 6 : dow - 1]; // convert Sun=0 to Mon-indexed
    });

    const recentSessions = sessions.slice(0, 5);

    const handleStop = () => {
        if (isRunning && sessionType) {
            (async () => {
                try {
                    const db = await createDatabase();
                    await db.pomodoro_sessions.insert({
                        id: crypto.randomUUID(),
                        type: sessionType,
                        duration_minutes: Math.round(totalSeconds / 60),
                        started_at: usePomodoroStore.getState().sessionStartedAt!,
                        completed_at: new Date().toISOString(),
                        status: 'abandoned',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    });
                } catch (err) {
                    console.error('[PomodoroWidget] Failed to save abandoned session:', err);
                }
            })();
        }
        stop();
    };

    return (
        <div className="space-y-4">
            {/* Quick start / Active session */}
            {isRunning && sessionType ? (
                <div className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/10">
                    {/* Inline progress ring */}
                    <div className="relative w-12 h-12 flex-shrink-0">
                        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                            <circle cx="24" cy="24" r={radius} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/10" />
                            <circle
                                cx="24" cy="24" r={radius}
                                fill="none"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                className={`${sessionType === 'focus' ? 'stroke-indigo-400' : sessionType === 'short_break' ? 'stroke-emerald-400' : 'stroke-teal-400'} transition-[stroke-dashoffset] duration-1000 ease-linear`}
                            />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-white">
                            {formatTime(remainingSeconds)}
                        </span>
                    </div>

                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{TYPE_CONFIG[sessionType].short}</p>
                        <p className="text-xs text-slate-400">{isPaused ? 'Paused' : 'In progress'}</p>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={isPaused ? resume : pause}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={handleStop}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-red-400 hover:bg-white/10 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex gap-2">
                    {(Object.entries(TYPE_CONFIG) as [PomodoroType, typeof TYPE_CONFIG.focus][]).map(([type, cfg]) => {
                        const Icon = cfg.icon;
                        return (
                            <motion.button
                                key={type}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => startSession(type)}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                                    type === 'focus'
                                        ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/30'
                                        : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{cfg.label}</span>
                                <span className="sm:hidden">{cfg.minutes}m</span>
                            </motion.button>
                        );
                    })}
                </div>
            )}

            {/* Today's stats */}
            <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xs text-slate-500 mb-1">Sessions</p>
                    <p className="text-xl font-bold text-white">{todayStats.count}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xs text-slate-500 mb-1">Focus Time</p>
                    <p className="text-xl font-bold text-white">{todayStats.focusMinutes}m</p>
                </div>
            </div>

            {/* Weekly mini bar chart */}
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-xs text-slate-500 mb-2">This Week</p>
                <div className="flex items-end gap-1 h-12">
                    {weeklyMinutes.map((minutes, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div
                                className={`w-full rounded-sm transition-all ${minutes > 0 ? 'bg-indigo-500/60' : 'bg-white/10'}`}
                                style={{ height: `${Math.max((minutes / maxWeekly) * 100, 4)}%`, minHeight: minutes > 0 ? 4 : 2 }}
                            />
                            <span className="text-[9px] text-slate-600">{shiftedLabels[i]}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent sessions */}
            {recentSessions.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-xs text-slate-500">Recent</p>
                    {recentSessions.map(session => {
                        const cfg = TYPE_CONFIG[session.type];
                        const Icon = cfg.icon;
                        return (
                            <div key={session.id} className="flex items-center gap-2 text-xs text-slate-400">
                                <Icon className={`w-3 h-3 ${cfg.color}`} />
                                <span className="flex-1">{cfg.short} &middot; {session.duration_minutes}m</span>
                                <span className="text-slate-600">
                                    {formatDistanceToNow(new Date(session.started_at), { addSuffix: true })}
                                </span>
                                {session.status === 'abandoned' && (
                                    <span title="Abandoned"><Clock className="w-3 h-3 text-orange-400" /></span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
