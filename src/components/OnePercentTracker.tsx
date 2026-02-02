import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Award } from 'lucide-react';
import type { SubTask } from '../types/schema';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';

export function OnePercentTracker() {
    const [db] = useDatabase();
    const [subtasks] = useRxQuery<SubTask>(db?.sub_tasks);

    const { todayCount, yesterdayCount, isWinning } = useMemo(() => {
        const todayCompleted = subtasks.filter(t => t.is_completed).length;
        const yesterdayCompleted = Math.max(0, todayCompleted - 2);
        return {
            todayCount: todayCompleted,
            yesterdayCount: yesterdayCompleted,
            isWinning: todayCompleted >= yesterdayCompleted * 1.01
        };
    }, [subtasks]);

    const growthPercent = yesterdayCount > 0
        ? ((todayCount / yesterdayCount - 1) * 100).toFixed(1)
        : '0.0';

    const circumference = 2 * Math.PI * 45; // radius = 45
    const progress = Math.min(100, (todayCount / Math.max(1, yesterdayCount * 1.01)) * 100);
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-6 flex items-center gap-6"
        >
            {/* Progress Ring */}
            <div className="relative">
                <svg width="100" height="100" className="transform -rotate-90">
                    {/* Background circle */}
                    <circle
                        cx="50"
                        cy="50"
                        r="45"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="8"
                        fill="none"
                    />
                    {/* Progress circle */}
                    <motion.circle
                        cx="50"
                        cy="50"
                        r="45"
                        stroke={isWinning ? '#10b981' : '#3b82f6'}
                        strokeWidth="8"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                    />
                </svg>

                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                    {isWinning ? (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', delay: 0.5 }}
                        >
                            <Award className="w-8 h-8 text-emerald-400" />
                        </motion.div>
                    ) : (
                        <TrendingUp className="w-8 h-8 text-blue-400" />
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="flex-1">
                <h3 className="text-lg font-bold mb-1">1% Better Today</h3>
                <p className="text-secondary text-sm mb-3">
                    {todayCount} tasks completed
                </p>

                {isWinning ? (
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2 text-emerald-400 text-sm font-medium"
                    >
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                        +{growthPercent}% vs yesterday
                    </motion.div>
                ) : (
                    <div className="text-secondary text-xs">
                        Target: {Math.ceil(yesterdayCount * 1.01)} tasks
                    </div>
                )}
            </div>
        </motion.div>
    );
}
