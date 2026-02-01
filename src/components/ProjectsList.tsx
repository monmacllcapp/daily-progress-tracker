import { useState, useEffect } from 'react';
import { createDatabase } from '../db';
import type { Project, SubTask } from '../types/schema';

export function ProjectsList() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [subtasks, setSubtasks] = useState<SubTask[]>([]);

    useEffect(() => {
        const loadData = async () => {
            const db = await createDatabase();

            db.projects.find().$.subscribe(docs => {
                setProjects(docs.map(d => d.toJSON()));
            });

            db.sub_tasks.find().$.subscribe(docs => {
                setSubtasks(docs.map(d => d.toJSON()));
            });
        };

        loadData();
    }, []);

    const getProjectSubtasks = (projectId: string) => {
        return subtasks
            .filter(st => st.project_id === projectId)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    };

    if (projects.length === 0) {
        return (
            <div className="text-center text-secondary py-8">
                <p>No projects yet. Click &quot;New Project&quot; to create one!</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {projects.map((project) => {
                const projectSubtasks = getProjectSubtasks(project.id);
                const completedCount = projectSubtasks.filter(st => st.is_completed).length;
                const progress = projectSubtasks.length > 0
                    ? Math.round((completedCount / projectSubtasks.length) * 100)
                    : 0;
                return (
                    <div key={project.id} className="bg-slate-800/50 rounded-lg border border-white/5 p-4">
                        <h3 className="text-lg font-bold text-slate-200">{project.title}</h3>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                            <span>{project.status} &bull; {progress}% Done</span>
                            <span>&bull; {projectSubtasks.length} subtasks</span>
                        </div>
                        <div className="h-0.5 w-full bg-slate-800 mt-2">
                            <div
                                className="h-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
