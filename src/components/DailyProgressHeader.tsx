import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, CheckCircle2, LayoutGrid, Trophy } from 'lucide-react';
import { createDatabase } from '../db';
import { getDailyProgress } from '../services/streak-service';

export function DailyProgressHeader() {
    const [tasksCompleted, setTasksCompleted] = useState(0);
    const [categoriesActive, setCategoriesActive] = useState(0);
    const [longestStreak, setLongestStreak] = useState<{ categoryName: string; count: number } | null>(null);
    const [totalStreak, setTotalStreak] = useState(0);

    useEffect(() => {
        const load = async () => {
            const db = await createDatabase();
            const progress = await getDailyProgress(db);
            setTasksCompleted(progress.tasksCompleted);
            setCategoriesActive(progress.categoriesActive);
            setLongestStreak(progress.longestStreak);
            setTotalStreak(progress.totalStreak);
        };
        load();

        // Refresh every 30 seconds
        const interval = setInterval(load, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 px-4 py-2 bg-zinc-900/50 rounded-xl border border-zinc-800/50"
        >
            {/* Tasks completed today */}
            <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium">{tasksCompleted}</span>
                <span className="text-xs text-secondary">done today</span>
            </div>

            <div className="w-px h-4 bg-zinc-700" />

            {/* Categories active */}
            <div className="flex items-center gap-1.5">
                <LayoutGrid className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium">{categoriesActive}</span>
                <span className="text-xs text-secondary">{categoriesActive === 1 ? 'category' : 'categories'}</span>
            </div>

            <div className="w-px h-4 bg-zinc-700" />

            {/* Best streak */}
            {longestStreak && longestStreak.count > 0 ? (
                <div className="flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-medium text-orange-400">{longestStreak.count}d</span>
                    <span className="text-xs text-secondary truncate max-w-[80px]">{longestStreak.categoryName}</span>
                </div>
            ) : (
                <div className="flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-zinc-600" />
                    <span className="text-xs text-secondary">No streaks yet</span>
                </div>
            )}

            {/* Total streak score */}
            {totalStreak > 0 && (
                <>
                    <div className="w-px h-4 bg-zinc-700" />
                    <div className="flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        <span className="text-sm font-medium text-amber-400">{totalStreak}</span>
                        <span className="text-xs text-secondary">total</span>
                    </div>
                </>
            )}
        </motion.div>
    );
}
