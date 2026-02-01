import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createDatabase } from '../db';
import { CategoryIcon } from './CategoryIcon';
import type { Category, Project, SubTask, Task } from '../types/schema';
import { X, TrendingUp, TrendingDown, Minus, Flame, ChevronRight } from 'lucide-react';

export function WheelOfLife() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [subtasks, setSubtasks] = useState<SubTask[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            const db = await createDatabase();

            db.categories.find({ sort: [{ sort_order: 'asc' }] }).$.subscribe(docs => {
                setCategories(docs.map(d => d.toJSON() as Category));
            });

            db.projects.find().$.subscribe(docs => {
                setProjects(docs.map(d => d.toJSON() as Project));
            });

            db.sub_tasks.find().$.subscribe(docs => {
                setSubtasks(docs.map(d => d.toJSON() as SubTask));
            });

            db.tasks.find().$.subscribe(docs => {
                setTasks(docs.map(d => d.toJSON() as Task));
            });
        };
        loadData();
    }, []);

    // Calculate progress per category (subtasks + tasks)
    const categoryProgress = useMemo(() => {
        const result: Record<string, number> = {};
        for (const cat of categories) {
            const catProjects = projects.filter(p => p.category_id === cat.id);
            const catSubtasks = subtasks.filter(st =>
                catProjects.some(p => p.id === st.project_id)
            );
            const catTasks = tasks.filter(t => t.category_id === cat.id);

            let totalItems = 0;
            let completedItems = 0;

            // Subtasks (milestones)
            totalItems += catSubtasks.length;
            completedItems += catSubtasks.filter(st => st.is_completed).length;

            // Tasks
            totalItems += catTasks.length;
            completedItems += catTasks.filter(t => t.status === 'completed').length;

            result[cat.id] = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
        }
        return result;
    }, [categories, projects, subtasks, tasks]);

    // Symmetry score: 0 = perfectly balanced, 1 = maximally imbalanced
    const symmetryScore = useMemo(() => {
        if (categories.length < 2) return 0;
        const values = categories.map(c => categoryProgress[c.id] || 0);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        if (mean === 0) return 0;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        // Normalize: stdDev / mean, capped at 1
        return Math.min(stdDev / Math.max(mean, 1), 1);
    }, [categories, categoryProgress]);

    const symmetryLabel = symmetryScore < 0.25 ? 'Balanced' : symmetryScore < 0.5 ? 'Slightly uneven' : 'Unbalanced';
    const symmetryColor = symmetryScore < 0.25 ? 'text-emerald-400' : symmetryScore < 0.5 ? 'text-amber-400' : 'text-red-400';

    const fallbackColors = ['#F59E0B', '#3B82F6', '#8B5CF6', '#6366F1', '#10B981', '#059669', '#1E40AF', '#EF4444'];

    if (categories.length === 0) {
        return (
            <div className="glass-card p-12 text-center">
                <h3 className="text-xl font-bold mb-3">Wheel of Life</h3>
                <p className="text-secondary text-sm">
                    Create categories in the Life Categories widget to see your life balance
                </p>
            </div>
        );
    }

    const segmentAngle = 360 / categories.length;
    const radius = 120;
    const centerX = 150;
    const centerY = 150;

    // Selected category detail
    const selectedCat = categories.find(c => c.id === selectedCategory);

    return (
        <div className="h-full w-full flex flex-col items-center justify-center p-4 overflow-y-auto">
            <h3 className="text-xl font-bold mb-2 text-center">Wheel of Life</h3>

            {/* Symmetry indicator */}
            <div className="flex items-center gap-2 mb-4">
                {symmetryScore < 0.25 ? (
                    <Minus className={`w-3 h-3 ${symmetryColor}`} />
                ) : symmetryScore < 0.5 ? (
                    <TrendingUp className={`w-3 h-3 ${symmetryColor}`} />
                ) : (
                    <TrendingDown className={`w-3 h-3 ${symmetryColor}`} />
                )}
                <span className={`text-xs font-medium ${symmetryColor}`}>{symmetryLabel}</span>
            </div>

            <div className="relative" style={{ width: '300px', height: '300px', margin: '0 auto' }}>
                <svg width="300" height="300" viewBox="0 0 300 300">
                    {/* Background circles */}
                    {[20, 40, 60, 80, 100].map((percent, i) => (
                        <circle
                            key={i}
                            cx={centerX}
                            cy={centerY}
                            r={(radius * percent) / 100}
                            fill="none"
                            stroke="rgba(255,255,255,0.05)"
                            strokeWidth="1"
                        />
                    ))}

                    {/* Category segments */}
                    {categories.map((category, index) => {
                        const startAngle = (index * segmentAngle - 90) * (Math.PI / 180);
                        const endAngle = ((index + 1) * segmentAngle - 90) * (Math.PI / 180);
                        const progress = categoryProgress[category.id] || 0;
                        const progressRadius = (radius * progress) / 100;

                        const x1 = centerX + Math.cos(startAngle) * radius;
                        const y1 = centerY + Math.sin(startAngle) * radius;
                        const x2 = centerX + Math.cos(endAngle) * radius;
                        const y2 = centerY + Math.sin(endAngle) * radius;

                        const px1 = centerX + Math.cos(startAngle) * progressRadius;
                        const py1 = centerY + Math.sin(startAngle) * progressRadius;
                        const px2 = centerX + Math.cos(endAngle) * progressRadius;
                        const py2 = centerY + Math.sin(endAngle) * progressRadius;

                        const color = category.color_theme || fallbackColors[index % fallbackColors.length];
                        const largeArcFlag = segmentAngle > 180 ? 1 : 0;
                        const isSelected = selectedCategory === category.id;

                        const outlinePath = `
                            M ${centerX} ${centerY}
                            L ${x1} ${y1}
                            A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
                            Z
                        `;

                        const progressPath = progressRadius > 0 ? `
                            M ${centerX} ${centerY}
                            L ${px1} ${py1}
                            A ${progressRadius} ${progressRadius} 0 ${largeArcFlag} 1 ${px2} ${py2}
                            Z
                        ` : '';

                        // Icon position: midpoint of the segment at 70% radius
                        const midAngle = (startAngle + endAngle) / 2;
                        const iconX = centerX + Math.cos(midAngle) * (radius * 0.7);
                        const iconY = centerY + Math.sin(midAngle) * (radius * 0.7);

                        return (
                            <g
                                key={category.id}
                                onClick={() => setSelectedCategory(isSelected ? null : category.id)}
                                style={{ cursor: 'pointer' }}
                            >
                                {/* Outline */}
                                <path
                                    d={outlinePath}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={isSelected ? 3 : 2}
                                    opacity={isSelected ? 0.8 : 0.3}
                                />

                                {/* Progress fill */}
                                {progressPath && (
                                    <motion.path
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: isSelected ? 0.8 : 0.6 }}
                                        transition={{ delay: index * 0.1 }}
                                        d={progressPath}
                                        fill={color}
                                    />
                                )}

                                {/* Milestone dots */}
                                {Array.from({ length: 10 }).map((_, dotIndex) => {
                                    const dotProgress = ((dotIndex + 1) * 10);
                                    const dotRadius = (radius * dotProgress) / 100;
                                    const dotX = centerX + Math.cos(midAngle) * dotRadius;
                                    const dotY = centerY + Math.sin(midAngle) * dotRadius;
                                    const isFilled = progress >= dotProgress;

                                    return (
                                        <motion.circle
                                            key={dotIndex}
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: index * 0.1 + dotIndex * 0.02 }}
                                            cx={dotX}
                                            cy={dotY}
                                            r={isFilled ? 4 : 3}
                                            fill={isFilled ? color : 'none'}
                                            stroke={color}
                                            strokeWidth={isFilled ? 0 : 1}
                                            opacity={isFilled ? 1 : 0.3}
                                        />
                                    );
                                })}

                                {/* Category label at edge */}
                                <text
                                    x={iconX}
                                    y={iconY}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fill="white"
                                    fontSize="8"
                                    fontWeight="bold"
                                    opacity={0.8}
                                >
                                    {Math.round(progress)}%
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Legend with streaks */}
            <div className="mt-6 grid grid-cols-2 gap-2 w-full max-w-xs">
                {categories.map((category, index) => {
                    const color = category.color_theme || fallbackColors[index % fallbackColors.length];
                    const progress = categoryProgress[category.id] || 0;

                    return (
                        <button
                            key={category.id}
                            onClick={() => setSelectedCategory(selectedCategory === category.id ? null : category.id)}
                            className={`flex items-center gap-2 p-1.5 rounded-lg transition-colors text-left ${
                                selectedCategory === category.id ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/30'
                            }`}
                        >
                            <div
                                className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: color + '30' }}
                            >
                                {category.icon ? (
                                    <CategoryIcon name={category.icon} className="w-3 h-3" style={{ color }} />
                                ) : (
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{category.name}</p>
                                <div className="flex items-center gap-1">
                                    <span className="text-xs text-secondary">{Math.round(progress)}%</span>
                                    {category.streak_count > 0 && (
                                        <span className="flex items-center gap-0.5 text-xs text-orange-400">
                                            <Flame className="w-3 h-3" />{category.streak_count}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <ChevronRight className="w-3 h-3 text-secondary flex-shrink-0" />
                        </button>
                    );
                })}
            </div>

            {/* Category Detail Drill-down */}
            <AnimatePresence>
                {selectedCat && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="mt-4 w-full max-w-xs bg-zinc-800/50 rounded-xl border border-zinc-700/30 p-3"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <CategoryIcon name={selectedCat.icon} className="w-4 h-4" style={{ color: selectedCat.color_theme }} />
                                <h4 className="text-sm font-bold">{selectedCat.name}</h4>
                            </div>
                            <button onClick={() => setSelectedCategory(null)} className="p-1 hover:bg-zinc-700 rounded">
                                <X className="w-3 h-3" />
                            </button>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-3">
                            <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${categoryProgress[selectedCat.id] || 0}%` }}
                                    transition={{ type: 'spring', stiffness: 100 }}
                                    className="h-full rounded-full"
                                    style={{ backgroundColor: selectedCat.color_theme }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-secondary mt-1">
                                <span>{Math.round(categoryProgress[selectedCat.id] || 0)}% complete</span>
                                {selectedCat.streak_count > 0 && (
                                    <span className="text-orange-400 flex items-center gap-0.5">
                                        <Flame className="w-3 h-3" /> {selectedCat.streak_count} day streak
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Stats */}
                        {(() => {
                            const catTasks = tasks.filter(t => t.category_id === selectedCat.id);
                            const catProjects = projects.filter(p => p.category_id === selectedCat.id);
                            const catSubtasks = subtasks.filter(st =>
                                catProjects.some(p => p.id === st.project_id)
                            );
                            const active = catTasks.filter(t => t.status === 'active').length;
                            const completed = catTasks.filter(t => t.status === 'completed').length;
                            const milestonesDone = catSubtasks.filter(st => st.is_completed).length;

                            return (
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-zinc-900/50 rounded-lg p-2">
                                        <p className="text-lg font-bold" style={{ color: selectedCat.color_theme }}>{active}</p>
                                        <p className="text-xs text-secondary">Active</p>
                                    </div>
                                    <div className="bg-zinc-900/50 rounded-lg p-2">
                                        <p className="text-lg font-bold text-emerald-400">{completed}</p>
                                        <p className="text-xs text-secondary">Done</p>
                                    </div>
                                    <div className="bg-zinc-900/50 rounded-lg p-2">
                                        <p className="text-lg font-bold text-blue-400">{milestonesDone}/{catSubtasks.length}</p>
                                        <p className="text-xs text-secondary">Milestones</p>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Recent projects */}
                        {(() => {
                            const catProjects = projects.filter(p => p.category_id === selectedCat.id);
                            if (catProjects.length === 0) return (
                                <p className="text-xs text-secondary mt-2">No projects in this category yet.</p>
                            );
                            return (
                                <div className="mt-2 space-y-1">
                                    {catProjects.slice(0, 3).map(p => (
                                        <div key={p.id} className="flex items-center gap-2 text-xs">
                                            <div
                                                className="w-1.5 h-1.5 rounded-full"
                                                style={{ backgroundColor: p.status === 'completed' ? '#10B981' : selectedCat.color_theme }}
                                            />
                                            <span className={p.status === 'completed' ? 'text-secondary line-through' : ''}>{p.title}</span>
                                        </div>
                                    ))}
                                    {catProjects.length > 3 && (
                                        <p className="text-xs text-secondary">+{catProjects.length - 3} more</p>
                                    )}
                                </div>
                            );
                        })()}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
