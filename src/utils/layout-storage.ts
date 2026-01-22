import type { Layout } from 'react-grid-layout';

export interface Layouts {
    [key: string]: Layout[];
}

export interface DashboardLayout {
    layouts: Layouts;
    version: number;
    updated_at: string;
}

const STORAGE_KEY = 'titan_dashboard_layout';
const LAYOUT_VERSION = 1;

export const defaultLayout: Layout[] = [
    // Vision Board - Top left, large
    { i: 'vision-board', x: 0, y: 0, w: 6, h: 4, minW: 4, minH: 3 },

    // Wheel of Life - Top right, square
    { i: 'wheel-of-life', x: 6, y: 0, w: 4, h: 4, minW: 3, minH: 3 },

    // Add Vision - Top right corner
    { i: 'add-vision', x: 10, y: 0, w: 2, h: 4, minW: 2, minH: 2 },

    // Today's Stressors - Bottom left, wide
    { i: 'todays-stressors', x: 0, y: 4, w: 6, h: 4, minW: 4, minH: 3 },

    // Projects - Bottom right, flexible
    { i: 'projects', x: 6, y: 4, w: 6, h: 4, minW: 4, minH: 2 },
];

export const saveLayout = (layouts: Layouts): void => {
    try {
        const data: DashboardLayout = {
            layouts,
            version: LAYOUT_VERSION,
            updated_at: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        console.log('[Layout] Saved to localStorage');
    } catch (error) {
        console.error('[Layout] Failed to save:', error);
    }
};

export const loadLayout = (): Layouts | null => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return null;

        const data: DashboardLayout = JSON.parse(stored);

        // Version check
        if (data.version !== LAYOUT_VERSION) {
            console.log('[Layout] Version mismatch, using default');
            return null;
        }

        console.log('[Layout] Loaded from localStorage');
        return data.layouts;
    } catch (error) {
        console.error('[Layout] Failed to load:', error);
        return null;
    }
};

export const resetLayout = (): void => {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[Layout] Reset to default');
    window.location.reload();
};
