import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { createDatabase } from '../db';
import type { Stressor, StressorMilestone } from '../types/schema';
import { v4 as uuidv4 } from 'uuid';
import { PulseBar } from './PulseBar';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';

export function TodaysStressors() {
    const [db] = useDatabase();
    const [stressors] = useRxQuery<Stressor>(db?.stressors, { selector: { is_today: true } });
    const [milestones] = useRxQuery<StressorMilestone>(db?.stressor_milestones);
    const [isAdding, setIsAdding] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newTimeEstimate, setNewTimeEstimate] = useState('30');

    const addStressor = async () => {
        if (!newTitle.trim()) return;

        try {
            const db = await createDatabase();
            await db.stressors.insert({
                id: uuidv4(),
                user_id: 'default-user',
                title: newTitle,
                description: newDescription,
                time_estimate_minutes: parseInt(newTimeEstimate) || 30,
                is_today: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            setNewTitle('');
            setNewDescription('');
            setNewTimeEstimate('30');
            setIsAdding(false);
        } catch (err) {
            console.error('Failed to add stressor:', err);
        }
    };

    const deleteStressor = async (id: string) => {
        try {
            const db = await createDatabase();
            const doc = await db.stressors.findOne(id).exec();
            if (doc) {
                await doc.remove();
            }
        } catch (err) {
            console.error('Failed to delete stressor:', err);
        }
    };

    const addMilestone = async (stressorId: string, title: string) => {
        if (!title.trim()) return;

        try {
            const db = await createDatabase();
            const existingMilestones = milestones.filter(m => m.stressor_id === stressorId);

            await db.stressor_milestones.insert({
                id: uuidv4(),
                stressor_id: stressorId,
                title: title.trim(),
                is_completed: false,
                sort_order: existingMilestones.length,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        } catch (err) {
            console.error('Failed to add milestone:', err);
        }
    };

    const toggleMilestone = async (milestoneId: string) => {
        try {
            const db = await createDatabase();
            const doc = await db.stressor_milestones.findOne(milestoneId).exec();
            if (doc) {
                await doc.patch({ is_completed: !doc.is_completed });
            }
        } catch (err) {
            console.error('Failed to toggle milestone:', err);
        }
    };

    const getStressorMilestones = (stressorId: string) => {
        return milestones
            .filter(m => m.stressor_id === stressorId)
            .sort((a, b) => a.sort_order - b.sort_order);
    };

    if (stressors.length === 0 && !isAdding) {
        return (
            <div className="text-center py-8">
                <p className="text-secondary text-sm mb-4">No urgent tasks for today</p>
                <button
                    onClick={() => setIsAdding(true)}
                    className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 rounded-lg text-sm font-medium transition-all"
                >
                    + Add Stressor
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Stressor Cards */}
            {stressors.map(stressor => {
                const stressorMilestones = getStressorMilestones(stressor.id);
                const totalEstimate = stressor.time_estimate_minutes;

                // Convert milestones to SubTask format for PulseBar
                const subtasksForBar = stressorMilestones.map((m) => ({
                    id: m.id,
                    project_id: stressor.id,
                    title: m.title,
                    time_estimate_minutes: totalEstimate / stressorMilestones.length,
                    time_actual_minutes: m.is_completed ? (totalEstimate / stressorMilestones.length) : 0,
                    is_completed: m.is_completed,
                    sort_order: m.sort_order,
                    created_at: m.created_at,
                    updated_at: m.updated_at
                }));

                return (
                    <motion.div
                        key={stressor.id}
                        layout
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card p-4 border-l-4 border-rose-500"
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                                <h4 className="font-bold text-lg">{stressor.title}</h4>
                                {stressor.description && (
                                    <p className="text-secondary text-sm mt-1">{stressor.description}</p>
                                )}
                            </div>
                            <button
                                onClick={() => deleteStressor(stressor.id)}
                                className="text-red-400 hover:text-red-300 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Progress Bar with Circles */}
                        {stressorMilestones.length > 0 && (
                            <div className="mb-3">
                                <PulseBar
                                    subtasks={subtasksForBar}
                                    totalEstimatedMinutes={totalEstimate}
                                />
                            </div>
                        )}

                        {/* Milestones */}
                        <div className="space-y-2">
                            {stressorMilestones.map(milestone => (
                                <div
                                    key={milestone.id}
                                    className="flex items-center gap-2 text-sm"
                                >
                                    <button
                                        onClick={() => toggleMilestone(milestone.id)}
                                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${milestone.is_completed ? 'bg-green-500 border-green-500' : 'border-white/30 hover:border-white/50' }`}
                                    >
                                        {milestone.is_completed && (
                                            <div className="w-2 h-2 bg-white rounded-sm" />
                                        )}
                                    </button>
                                    <span className={milestone.is_completed ? 'line-through text-secondary' : ''}>
                                        {milestone.title}
                                    </span>
                                </div>
                            ))}

                            {/* Add Milestone */}
                            <button
                                onClick={() => {
                                    const title = prompt('Milestone name:');
                                    if (title) addMilestone(stressor.id, title);
                                }}
                                className="text-xs text-secondary hover:text-white transition-colors"
                            >
                                + Add Milestone
                            </button>
                        </div>

                        {/* Time Estimate */}
                        <div className="mt-3 text-xs text-secondary">
                            Est: {stressor.time_estimate_minutes}m
                        </div>
                    </motion.div>
                );
            })}

            {/* Add New Stressor Form */}
            {isAdding ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-card p-4 border-l-4 border-rose-500/50"
                >
                    <input
                        autoFocus
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="What's stressing you out?"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <textarea
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                    />
                    <div className="flex gap-2 items-center mb-3">
                        <input
                            type="number"
                            value={newTimeEstimate}
                            onChange={(e) => setNewTimeEstimate(e.target.value)}
                            className="w-20 px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                        <span className="text-sm text-secondary">minutes</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsAdding(false)}
                            className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={addStressor}
                            className="flex-1 px-4 py-2 bg-rose-500 hover:bg-rose-600 rounded-lg font-bold transition-all"
                        >
                            Add Stressor
                        </button>
                    </div>
                </motion.div>
            ) : (
                <button
                    onClick={() => setIsAdding(true)}
                    className="w-full py-2 border border-dashed border-white/20 rounded-lg text-secondary hover:text-white hover:border-white/40 transition-all"
                >
                    + Add Stressor
                </button>
            )}
        </div>
    );
}
