import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { createDatabase } from '../db';
import { createTask } from '../services/task-rollover';
import { Sparkles, Target, Zap, ArrowRight, ArrowLeft, FolderOpen, Eye } from 'lucide-react';
import { DatePicker } from './DatePicker';
import type { Category, VisionBoard } from '../types/schema';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';

interface SubTaskInput {
    id: string;
    title: string;
    time_estimate_minutes: number;
    time_unit: 'minutes' | 'hours' | 'days' | 'months';
    due_date?: string;
}

interface RPMWizardProps {
    onClose?: () => void;
}

export function RPMWizard({ onClose }: RPMWizardProps) {
    const navigate = useNavigate();
    const [db] = useDatabase();
    const [categories] = useRxQuery<Category>(db?.categories);
    const [visions] = useRxQuery<VisionBoard>(db?.vision_board);
    const [currentSlide, setCurrentSlide] = useState(0);

    // Form state
    const [result, setResult] = useState('');
    const [purpose, setPurpose] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [subtasks, setSubtasks] = useState<SubTaskInput[]>([
        { id: uuidv4(), title: '', time_estimate_minutes: 30, time_unit: 'minutes', due_date: '' }
    ]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [selectedVision, setSelectedVision] = useState<string>('');

    const canProceedFromSlide = (slide: number): boolean => {
        if (slide === 0) return result.trim().length > 0;
        if (slide === 1) return purpose.trim().length > 0;
        if (slide === 2) return subtasks.some(t => t.title.trim().length > 0);
        return false;
    };

    const handleNext = () => {
        if (canProceedFromSlide(currentSlide)) {
            setCurrentSlide(prev => Math.min(prev + 1, 2));
        }
    };

    const handleBack = () => {
        setCurrentSlide(prev => Math.max(prev - 1, 0));
    };

    const addSubtask = () => {
        setSubtasks([...subtasks, { id: uuidv4(), title: '', time_estimate_minutes: 30, time_unit: 'minutes', due_date: '' }]);
    };

    const updateSubtask = (id: string, field: keyof SubTaskInput, value: string | number) => {
        setSubtasks(subtasks.map(st => st.id === id ? { ...st, [field]: value } : st));
    };

    const removeSubtask = (id: string) => {
        if (subtasks.length > 1) {
            setSubtasks(subtasks.filter(st => st.id !== id));
        }
    };

    const convertToMinutes = (value: number, unit: 'minutes' | 'hours' | 'days' | 'months'): number => {
        if (unit === 'minutes') return value;
        if (unit === 'hours') return value * 60; // hours to minutes
        if (unit === 'days') return value * 24 * 60; // days to minutes
        if (unit === 'months') return value * 30 * 24 * 60; // months to minutes (approximate)
        return value;
    };

    const handleSubmit = async () => {
        console.log('[RPM Wizard] Ignite Project clicked');
        console.log('[RPM Wizard] Form data:', { result, purpose, subtasks, dueDate });

        try {
            const db = await createDatabase();
            const projectId = uuidv4();
            const now = new Date().toISOString();

            console.log('[RPM Wizard] Creating project:', projectId);

            // Create project
            await db.projects.insert({
                id: projectId,
                title: result,
                status: 'active',
                motivation_payload: {
                    why: purpose,
                    impact_positive: '',
                    impact_negative: ''
                },
                metrics: {
                    total_time_estimated: subtasks.reduce((acc, st) => acc + convertToMinutes(st.time_estimate_minutes, st.time_unit), 0),
                    total_time_spent: 0,
                    optimism_ratio: 1.0
                },
                linked_vision_id: selectedVision || undefined,
                category_id: selectedCategory || undefined,
                due_date: dueDate || undefined,
                created_at: now,
                updated_at: now
            });

            console.log('[RPM Wizard] Project created successfully');

            // Create subtasks
            const validSubtasks = subtasks.filter(st => st.title.trim().length > 0);
            console.log('[RPM Wizard] Creating', validSubtasks.length, 'subtasks');

            for (let i = 0; i < validSubtasks.length; i++) {
                const st = validSubtasks[i];
                await db.sub_tasks.insert({
                    id: uuidv4(),
                    project_id: projectId,
                    title: st.title,
                    time_estimate_minutes: convertToMinutes(st.time_estimate_minutes, st.time_unit),
                    time_actual_minutes: 0,
                    is_completed: false,
                    sort_order: i,
                    updated_at: now
                });
            }

            console.log('[RPM Wizard] All subtasks created');

            // Create Task entities for each subtask so they appear in the persistent task list
            const existingTasks = await db.tasks.find({ selector: { status: 'active' } }).exec();
            const sortOrder = existingTasks.length;
            const today = new Date().toISOString().split('T')[0];

            for (let i = 0; i < validSubtasks.length; i++) {
                const st = validSubtasks[i];
                await createTask(db, {
                    title: st.title,
                    priority: 'medium',
                    status: 'active',
                    source: 'rpm_wizard',
                    created_date: today,
                    sort_order: sortOrder + i,
                    goal_id: projectId,
                    category_id: selectedCategory || '',
                    time_estimate_minutes: convertToMinutes(st.time_estimate_minutes, st.time_unit),
                    due_date: st.due_date || undefined,
                    tags: ['rpm-action'],
                });
            }

            console.log('[RPM Wizard] Created', validSubtasks.length, 'task entities');
            console.log('[RPM Wizard] Closing modal, onClose:', !!onClose);

            // Close modal or navigate back
            if (onClose) {
                console.log('[RPM Wizard] Calling onClose callback');
                onClose();
            } else {
                console.log('[RPM Wizard] Navigating to /');
                navigate('/');
            }
        } catch (err) {
            console.error('[RPM Wizard] Failed to create project:', err);
            alert(`Failed to create project: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const slideVariants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 1000 : -1000,
            opacity: 0
        }),
        center: {
            x: 0,
            opacity: 1
        },
        exit: (direction: number) => ({
            x: direction < 0 ? 1000 : -1000,
            opacity: 0
        })
    };

    const slides = [
        // Slide 0: Result
        <div key="result" className="space-y-6">
            <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/20 mb-4">
                    <Target className="w-8 h-8 text-blue-400" />
                </div>
                <h2 className="text-3xl font-bold">What's the Result?</h2>
                <p className="text-secondary text-lg">Define the specific outcome you want to achieve.</p>
            </div>

            <input
                type="text"
                value={result}
                onChange={(e) => setResult(e.target.value)}
                placeholder="e.g., Launch MVP of my SaaS product"
                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                autoFocus
            />

            {/* Category, Vision, and Due Date */}
            <div className="grid grid-cols-3 gap-3 mt-4">
                <div>
                    <label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" /> Life Bucket
                    </label>
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    >
                        <option value="">None</option>
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Vision
                    </label>
                    <select
                        value={selectedVision}
                        onChange={(e) => setSelectedVision(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    >
                        <option value="">None</option>
                        {visions.map(v => (
                            <option key={v.id} value={v.id}>{v.declaration}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-500 mb-1 block">Due Date</label>
                    <DatePicker value={dueDate} onChange={setDueDate} />
                </div>
            </div>
        </div>,

        // Slide 1: Purpose
        <div key="purpose" className="space-y-6">
            <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-500/20 mb-4">
                    <Sparkles className="w-8 h-8 text-rose-400" />
                </div>
                <h2 className="text-3xl font-bold">Why is this a MUST?</h2>
                <p className="text-secondary text-lg">Your purpose is your fuel. Make it compelling.</p>
            </div>

            <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="This matters because..."
                rows={6}
                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all resize-none"
                autoFocus
            />

            {purpose.trim().length === 0 && (
                <p className="text-amber-400 text-sm flex items-center gap-2">
                    <span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                    You cannot proceed without defining your "Why"
                </p>
            )}
        </div>,

        // Slide 2: Massive Action
        <div key="action" className="space-y-6">
            <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 mb-4">
                    <Zap className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-3xl font-bold">Massive Action Plan</h2>
                <p className="text-secondary text-lg">Break it down into executable milestones.</p>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {subtasks.map((st, idx) => (
                    <motion.div
                        key={st.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="relative flex gap-2 items-center"
                    >
                        <span className="text-secondary font-mono text-sm w-5">{idx + 1}.</span>
                        <input
                            type="text"
                            value={st.title}
                            onChange={(e) => updateSubtask(st.id, 'title', e.target.value)}
                            placeholder="Milestone title"
                            className="flex-1 px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                        />
                        <input
                            type="text"
                            inputMode="numeric"
                            value={st.time_estimate_minutes}
                            onChange={(e) => {
                                const value = e.target.value.replace(/^0+/, '') || '0';
                                updateSubtask(st.id, 'time_estimate_minutes', parseInt(value) || 0);
                            }}
                            className="w-14 px-2 py-2.5 bg-white/5 border border-white/10 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                        />
                        <select
                            value={st.time_unit}
                            onChange={(e) => updateSubtask(st.id, 'time_unit', e.target.value as 'minutes' | 'hours' | 'days' | 'months')}
                            className="w-16 px-1 py-2.5 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                        >
                            <option value="minutes">min</option>
                            <option value="hours">hrs</option>
                            <option value="days">days</option>
                            <option value="months">mos</option>
                        </select>

                        {/* Native Date Input - Icon only */}
                        <input
                            type="date"
                            value={st.due_date ? new Date(st.due_date).toISOString().split('T')[0] : ''}
                            onChange={(e) => {
                                const dateValue = e.target.value ? new Date(e.target.value).toISOString() : '';
                                updateSubtask(st.id, 'due_date', dateValue);
                            }}
                            className="w-10 px-2.5 py-2 bg-white/5 border border-white/10 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                            style={{ colorScheme: 'dark' }}
                        />

                        {subtasks.length > 1 && (
                            <button
                                onClick={() => removeSubtask(st.id)}
                                aria-label="Remove subtask"
                                className="text-red-400 hover:text-red-300 transition-colors p-1"
                            >
                                ✕
                            </button>
                        )}
                    </motion.div>
                ))}
            </div>

            <button
                onClick={addSubtask}
                className="w-full py-3 border border-dashed border-white/20 rounded-lg text-secondary hover:text-white hover:border-white/40 transition-all"
            >
                + Add Milestone
            </button>
        </div>
    ];

    const isModal = !!onClose;

    return (
        <div className={isModal
            ? "fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            : "min-h-screen bg-background flex items-center justify-center p-6"
        }>
            {isModal && (
                <div className="absolute inset-0" onClick={onClose} />
            )}
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-2xl glass-card p-12 relative overflow-hidden z-10"
            >
                {/* Progress Dots */}
                <div className="flex justify-center gap-2 mb-12">
                    {[0, 1, 2].map(idx => (
                        <motion.div
                            key={idx}
                            className={`h-2 rounded-full transition-all ${idx === currentSlide ? 'w-8 bg-blue-500' : 'w-2 bg-white/20' }`}
                            animate={{ width: idx === currentSlide ? 32 : 8 }}
                        />
                    ))}
                </div>

                {/* Slides */}
                <div className="relative min-h-[400px]">
                    <AnimatePresence mode="wait" custom={currentSlide}>
                        <motion.div
                            key={currentSlide}
                            custom={currentSlide}
                            variants={slideVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="absolute inset-0" > {slides[currentSlide]} </motion.div> </AnimatePresence> </div> {/* Navigation */} <div className="flex justify-between mt-12"> <button onClick={handleBack} disabled={currentSlide === 0} className="flex items-center gap-2 px-6 py-3 text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all" > <ArrowLeft className="w-5 h-5" /> Back </button> {currentSlide < 2 ? ( <button onClick={handleNext} disabled={!canProceedFromSlide(currentSlide)} className="flex items-center gap-2 px-8 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-white/10 disabled:cursor-not-allowed rounded-xl font-bold transition-all shadow-lg shadow-[rgba(59,130,246,0.2)] active:scale-95" > Next <ArrowRight className="w-5 h-5" /> </button> ) : ( <button onClick={handleSubmit} disabled={!canProceedFromSlide(currentSlide)} className="flex items-center gap-2 px-8 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-white/10 disabled:cursor-not-allowed rounded-xl font-bold transition-all shadow-lg shadow-[rgba(16,185,129,0.2)] active:scale-95" > Ignite Project <Zap className="w-5 h-5" /> </button> )} </div> {/* Close button */} <button onClick={() => onClose ? onClose() : navigate('/')}
                    aria-label="Close wizard"
                    className="absolute top-6 right-6 text-secondary hover:text-white transition-colors"
                >
                    ✕
                </button>
            </motion.div>
        </div>
    );
}
