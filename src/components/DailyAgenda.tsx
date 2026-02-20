import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight, Zap, Focus, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createDatabase } from '../db';
import { syncCalendarEvents } from '../services/google-calendar';
import { isGoogleAuthAvailable, isGoogleConnected, requestGoogleAuth } from '../services/google-auth';
import { syncCalendarTaskStatus } from '../services/task-scheduler';
import { completeTask } from '../services/task-rollover';
import { detectAllConflicts, getMeetingLoadStats } from '../services/calendar-monitor';
import type { EventConflict, MeetingLoadStats } from '../services/calendar-monitor';
import type { CalendarEvent } from '../types/schema';
import type { Task } from '../types/schema';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6 AM to 10 PM
const HOUR_HEIGHT = 56; // pixels per hour

function formatHour(hour: number): string {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
}

function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
}

interface TimeBlock {
    type: 'event' | 'task';
    id: string;
    title: string;
    startHour: number;
    startMinute: number;
    durationMinutes: number;
    color: string;
    isFocusBlock?: boolean;
    linkedTaskId?: string;
}

type PositionedTimeBlock = TimeBlock & { column: number; totalColumns: number };

function assignColumns(blocks: TimeBlock[]): PositionedTimeBlock[] {
    if (blocks.length === 0) return [];

    // Sort by start time, then longest duration first
    const sorted = [...blocks].sort((a, b) => {
        const aStart = a.startHour * 60 + a.startMinute;
        const bStart = b.startHour * 60 + b.startMinute;
        if (aStart !== bStart) return aStart - bStart;
        return b.durationMinutes - a.durationMinutes;
    });

    // For each block, find its column by checking which columns are occupied at its start time
    const result: PositionedTimeBlock[] = [];
    const columnEnds: number[] = []; // tracks when each column becomes free (in minutes from midnight)

    for (const block of sorted) {
        const blockStart = block.startHour * 60 + block.startMinute;
        const blockEnd = blockStart + block.durationMinutes;

        // Find first available column
        let col = 0;
        while (col < columnEnds.length && columnEnds[col] > blockStart) {
            col++;
        }

        // Assign column
        if (col >= columnEnds.length) {
            columnEnds.push(blockEnd);
        } else {
            columnEnds[col] = blockEnd;
        }

        result.push({ ...block, column: col, totalColumns: 0 }); // totalColumns set later
    }

    // Calculate totalColumns for each event based on all events it overlaps with
    for (let i = 0; i < result.length; i++) {
        const iStart = result[i].startHour * 60 + result[i].startMinute;
        const iEnd = iStart + result[i].durationMinutes;
        let maxCol = result[i].column;

        for (let j = 0; j < result.length; j++) {
            if (i === j) continue;
            const jStart = result[j].startHour * 60 + result[j].startMinute;
            const jEnd = jStart + result[j].durationMinutes;

            // Check overlap
            if (iStart < jEnd && jStart < iEnd) {
                maxCol = Math.max(maxCol, result[j].column);
            }
        }

        result[i].totalColumns = maxCol + 1;
    }

    return result;
}

function parseTimeBlocks(events: CalendarEvent[]): TimeBlock[] {
    const blocks: TimeBlock[] = [];

    for (const event of events) {
        if (event.all_day) continue;

        const start = new Date(event.start_time);
        const end = new Date(event.end_time);
        const duration = (end.getTime() - start.getTime()) / 60000;

        blocks.push({
            type: 'event',
            id: event.id,
            title: event.summary,
            startHour: start.getHours(),
            startMinute: start.getMinutes(),
            durationMinutes: duration,
            color: event.source === 'google' ? '#3b82f6' : '#8b5cf6',
            isFocusBlock: event.is_focus_block,
            linkedTaskId: event.linked_task_id,
        });
    }

    // Tasks with time estimates that aren't already in calendar events
    // Unscheduled tasks (not linked to calendar events) show in the sidebar,
    // not positioned on the timeline.

    return blocks;
}

