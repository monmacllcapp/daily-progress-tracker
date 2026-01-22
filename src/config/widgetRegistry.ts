import { VisionBoardGallery } from '../components/VisionBoardGallery';
import { WheelOfLife } from '../components/WheelOfLife';
import { ProjectsList } from '../components/ProjectsList';

export interface WidgetConfig {
    id: string;
    component: React.ComponentType<any>;
    title: string;
    type: 'metric' | 'chart' | 'table' | 'interactive';
    defaultLayout: { x: number; y: number; w: number; h: number; minW?: number; minH?: number };
}

export const WIDGET_REGISTRY: WidgetConfig[] = [
    {
        id: 'vision-board',
        component: VisionBoardGallery,
        title: 'Vision Board',
        type: 'interactive',
        defaultLayout: { x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 3 }
    },
    {
        id: 'wheel-of-life',
        component: WheelOfLife,
        title: 'Wheel of Life',
        type: 'chart',
        defaultLayout: { x: 6, y: 0, w: 6, h: 4, minW: 3, minH: 3 }
    },
    {
        id: 'projects-list',
        component: ProjectsList,
        title: 'Projects',
        type: 'table',
        defaultLayout: { x: 0, y: 4, w: 12, h: 4, minW: 4, minH: 3 }
    }
];
