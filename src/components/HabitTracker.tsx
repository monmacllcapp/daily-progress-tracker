import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, Flame, ChevronDown, ChevronRight, X } from 'lucide-react';
import { createDatabase } from '../db';
import type { TitanDatabase } from '../db';
import type { Habit, HabitCompletion, Category } from '../types/schema';
import { getHabitStreak, isHabitDueToday, toggleHabitCompletion, syncHabitCategoryStreak } from '../services/habit-service';

const PRESET_COLORS = ['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899'];

const FREQUENCY_OPTIONS: { value: Habit['frequency']; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekdays', label: 'Weekdays' },
    { value: 'weekends', label: 'Weekends' },
];

function getToday(): string {
    return new Date().toISOString().split('T')[0];
}

function getLast7Days(): string[] {
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
    }
    return days;
}

function getLast28Days(): string[] {
    const days: string[] = [];
    for (let i = 27; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
    }
    return days;
}

interface HabitRowProps {
    habit: Habit;
    completions: HabitCompletion[];
    onToggle: (habitId: string) => void;
    categories: Category[];
}

function HabitRow({ habit, completions, onToggle, categories }: HabitRowProps) {
    const [expanded, setExpanded] = useState(false);
    const today = getToday();
    const last7 = getLast7Days();
    const last28 = getLast28Days();
    const completionDates = new Set(completions.map(c => c.date));
    const isCompletedToday = completionDates.has(today);
    const isDue = isHabitDueToday(habit);
    const streak = getHabitStreak(completions);
    const category = categories.find(c => c.id === habit.category_id);

    // Completion rate
    const last28Completions = last28.filter(d => completionDates.has(d)).length;
    const completionRate = Math.round((last28Completions / 28) * 100);

    return (
        <div className="border border-white/5 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 p-3">
                {/* Icon circle */}
                <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: `${habit.color || '#6366f1'}20`, color: habit.color || '#6366f1' }}
                >
                    {habit.name.charAt(0).toUpperCase()}
                </div>

                {/* Name - clickable to expand */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex-1 min-w-0 text-left flex items-center gap-1"
                >
                    {expanded ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                    <span className="text-sm text-white truncate">{habit.name}</span>
                </button>

                {/* Last 7 days dots */}
                <div className="hidden sm:flex items-center gap-0.5">
                    {last7.map(day => (
                        <div
                            key={day}
                            className={`w-2 h-2 rounded-full ${completionDates.has(day) ? '' : 'bg-white/10'}`}
                            style={completionDates.has(day) ? { backgroundColor: habit.color || '#6366f1' } : undefined}
                        />
                    ))}
                </div>

                {/* Current streak */}
                {streak.current > 0 && (
                    <div className="flex items-center gap-0.5 text-xs text-orange-400">
                        <Flame className="w-3 h-3" />
                        <span>{streak.current}</span>
                    </div>
                )}

                {/* Today toggle */}
                <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => onToggle(habit.id)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors ${
                        isCompletedToday
                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                            : isDue
                                ? 'border-white/20 text-transparent hover:border-white/40'
                                : 'border-white/10 text-transparent opacity-50'
                    }`}
                >
                    <AnimatePresence mode="wait">
                        {isCompletedToday && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                                transition={{ type: 'spring', damping: 15, stiffness: 400 }}
                            >
                                <Check className="w-4 h-4" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.button>
            </div>

            {/* Expanded detail */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
                            {/* 4-week contribution grid */}
                            <div>
                                <p className="text-xs text-slate-500 mb-1.5">Last 4 weeks</p>
                                <div className="grid grid-cols-7 gap-1">
                                    {last28.map(day => (
                                        <div
                                            key={day}
                                            className={`aspect-square rounded-sm ${
                                                completionDates.has(day) ? '' : 'bg-white/5'
                                            }`}
                                            style={completionDates.has(day) ? { backgroundColor: `${habit.color || '#6366f1'}80` } : undefined}
                                            title={day}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Stats row */}
                            <div className="flex items-center gap-4 text-xs">
                                <div>
                                    <span className="text-slate-500">Current: </span>
                                    <span className="text-white font-medium">{streak.current} days</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Longest: </span>
                                    <span className="text-white font-medium">{streak.longest} days</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Rate: </span>
                                    <span className="text-white font-medium">{completionRate}%</span>
                                </div>
                            </div>

                            {/* Linked category */}
                            {category && (
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color_theme }} />
                                    <span className="text-xs text-slate-400">{category.name}</span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function HabitTracker() {
    const [habits, setHabits] = useState<Habit[]>([]);
    const [completions, setCompletions] = useState<HabitCompletion[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [dbRef, setDbRef] = useState<TitanDatabase | null>(null);

    // Add form state
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
    const [newCategoryId, setNewCategoryId] = useState('');
    const [newFrequency, setNewFrequency] = useState<Habit['frequency']>('daily');

    useEffect(() => {
        const subs: { unsubscribe: () => void }[] = [];

        const init = async () => {
            const db = await createDatabase();
            setDbRef(db);

            subs.push(
                db.habits.find({
                    selector: { is_archived: false },
                    sort: [{ sort_order: 'asc' }],
                }).$.subscribe(docs => {
                    setHabits(docs.map(d => d.toJSON() as Habit));
                })
            );

            subs.push(
                db.habit_completions.find().$.subscribe(docs => {
                    setCompletions(docs.map(d => d.toJSON() as HabitCompletion));
                })
            );

            subs.push(
                db.categories.find().$.subscribe(docs => {
                    setCategories(docs.map(d => d.toJSON() as Category));
                })
            );
        };

        init();
        return () => subs.forEach(s => s.unsubscribe());
    }, []);

    const handleToggle = useCallback(async (habitId: string) => {
        if (!dbRef) return;
        const today = getToday();
        const completed = await toggleHabitCompletion(dbRef, habitId, today);

        if (completed) {
            const habit = habits.find(h => h.id === habitId);
            if (habit) {
                await syncHabitCategoryStreak(dbRef, habit);
            }
        }
    }, [dbRef, habits]);

    const handleAddHabit = async () => {
        if (!dbRef || !newName.trim()) return;
        const timestamp = new Date().toISOString();

        await dbRef.habits.insert({
            id: crypto.randomUUID(),
            name: newName.trim(),
            color: newColor,
            category_id: newCategoryId || undefined,
            frequency: newFrequency,
            sort_order: habits.length,
            is_archived: false,
            created_at: timestamp,
            updated_at: timestamp,
        });

        setNewName('');
        setNewColor(PRESET_COLORS[0]);
        setNewCategoryId('');
        setNewFrequency('daily');
        setShowAddForm(false);
    };

    const habitCompletions = (habitId: string) =>
        completions.filter(c => c.habit_id === habitId);

    // Empty state
    if (habits.length === 0 && !showAddForm) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-slate-400 mb-1">Build your streak.</p>
                <p className="text-sm text-slate-500 mb-4">Add your first habit.</p>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors text-sm font-medium"
                >
                    <Plus className="w-4 h-4" />
                    Add Habit
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">
                    {habits.filter(h => {
                        const isDone = completions.some(c => c.habit_id === h.id && c.date === getToday());
                        return isDone;
                    }).length}/{habits.filter(h => isHabitDueToday(h)).length} today
                </span>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                    {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
            </div>

            {/* Add form */}
            <AnimatePresence>
                {showAddForm && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-3">
                            <input
                                type="text"
                                placeholder="Habit name"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                                autoFocus
                            />

                            {/* Color swatches */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">Color:</span>
                                {PRESET_COLORS.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => setNewColor(color)}
                                        className={`w-5 h-5 rounded-full transition-transform ${newColor === color ? 'ring-2 ring-white/40 scale-110' : ''}`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>

                            {/* Category dropdown */}
                            {categories.length > 0 && (
                                <select
                                    value={newCategoryId}
                                    onChange={e => setNewCategoryId(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="">No category</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            )}

                            {/* Frequency */}
                            <div className="flex gap-2">
                                {FREQUENCY_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setNewFrequency(opt.value)}
                                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                            newFrequency === opt.value
                                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                                : 'bg-white/5 text-slate-400 border border-white/10'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>

                            {/* Save / Cancel */}
                            <div className="flex gap-2">
                                <button
                                    onClick={handleAddHabit}
                                    disabled={!newName.trim()}
                                    className="flex-1 px-3 py-2 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-sm font-medium disabled:opacity-40 transition-colors"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => setShowAddForm(false)}
                                    className="px-3 py-2 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 text-sm transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Habit list */}
            <div className="space-y-1.5">
                {habits.map(habit => (
                    <HabitRow
                        key={habit.id}
                        habit={habit}
                        completions={habitCompletions(habit.id)}
                        onToggle={handleToggle}
                        categories={categories}
                    />
                ))}
            </div>
        </div>
    );
}
