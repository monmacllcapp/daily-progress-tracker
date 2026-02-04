import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { createDatabase } from '../db';
import { createTask } from '../services/task-rollover';
import { toggleHabitCompletion, syncHabitCategoryStreak } from '../services/habit-service';
import { onMorningFlowComplete } from '../services/gamification';
import { trackEvent } from '../services/analytics';
import type { Habit } from '../types/schema';

const steps = [
    { id: 'gratitude', title: 'Gratitude Stack', prompt: 'What are 3 things you are grateful for?' },
    { id: 'non_negotiables', title: '3 Non-Negotiable Wins', prompt: 'What are 3 things that if you did today, you\'d feel like it\'s a big win?' },
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
    const [dbHabits, setDbHabits] = useState<Habit[]>([]);

    const [formData, setFormData] = useState({
        gratitude: [''],
        non_negotiables: [''],
        stressors: [''],
        habits: {} as Record<string, boolean>
    });

    // Load dynamic habits from DB
    useEffect(() => {
        const load = async () => {
            try {
                const db = await createDatabase();
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
    }, []);

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
        try {
            const db = await createDatabase();
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
