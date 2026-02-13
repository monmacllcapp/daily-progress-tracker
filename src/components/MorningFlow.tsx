import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { createTask } from '../services/task-rollover';
import { toggleHabitCompletion, syncHabitCategoryStreak } from '../services/habit-service';
import { onMorningFlowComplete } from '../services/gamification';
import { trackEvent } from '../services/analytics';
import { useDatabase } from '../hooks/useDatabase';
import type { Habit } from '../types/schema';
import type { CalendarEvent } from '../types/schema';
import type { MeetingLoadStats, EventConflict } from '../services/calendar-monitor';
import type { CalendarBriefing, FreeSlot } from '../services/calendar-ai';

const steps = [
    { id: 'gratitude', title: 'Gratitude Stack', prompt: 'What are 3 things you are grateful for?' },
    { id: 'non_negotiables', title: '3 Non-Negotiable Wins', prompt: 'What are 3 things that if you did today, you\'d feel like it\'s a big win?' },
    { id: 'calendar', title: 'Calendar Check', prompt: 'Here\'s what your day looks like.' },
    { id: 'stressors', title: 'Stress Relief', prompt: 'What stressors, if knocked off your plate, would bring you relief?' },
    { id: 'habits', title: 'Daily Habits', prompt: 'Check off your non-negotiable habits.' },
];

interface MorningFlowProps {
    onComplete?: () => void;
}

const DEFAULT_HABITS = ['Hydrate', 'Meditate', 'Movement', 'Deep Work Block'];

