import React from 'react';
import { Project, SubTask } from '../types/schema';
import { PulseBar } from './PulseBar';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

interface ProjectCardProps {
    project: Project;
    subtasks: SubTask[];
    onOpenCoPilot: () => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, subtasks, onOpenCoPilot }) => {
    const { metrics, title, status } = project;

    // Example "optimism" color
    const optimismColor = metrics.optimism_ratio > 1.2 ? 'text-green-400' : metrics.optimism_ratio < 0.8 ? 'text-rose-400' : 'text-blue-400';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 relative group"
        >
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className={clsx("text-lg font-bold tracking-tight", status === 'completed' && "line-through text-slate-500")}>
                        {title}
                    </h3>
                    <div className="flex gap-4 mt-1 text-xs text-secondary font-mono">
                        <span>EST: {metrics.total_time_estimated}m</span>
                        <span className={optimismColor}>ACT: {metrics.total_time_spent}m</span>
                    </div>
                </div>
                <button
                    onClick={onOpenCoPilot}
                    className="p-2 rounded-full hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all text-blue-400"
                    title="Open AI Co-Pilot"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>
                </button>
            </div>

            <div className="mb-4">
                <PulseBar subtasks={subtasks} totalEstimatedMinutes={metrics.total_time_estimated} />
            </div>

            <div className="flex justify-between items-center text-xs text-slate-500">
                <span>{subtasks.filter(t => t.is_completed).length}/{subtasks.length} Milestones</span>
                {status === 'active' && <span className="text-blue-400/50 uppercase tracking-widest text-[10px]">Active Focus</span>}
            </div>
        </motion.div>
    );
};
