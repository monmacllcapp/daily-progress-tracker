import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { createTask } from '../services/task-rollover';
import { onMorningFlowComplete } from '../services/gamification';
import { trackEvent } from '../services/analytics';
import { useDatabase } from '../hooks/useDatabase';
import { EmailTriageCard } from './EmailTriageCard';
import type { CalendarEvent } from '../types/schema';
import type { MeetingLoadStats, EventConflict } from '../services/calendar-monitor';
import type { CalendarBriefing, FreeSlot } from '../services/calendar-ai';

const STEPS = [
    { id: 'intentions', title: 'Set Intentions', description: 'Gratitude, priorities, and grounding' },
    { id: 'calendar', title: 'Calendar Check', description: 'Review your day' },
    { id: 'email', title: 'Email Triage', description: 'Scan your inbox' },
];

interface MorningFlowProps {
    onComplete?: () => void;
}

export const MorningFlow: React.FC<MorningFlowProps> = ({ onComplete }) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const navigate = useNavigate();
    const [db] = useDatabase();

    const [formData, setFormData] = useState({
        gratitude: [''],
        non_negotiables: [''],
        stressors: [''],
    });

    const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
    const [meetingLoad, setMeetingLoad] = useState<MeetingLoadStats | null>(null);
    const [calendarConflicts, setCalendarConflicts] = useState<EventConflict[]>([]);
    const [calendarBriefing, setCalendarBriefing] = useState<CalendarBriefing | null>(null);
    const [freeSlots, setFreeSlots] = useState<FreeSlot[]>([]);
    const [isCalendarLoading, setIsCalendarLoading] = useState(false);
    const [isCalendarConnected, setIsCalendarConnected] = useState(false);
    const [calendarLoadKey, setCalendarLoadKey] = useState(0);

    // Load calendar data when entering the calendar step
    useEffect(() => {
        if (STEPS[currentStepIndex]?.id !== 'calendar') return;
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
                habits: {},
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

            console.log('[MorningFlow] Day ignited:', {
                gratitude: validGratitude.length,
                nonNegotiables: validNonNegotiables.length,
                stressors: validStressors.length,
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

    const currentStep = STEPS[currentStepIndex];
    const isFirst = currentStepIndex === 0;
    const isLast = currentStepIndex === STEPS.length - 1;

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
            case 'intentions':
                return (
                    <div className="space-y-6">
                        {/* Gratitude — blue accent */}
                        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6 border-l-4 border-l-blue-500">
                            <h3 className="text-lg font-semibold text-white mb-1">Gratitude</h3>
                            <p className="text-sm text-slate-400 mb-4">What are 3 things you are grateful for?</p>
                            <div className="space-y-3">
                                {formData.gratitude.map((item, i) => (
                                    <input
                                        key={i}
                                        type="text"
                                        autoFocus={i === 0}
                                        placeholder={`I am grateful for...`}
                                        value={item}
                                        onChange={(e) => updateArrayField('gratitude', i, e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                                    />
                                ))}
                            </div>
                        </div>

                        {/* 3 Must-Do's — rose accent */}
                        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6 border-l-4 border-l-rose-500">
                            <h3 className="text-lg font-semibold text-white mb-1">3 Must-Do's</h3>
                            <p className="text-sm text-slate-400 mb-4">These become today's high-priority tasks.</p>
                            <div className="space-y-3">
                                {formData.non_negotiables.map((item, i) => (
                                    <input
                                        key={i}
                                        type="text"
                                        placeholder={`Must-do #${i + 1}`}
                                        value={item}
                                        onChange={(e) => updateArrayField('non_negotiables', i, e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Ground — orange accent */}
                        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6 border-l-4 border-l-orange-500">
                            <h3 className="text-lg font-semibold text-white mb-1">Ground</h3>
                            <p className="text-sm text-slate-400 mb-4">Name it to tame it. These become relief tasks.</p>
                            <div className="space-y-3">
                                {formData.stressors.map((item, i) => (
                                    <input
                                        key={i}
                                        type="text"
                                        placeholder={`Stressor #${i + 1}`}
                                        value={item}
                                        onChange={(e) => updateArrayField('stressors', i, e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
                                    />
                                ))}
                            </div>
                        </div>
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
            case 'email':
                return <EmailTriageCard />;
            default:
                return null;
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-up">
            {/* Horizontal Stepper Bar */}
            <div className="flex items-center gap-2">
                {STEPS.map((step, i) => (
                    <React.Fragment key={step.id}>
                        {/* Step pill */}
                        <button
                            onClick={() => i < currentStepIndex && setCurrentStepIndex(i)}
                            disabled={i > currentStepIndex}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                                i === currentStepIndex
                                    ? 'bg-blue-500/20 border border-blue-500/50 text-blue-300'
                                    : i < currentStepIndex
                                    ? 'bg-green-500/10 border border-green-500/30 text-green-400 cursor-pointer hover:bg-green-500/20'
                                    : 'bg-white/5 border border-white/10 text-slate-500'
                            }`}
                        >
                            <span className="w-5 h-5 flex items-center justify-center text-xs">
                                {i < currentStepIndex ? '✓' : i + 1}
                            </span>
                            <span className="hidden sm:inline">{step.title}</span>
                        </button>
                        {/* Connector line */}
                        {i < STEPS.length - 1 && (
                            <div className={`flex-1 h-px min-w-[24px] ${
                                i < currentStepIndex ? 'bg-green-500/30' : 'bg-white/10'
                            }`} />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Step Content Card */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentStep.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="bg-slate-900/50 border border-white/10 rounded-2xl p-8"
                >
                    <h2 className="text-2xl font-bold text-white mb-2">
                        {currentStep.title}
                    </h2>
                    <p className="text-slate-400 mb-6">
                        {currentStep.description}
                    </p>

                    {renderStepContent()}

                    {/* Navigation buttons */}
                    <div className="flex justify-between items-center mt-8 pt-6 border-t border-white/10">
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
                </motion.div>
            </AnimatePresence>
        </div>
    );
};
