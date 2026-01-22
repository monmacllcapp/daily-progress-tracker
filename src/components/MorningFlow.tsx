import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { createDatabase } from '../db';

const steps = [
    { id: 'gratitude', title: 'Gratitude Stack', prompt: 'What are 3 things you are grateful for?' },
    { id: 'stressors', title: 'Quick Wins', prompt: 'What stressors can you squash in <5 mins?' },
    { id: 'projects', title: '3 Non-Negotiables', prompt: 'The massive projects to move today.' },
];

interface MorningFlowProps {
    onComplete?: () => void;
}

export const MorningFlow: React.FC<MorningFlowProps> = ({ onComplete }) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        gratitude: [''],
        projects: [''],
        stressors: [''],
        habits: {} as Record<string, boolean>
    });

    // Helper to update array fields (gratitude, projects, stressors)
    const updateArrayField = (field: 'gratitude' | 'projects' | 'stressors', index: number, value: string) => {
        setFormData(prev => {
            const newArray = [...prev[field]];
            newArray[index] = value;
            // Auto-add new line if typing in the last one (up to 3)
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

            // 1. Create Daily Journal
            await db.daily_journal.insert({
                id: crypto.randomUUID(),
                date: timestamp,
                gratitude: formData.gratitude.filter(g => g.trim()),
                stressors: formData.stressors.filter(s => s.trim()),
                habits: formData.habits
            });

            // 2. Create Projects from "Project" inputs
            const validProjects = formData.projects.filter(p => p.trim());

            await Promise.all(validProjects.map(async (title) => {
                await db.projects.insert({
                    id: crypto.randomUUID(),
                    title: title,
                    status: 'active',
                    motivation_payload: { why: '', impact_positive: '', impact_negative: '' },
                    metrics: { total_time_estimated: 0, total_time_spent: 0, optimism_ratio: 1 },
                    created_at: timestamp,
                    updated_at: timestamp
                });
            }));

            console.log("Ignition Sequence Start...");

            // Call onComplete callback if provided
            if (onComplete) {
                onComplete();
            } else {
                navigate('/');
            }
        } catch (err) {
            console.error("Ignition Failed:", err);
            alert("System Failure. Check Console.");
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
                                autoFocus={i === 0} // Auto-focus first input
                                placeholder={`I am grateful for...`}
                                value={item}
                                onChange={(e) => updateArrayField('gratitude', i, e.target.value)}
                                className="w-full bg-white bg-opacity-5 border border-white border-opacity-10 rounded-lg p-4 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        ))}
                    </div>
                );
            case 'projects':
                return (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-500 mb-2">Identify 1-3 major outcomes.</p>
                        {formData.projects.map((item, i) => (
                            <input
                                key={i}
                                type="text"
                                autoFocus={i === 0}
                                placeholder={`Project #${i + 1}`}
                                value={item}
                                onChange={(e) => updateArrayField('projects', i, e.target.value)}
                                className="w-full bg-white bg-opacity-5 border border-white border-opacity-10 rounded-lg p-4 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
                            />
                        ))}
                    </div>
                );
            case 'stressors':
                return (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-500 mb-2">Name it to tame it.</p>
                        {formData.stressors.map((item, i) => (
                            <input
                                key={i}
                                type="text"
                                autoFocus={i === 0}
                                placeholder={`Stressor #${i + 1}`}
                                value={item}
                                onChange={(e) => updateArrayField('stressors', i, e.target.value)}
                                className="w-full bg-white bg-opacity-5 border border-white border-opacity-10 rounded-lg p-4 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
                            />
                        ))}
                    </div>
                );
            case 'habits':
                const defaultHabits = ['Hydrate', 'Meditate', 'Movement', 'Deep Work Block'];
                return (
                    <div className="grid grid-cols-2 gap-4">
                        {defaultHabits.map((habit) => (
                            <button
                                key={habit}
                                onClick={() => toggleHabit(habit)}
                                className={`p-6 rounded-xl border transition-all text-left ${formData.habits[habit]
                                    ? 'bg-blue-500 bg-opacity-20 border-blue-500 text-white'
                                    : 'bg-white bg-opacity-5 border-white border-opacity-10 text-slate-400 hover:bg-white hover:bg-opacity-10'
                                    }`}
                            >
                                <div className="font-bold mb-1">{habit}</div>
                                <div className="text-xs opacity-70">{formData.habits[habit] ? 'Completed' : 'Pending'}</div>
                            </button>
                        ))}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-1/2 bg-blue-500 bg-opacity-10 blur-[120px] rounded-full" />

            <AnimatePresence mode="wait">
                <motion.div
                    key={currentStep.id}
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 1.05, y: -20 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="relative z-10 w-full max-w-4xl" // Widened to max-w-4xl
                >
                    <div className="glass-panel p-12 rounded-2xl border-white border-opacity-5 shadow-2xl min-h-[500px] flex flex-col">
                        <motion.h6
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="text-blue-400 font-mono text-sm uppercase tracking-widest mb-4"
                        >
                            Step 0{currentStepIndex + 1} / 04
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

                        <div className="flex justify-between items-center mt-12 pt-8 border-t border-white border-opacity-10">
                            <button
                                onClick={handleBack}
                                disabled={isFirst}
                                className="text-slate-500 hover:text-white transition-colors disabled:opacity-0 px-6 py-2"
                            >
                                Back
                            </button>

                            <button
                                onClick={handleNext}
                                className="bg-white text-slate-950 px-8 py-3 rounded-lg font-bold hover:bg-slate-200 transition-all active:scale-95 shadow-lg shadow-white shadow-opacity-10"
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
