import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createDatabase } from '../db';
import type { Category, Project, SubTask } from '../types/schema';

export function WheelOfLife() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [subtasks, setSubtasks] = useState<SubTask[]>([]);

    useEffect(() => {
        const loadData = async () => {
            const db = await createDatabase();

            db.categories.find().$.subscribe(docs => {
                setCategories(docs.map(d => d.toJSON()));
            });

            db.projects.find().$.subscribe(docs => {
                setProjects(docs.map(d => d.toJSON()));
            });

            db.sub_tasks.find().$.subscribe(docs => {
                setSubtasks(docs.map(d => d.toJSON()));
            });
        };
        loadData();
    }, []);

    const calculateCategoryProgress = (categoryId: string) => {
        const categoryProjects = projects.filter(p => p.category_id === categoryId);
        const categorySubtasks = subtasks.filter(st =>
            categoryProjects.some(p => p.id === st.project_id)
        );

        if (categorySubtasks.length === 0) return 0;

        const completed = categorySubtasks.filter(st => st.is_completed).length;
        const total = categorySubtasks.length;

        return (completed / total) * 100;
    };

    const categoryColors = [
        '#F59E0B', // Amber
        '#3B82F6', // Blue
        '#8B5CF6', // Purple
        '#6366F1', // Indigo
        '#10B981', // Emerald
        '#059669', // Green
        '#1E40AF', // Dark Blue
        '#EF4444', // Red
    ];

    if (categories.length === 0) {
        return (
            <div className="glass-card p-12 text-center">
                <h3 className="text-xl font-bold mb-3">Wheel of Life</h3>
                <p className="text-secondary text-sm">
                    Create categories in your vision board to see your life balance
                </p>
            </div>
        );
    }

    const segmentAngle = 360 / categories.length;
    const radius = 120;
    const centerX = 150;
    const centerY = 150;

    return (
        <div className="h-full w-full flex flex-col items-center justify-center p-4">
            <h3 className="text-xl font-bold mb-6 text-center">Wheel of Life</h3>

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
                        const progress = calculateCategoryProgress(category.id);
                        const progressRadius = (radius * progress) / 100;

                        const x1 = centerX + Math.cos(startAngle) * radius;
                        const y1 = centerY + Math.sin(startAngle) * radius;
                        const x2 = centerX + Math.cos(endAngle) * radius;
                        const y2 = centerY + Math.sin(endAngle) * radius;

                        const px1 = centerX + Math.cos(startAngle) * progressRadius;
                        const py1 = centerY + Math.sin(startAngle) * progressRadius;
                        const px2 = centerX + Math.cos(endAngle) * progressRadius;
                        const py2 = centerY + Math.sin(endAngle) * progressRadius;

                        const color = category.color_theme || categoryColors[index % categoryColors.length];

                        const largeArcFlag = segmentAngle > 180 ? 1 : 0;

                        // Segment outline
                        const outlinePath = `
              M ${centerX} ${centerY}
              L ${x1} ${y1}
              A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
              Z
            `;

                        // Progress fill
                        const progressPath = progressRadius > 0 ? `
              M ${centerX} ${centerY}
              L ${px1} ${py1}
              A ${progressRadius} ${progressRadius} 0 ${largeArcFlag} 1 ${px2} ${py2}
              Z
            ` : '';

                        return (
                            <g key={category.id}>
                                {/* Outline */}
                                <path
                                    d={outlinePath}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth="2"
                                    opacity="0.3"
                                />

                                {/* Progress fill */}
                                {progressPath && (
                                    <motion.path
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 0.6 }}
                                        transition={{ delay: index * 0.1 }}
                                        d={progressPath}
                                        fill={color}
                                    />
                                )}

                                {/* Milestone dots */}
                                {Array.from({ length: 10 }).map((_, dotIndex) => {
                                    const dotProgress = ((dotIndex + 1) * 10);
                                    const dotRadius = (radius * dotProgress) / 100;
                                    const midAngle = (startAngle + endAngle) / 2;
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
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Legend */}
            <div className="mt-8 grid grid-cols-2 gap-3">
                {categories.map((category, index) => {
                    const color = category.color_theme || categoryColors[index % categoryColors.length];
                    const progress = calculateCategoryProgress(category.id);

                    return (
                        <div key={category.id} className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: color }}
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{category.name}</p>
                                <p className="text-xs text-secondary">{Math.round(progress)}%</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
