/**
 * WeekView — 7-column (Sun–Sat) calendar view for Maple Life OS.
 * Renders events as positioned blocks on a shared timeline.
 * Clicking a day header calls onDateChange() so the parent can switch to day view.
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar, RefreshCw, Focus } from 'lucide-react';
import { createDatabase } from '../../db';
import { syncCalendarEvents } from '../../services/google-calendar';
import { isGoogleConnected } from '../../services/google-auth';
import type { CalendarEvent } from '../../types/schema';
import {
    HOURS,
    HOUR_HEIGHT,
    formatHour,
    parseTimeBlocks,
    assignColumns,
    deduplicateEvents,
    getWeekRange,
    toDateString,
} from './calendar-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeekViewProps {
    selectedDate: Date;
    onDateChange: (date: Date) => void;
}

// ─── Day header label helpers ─────────────────────────────────────────────────

const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDayHeader(date: Date): { abbrev: string; num: number } {
    return { abbrev: DAY_ABBREVS[date.getDay()], num: date.getDate() };
}

function formatMonthYear(start: Date, end: Date): string {
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    // If week spans two months, show both
    if (start.getMonth() !== end.getMonth()) {
        const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
        return `${start.toLocaleDateString('en-US', { month: 'short' })} – ${endMonth} ${end.getFullYear()}`;
    }
    return startLabel;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WeekView({ selectedDate, onDateChange }: WeekViewProps) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);

    // The week (Sun–Sat) that contains selectedDate
    const { start: weekStart, end: weekEnd } = useMemo(
        () => getWeekRange(selectedDate),
        [selectedDate]
    );

    // Array of 7 Date objects for each column
    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            return d;
        });
    }, [weekStart]);

    const todayStr = toDateString(new Date());

    // ── Load events for this week ──────────────────────────────────────────────
    useEffect(() => {
        let mounted = true;

        async function load() {
            const db = await createDatabase();

            const eventDocs = await db.calendar_events.find({
                selector: {
                    start_time: {
                        $gte: weekStart.toISOString(),
                        $lte: weekEnd.toISOString(),
                    },
                },
            }).exec();

            if (mounted) {
                setEvents(deduplicateEvents(eventDocs.map(d => d.toJSON() as CalendarEvent)));
            }

            // Auto-sync from Google if connected
            if (isGoogleConnected()) {
                setIsSyncing(true);
                try {
                    await syncCalendarEvents(db, weekStart, weekEnd);
                    const synced = await db.calendar_events.find({
                        selector: {
                            start_time: {
                                $gte: weekStart.toISOString(),
                                $lte: weekEnd.toISOString(),
                            },
                        },
                    }).exec();
                    if (mounted) {
                        setEvents(deduplicateEvents(synced.map(d => d.toJSON() as CalendarEvent)));
                    }
                } catch (err) {
                    console.error('[WeekView] Auto-sync failed:', err);
                } finally {
                    if (mounted) setIsSyncing(false);
                }
            }
        }

        load();
        return () => { mounted = false; };
    }, [weekStart, weekEnd]);

    // ── Events bucketed by day ─────────────────────────────────────────────────
    const eventsByDay = useMemo(() => {
        return weekDays.map(day => {
            const dayStr = toDateString(day);
            const dayEvents = events.filter(e => {
                const eventDate = toDateString(new Date(e.start_time));
                return eventDate === dayStr && !e.all_day;
            });
            return assignColumns(parseTimeBlocks(dayEvents));
        });
    }, [events, weekDays]);

    // All-day events bucketed by day
    const allDayByDay = useMemo(() => {
        return weekDays.map(day => {
            const dayStr = toDateString(day);
            return events.filter(e => {
                const eventDate = toDateString(new Date(e.start_time));
                return eventDate === dayStr && e.all_day;
            });
        });
    }, [events, weekDays]);

    // ── Navigation ────────────────────────────────────────────────────────────
    const navigateWeek = (delta: number) => {
        const next = new Date(selectedDate);
        next.setDate(next.getDate() + delta * 7);
        onDateChange(next);
    };

    // ── Current time position ─────────────────────────────────────────────────
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeTop =
        currentHour >= 6 && currentHour <= 22
            ? (currentHour - 6) * HOUR_HEIGHT + (currentMinute / 60) * HOUR_HEIGHT
            : null;

    // ── Sync handler ──────────────────────────────────────────────────────────
    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const db = await createDatabase();
            await syncCalendarEvents(db, weekStart, weekEnd);
            const synced = await db.calendar_events.find({
                selector: {
                    start_time: {
                        $gte: weekStart.toISOString(),
                        $lte: weekEnd.toISOString(),
                    },
                },
            }).exec();
            setEvents(deduplicateEvents(synced.map(d => d.toJSON() as CalendarEvent)));
        } catch (err) {
            console.error('[WeekView] Manual sync failed:', err);
        } finally {
            setIsSyncing(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col text-white h-full overflow-hidden">
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    <span className="text-base font-bold">Week View</span>
                    <span className="text-sm text-slate-400">
                        {formatMonthYear(weekStart, weekEnd)}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => navigateWeek(-1)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                        title="Previous week"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => onDateChange(new Date())}
                        className="px-2 py-0.5 text-xs hover:bg-white/10 rounded transition-colors"
                    >
                        Today
                    </button>
                    <button
                        onClick={() => navigateWeek(1)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                        title="Next week"
                    >
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="p-1 hover:bg-white/10 rounded transition-colors ml-1"
                        title="Sync Google Calendar"
                    >
                        <RefreshCw
                            className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''} ${isGoogleConnected() ? 'text-green-400' : 'text-slate-500'}`}
                        />
                    </button>
                </div>
            </div>

            {/* ── Day column headers ── */}
            <div className="grid border-b border-white/10 flex-shrink-0" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
                {/* Spacer for the time gutter */}
                <div />
                {weekDays.map((day, idx) => {
                    const isToday = toDateString(day) === todayStr;
                    const { abbrev, num } = formatDayHeader(day);
                    const hasAllDay = allDayByDay[idx].length > 0;
                    return (
                        <div
                            key={idx}
                            className={`flex flex-col items-center py-1.5 cursor-pointer hover:bg-white/5 transition-colors border-l border-white/5 ${isToday ? 'bg-white/5' : ''}`}
                            onClick={() => onDateChange(day)}
                            title={`Switch to ${abbrev} ${num}`}
                        >
                            <span className={`text-xs font-medium ${isToday ? 'text-blue-400' : 'text-slate-400'}`}>
                                {abbrev}
                            </span>
                            <span className={`text-sm font-bold leading-tight ${isToday ? 'text-white' : 'text-slate-300'}`}>
                                {num}
                            </span>
                            {/* All-day event dots */}
                            {hasAllDay && (
                                <div className="flex gap-0.5 mt-0.5">
                                    {allDayByDay[idx].slice(0, 3).map(e => (
                                        <div
                                            key={e.id}
                                            className="w-1 h-1 rounded-full bg-blue-400"
                                            title={e.summary}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Scrollable timeline grid ── */}
            <div className="flex-1 overflow-y-auto">
                <div
                    className="grid relative"
                    style={{ gridTemplateColumns: '48px repeat(7, 1fr)', height: HOURS.length * HOUR_HEIGHT }}
                >
                    {/* ── Time gutter ── */}
                    <div className="relative">
                        {HOURS.map(hour => (
                            <div
                                key={hour}
                                className="absolute left-0 right-0 flex items-start justify-end pr-1"
                                style={{ top: (hour - 6) * HOUR_HEIGHT }}
                            >
                                <span className="text-xs text-slate-600 leading-none pt-0.5">
                                    {formatHour(hour)}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* ── 7 day columns ── */}
                    {weekDays.map((day, dayIdx) => {
                        const isToday = toDateString(day) === todayStr;
                        const blocks = eventsByDay[dayIdx];

                        return (
                            <div
                                key={dayIdx}
                                className={`relative border-l border-white/5 ${isToday ? 'bg-white/5' : ''}`}
                            >
                                {/* Hour grid lines */}
                                {HOURS.map(hour => (
                                    <div
                                        key={hour}
                                        className="absolute left-0 right-0 border-t border-white/5"
                                        style={{ top: (hour - 6) * HOUR_HEIGHT }}
                                    />
                                ))}

                                {/* Current time indicator — only on today's column */}
                                {isToday && currentTimeTop !== null && (
                                    <div
                                        className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                                        style={{ top: currentTimeTop }}
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                        <div className="flex-1 h-px bg-red-500/60" />
                                    </div>
                                )}

                                {/* Timed event blocks */}
                                <AnimatePresence>
                                    {blocks.map(block => {
                                        if (block.startHour < 6 || block.startHour > 22) return null;

                                        const top =
                                            (block.startHour - 6) * HOUR_HEIGHT +
                                            (block.startMinute / 60) * HOUR_HEIGHT;
                                        const height = Math.max(
                                            (block.durationMinutes / 60) * HOUR_HEIGHT,
                                            16,
                                        );
                                        const leftPct = (block.column / block.totalColumns) * 100;
                                        const widthPct = (1 / block.totalColumns) * 100;

                                        return (
                                            <motion.div
                                                key={block.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="absolute rounded overflow-hidden cursor-pointer hover:brightness-110 transition-all"
                                                style={{
                                                    top,
                                                    height,
                                                    left: `${leftPct}%`,
                                                    width: `calc(${widthPct}% - 2px)`,
                                                    backgroundColor: block.color + '33',
                                                    borderLeft: `2px solid ${block.color}`,
                                                }}
                                                title={`${block.title} (${block.durationMinutes}min)`}
                                                onClick={() => onDateChange(day)}
                                            >
                                                <div className="flex items-center gap-0.5 px-1 pt-0.5 min-w-0">
                                                    {block.isFocusBlock && (
                                                        <Focus className="w-2.5 h-2.5 text-purple-400 flex-shrink-0" />
                                                    )}
                                                    <span
                                                        className="text-xs font-medium truncate"
                                                        style={{ color: block.color }}
                                                    >
                                                        {block.title}
                                                    </span>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Empty state ── */}
            {events.length === 0 && !isSyncing && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                        <Calendar className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                        <p className="text-sm text-slate-600">No events this week</p>
                    </div>
                </div>
            )}
        </div>
    );
}
