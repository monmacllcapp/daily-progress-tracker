import React, { useState } from 'react';
import { Trash2, Plus, GripVertical, CheckCircle2, Circle } from 'lucide-react';
import type { ProjectData } from '../store/plannerStore';
import { usePlannerStore } from '../store/plannerStore';
import { clsx } from 'clsx';

interface ProjectCardProps {
    data: ProjectData;
    configId: string;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ data, configId }) => {
    const { updateProjectTitle, addTask, toggleTask, updateTask, deleteTask } = usePlannerStore();
    const [isHovering, setIsHovering] = useState(false);

    // Track editing state for tasks
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

    return (
        <div
            className="flex flex-col h-full"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            {/* Progress Bar (Emerald Line) */}
            <div className="h-0.5 w-full bg-slate-800">
                <div
                    className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                    style={{ width: `${data.progress}%` }}
                />
            </div>

            {/* Header / Title Input */}
            <div className="p-4 pb-2">
                <input
                    type="text"
                    value={data.title}
                    onChange={(e) => updateProjectTitle(configId, e.target.value)}
                    className="w-full bg-transparent text-lg font-bold text-slate-200 focus:outline-none placeholder-slate-600"
                    placeholder="Project Title"
                    onMouseDown={(e) => e.stopPropagation()} // Prevent drag start
                />
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500 uppercase tracking-widest font-medium">
                        {data.status} • {data.progress}% Done
                    </span>
                </div>
            </div>

            {/* Task List - Scrollable */}
            <div
                className="flex-1 overflow-y-auto px-4 pb-4 nodrag space-y-1 custom-scrollbar"
                onMouseDown={(e) => e.stopPropagation()} // Critical: allow selecting text/interaction
            >
                {data.tasks.map(task => (
                    <div
                        key={task.id}
                        className="group/task flex items-center gap-2 py-1.5 px-2 rounded hover:bg-white/5 transition-colors"
                    >
                        <button
                            onClick={() => toggleTask(configId, task.id)}
                            className={clsx(
                                "flex-shrink-0 transition-colors",
                                task.completed ? "text-emerald-500" : "text-slate-600 hover:text-slate-400"
                            )}
                        >
                            {task.completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                        </button>

                        <input
                            type="text"
                            value={task.text}
                            onChange={(e) => updateTask(configId, task.id, e.target.value)}
                            className={clsx(
                                "flex-1 bg-transparent text-sm focus:outline-none",
                                task.completed ? "text-slate-500 line-through" : "text-slate-300"
                            )}
                            onFocus={() => setEditingTaskId(task.id)}
                            onBlur={() => setEditingTaskId(null)}
                        />

                        <button
                            onClick={() => deleteTask(configId, task.id)}
                            className="opacity-0 group-hover/task:opacity-100 text-slate-600 hover:text-red-400 transition-all"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}

                {/* Empty State / Add Area */}
                <button
                    onClick={() => addTask(configId, "New Task")}
                    className="w-full py-2 flex items-center gap-2 text-xs text-slate-500 hover:text-emerald-400 transition-colors group mt-2 pl-2"
                >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Task</span>
                </button>
            </div>

            {/* Footer Badges (Optional) */}
            <div className="px-4 py-2 border-t border-white/5 flex justify-between items-center text-[10px] text-slate-600">
                <span>{data.tasks.length} Tasks</span>
                {data.dueDate && <span>Due {data.dueDate}</span>}
            </div>
        </div>
    );
};