export function DailyAgenda() {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [conflicts, setConflicts] = useState<EventConflict[]>([]);
    const [meetingLoad, setMeetingLoad] = useState<MeetingLoadStats | null>(null);

    useEffect(() => {
        let mounted = true;

        async function load() {
            const db = await createDatabase();
            const dateStr = toDateString(selectedDate);

            // Load local calendar events for this date
            const dayStart = new Date(dateStr + 'T00:00:00');
            const dayEnd = new Date(dateStr + 'T23:59:59');

            const eventDocs = await db.calendar_events.find({
                selector: {
                    start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() }
                }
            }).exec();

            if (mounted) {
                setEvents(eventDocs.map(d => d.toJSON() as CalendarEvent));
            }

            // Compute conflicts and meeting load
            const [detectedConflicts, loadStats] = await Promise.all([
                detectAllConflicts(db, selectedDate),
                getMeetingLoadStats(db, selectedDate),
            ]);
            if (mounted) {
                setConflicts(detectedConflicts);
                setMeetingLoad(loadStats);
            }

            // Load active tasks for this date
            const taskDocs = await db.tasks.find({
                selector: { status: 'active' }
            }).exec();

            if (mounted) {
                setTasks(taskDocs.map(d => d.toJSON() as Task));
            }

            // Auto-sync from Google Calendar on mount if connected
            if (isGoogleConnected()) {
                setIsSyncing(true);
                try {
                    await syncCalendarEvents(db, dayStart, dayEnd);
                    // Reload events after sync
                    const syncedEventDocs = await db.calendar_events.find({
                        selector: {
                            start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() }
                        }
                    }).exec();
                    if (mounted) {
                        setEvents(syncedEventDocs.map(d => d.toJSON() as CalendarEvent));
                    }
                } catch (err) {
                    console.error('[DailyAgenda] Auto-sync on mount failed:', err);
                } finally {
                    if (mounted) {
                        setIsSyncing(false);
                    }
                }
            }
        }

        load();

        // Auto-sync: mark tasks complete whose calendar events have passed
        if (toDateString(selectedDate) === toDateString(new Date())) {
            createDatabase().then(db => syncCalendarTaskStatus(db)).then(completedIds => {
                if (completedIds.length > 0 && mounted) {
                    // Reload tasks to reflect status changes
                    createDatabase().then(db =>
                        db.tasks.find({ selector: { status: 'active' } }).exec()
                    ).then(taskDocs => {
                        if (mounted) setTasks(taskDocs.map(d => d.toJSON() as Task));
                    }).catch(err => {
                        console.error('[DailyAgenda] Failed to reload tasks after sync:', err);
                    });
                }
            }).catch(err => {
                console.error('[DailyAgenda] Auto-sync calendar task status failed:', err);
            });
        }

        return () => { mounted = false; };
    }, [selectedDate]);

    const timeBlocks = useMemo(() => assignColumns(parseTimeBlocks(events)), [events]);

    const currentHour = new Date().getHours();
    const currentMinute = new Date().getMinutes();
    const isToday = toDateString(selectedDate) === toDateString(new Date());

    const handleSync = async () => {
        if (!isGoogleConnected()) {
            try {
                await requestGoogleAuth();
            } catch (err) {
                console.error('[DailyAgenda] Auth failed:', err);
                return;
            }
        }

        setIsSyncing(true);
        try {
            const db = await createDatabase();
            const dayStart = new Date(toDateString(selectedDate) + 'T00:00:00');
            const dayEnd = new Date(toDateString(selectedDate) + 'T23:59:59');
            await syncCalendarEvents(db, dayStart, dayEnd);

            // Reload events
            const eventDocs = await db.calendar_events.find({
                selector: {
                    start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() }
                }
            }).exec();
            setEvents(eventDocs.map(d => d.toJSON() as CalendarEvent));
        } catch (err) {
            console.error('[DailyAgenda] Sync failed:', err);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleCompleteFromBlock = async (block: TimeBlock) => {
        if (!block.linkedTaskId) return;
        try {
            const db = await createDatabase();
            await completeTask(db, block.linkedTaskId);
            // Reload tasks
            const taskDocs = await db.tasks.find({ selector: { status: 'active' } }).exec();
            setTasks(taskDocs.map(d => d.toJSON() as Task));
        } catch (err) {
            console.error('[DailyAgenda] Failed to complete task:', err);
        }
    };

    const navigateDate = (delta: number) => {
        const next = new Date(selectedDate);
        next.setDate(next.getDate() + delta);
        setSelectedDate(next);
    };

    const unscheduledTasks = tasks.filter(
        t => t.status === 'active' && t.time_estimate_minutes &&
        !events.some(e => e.linked_task_id === t.id)
    );

    const allDayEvents = events.filter(e => e.all_day);

    return (
        <div className="flex flex-col text-white">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    <span className="text-base font-bold">Daily Agenda</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => navigateDate(-1)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setSelectedDate(new Date())}
                        className="px-2 py-0.5 text-sm hover:bg-white/10 rounded transition-colors"
                    >
                        {formatDate(selectedDate)}
                    </button>
                    <button
                        onClick={() => navigateDate(1)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
                {isGoogleAuthAvailable() && (
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                        title={isGoogleConnected() ? 'Sync with Google Calendar' : 'Connect Google Calendar'}
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''} ${isGoogleConnected() ? 'text-green-400' : 'text-slate-500'}`} />
                    </button>
                )}
            </div>

            {/* All-day events */}
            {allDayEvents.length > 0 && (
                <div className="px-3 py-1.5 border-b border-white/5">
                    <span className="text-xs uppercase tracking-wider text-slate-500">All Day</span>
                    {allDayEvents.map(event => (
                        <div
                            key={event.id}
                            className="mt-1 px-2 py-1 rounded text-sm bg-blue-500/20 text-blue-300"
                        >
                            {event.summary}
                        </div>
                    ))}
                </div>
            )}

            {/* Meeting Load Stats */}
            {meetingLoad && meetingLoad.meetingCount > 0 && (
                <div className="px-3 py-2 border-b border-white/5">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs uppercase tracking-wider text-slate-500">Meeting Load</span>
                        <span className="text-xs text-slate-400 font-mono">
                            {Math.round(meetingLoad.totalMeetingMinutes / 60 * 10) / 10}h / {Math.round(meetingLoad.totalFreeMinutes / 60 * 10) / 10}h free
                        </span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-1">
                        <div
                            className={`h-full rounded-full transition-all ${meetingLoad.percentBooked > 70 ? 'bg-red-500' : meetingLoad.percentBooked > 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(meetingLoad.percentBooked, 100)}%` }}
                        />
                    </div>
                    <div className="flex gap-3 text-xs text-slate-600">
                        <span>{meetingLoad.meetingCount} meetings</span>
                        {meetingLoad.backToBackCount > 0 && (
                            <span className="text-amber-500">{meetingLoad.backToBackCount} back-to-back</span>
                        )}
                        {meetingLoad.overlapCount > 0 && (
                            <span className="text-red-400">{meetingLoad.overlapCount} overlaps</span>
                        )}
                        <span>Longest free: {Math.round(meetingLoad.longestFreeBlock)}min</span>
                    </div>
                </div>
            )}

            {/* Conflict Alert Banner */}
            {conflicts.length > 0 && (
                <div className="px-3 py-2 border-b border-red-500/20 bg-red-500/5">
                    <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />
                        <span className="text-xs text-red-400 font-medium">
                            {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}: {conflicts[0].message}
                            {conflicts.length > 1 && ` (+${conflicts.length - 1} more)`}
                        </span>
                    </div>
                </div>
            )}

            {/* Connect Google Calendar CTA */}
            {!isGoogleConnected() && events.length === 0 && (
                <div className="px-3 py-4 border-b border-white/10">
                    <div className="flex flex-col items-center justify-center text-center gap-2">
                        <Calendar className="w-8 h-8 text-slate-600" />
                        <div>
                            <p className="text-sm text-slate-400 mb-1">No events scheduled</p>
                            {isGoogleAuthAvailable() && (
                                <button
                                    onClick={handleSync}
                                    className="px-3 py-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded transition-colors"
                                >
                                    Connect Google Calendar
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Timeline */}
            <div>
                <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                    {/* Hour grid lines */}
                    {HOURS.map(hour => (
                        <div
                            key={hour}
                            className="absolute left-0 right-0 border-t border-white/5 flex items-start"
                            style={{ top: (hour - 6) * HOUR_HEIGHT }}
                        >
                            <span className="text-xs text-slate-600 w-12 text-right pr-2 pt-0.5 flex-shrink-0">
                                {formatHour(hour)}
                            </span>
                            <div className="flex-1" />
                        </div>
                    ))}

                    {/* Current time indicator */}
                    {isToday && currentHour >= 6 && currentHour <= 22 && (
                        <div
                            className="absolute left-12 right-0 z-20 flex items-center"
                            style={{ top: (currentHour - 6) * HOUR_HEIGHT + (currentMinute / 60) * HOUR_HEIGHT }}
                        >
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <div className="flex-1 h-px bg-red-500/60" />
                        </div>
                    )}

                    {/* Time blocks */}
                    <AnimatePresence>
                        {timeBlocks.map(block => {
                            if (block.startHour < 6 || block.startHour > 22) return null;

                            const top = (block.startHour - 6) * HOUR_HEIGHT + (block.startMinute / 60) * HOUR_HEIGHT;
                            const height = Math.max((block.durationMinutes / 60) * HOUR_HEIGHT, 20);
                            const hasConflict = conflicts.some(c => c.eventA.id === block.id || c.eventB.id === block.id);
                            const isNarrow = block.totalColumns > 1;

                            return (
                                <motion.div
                                    key={block.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0 }}
                                    className={`absolute rounded-md px-2 py-1 overflow-hidden cursor-pointer hover:brightness-110 transition-all group ${hasConflict ? 'ring-1 ring-red-500/40' : ''}`}
                                    style={{
                                        top,
                                        height,
                                        left: `calc(56px + (100% - 64px) * ${block.column / block.totalColumns})`,
                                        width: `calc((100% - 64px) / ${block.totalColumns} - 2px)`,
                                        backgroundColor: hasConflict ? 'rgba(239, 68, 68, 0.15)' : block.color + '33',
                                        borderLeft: `3px solid ${hasConflict ? '#ef4444' : block.color}`,
                                    }}
                                    title={`${block.title} (${block.durationMinutes}min)`}
                                >
                                    <div className="flex items-center gap-1 min-w-0">
                                        {block.isFocusBlock && <Focus className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                                        <span className={`${isNarrow ? 'text-sm' : 'text-base'} font-medium truncate flex-1`} style={{ color: block.color }}>
                                            {block.title}
                                        </span>
                                        {block.linkedTaskId && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleCompleteFromBlock(block); }}
                                                className="p-0.5 hover:bg-emerald-500/20 rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                                                title="Mark task complete"
                                            >
                                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                            </button>
                                        )}
                                    </div>
                                    {height > 30 && (
                                        <span className="text-xs text-slate-400 truncate block">
                                            {block.durationMinutes}min
                                        </span>
                                    )}
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </div>

            {/* Unscheduled tasks */}
            {unscheduledTasks.length > 0 && (
                <div className="border-t border-white/10 px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Zap className="w-3 h-3 text-yellow-400" />
                        <span className="text-xs uppercase tracking-wider text-slate-500">
                            Unscheduled ({unscheduledTasks.length})
                        </span>
                    </div>
                    {unscheduledTasks.slice(0, 5).map(task => (
                        <div
                            key={task.id}
                            className="flex items-center justify-between py-0.5"
                        >
                            <span className="text-sm text-slate-400 truncate">{task.title}</span>
                            <span className="text-xs text-slate-600 flex-shrink-0 ml-2">
                                {task.time_estimate_minutes}m
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