export const MorningFlow: React.FC<MorningFlowProps> = ({ onComplete }) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const navigate = useNavigate();
    const [db] = useDatabase();
    const [dbHabits, setDbHabits] = useState<Habit[]>([]);

    const [formData, setFormData] = useState({
        gratitude: [''],
        non_negotiables: [''],
        stressors: [''],
        habits: {} as Record<string, boolean>
    });

    const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
    const [meetingLoad, setMeetingLoad] = useState<MeetingLoadStats | null>(null);
    const [calendarConflicts, setCalendarConflicts] = useState<EventConflict[]>([]);
    const [calendarBriefing, setCalendarBriefing] = useState<CalendarBriefing | null>(null);
    const [freeSlots, setFreeSlots] = useState<FreeSlot[]>([]);
    const [isCalendarLoading, setIsCalendarLoading] = useState(false);
    const [isCalendarConnected, setIsCalendarConnected] = useState(false);
    const [calendarLoadKey, setCalendarLoadKey] = useState(0);

    // Load dynamic habits from DB
    useEffect(() => {
        const load = async () => {
            if (!db) return;
            try {
                const docs = await db.habits.find({
                    selector: { is_archived: false },
                    sort: [{ sort_order: 'asc' }],
                }).exec();
                setDbHabits(docs.map(d => d.toJSON() as Habit));
            } catch {
                // Fallback to defaults handled below
            }
        };
        load();
    }, [db]);

    // Load calendar data when entering the calendar step
    useEffect(() => {
        if (steps[currentStepIndex]?.id !== 'calendar') return;
        if (!db) return;

        const loadCalendarData = async () => {
            setIsCalendarLoading(true);
            try {
                const { isGoogleConnected } = await import('../services/google-auth');
                if (!isGoogleConnected()) {
                    setIsCalendarConnected(false);
                    setIsCalendarLoading(false);
                    return;
                }
                setIsCalendarConnected(true);

                const { syncCalendarEvents } = await import('../services/google-calendar');
                const { detectAllConflicts, getMeetingLoadStats } = await import('../services/calendar-monitor');
                const { computeFreeSlots, generateCalendarBriefing } = await import('../services/calendar-ai');

                const today = new Date();
                const dayStart = new Date(today);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(today);
                dayEnd.setHours(23, 59, 59, 999);

                // Sync fresh data from Google
                await syncCalendarEvents(db, dayStart, dayEnd);

                // Fetch local events for today
                const docs = await db.calendar_events.find({
                    selector: {
                        start_time: { $gte: dayStart.toISOString(), $lte: dayEnd.toISOString() }
                    }
                }).exec();
                const events = docs.map(d => d.toJSON() as CalendarEvent);
                setCalendarEvents(events);

                // Compute meeting load
                const load = await getMeetingLoadStats(db, today);
                setMeetingLoad(load);

                // Detect conflicts
                const conflicts = await detectAllConflicts(db, today);
                setCalendarConflicts(conflicts);

                // Compute free slots
                const slots = computeFreeSlots(events, today);
                setFreeSlots(slots);

                // Get active tasks for AI briefing
                const taskDocs = await db.tasks.find({ selector: { status: 'active' } }).exec();
                const tasks = taskDocs.map(d => d.toJSON());

                // AI briefing (non-blocking, may return null)
                generateCalendarBriefing(events, tasks as any, load, conflicts)
                    .then(briefing => { if (briefing) setCalendarBriefing(briefing); })
                    .catch(err => console.warn('[MorningFlow] AI briefing failed:', err));

            } catch (err) {
                console.error('[MorningFlow] Calendar data load failed:', err);
            } finally {
                setIsCalendarLoading(false);
            }
        };

        loadCalendarData();
    }, [currentStepIndex, calendarLoadKey, db]);

    const updateArrayField = (field: 'gratitude' | 'non_negotiables' | 'stressors', index: number, value: string) => {
        setFormData(prev => {
            const newArray = [...prev[field]];
            newArray[index] = value;
            if (index === newArray.length - 1 && value.trim() !== '' && newArray.length < 3) {
                newArray.push('');
            }
            return { ...prev, [field]: newArray };
        });
    };

    const toggleHabit = (habitId: string) => {
        setFormData(prev => ({
            ...prev,
            habits: { ...prev.habits, [habitId]: !prev.habits[habitId] }
        }));
    };

    const igniteDay = async () => {
        if (!db) {
            console.error('[MorningFlow] Database not initialized');
            alert('Database not ready. Please wait a moment and try again.');
            return;
        }

        try {
            const timestamp = new Date().toISOString();
            const today = timestamp.split('T')[0];

            const validGratitude = formData.gratitude.filter(g => g.trim());
            const validNonNegotiables = formData.non_negotiables.filter(n => n.trim());
            const validStressors = formData.stressors.filter(s => s.trim());

            // 1. Create Daily Journal
            await db.daily_journal.insert({
                id: crypto.randomUUID(),
                date: today,
                gratitude: validGratitude,
                non_negotiables: validNonNegotiables,
                stressors: validStressors,
                habits: formData.habits,
                created_at: timestamp,
                updated_at: timestamp,
            });

            // 2. Create Task entities from non-negotiable wins (high priority)
            const existingTasks = await db.tasks.find({ selector: { status: 'active' } }).exec();
            const nextSortOrder = existingTasks.length;

            await Promise.all(validNonNegotiables.map(async (title, i) => {
                await createTask(db, {
                    title,
                    priority: 'high',
                    status: 'active',
                    source: 'morning_flow',
                    created_date: today,
                    sort_order: nextSortOrder + i,
                    tags: ['non-negotiable'],
                });
            }));

            // 3. Create Task entities from stressors (medium priority, relief tag)
            await Promise.all(validStressors.map(async (title, i) => {
                await createTask(db, {
                    title,
                    priority: 'medium',
                    status: 'active',
                    source: 'morning_flow',
                    created_date: today,
                    sort_order: nextSortOrder + validNonNegotiables.length + i,
                    tags: ['relief'],
                });
            }));

            // 4. Persist habit completions to habit_completions collection
            if (dbHabits.length > 0) {
                const checkedHabitIds = Object.keys(formData.habits).filter(k => formData.habits[k]);
                await Promise.all(checkedHabitIds.map(async (habitId) => {
                    const completed = await toggleHabitCompletion(db, habitId, today);
                    if (completed) {
                        const habit = dbHabits.find(h => h.id === habitId);
                        if (habit) await syncHabitCategoryStreak(db, habit);
                    }
                }));
            }

            console.log('[MorningFlow] Day ignited:', {
                gratitude: validGratitude.length,
                nonNegotiables: validNonNegotiables.length,
                stressors: validStressors.length,
                habits: Object.keys(formData.habits).filter(k => formData.habits[k]).length,
            });

            // Award XP for completing morning flow
            onMorningFlowComplete(db).catch(err =>
                console.warn('[Gamification] Failed to award XP for morning flow:', err)
            );

            // Track morning flow completion (analytics)
            trackEvent(db, 'morning_flow_complete', {
                gratitude_count: validGratitude.length,
                non_negotiables_count: validNonNegotiables.length,
                stressors_count: validStressors.length,
                habits_checked: Object.keys(formData.habits).filter(k => formData.habits[k]).length,
            }).catch(err =>
                console.warn('[Analytics] Failed to track morning flow completion:', err)
            );

            if (onComplete) {
                onComplete();
            } else {
                navigate('/');
            }
        } catch (err) {
            console.error('Ignition Failed:', err);
            alert('System Failure. Check Console.');
        }
    };

    const currentStep = steps[currentStepIndex];
    const isFirst = currentStepIndex === 0;
    const isLast = currentStepIndex === steps.length - 1;

    const handleNext = () => {
        if (isLast) {
            igniteDay();
        } else {
            setCurrentStepIndex(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (!isFirst) {
            setCurrentStepIndex(prev => prev - 1);
        }
    };

    const renderStepContent = () => {
        switch (currentStep.id) {
            case 'gratitude':
                return (
                    <div className="space-y-4">
                        {formData.gratitude.map((item, i) => (
                            <input
                                key={i}
                                type="text"
                                autoFocus={i === 0}
                                placeholder={`I am grateful for...`}
                                value={item}
                                onChange={(e) => updateArrayField('gratitude', i, e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        ))}
                    </div>
                );
            case 'non_negotiables':
                return (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-500 mb-2">These become today's high-priority tasks.</p>
                        {formData.non_negotiables.map((item, i) => (
                            <input
                                key={i}
                                type="text"
                                autoFocus={i === 0}
                                placeholder={`Win #${i + 1}`}
                                value={item}
                                onChange={(e) => updateArrayField('non_negotiables', i, e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-4 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
                            />
                        ))}
                    </div>
                );
            case 'calendar': {
                const formatSlotTime = (iso: string) => {
                    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                };

                if (isCalendarLoading) {
                    return (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mr-3" />
                            <span className="text-slate-400">Loading calendar...</span>
                        </div>
                    );
                }

                if (!isCalendarConnected) {
                    return (
                        <div className="text-center py-12">
                            <div className="text-4xl mb-4">📅</div>
                            <p className="text-slate-400 mb-4">Connect Google Calendar to see your schedule and avoid conflicts.</p>
                            <button
                                onClick={async () => {
                                    try {
                                        const { requestGoogleAuth } = await import('../services/google-auth');
                                        await requestGoogleAuth();
                                        setCalendarLoadKey(k => k + 1);
                                    } catch (err) {
                                        console.error('Google connect failed:', err);
                                    }
                                }}
                                className="bg-blue-500/20 border border-blue-500/50 text-blue-400 px-6 py-3 rounded-lg hover:bg-blue-500/30 transition-colors"
                            >
                                Connect Google Calendar
                            </button>
                        </div>
                    );
                }

                return (
                    <div className="space-y-6">
                        {/* Meeting Load Bar */}
                        {meetingLoad && (
                            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-white font-semibold">Meeting Load</h3>
                                    <span className="text-sm text-slate-400">
                                        {meetingLoad.meetingCount} meeting{meetingLoad.meetingCount !== 1 ? 's' : ''} · {Math.round(meetingLoad.totalMeetingMinutes / 60 * 10) / 10}h booked · {Math.round(meetingLoad.totalFreeMinutes / 60 * 10) / 10}h free
                                    </span>
                                </div>
                                <div className="w-full bg-white/10 rounded-full h-3">
                                    <div
                                        className={`h-3 rounded-full transition-all ${meetingLoad.percentBooked > 70 ? 'bg-red-500' : meetingLoad.percentBooked > 40 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                        style={{ width: `${Math.min(meetingLoad.percentBooked, 100)}%` }}
                                    />
                                </div>
                                <div className="text-xs text-slate-500 mt-2">{meetingLoad.percentBooked}% of working day booked</div>
                            </div>
                        )}

                        {/* Conflict Alerts */}
                        {calendarConflicts.length > 0 && (
                            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-5">
                                <h3 className="text-orange-400 font-semibold mb-2">Conflicts Detected</h3>
                                {calendarConflicts.map((c, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm text-orange-300/80 mb-1">
                                        <span className="shrink-0 mt-0.5">&#9888;</span>
                                        <span>{c.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* AI Briefing */}
                        {calendarBriefing && (
                            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-5">
                                <h3 className="text-purple-400 font-semibold mb-2">AI Analysis</h3>
                                <p className="text-sm text-slate-300 mb-2">{calendarBriefing.summary}</p>
                                {calendarBriefing.insights.length > 0 && (
                                    <ul className="space-y-1">
                                        {calendarBriefing.insights.map((insight, i) => (
                                            <li key={i} className="text-xs text-purple-300/70">&#x2022; {insight}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        {/* Free Slots */}
                        {freeSlots.length > 0 && (
                            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                                <h3 className="text-white font-semibold mb-3">Free Slots</h3>
                                <div className="space-y-2">
                                    {freeSlots.map((slot, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm bg-white/5 rounded-lg px-4 py-2">
                                            <span className="text-slate-300">
                                                {formatSlotTime(slot.startTime)} - {formatSlotTime(slot.endTime)}
                                                <span className="text-slate-500 ml-2">({slot.durationMinutes}min)</span>
                                            </span>
                                            <span className="text-slate-500 text-xs">{slot.recommendation}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* No events fallback */}
                        {calendarEvents.length === 0 && !isCalendarLoading && (
                            <div className="text-center py-8 text-slate-500">
                                <p>No events on your calendar today. Clear day ahead!</p>
                            </div>
                        )}
                    </div>
                );
            }
            case 'stressors':
                return (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-500 mb-2">Name it to tame it. These become tasks you can knock out for relief.</p>
                        {formData.stressors.map((item, i) => (
                            <input
                                key={i}
                                type="text"
                                autoFocus={i === 0}
                                placeholder={`Stressor #${i + 1}`}
                                value={item}
                                onChange={(e) => updateArrayField('stressors', i, e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg p-4 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
                            />
                        ))}
                    </div>
                );
            case 'habits': {
                const habitList = dbHabits.length > 0
                    ? dbHabits.map(h => ({ key: h.id, label: h.name }))
                    : DEFAULT_HABITS.map(h => ({ key: h, label: h }));
                return (
                    <div className="grid grid-cols-2 gap-4">
                        {habitList.map((habit) => (
                            <button
                                key={habit.key}
                                onClick={() => toggleHabit(habit.key)}
                                className={`p-6 rounded-xl border transition-all text-left ${formData.habits[habit.key] ? 'bg-blue-500/20 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10' }`}
                            >
                                <div className="font-bold mb-1">{habit.label}</div>
                                <div className="text-xs opacity-70">{formData.habits[habit.key] ? 'Completed' : 'Pending'}</div>
                            </button>
                        ))}
                    </div>
                );
            }
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-1/2 bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />

            <AnimatePresence mode="wait">
                <motion.div
                    key={currentStep.id}
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 1.05, y: -20 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="relative z-10 w-full max-w-4xl"
                >
                    <div className="glass-panel p-12 rounded-2xl border-white/5 shadow-2xl min-h-[500px] flex flex-col">
                        <motion.h6
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="text-blue-400 font-mono text-sm uppercase tracking-widest mb-4"
                        >
                            Step {String(currentStepIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
                        </motion.h6>

                        <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">
                            {currentStep.title}
                        </h2>

                        <p className="text-xl text-slate-400 mb-8">
                            {currentStep.prompt}
                        </p>

                        <div className="flex-1">
                            {renderStepContent()}
                        </div>

                        <div className="flex justify-between items-center mt-12 pt-8 border-t border-white/10">
                            <button
                                onClick={handleBack}
                                disabled={isFirst}
                                className="text-slate-500 hover:text-white transition-colors disabled:opacity-0 px-6 py-2"
                            >
                                Back
                            </button>

                            <button
                                onClick={handleNext}
                                className="bg-white text-slate-950 px-8 py-3 rounded-lg font-bold hover:bg-slate-200 transition-all active:scale-95 shadow-lg shadow-white/10"
                            >
                                {isLast ? 'Ignite Day' : 'Next Step'}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};
