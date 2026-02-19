import { lazy } from 'react';

// Lazy-load all dashboard widgets to reduce initial bundle size
const VisionBoardGallery = lazy(() =>
    import('../components/VisionBoardGallery').then((m) => ({ default: m.VisionBoardGallery }))
);
const WheelOfLife = lazy(() =>
    import('../components/WheelOfLife').then((m) => ({ default: m.WheelOfLife }))
);
const ProjectsList = lazy(() =>
    import('../components/ProjectsList').then((m) => ({ default: m.ProjectsList }))
);
const TaskDashboard = lazy(() =>
    import('../components/TaskDashboard').then((m) => ({ default: m.TaskDashboard }))
);
const JournalHistory = lazy(() =>
    import('../components/JournalHistory').then((m) => ({ default: m.JournalHistory }))
);
const DailyAgenda = lazy(() =>
    import('../components/DailyAgenda').then((m) => ({ default: m.DailyAgenda }))
);
const EmailDashboard = lazy(() =>
    import('../components/EmailDashboard').then((m) => ({ default: m.EmailDashboard }))
);
const CategoryManager = lazy(() =>
    import('../components/CategoryManager').then((m) => ({ default: m.CategoryManager }))
);
const PomodoroWidget = lazy(() =>
    import('../components/PomodoroWidget').then((m) => ({ default: m.PomodoroWidget }))
);
const HabitTracker = lazy(() =>
    import('../components/HabitTracker').then((m) => ({ default: m.HabitTracker }))
);
const OnePercentTracker = lazy(() =>
    import('../components/OnePercentTracker').then((m) => ({ default: m.OnePercentTracker }))
);
const MorningBriefWidget = lazy(() =>
  import('../components/v2/MorningBrief').then((m) => ({ default: m.MorningBrief }))
);
const SignalFeedWidget = lazy(() =>
  import('../components/v2/SignalFeed').then((m) => ({ default: m.SignalFeed }))
);
const StaffingDashboard = lazy(() =>
    import('../components/StaffingDashboard').then((m) => ({ default: m.StaffingDashboard }))
);
const FinancialDashboard = lazy(() =>
    import('../components/FinancialDashboard').then((m) => ({ default: m.FinancialDashboard }))
);
const ProjectStageWidget = lazy(() =>
  import('../components/v2/ProjectStageWidget').then((m) => ({ default: m.ProjectStageWidget }))
);
const AgentStatus = lazy(() =>
    import('../components/AgentStatus').then((m) => ({ default: m.AgentStatus }))
);

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
        defaultLayout: { x: 0, y: 30, w: 6, h: 6, minW: 3, minH: 4 }
    },
    {
        id: 'one-percent-tracker',
        component: OnePercentTracker,
        title: '1% Better',
        type: 'metric',
        defaultLayout: { x: 6, y: 30, w: 6, h: 6, minW: 3, minH: 4 }
    },
    {
        id: 'morning-brief',
        component: MorningBriefWidget,
        title: 'Morning Brief',
        type: 'interactive',
        defaultLayout: { x: 0, y: 36, w: 6, h: 6, minW: 4, minH: 4 }
    },
    {
        id: 'signal-feed',
        component: SignalFeedWidget,
        title: 'Signal Feed',
        type: 'interactive',
        defaultLayout: { x: 6, y: 36, w: 6, h: 6, minW: 4, minH: 4 }
    },
    {
        id: 'staffing-kpi',
        component: StaffingDashboard,
        title: 'Staffing KPIs',
        type: 'interactive',
        defaultLayout: { x: 9, y: 8, w: 3, h: 4, minW: 3, minH: 3 }
    },
    {
        id: 'financial-dashboard',
        component: FinancialDashboard,
        title: 'Finances',
        type: 'interactive',
        defaultLayout: { x: 0, y: 12, w: 3, h: 4, minW: 2, minH: 3 }
    },
    {
        id: 'project-stages',
        component: ProjectStageWidget,
        title: 'Project Stages',
        type: 'metric',
        defaultLayout: { x: 6, y: 42, w: 6, h: 4, minW: 3, minH: 3 }
    },
    {
        id: 'agent-status',
        component: AgentStatus,
        title: 'Agent Status',
        type: 'interactive',
        defaultLayout: { x: 9, y: 0, w: 3, h: 4, minW: 2, minH: 3 }
    }
];
