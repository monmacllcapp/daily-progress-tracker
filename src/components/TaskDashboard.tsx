import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, RotateCcw, ListTodo, ChevronDown, ChevronRight, Zap, Lightbulb, CalendarPlus, Focus, AlertTriangle } from 'lucide-react';
import { createDatabase } from '../db';
import type { Task, Category, Project } from '../types/schema';
import { completeTask, dismissTask, deferTask } from '../services/task-rollover';
import { suggestFocus, isAIAvailable } from '../services/ai-advisor';
import type { FocusSuggestion } from '../services/ai-advisor';
import { scheduleTask, scheduleDeepWork, schedulePowerBatch, checkLocalConflicts } from '../services/task-scheduler';
import type { LocalConflict } from '../services/task-scheduler';
import { BrainDump } from './BrainDump';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';

type FilterStatus = 'active' | 'completed' | 'all';

export function TaskDashboard() {
    const [db] = useDatabase();
    const [tasks] = useRxQuery<Task>(db?.tasks);
    const [categories] = useRxQuery<Category>(db?.categories);
    const [projects] = useRxQuery<Project>(db?.projects);
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('active');
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['uncategorized']));
    const [deferringTaskId, setDeferringTaskId] = useState<string | null>(null);
    const [deferReason, setDeferReason] = useState('');
    const [toast, setToast] = useState<string | null>(null);
    const [focusSuggestion, setFocusSuggestion] = useState<FocusSuggestion | null>(null);
    const [schedulingTaskId, setSchedulingTaskId] = useState<string | null>(null);
    const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split('T')[0]);
    const [scheduleTime, setScheduleTime] = useState('09:00');
    const [isFocusBlock, setIsFocusBlock] = useState(false);
    const [focusDuration, setFocusDuration] = useState(90);
    const [scheduleConflicts, setScheduleConflicts] = useState<LocalConflict[]>([]);
    const [batchScheduleTime, setBatchScheduleTime] = useState('');
    const [showBatchPicker, setShowBatchPicker] = useState(false);

    // AI focus suggestion — runs when tasks change and AI is available
    useEffect(() => {
        if (!isAIAvailable()) return;
        const active = tasks.filter(t => t.status === 'active');
        if (active.length === 0) {
            // Use callback form to avoid synchronous setState lint warning
            const timer = setTimeout(() => setFocusSuggestion(null), 0);
            return () => clearTimeout(timer);
        }
        let cancelled = false;
        suggestFocus(active, projects, categories).then(suggestion => {
            if (!cancelled) setFocusSuggestion(suggestion);
        });
        return () => { cancelled = true; };
    }, [tasks, projects, categories]);

    const filteredTasks = tasks.filter(t => {
        if (filterStatus === 'all') return true;
        if (filterStatus === 'active') return t.status === 'active';
        return t.status === 'completed';
    });

    // Group by category
    const tasksByCategory = new Map<string, Task[]>();
    for (const task of filteredTasks) {
        const catId = task.category_id || 'uncategorized';
        if (!tasksByCategory.has(catId)) {
            tasksByCategory.set(catId, []);
        }
        tasksByCategory.get(catId)!.push(task);
    }

    // Ensure uncategorized is first, then sort by category name
    const sortedCategoryIds = Array.from(tasksByCategory.keys()).sort((a, b) => {
        if (a === 'uncategorized') return -1;
        if (b === 'uncategorized') return 1;
        const catA = categories.find(c => c.id === a);
        const catB = categories.find(c => c.id === b);
        return (catA?.name || '').localeCompare(catB?.name || '');
    });

    const getCategoryName = (catId: string): string => {
        if (catId === 'uncategorized') return 'Uncategorized';
        return categories.find(c => c.id === catId)?.name || 'Unknown';
    };

    const getCategoryColor = (catId: string): string => {
        if (catId === 'uncategorized') return '#6b7280';
        return categories.find(c => c.id === catId)?.color_theme || '#6b7280';
    };

    const toggleCategory = (catId: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(catId)) next.delete(catId);
            else next.add(catId);
            return next;
        });
    };

    const handleComplete = async (taskId: string) => {
        const db = await createDatabase();
        await completeTask(db, taskId);
        showToast('Task completed');
    };

    const handleDismiss = async (taskId: string) => {
        const db = await createDatabase();
        await dismissTask(db, taskId);
        showToast('Task dismissed');
    };

    const handleDeferSubmit = async () => {
        if (!deferringTaskId) return;
        const db = await createDatabase();
        await deferTask(db, deferringTaskId, deferReason);
        setDeferringTaskId(null);
        setDeferReason('');
        showToast('Task deferred');
    };

    // Check for conflicts when schedule date/time changes
    useEffect(() => {
        if (!schedulingTaskId) {
            const timer = setTimeout(() => setScheduleConflicts([]), 0);
            return () => clearTimeout(timer);
        }
        const task = tasks.find(t => t.id === schedulingTaskId);
        const duration = isFocusBlock ? focusDuration : (task?.time_estimate_minutes || 30);
        const startTime = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();

        let cancelled = false;
        createDatabase().then(db =>
            checkLocalConflicts(db, startTime, duration)
        ).then(conflicts => {
            if (!cancelled) setScheduleConflicts(conflicts);
        }).catch(err => {
            console.error('[TaskDashboard] Failed to check schedule conflicts:', err);
        });
        return () => { cancelled = true; };
    }, [schedulingTaskId, scheduleDate, scheduleTime, isFocusBlock, focusDuration, tasks]);

    const handleScheduleSubmit = async () => {
        if (!schedulingTaskId) return;
        const startTime = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
        try {
            const db = await createDatabase();
            if (isFocusBlock) {
                await scheduleDeepWork(db, schedulingTaskId, startTime, focusDuration);
                showToast('Focus block scheduled');
            } else {
                await scheduleTask(db, { taskId: schedulingTaskId, startTime });
                showToast('Task scheduled');
            }
        } catch (err) {
            console.error('[TaskDashboard] Schedule failed:', err);
            showToast('Failed to schedule');
        }
        setSchedulingTaskId(null);
        setIsFocusBlock(false);
    };

    const handleBatchSchedule = async () => {
        if (!batchScheduleTime) return;
        const quickWins = tasks.filter(
            t => t.status === 'active' && t.time_estimate_minutes && t.time_estimate_minutes <= 5
        );
        if (quickWins.length === 0) return;

        const startTime = new Date(`${new Date().toISOString().split('T')[0]}T${batchScheduleTime}:00`).toISOString();
        try {
            const db = await createDatabase();
            await schedulePowerBatch(db, quickWins.map(t => t.id), startTime);
            showToast(`Power batch of ${quickWins.length} tasks scheduled`);
        } catch (err) {
            console.error('[TaskDashboard] Batch schedule failed:', err);
            showToast('Failed to schedule batch');
        }
        setShowBatchPicker(false);
        setBatchScheduleTime('');
    };

    const showToast = (message: string) => {
        setToast(message);
        setTimeout(() => setToast(null), 2000);
    };

    const activeTasks = tasks.filter(t => t.status === 'active');
    const completedToday = tasks.filter(t =>
        t.status === 'completed' && t.completed_date === new Date().toISOString().split('T')[0]
    );

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'urgent': return 'text-red-400 border-red-500';
            case 'high': return 'text-orange-400 border-orange-500';
            case 'medium': return 'text-blue-400 border-blue-500';
            default: return 'text-slate-400 border-slate-600';
        }
    };

    const getSourceBadge = (source: string) => {
        switch (source) {
            case 'morning_flow': return { label: 'Morning', color: 'bg-purple-500', bgLight: 'bg-purple-500/20' };
            case 'brain_dump': return { label: 'Brain Dump', color: 'bg-blue-500', bgLight: 'bg-blue-500/20' };
            case 'rpm_wizard': return { label: 'RPM', color: 'bg-emerald-500', bgLight: 'bg-emerald-500/20' };
            default: return null;
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 flex flex-col"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <ListTodo className="w-5 h-5 text-blue-400" />
                    <h2 className="text-lg font-bold">Tasks</h2>
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-bold rounded-full">
                        {activeTasks.length} active
                    </span>
                    {completedToday.length > 0 && (
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full">
                            {completedToday.length} done today
                        </span>
                    )}
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
                    {(['active', 'completed', 'all'] as FilterStatus[]).map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${filterStatus === status
                                ? 'bg-white/10 text-white'
                                : 'text-slate-500 hover:text-white'
                                }`}
                        >
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Daily Progress Bar */}
            {(activeTasks.length + completedToday.length) > 0 && (
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Today's Progress</span>
                        <span className="text-xs text-slate-400 font-mono">
                            {completedToday.length}/{activeTasks.length + completedToday.length}
                        </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{
                                width: `${((completedToday.length) / (activeTasks.length + completedToday.length)) * 100}%`
                            }}
                            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                        />
                    </div>
                </div>
            )}

            {/* AI Focus Suggestion */}
            {focusSuggestion && (
                <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                    <Lightbulb className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                        <span className="text-xs text-indigo-400 font-bold">Focus next: </span>
                        <span className="text-xs text-slate-300">
                            {tasks.find(t => t.id === focusSuggestion.taskId)?.title}
                        </span>
                        <p className="text-[10px] text-slate-500 mt-0.5">{focusSuggestion.reason}</p>
                    </div>
                </div>
            )}

            {/* Brain Dump Input */}
            <div className="mb-4">
                <BrainDump onTasksCreated={(count) => showToast(`Added ${count} task${count > 1 ? 's' : ''}`)} />
            </div>

            {/* Task List */}
            <div className="space-y-3">
                {sortedCategoryIds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                        <ListTodo className="w-10 h-10 mb-3 opacity-50" />
                        <p className="text-sm">No tasks yet</p>
                        <p className="text-xs mt-1">Use the brain dump above or complete your morning flow</p>
                    </div>
                ) : (<>
                    {/* Power Batch — Quick Wins (tasks <= 5 min) */}
                    {(() => {
                        const quickWins = filteredTasks.filter(
                            t => t.status === 'active' && t.time_estimate_minutes && t.time_estimate_minutes <= 5
                        );
                        if (quickWins.length === 0) return null;
                        return (
                            <div className="mb-2">
                                <div className="flex items-center gap-2 py-2">
                                    <Zap className="w-3.5 h-3.5 text-yellow-400" />
                                    <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">
                                        Power Batch
                                    </span>
                                    <span className="text-xs text-slate-600">({quickWins.length})</span>
                                    <span className="text-[10px] text-slate-600 ml-auto mr-2">
                                        {quickWins.reduce((sum, t) => sum + (t.time_estimate_minutes || 0), 0)}m total
                                    </span>
                                    {showBatchPicker ? (
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="time"
                                                value={batchScheduleTime}
                                                onChange={e => setBatchScheduleTime(e.target.value)}
                                                className="bg-white/5 border border-yellow-500/30 rounded px-1.5 py-0.5 text-[10px] text-white w-20 focus:outline-none"
                                                autoFocus
                                            />
                                            <button
                                                onClick={handleBatchSchedule}
                                                disabled={!batchScheduleTime}
                                                className="px-2 py-0.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 text-[10px] font-bold rounded transition-colors disabled:opacity-40"
                                            >
                                                Go
                                            </button>
                                            <button
                                                onClick={() => setShowBatchPicker(false)}
                                                className="text-slate-500 hover:text-white text-[10px] px-1"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => { setShowBatchPicker(true); setBatchScheduleTime('09:00'); }}
                                            className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded transition-colors"
                                            title="Schedule all quick wins as a power batch"
                                        >
                                            <CalendarPlus className="w-3 h-3" />
                                            Schedule Batch
                                        </button>
                                    )}
                                </div>
                                {quickWins.map(task => (
                                    <div key={`qw-${task.id}`} className="ml-5">
                                        <div className="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10 hover:bg-yellow-500/10 transition-all group">
                                            <Zap className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                                            <span className="flex-1 text-sm text-white truncate">{task.title}</span>
                                            <span className="text-[10px] text-yellow-400 font-mono">{task.time_estimate_minutes}m</span>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleComplete(task.id)}
                                                    className="p-1 hover:bg-emerald-500/20 rounded-lg transition-colors"
                                                    title="Complete"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}

                    {sortedCategoryIds.map(catId => {
                        const catTasks = tasksByCategory.get(catId)!
                            .sort((a, b) => {
                                // Sort: high priority first, then by sort_order
                                const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
                                const aPri = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
                                const bPri = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
                                if (aPri !== bPri) return aPri - bPri;
                                return (a.sort_order || 0) - (b.sort_order || 0);
                            });

                        const isExpanded = expandedCategories.has(catId);

                        return (
                            <div key={catId}>
                                {/* Category Header */}
                                <button
                                    onClick={() => toggleCategory(catId)}
                                    className="w-full flex items-center gap-2 py-2 text-left hover:opacity-80 transition-opacity"
                                >
                                    {isExpanded
                                        ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                        : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                    }
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: getCategoryColor(catId) }}
                                    />
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        {getCategoryName(catId)}
                                    </span>
                                    <span className="text-xs text-slate-600">({catTasks.length})</span>
                                </button>

                                {/* Tasks */}
                                <AnimatePresence>
                                    {isExpanded && catTasks.map(task => (
                                        <motion.div
                                            key={task.id}
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="ml-5"
                                        >
                                            <div className={`flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/5 transition-all group ${task.status !== 'active' ? 'opacity-50' : ''}`}>
                                                {/* Priority indicator */}
                                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getPriorityColor(task.priority)}`}
                                                    style={{ backgroundColor: task.priority === 'urgent' ? '#f87171' : task.priority === 'high' ? '#fb923c' : task.priority === 'medium' ? '#60a5fa' : '#94a3b8' }}
                                                />

                                                {/* Task title */}
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-sm ${task.status === 'completed' ? 'line-through text-slate-600' : 'text-white'}`}>
                                                        {task.title}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        {/* Rolled badge */}
                                                        {task.rolled_from_date && (
                                                            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                                                <RotateCcw className="w-2.5 h-2.5" />
                                                                from {task.rolled_from_date}
                                                            </span>
                                                        )}
                                                        {/* Source badge */}
                                                        {(() => {
                                                            const badge = getSourceBadge(task.source);
                                                            if (!badge) return null;
                                                            return (
                                                                <span className={`text-[10px] ${badge.bgLight} text-white px-1.5 py-0.5 rounded`}>
                                                                    {badge.label}
                                                                </span>
                                                            );
                                                        })()}
                                                        {/* Tags */}
                                                        {task.tags?.map(tag => (
                                                            <span key={tag} className="text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">
                                                                {tag}
                                                            </span>
                                                        ))}
                                                        {/* Time estimate */}
                                                        {task.time_estimate_minutes && (
                                                            <span className="text-[10px] text-slate-600">
                                                                {task.time_estimate_minutes}m
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Action buttons (visible on hover) */}
                                                {task.status === 'active' && (
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => handleComplete(task.id)}
                                                            className="p-1.5 hover:bg-emerald-500/20 rounded-lg transition-colors"
                                                            title="Complete"
                                                        >
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeferringTaskId(task.id)}
                                                            className="p-1.5 hover:bg-amber-500/20 rounded-lg transition-colors"
                                                            title="Defer"
                                                        >
                                                            <Clock className="w-4 h-4 text-amber-400" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setSchedulingTaskId(task.id);
                                                                setScheduleDate(new Date().toISOString().split('T')[0]);
                                                                setScheduleTime('09:00');
                                                            }}
                                                            className="p-1.5 hover:bg-blue-500/20 rounded-lg transition-colors"
                                                            title="Schedule on calendar"
                                                        >
                                                            <CalendarPlus className="w-4 h-4 text-blue-400" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDismiss(task.id)}
                                                            className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
                                                            title="Dismiss"
                                                        >
                                                            <XCircle className="w-4 h-4 text-red-400" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </>)}
            </div>

            {/* Defer Modal */}
            <AnimatePresence>
                {deferringTaskId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                        onClick={() => setDeferringTaskId(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            onClick={e => e.stopPropagation()}
                            className="glass-card p-6 w-full max-w-sm"
                        >
                            <h3 className="text-lg font-bold mb-3">Defer Task</h3>
                            <input
                                type="text"
                                value={deferReason}
                                onChange={e => setDeferReason(e.target.value)}
                                placeholder="Why are you deferring this?"
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors text-sm"
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') handleDeferSubmit(); }}
                            />
                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={() => setDeferringTaskId(null)}
                                    className="flex-1 px-4 py-2 text-sm text-slate-500 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeferSubmit}
                                    className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 rounded-lg text-sm font-bold transition-all"
                                >
                                    Defer
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Schedule Modal */}
            <AnimatePresence>
                {schedulingTaskId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                        onClick={() => setSchedulingTaskId(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            onClick={e => e.stopPropagation()}
                            className="glass-card p-6 w-full max-w-sm"
                        >
                            <h3 className="text-lg font-bold mb-1">Schedule Task</h3>
                            <p className="text-xs text-slate-500 mb-4">
                                {tasks.find(t => t.id === schedulingTaskId)?.title}
                            </p>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={scheduleDate}
                                        onChange={e => setScheduleDate(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Start Time</label>
                                    <input
                                        type="time"
                                        value={scheduleTime}
                                        onChange={e => setScheduleTime(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                                    />
                                </div>

                                {/* Focus Block Toggle */}
                                <div className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <Focus className="w-4 h-4 text-purple-400" />
                                        <span className="text-xs text-slate-300">Deep Work Block</span>
                                    </div>
                                    <button
                                        onClick={() => setIsFocusBlock(!isFocusBlock)}
                                        className={`w-9 h-5 rounded-full transition-colors relative ${isFocusBlock ? 'bg-purple-500' : 'bg-slate-700'}`}
                                    >
                                        <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${isFocusBlock ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>

                                {/* Duration (shown when focus block) */}
                                {isFocusBlock && (
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">Duration (minutes)</label>
                                        <div className="flex gap-2">
                                            {[60, 90, 120].map(d => (
                                                <button
                                                    key={d}
                                                    onClick={() => setFocusDuration(d)}
                                                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${focusDuration === d
                                                        ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40'
                                                        : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'
                                                    }`}
                                                >
                                                    {d}m
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Conflict Warnings */}
                                {scheduleConflicts.length > 0 && (
                                    <div className="space-y-1.5">
                                        {scheduleConflicts.map(conflict => (
                                            <div
                                                key={conflict.eventId}
                                                className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                                                    conflict.type === 'overlap'
                                                        ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                                                        : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                                                }`}
                                            >
                                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                                <span>{conflict.message}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={() => { setSchedulingTaskId(null); setIsFocusBlock(false); }}
                                    className="flex-1 px-4 py-2 text-sm text-slate-500 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleScheduleSubmit}
                                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                        isFocusBlock
                                            ? 'bg-purple-500 hover:bg-purple-600'
                                            : 'bg-blue-500 hover:bg-blue-600'
                                    }`}
                                >
                                    {isFocusBlock ? 'Schedule Focus Block' : 'Schedule'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-6 right-6 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50"
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
