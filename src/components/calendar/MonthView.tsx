/**
 * MonthView — standard calendar grid (6 rows × 7 columns, Sun–Sat) for Maple Life OS.
 * Shows up to 3 event pills per day cell with "+N more" overflow.
 * Clicking a date calls onDateChange() so the parent can switch to day view.
 */

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar, RefreshCw } from 'lucide-react';
import { createDatabase } from '../../db';
import { syncCalendarEvents } from '../../services/google-calendar';
import { isGoogleConnected } from '../../services/google-auth';
import type { CalendarEvent } from '../../types/schema';
import {
    getMonthRange,
    toDateString,
    deduplicateEvents,
} from './calendar-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthViewProps {
    selectedDate: Date;
    onDateChange: (date: Date) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_PILLS = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** "February 2026" */
function formatMonthYear(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Build a 6×7 grid of Date objects for the calendar view.
 * The grid always starts on the Sunday before (or on) the 1st of the month,
 * and ends after 6 complete rows (42 cells).
 */
function buildCalendarGrid(year: number, month: number): Date[] {
    const firstOfMonth = new Date(year, month, 1);
    const startSunday = new Date(firstOfMonth);
    startSunday.setDate(1 - firstOfMonth.getDay()); // back to nearest Sunday

    return Array.from({ length: 42 }, (_, i) => {
        const d = new Date(startSunday);
        d.setDate(d.getDate() + i);
        return d;
    });
}

/** Get a color for an event pill based on source/type */
function eventPillColor(event: CalendarEvent): string {
    if (event.is_focus_block) return '#8b5cf6';
    return event.source === 'google' ? '#3b82f6' : '#8b5cf6';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MonthView({ selectedDate, onDateChange }: MonthViewProps) {
    // Derive the displayed month from selectedDate
    const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
    const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);

    // Keep viewYear/viewMonth in sync when selectedDate changes from outside
    useEffect(() => {
        setViewYear(selectedDate.getFullYear());
        setViewMonth(selectedDate.getMonth());
    }, [selectedDate]);

    const viewDate = useMemo(() => new Date(viewYear, viewMonth, 1), [viewYear, viewMonth]);
    const { start: monthStart, end: monthEnd } = useMemo(
        () => getMonthRange(viewDate),
        [viewDate]
    );

    const calendarGrid = useMemo(
        () => buildCalendarGrid(viewYear, viewMonth),
        [viewYear, viewMonth]
    );

    const todayStr = toDateString(new Date());

    // ── Load events for the visible month ──────────────────────────────────────
    useEffect(() => {
        let mounted = true;

        async function load() {
            const db = await createDatabase();

            const eventDocs = await db.calendar_events.find({
                selector: {
                    start_time: {
                        $gte: monthStart.toISOString(),
                        $lte: monthEnd.toISOString(),
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
                    await syncCalendarEvents(db, monthStart, monthEnd);
                    const synced = await db.calendar_events.find({
                        selector: {
                            start_time: {
                                $gte: monthStart.toISOString(),
                                $lte: monthEnd.toISOString(),
                            },
                        },
                    }).exec();
                    if (mounted) {
                        setEvents(deduplicateEvents(synced.map(d => d.toJSON() as CalendarEvent)));
                    }
                } catch (err) {
                    console.error('[MonthView] Auto-sync failed:', err);
                } finally {
                    if (mounted) setIsSyncing(false);
                }
            }
        }

        load();
        return () => { mounted = false; };
    }, [monthStart, monthEnd]);

    // ── Events bucketed by date string ─────────────────────────────────────────
    const eventsByDate = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const event of events) {
            const key = toDateString(new Date(event.start_time));
            const existing = map.get(key) ?? [];
            existing.push(event);
            map.set(key, existing);
        }
        return map;
    }, [events]);

    // ── Navigation ────────────────────────────────────────────────────────────
    const navigateMonth = (delta: number) => {
        const next = new Date(viewYear, viewMonth + delta, 1);
        setViewYear(next.getFullYear());
        setViewMonth(next.getMonth());
    };

    const goToToday = () => {
        const today = new Date();
        setViewYear(today.getFullYear());
        setViewMonth(today.getMonth());
        onDateChange(today);
    };

    // ── Manual sync ────────────────────────────────────────────────────────────
    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const db = await createDatabase();
            await syncCalendarEvents(db, monthStart, monthEnd);
            const synced = await db.calendar_events.find({
                selector: {
                    start_time: {
                        $gte: monthStart.toISOString(),
                        $lte: monthEnd.toISOString(),
                    },
                },
            }).exec();
            setEvents(deduplicateEvents(synced.map(d => d.toJSON() as CalendarEvent)));
        } catch (err) {
            console.error('[MonthView] Manual sync failed:', err);
        } finally {
            setIsSyncing(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col text-white h-full">
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    <span className="text-base font-bold">Month View</span>
                    <span className="text-sm text-slate-400">
                        {formatMonthYear(viewDate)}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => navigateMonth(-1)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                        title="Previous month"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={goToToday}
                        className="px-2 py-0.5 text-xs hover:bg-white/10 rounded transition-colors"
                    >
                        Today
                    </button>
                    <button
                        onClick={() => navigateMonth(1)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                        title="Next month"
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

            {/* ── Day-of-week headers ── */}
            <div className="grid grid-cols-7 border-b border-white/10 flex-shrink-0">
                {DAY_HEADERS.map(day => (
                    <div
                        key={day}
                        className="py-1.5 text-center text-xs font-medium text-slate-500 uppercase tracking-wider"
                    >
                        {day}
                    </div>
                ))}
            </div>

            {/* ── Calendar grid ── */}
            <div className="grid grid-cols-7 flex-1 overflow-hidden">
                {calendarGrid.map((day, idx) => {
                    const dayStr = toDateString(day);
                    const isCurrentMonth = day.getMonth() === viewMonth;
                    const isToday = dayStr === todayStr;
                    const dayEvents = eventsByDate.get(dayStr) ?? [];
                    const visibleEvents = dayEvents.slice(0, MAX_PILLS);
                    const overflowCount = dayEvents.length - MAX_PILLS;

                    return (
                        <div
                            key={idx}
                            onClick={() => onDateChange(day)}
                            className={`
                                min-h-[80px] p-1 border-b border-r border-white/5
                                cursor-pointer transition-colors
                                ${isCurrentMonth ? 'hover:bg-white/5' : 'hover:bg-white/3'}
                                ${idx % 7 === 0 ? 'border-l border-white/5' : ''}
                            `}
                        >
                            {/* Date number */}
                            <div className="flex items-center justify-start mb-1">
                                <span
                                    className={`
                                        inline-flex items-center justify-center
                                        w-6 h-6 rounded-full text-xs font-semibold leading-none
                                        ${isToday
                                            ? 'bg-blue-500 text-white'
                                            : isCurrentMonth
                                                ? 'text-slate-200'
                                                : 'text-slate-600'
                                        }
                                    `}
                                >
                                    {day.getDate()}
                                </span>
                            </div>

                            {/* Event pills */}
                            <div className="flex flex-col gap-0.5">
                                {visibleEvents.map(event => {
                                    const color = eventPillColor(event);
                                    return (
                                        <div
                                            key={event.id}
                                            className="flex items-center rounded text-xs px-1 py-0.5 truncate"
                                            style={{
                                                backgroundColor: color + '22',
                                                borderLeft: `2px solid ${color}`,
                                            }}
                                            title={event.summary}
                                        >
                                            <span
                                                className="truncate text-xs leading-tight"
                                                style={{ color }}
                                            >
                                                {event.summary}
                                            </span>
                                        </div>
                                    );
                                })}

                                {/* Overflow indicator */}
                                {overflowCount > 0 && (
                                    <div className="text-xs text-slate-500 px-1 leading-tight">
                                        +{overflowCount} more
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
