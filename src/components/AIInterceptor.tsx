import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Clock, Scissors, X } from 'lucide-react';
import type { SubTask } from '../types/schema';

interface AIInterceptorProps {
    task: SubTask;
    isOpen: boolean;
    onClose: () => void;
    onExtendTime: (additionalMinutes: number) => void;
    onBreakDown: () => void;
    onAbort: () => void;
}

export function AIInterceptor({
    task,
    isOpen,
    onClose,
    onExtendTime,
    onBreakDown,
    onAbort
}: AIInterceptorProps) {
    const drift = task.time_actual_minutes - task.time_estimate_minutes;
    const driftPercent = task.time_estimate_minutes > 0
        ? ((drift / task.time_estimate_minutes) * 100).toFixed(0)
        : '0';

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-6"
                    >
                        <div className="glass-card p-8 max-w-lg w-full relative">
                            {/* Close button */}
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 text-secondary hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            {/* Header */}
                            <div className="flex items-start gap-4 mb-6">
                                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                                    <AlertTriangle className="w-6 h-6 text-amber-400 animate-pulse" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-2xl font-bold mb-2">Drift Detected</h2>
                                    <p className="text-secondary text-sm">
                                        This task is taking longer than expected
                                    </p>
                                </div>
                            </div>

                            {/* Task Info */}
                            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6">
                                <h3 className="font-medium mb-3">{task.title}</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-secondary">Estimated</span>
                                        <p className="text-lg font-bold text-blue-400">{task.time_estimate_minutes}m</p>
                                    </div>
                                    <div>
                                        <span className="text-secondary">Actual</span>
                                        <p className="text-lg font-bold text-amber-400">{task.time_actual_minutes}m</p>
                                    </div>
                                </div>
                                <div className="mt-3 pt-3 border-t border-white/10">
                                    <span className="text-red-400 font-medium text-sm">
                                        {driftPercent}% over estimate
                                    </span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="space-y-3">
                                <p className="text-secondary text-sm mb-4">What would you like to do?</p>

                                <button
                                    onClick={() => {
                                        onExtendTime(30);
                                        onClose();
                                    }}
                                    className="w-full flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                                        <Clock className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="font-medium">Extend Time</p>
                                        <p className="text-secondary text-xs">Add +30 minutes to estimate</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => {
                                        onBreakDown();
                                        onClose();
                                    }}
                                    className="w-full flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                                        <Scissors className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="font-medium">Break Down Task</p>
                                        <p className="text-secondary text-xs">Split into smaller subtasks</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => {
                                        onAbort();
                                        onClose();
                                    }}
                                    className="w-full flex items-center gap-3 p-4 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 rounded-lg transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center group-hover:bg-red-500/30 transition-colors">
                                        <X className="w-5 h-5 text-red-400" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="font-medium text-red-400">Abort Task</p>
                                        <p className="text-secondary text-xs">Mark as incomplete and move on</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
