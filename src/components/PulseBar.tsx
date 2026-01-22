import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import type { SubTask } from '../types/schema';

interface PulseBarProps {
    subtasks: SubTask[];
    totalEstimatedMinutes: number;
}

export const PulseBar: React.FC<PulseBarProps> = ({ subtasks, totalEstimatedMinutes }) => {
    if (totalEstimatedMinutes === 0 || subtasks.length === 0) {
        return <div className="h-2 w-full bg-white bg-opacity-5 rounded-full" />;
    }

    // Sort subtasks by sort_order to match display order
    const sortedSubtasks = useMemo(() => {
        return [...subtasks].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }, [subtasks]);

    return (
        <div className="relative w-full h-3 bg-slate-800 bg-opacity-50 rounded-full overflow-visible flex items-center">
            {/* Background track */}
            <div className="absolute inset-0 bg-white bg-opacity-5 rounded-full" />

            {/* Connecting line between circles */}
            <div className="absolute inset-y-0 left-0 right-0 flex items-center px-2">
                <div className="w-full h-0.5 bg-white bg-opacity-10" />
            </div>

            {/* Milestone circles */}
            <div className="relative w-full flex justify-between items-center px-2">
                {sortedSubtasks.map((task, index) => {
                    const position = ((index + 1) / sortedSubtasks.length) * 100;
                    const isDrifting = !task.is_completed && task.time_actual_minutes > task.time_estimate_minutes;

                    return (
                        <motion.div
                            key={task.id}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: index * 0.05, type: 'spring', stiffness: 300 }}
                            className="relative group"
                            style={{
                                position: 'absolute',
                                left: `${position}%`,
                                transform: 'translateX(-50%)'
                            }}
                        >
                            {/* Circle */}
                            <div
                                className={clsx(
                                    "w-3 h-3 rounded-full border-2 transition-all duration-300 cursor-pointer",
                                    task.is_completed
                                        ? "bg-green-500 border-green-500 shadow-lg shadow-[rgba(34,197,94,0.5)]"
                                        : isDrifting
                                            ? "bg-rose-500 border-rose-500 shadow-lg shadow-[rgba(244,63,94,0.5)]"
                                            : "bg-slate-700 border-white border-opacity-30 hover:border-white hover:border-opacity-50"
                                )}
                                title={task.title}
                            />

                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                <div className="bg-black bg-opacity-90 text-white text-xs px-2 py-1 rounded shadow-lg">
                                    {task.title}
                                    {isDrifting && <span className="text-rose-400 ml-1">⚠️</span>}
                                </div>
                                <div className="w-2 h-2 bg-black bg-opacity-90 rotate-45 absolute top-full left-1/2 -translate-x-1/2 -mt-1" />
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};
