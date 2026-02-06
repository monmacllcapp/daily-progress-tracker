import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ChevronDown, ChevronRight, Heart, Target, Flame, CheckSquare } from 'lucide-react';
import type { DailyJournal } from '../types/schema';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';

export function JournalHistory() {
    const [db] = useDatabase();
    const [journals] = useRxQuery<DailyJournal>(db?.daily_journal, { sort: [{ date: 'desc' }] });
    const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

    // Auto-expand the most recent entry when journals load
    useEffect(() => {
        if (journals.length > 0) {
            setExpandedDates(prev => {
                if (prev.size === 0) return new Set([journals[0].date]);
                return prev;
            });
        }
    }, [journals]);

    const toggleDate = (date: string) => {
        setExpandedDates(prev => {
            const next = new Set(prev);
            if (next.has(date)) next.delete(date);
            else next.add(date);
            return next;
        });
    };

    const { todayStr, yesterdayStr } = useMemo(() => {
        const now = new Date();
        const t = now.toISOString().split('T')[0];
        const y = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
        return { todayStr: t, yesterdayStr: y };
    }, []);

    const formatDate = (dateStr: string): string => {
        if (dateStr === todayStr) return 'Today';
        if (dateStr === yesterdayStr) return 'Yesterday';
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    };

    const completedHabitsCount = (habits: Record<string, boolean>) =>
        Object.values(habits).filter(Boolean).length;

    const totalHabitsCount = (habits: Record<string, boolean>) =>
        Object.keys(habits).length;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 flex flex-col"
        >
            <div className="flex items-center gap-3 mb-4">
                <BookOpen className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-bold">Journal</h2>
                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs font-bold rounded-full">
                    {journals.length} {journals.length === 1 ? 'entry' : 'entries'}
                </span>
            </div>

            <div className="space-y-2">
                {journals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                        <BookOpen className="w-10 h-10 mb-3 opacity-50" />
                        <p className="text-sm">No journal entries yet</p>
                        <p className="text-xs mt-1">Complete your morning flow to start journaling</p>
                    </div>
                ) : (
                    journals.map(journal => {
                        const isExpanded = expandedDates.has(journal.date);
                        const habitsCompleted = completedHabitsCount(journal.habits);
                        const habitsTotal = totalHabitsCount(journal.habits);

                        return (
                            <div key={journal.id}>
                                <button
                                    onClick={() => toggleDate(journal.date)}
                                    className="w-full flex items-center gap-2 py-2 px-2 rounded-lg text-left hover:bg-white/5 transition-all"
                                >
                                    {isExpanded
                                        ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                        : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                    }
                                    <span className="text-sm font-medium text-white">{formatDate(journal.date)}</span>
                                    <span className="text-[10px] text-slate-600 ml-auto">
                                        {journal.gratitude?.length || 0}G / {journal.non_negotiables?.length || 0}W / {habitsCompleted}/{habitsTotal}H
                                    </span>
                                </button>

                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="ml-5 space-y-3 pb-3"
                                        >
                                            {/* Gratitude */}
                                            {journal.gratitude?.length > 0 && (
                                                <div>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <Heart className="w-3 h-3 text-pink-400" />
                                                        <span className="text-[10px] text-pink-400 uppercase tracking-wider font-bold">Gratitude</span>
                                                    </div>
                                                    {journal.gratitude.map((item, i) => (
                                                        <p key={i} className="text-xs text-slate-400 pl-4 py-0.5">{item}</p>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Non-negotiable Wins */}
                                            {journal.non_negotiables?.length > 0 && (
                                                <div>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <Target className="w-3 h-3 text-rose-400" />
                                                        <span className="text-[10px] text-rose-400 uppercase tracking-wider font-bold">Non-Negotiable Wins</span>
                                                    </div>
                                                    {journal.non_negotiables.map((item, i) => (
                                                        <p key={i} className="text-xs text-slate-400 pl-4 py-0.5">{item}</p>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Stressors */}
                                            {journal.stressors?.length > 0 && (
                                                <div>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <Flame className="w-3 h-3 text-orange-400" />
                                                        <span className="text-[10px] text-orange-400 uppercase tracking-wider font-bold">Stressors</span>
                                                    </div>
                                                    {journal.stressors.map((item, i) => (
                                                        <p key={i} className="text-xs text-slate-400 pl-4 py-0.5">{item}</p>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Habits */}
                                            {habitsTotal > 0 && (
                                                <div>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <CheckSquare className="w-3 h-3 text-blue-400" />
                                                        <span className="text-[10px] text-blue-400 uppercase tracking-wider font-bold">Habits</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1.5 pl-4">
                                                        {Object.entries(journal.habits).map(([habit, done]) => (
                                                            <span
                                                                key={habit}
                                                                className={`text-[10px] px-2 py-0.5 rounded ${ done ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-slate-600 line-through' }`}
                                                            >
                                                                {habit}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })
                )}
            </div>
        </motion.div>
    );
}
