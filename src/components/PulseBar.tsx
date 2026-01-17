import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { SubTask } from '../types/schema';

interface PulseBarProps {
    subtasks: SubTask[];
    totalEstimatedMinutes: number; // Derived from project metrics
}

export const PulseBar: React.FC<PulseBarProps> = ({ subtasks, totalEstimatedMinutes }) => {
    // If no estimate, show empty track
    if (totalEstimatedMinutes === 0) {
        return <div className="h-2 w-full bg-white/5 rounded-full" />;
    }

    // Calculate segments
    // We need to map each subtask to a width percentage of the TOTAL estimate.
    // If subtask is 15m and total is 60m, width is 25%.
    const segments = useMemo(() => {
        return subtasks.map(task => {
            const widthPct = (task.time_estimate_minutes / totalEstimatedMinutes) * 100;
            const progressPct = Math.min(100, (task.time_actual_minutes / task.time_estimate_minutes) * 100);
            const isDrifting = task.time_actual_minutes > task.time_estimate_minutes;

            return {
                id: task.id,
                width: widthPct,
                progress: progressPct,
                isDrifting,
                title: task.title
            };
        }).sort((a, b) => a.id.localeCompare(b.id)); // Stable sort or by sort_order if available
    }, [subtasks, totalEstimatedMinutes]);

    const totalDrift = useMemo(() => {
        const spent = subtasks.reduce((acc, t) => acc + t.time_actual_minutes, 0);
        return Math.max(0, spent - totalEstimatedMinutes);
    }, [subtasks, totalEstimatedMinutes]);

    const driftWidth = (totalDrift / totalEstimatedMinutes) * 100;

    return (
        <div className="relative w-full h-3 bg-slate-800/50 rounded-full overflow-hidden flex ring-1 ring-white/10">
            {segments.map(segment => (
                <div
                    key={segment.id}
                    className="h-full border-r border-slate-900/20 last:border-0 relative"
                    style={{ width: `${segment.width}%` }}
                    title={segment.title}
                >
                    {/* Background for segment (unfilled) */}
                    <div className="absolute inset-0 bg-white/5" />

                    {/* Fill */}
                    <motion.div
                        className={clsx(
                            "h-full",
                            segment.isDrifting ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" : "bg-blue-500"
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${segment.progress}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                </div>
            ))}

            {/* Global Drift Overflow Indicator (if drift exceeds graphical space, we might scale or just show red overlay at end) */}
            {/* For now, if total drift exists, we can show a glow or a separate indicator, but the requirement said "turn the overflow segment RED". 
          The per-segment logic above handles local overflow logic (color change). 
          If the sum of actuals > estimate, we effectively "fill" the bar. 
      */}
        </div>
    );
};
