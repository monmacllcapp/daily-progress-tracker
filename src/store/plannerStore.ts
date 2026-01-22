import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

// --- Types ---

export interface Task {
    id: string;
    text: string;
    completed: boolean;
}

export interface ProjectData {
    id: string; // Matches widgetId for 1:1 project widgets
    title: string;
    description: string;
    status: 'planning' | 'active' | 'completed';
    dueDate: string | null;
    tasks: Task[];
    progress: number; // 0-100
}

export interface LayoutConfig {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface WidgetConfig {
    id: string;
    type: 'project-card' | 'note-card' | 'timer';
    layout: LayoutConfig;
    data: ProjectData; // State is INSIDE the widget config for simplicity in this architecture
}

interface PlannerState {
    widgets: WidgetConfig[];

    // Actions
    addWidget: (type: WidgetConfig['type']) => void;
    removeWidget: (id: string) => void;
    updateLayout: (updates: { id: string; layout: LayoutConfig }[]) => void;

    // Project Specific Actions
    updateProjectTitle: (widgetId: string, title: string) => void;
    addTask: (widgetId: string, text: string) => void;
    toggleTask: (widgetId: string, taskId: string) => void;
    updateTask: (widgetId: string, taskId: string, text: string) => void;
    deleteTask: (widgetId: string, taskId: string) => void;
}

// --- Logic Helpers ---

const calculateProgress = (tasks: Task[]): number => {
    if (tasks.length === 0) return 0;
    const completed = tasks.filter(t => t.completed).length;
    return Math.round((completed / tasks.length) * 100);
};

// --- Store ---

export const usePlannerStore = create<PlannerState>()(
    persist(
        (set) => ({
            widgets: [
                // Default initial widget if empty
                {
                    id: 'default-project-1',
                    type: 'project-card',
                    layout: { x: 0, y: 0, w: 4, h: 4 }, // 12 col grid, so 1/3 width
                    data: {
                        id: 'default-project-1',
                        title: 'My First Project',
                        description: 'Start dragging things around!',
                        status: 'active',
                        dueDate: null,
                        tasks: [
                            { id: 't1', text: 'Explore the grid', completed: false },
                            { id: 't2', text: 'Add a new task', completed: false }
                        ],
                        progress: 0
                    }
                }
            ],

            addWidget: (type) => set((state) => {
                const id = uuidv4();
                const newWidget: WidgetConfig = {
                    id,
                    type,
                    // Default placement: top left, or seek empty space (simplified to 0,0 for RGL gravity to handle)
                    layout: { x: 0, y: Infinity, w: 4, h: 4 },
                    data: {
                        id,
                        title: 'New Project',
                        description: '',
                        status: 'planning',
                        dueDate: null,
                        tasks: [],
                        progress: 0
                    }
                };
                return { widgets: [...state.widgets, newWidget] };
            }),

            removeWidget: (id) => set((state) => ({
                widgets: state.widgets.filter(w => w.id !== id)
            })),

            updateLayout: (updates) => set((state) => {
                const widgetMap = new Map(state.widgets.map(w => [w.id, w]));

                updates.forEach(u => {
                    const widget = widgetMap.get(u.id);
                    if (widget) {
                        widget.layout = { ...widget.layout, ...u.layout };
                    }
                });

                return { widgets: Array.from(widgetMap.values()) };
            }),

            updateProjectTitle: (widgetId, title) => set((state) => ({
                widgets: state.widgets.map(w =>
                    w.id === widgetId
                        ? { ...w, data: { ...w.data, title } }
                        : w
                )
            })),

            addTask: (widgetId, text) => set((state) => ({
                widgets: state.widgets.map(w => {
                    if (w.id !== widgetId) return w;

                    const newTasks = [
                        ...w.data.tasks,
                        { id: uuidv4(), text, completed: false }
                    ];

                    return {
                        ...w,
                        data: {
                            ...w.data,
                            tasks: newTasks,
                            progress: calculateProgress(newTasks)
                        }
                    };
                })
            })),

            toggleTask: (widgetId, taskId) => set((state) => ({
                widgets: state.widgets.map(w => {
                    if (w.id !== widgetId) return w;

                    const newTasks = w.data.tasks.map(t =>
                        t.id === taskId ? { ...t, completed: !t.completed } : t
                    );

                    return {
                        ...w,
                        data: {
                            ...w.data,
                            tasks: newTasks,
                            progress: calculateProgress(newTasks)
                        }
                    };
                })
            })),

            updateTask: (widgetId, taskId, text) => set((state) => ({
                widgets: state.widgets.map(w => {
                    if (w.id !== widgetId) return w;
                    const newTasks = w.data.tasks.map(t =>
                        t.id === taskId ? { ...t, text } : t
                    );
                    return { ...w, data: { ...w.data, tasks: newTasks } };
                })
            })),

            deleteTask: (widgetId, taskId) => set((state) => ({
                widgets: state.widgets.map(w => {
                    if (w.id !== widgetId) return w;
                    const newTasks = w.data.tasks.filter(t => t.id !== taskId);
                    return {
                        ...w,
                        data: {
                            ...w.data,
                            tasks: newTasks,
                            progress: calculateProgress(newTasks)
                        }
                    };
                })
            }))
        }),
        {
            name: 'titan-planner-storage', // unique name
            storage: createJSONStorage(() => localStorage),
        }
    )
);
