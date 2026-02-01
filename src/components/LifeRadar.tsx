import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';
import { createDatabase } from '../db';
import type { Category, Project, SubTask } from '../types/schema';
import { TrendingUp, AlertTriangle } from 'lucide-react';

interface RadarDataPoint {
    category: string;
    value: number;
    color: string;
}

export function LifeRadar() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [subtasks, setSubtasks] = useState<SubTask[]>([]);

    useEffect(() => {
        const initData = async () => {
            const db = await createDatabase();

            // Subscribe to categories
            db.categories.find().$.subscribe(docs => {
                setCategories(docs.map(d => d.toJSON()));
            });

            // Subscribe to projects
            db.projects.find({ selector: { status: 'active' } }).$.subscribe(docs => {
                setProjects(docs.map(d => d.toJSON()));
            });

            // Subscribe to subtasks
            db.sub_tasks.find().$.subscribe(docs => {
                setSubtasks(docs.map(d => d.toJSON()));
            });
        };

        initData();
    }, []);

    const radarData = useMemo((): RadarDataPoint[] => {
        // Calculate growth score for each category
        return categories.map(cat => {
            // Find projects in this category
            const categoryProjects = projects.filter(p => p.category_id === cat.id);

            if (categoryProjects.length === 0) {
                return {
                    category: cat.name,
                    value: 0,
                    color: cat.color_theme
                };
            }

            // Get all subtasks for these projects
            const categorySubtasks = subtasks.filter(st =>
                categoryProjects.some(p => p.id === st.project_id)
            );

            if (categorySubtasks.length === 0) {
                return {
                    category: cat.name,
                    value: 0,
                    color: cat.color_theme
                };
            }

            // Calculate completion ratio
            const completedCount = categorySubtasks.filter(st => st.is_completed).length;
            const completionRatio = completedCount / categorySubtasks.length;

            // Add streak bonus (if completed something today)
            const today = new Date().toISOString().split('T')[0];
            const streakBonus = cat.last_active_date === today ? 0.1 : 0;

            // Final growth score (0-1 scale, converted to 0-100 for radar)
            const growthScore = Math.min(1, completionRatio + streakBonus);

            return {
                category: cat.name,
                value: growthScore * 100,
                color: cat.color_theme
            };
        });
    }, [categories, projects, subtasks]);

    const flatTireCategories = radarData.filter(d => d.value < 20);
    const averageGrowth = radarData.length > 0
        ? radarData.reduce((acc, d) => acc + d.value, 0) / radarData.length
        : 0;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-8 h-full flex flex-col"
        >
            <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                    <TrendingUp className="w-6 h-6 text-blue-400" />
                    Life Inflation Radar
                </h2>
                <p className="text-secondary text-sm">
                    Your 1% daily growth across life categories
                </p>
            </div>

            {radarData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-secondary">
                    <div className="text-center space-y-3">
                        <div className="text-4xl">🎯</div>
                        <p>No categories defined yet</p>
                        <p className="text-xs">Create categories to track your growth</p>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex-1 min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart data={radarData}>
                                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                <PolarAngleAxis
                                    dataKey="category"
                                    tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                                />
                                <PolarRadiusAxis
                                    angle={90}
                                    domain={[0, 100]}
                                    tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                                />
                                <Radar
                                    name="Growth"
                                    dataKey="value"
                                    stroke="#3b82f6"
                                    fill="#3b82f6"
                                    fillOpacity={0.3}
                                    strokeWidth={2}
                                    animationDuration={800}
                                    animationEasing="ease-out"
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Stats */}
                    <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-secondary text-sm">Average Growth</span>
                            <span className="text-xl font-bold text-blue-400">
                                {averageGrowth.toFixed(1)}%
                            </span>
                        </div>

                        {flatTireCategories.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
                            >
                                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5 animate-pulse" />
                                <div className="flex-1">
                                    <p className="font-bold text-red-300">Needs Attention</p>
                                    <p className="text-red-300 text-xs/70 mt-1">
                                        Review lowest scores
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </>
            )}
        </motion.div>
    );
}
