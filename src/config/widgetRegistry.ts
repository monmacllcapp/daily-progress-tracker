import { VisionBoardGallery } from '../components/VisionBoardGallery';
import { WheelOfLife } from '../components/WheelOfLife';
import { ProjectsList } from '../components/ProjectsList';
import { TaskDashboard } from '../components/TaskDashboard';
import { JournalHistory } from '../components/JournalHistory';
import { DailyAgenda } from '../components/DailyAgenda';
import { EmailDashboard } from '../components/EmailDashboard';
import { CategoryManager } from '../components/CategoryManager';
import { PomodoroWidget } from '../components/PomodoroWidget';
import { HabitTracker } from '../components/HabitTracker';

export interface WidgetConfig {
    id: string;
    component: React.ComponentType;
    title: string;
    type: 'metric' | 'chart' | 'table' | 'interactive';
    defaultLayout: { x: number; y: number; w: number; h: number; minW?: number; minH?: number };
}

export const WIDGET_REGISTRY: WidgetConfig[] = [
    {
        id: 'task-dashboard',
        component: TaskDashboard,
        title: 'Tasks',
        type: 'interactive',
        defaultLayout: { x: 0, y: 0, w: 3, h: 4, minW: 2, minH: 3 }
    },
    {
        id: 'wheel-of-life',
        component: WheelOfLife,
        title: 'Wheel of Life',
        type: 'chart',
        defaultLayout: { x: 3, y: 0, w: 3, h: 4, minW: 2, minH: 3 }
    },
    {
        id: 'vision-board',
        component: VisionBoardGallery,
        title: 'Vision Board',
        type: 'interactive',
        defaultLayout: { x: 6, y: 0, w: 6, h: 4, minW: 4, minH: 3 }
    },
    {
        id: 'projects-list',
        component: ProjectsList,
        title: 'Projects',
        type: 'table',
        defaultLayout: { x: 0, y: 4, w: 3, h: 4, minW: 2, minH: 3 }
    },
    {
        id: 'journal-history',
        component: JournalHistory,
        title: 'Journal',
        type: 'interactive',
        defaultLayout: { x: 3, y: 4, w: 3, h: 4, minW: 2, minH: 3 }
    },
    {
        id: 'daily-agenda',
        component: DailyAgenda,
        title: 'Daily Agenda',
        type: 'interactive',
        defaultLayout: { x: 6, y: 4, w: 3, h: 4, minW: 2, minH: 3 }
    },
    {
        id: 'email-dashboard',
        component: EmailDashboard,
        title: 'Email Triage',
        type: 'interactive',
        defaultLayout: { x: 9, y: 4, w: 3, h: 4, minW: 2, minH: 3 }
    },
    {
        id: 'category-manager',
        component: CategoryManager,
        title: 'Life Categories',
        type: 'interactive',
        defaultLayout: { x: 0, y: 8, w: 3, h: 4, minW: 2, minH: 3 }
    },
    {
        id: 'pomodoro',
        component: PomodoroWidget,
        title: 'Pomodoro Timer',
        type: 'interactive',
        defaultLayout: { x: 3, y: 8, w: 3, h: 4, minW: 2, minH: 3 }
    },
    {
        id: 'habit-tracker',
        component: HabitTracker,
        title: 'Habit Tracker',
        type: 'interactive',
        defaultLayout: { x: 6, y: 8, w: 3, h: 4, minW: 2, minH: 3 }
    }
];
