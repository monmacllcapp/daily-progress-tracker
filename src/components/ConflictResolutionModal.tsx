import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Calendar, Clock, ArrowRight } from 'lucide-react';
import type { Conflict } from '../services/conflict-detector';

interface ConflictResolutionModalProps {
    conflicts: Conflict[];
    onOverride: () => void;
    onMove: (newTime: Date) => void;
    onCancel: () => void;
}

export function ConflictResolutionModal({
    conflicts,
    onOverride,
    onMove,
    onCancel
}: ConflictResolutionModalProps) {
    if (conflicts.length === 0) return null;

    const primaryConflict = conflicts[0];

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    };

    const getSuggestedTime = (): Date => {
        // Parse the AI suggestion or use a default
        const currentTime = new Date(primaryConflict.newProject.due_date!);
        currentTime.setHours(currentTime.getHours() + 2); // Move 2 hours later
        return currentTime;
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
                onClick={onCancel}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="glass-card p-8 max-w-2xl w-full"
                >
                    {/* Header */}
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-amber-500 bg-opacity-20 rounded-lg">
                            <AlertTriangle className="w-6 h-6 text-amber-400" />
                        </div>
                        <div className="flex-1">
                            < h2 className="text-2xl font-bold mb-2">Schedule Conflict Detected</h2>
                            < p className="text-secondary text-sm">
                                {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} found with your calendar
                            </p >
                        </div >
                    </div >

                    {/* Conflict Details */}
                    < div className="space-y-4 mb-6">
                        {/* New Project */}
                        <div className="p-4 bg-blue-500 bg-opacity-10 border border-blue-500 border-opacity-20 rounded-lg">
                            < div className="flex items-center gap-2 mb-2">
                                < Calendar className="w-4 h-4 text-blue-400" />
                                < span className="text-xs text-blue-400 font-medium uppercase">New Project</span>
                            </div >
                            <h3 className="font-bold text-lg mb-1">{primaryConflict.newProject.title}</h3>
                            < div className="flex items-center gap-4 text-sm text-secondary">
                                < div className="flex items-center gap-1">
                                    < Clock className="w-3 h-3" />
                                    < span > {primaryConflict.newProject.metrics.total_time_estimated} min</span >
                                </div >
                                {
                                    primaryConflict.newProject.due_date && (
                                        <span>
                                            {formatDate(primaryConflict.newProject.due_date)} at{' '}
                                            {formatTime(primaryConflict.newProject.due_date)}
                                        </span>
                                    )
                                }
                            </div >
                        </div >

                        {/* Conflicting Event */}
                        < div className="flex items-center justify-center">
                            < div className="p-2 bg-red-500 bg-opacity-20 rounded-full">
                                < AlertTriangle className="w-4 h-4 text-red-400" />
                            </div >
                        </div >

                        <div className="p-4 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-20 rounded-lg">
                            < div className="flex items-center gap-2 mb-2">
                                < Calendar className="w-4 h-4 text-red-400" />
                                < span className="text-xs text-red-400 font-medium uppercase">Conflicts With</span>
                            </div >
                            <h3 className="font-bold text-lg mb-1">{primaryConflict.existingEvent.summary}</h3>
                            < div className="flex items-center gap-2 text-sm text-secondary">
                                <span>
                                    {formatTime(primaryConflict.existingEvent.start.dateTime)} -{' '}
                                    {formatTime(primaryConflict.existingEvent.end.dateTime)}
                                </span >
                            </div >
                        </div >
                    </div >

                    {/* AI Suggestion */}
                    < div className="p-4 bg-gradient-to-r from-[rgba(168,85,247,0.1)] to-[rgba(59,130,246,0.1)] border border-purple-500 border-opacity-20 rounded-lg mb-6">
                        < div className="flex items-start gap-3">
                            < div className="p-2 bg-purple-500 bg-opacity-20 rounded-lg flex-shrink-0">
                                < Sparkles className="w-4 h-4 text-purple-400" />
                            </div >
                            <div className="flex-1">
                                < h4 className="font-bold text-sm mb-1 text-purple-400">AI Suggestion</h4>
                                < p className="text-sm mb-2">{primaryConflict.suggestion}</p>
                                < p className="text-xs text-secondary">{primaryConflict.aiExplanation}</p>
                            </div >
                        </div >
                    </div >

                    {/* Actions */}
                    < div className="flex gap-3">
                        < button
                            onClick={onCancel}
                            className="flex-1 px-6 py-3 bg-white bg-opacity-10 hover:bg-white hover:bg-opacity-20 rounded-xl font-medium transition-all"
                        >
                            Cancel
                        </button >
                        <button
                            onClick={onOverride}
                            className="flex-1 px-6 py-3 bg-amber-500 bg-opacity-20 hover:bg-amber-500 hover:bg-opacity-30 border border-amber-500 border-opacity-30 rounded-xl font-medium transition-all text-amber-400"
                        >
                            Override Anyway
                        </button >
                        <button
                            onClick={() => onMove(getSuggestedTime())}
                            className="flex-1 px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl font-bold transition-all shadow-lg shadow-[rgba(59,130,246,0.2)] flex items-center justify-center gap-2"
                        >
                            Move to Suggested Time
                            < ArrowRight className="w-4 h-4" />
                        </button >
                    </div >

                    {/* Additional Conflicts */}
                    {
                        conflicts.length > 1 && (
                            <div className="mt-4 pt-4 border-t border-white border-opacity-10">
                                < p className="text-xs text-secondary">
                                    + {conflicts.length - 1} more conflict{conflicts.length - 1 > 1 ? 's' : ''} detected
                                </p >
                            </div >
                        )
                    }
                </motion.div >
            </motion.div >
        </AnimatePresence >
    );
}

// Missing import
import { Sparkles } from 'lucide-react';
