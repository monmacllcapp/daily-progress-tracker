import { useState, useEffect } from 'react';
import { createDatabase } from '../db';
import { ProjectCard } from './ProjectCard';
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
                <p>No projects yet. Click "New Project" to create one!</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {projects.map((project) => (
                <ProjectCard
                    key={project.id}
                    project={project}
                    subtasks={getProjectSubtasks(project.id)}
                    onOpenCoPilot={() => { }}
                />
            ))}
        </div>
    );
}
