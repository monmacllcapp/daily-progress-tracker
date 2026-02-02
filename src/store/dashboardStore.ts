import { create } from 'zustand';
import type { Layout } from 'react-grid-layout';
import { WIDGET_REGISTRY } from '../config/widgetRegistry';

interface DashboardState {
    layouts: Layout[];
    hiddenWidgets: string[];
    isSidebarOpen: boolean;

    // Actions
    updateLayout: (newLayout: Layout[]) => void;
    updateWidgetHeight: (widgetId: string, h: number) => void;
    toggleWidgetVisibility: (widgetId: string) => void;
    setSidebarOpen: (isOpen: boolean) => void;
    resetLayout: () => void;
    loadLayout: () => void;
}

const STORAGE_KEY = 'titan_glass_layout_v5';

function getDefaultLayouts(): Layout[] {
    return WIDGET_REGISTRY.map(w => ({
        i: w.id,
        ...w.defaultLayout
    }));
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
    // Start with defaults so widgets render immediately
    layouts: getDefaultLayouts(),
    hiddenWidgets: [],
    isSidebarOpen: false,

    updateLayout: (newLayout) => {
        set({ layouts: newLayout });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            layouts: newLayout,
            hiddenWidgets: get().hiddenWidgets
        }));
    },

    updateWidgetHeight: (widgetId, h) => {
        const { layouts } = get();
        const current = layouts.find(l => l.i === widgetId);
        if (!current || current.h >= h) return; // Only grow
        const newLayouts = layouts.map(l =>
            l.i === widgetId ? { ...l, h } : l
        );
        set({ layouts: newLayouts });
        // Persist so the auto-sized height survives refresh
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            layouts: newLayouts,
            hiddenWidgets: get().hiddenWidgets
        }));
    },

    toggleWidgetVisibility: (widgetId) => {
        const { hiddenWidgets, layouts } = get();
        const isHidden = hiddenWidgets.includes(widgetId);

        const newHidden = isHidden
            ? hiddenWidgets.filter(id => id !== widgetId)
            : [...hiddenWidgets, widgetId];

        const newLayouts = [...layouts];
        if (isHidden) {
            const existingItem = layouts.find(l => l.i === widgetId);
            if (!existingItem) {
                const config = WIDGET_REGISTRY.find(w => w.id === widgetId);
                if (config) {
                    newLayouts.push({
                        i: config.id,
                        ...config.defaultLayout
                    });
                }
            }
        }

        set({ hiddenWidgets: newHidden, layouts: newLayouts });

        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            layouts: newLayouts,
            hiddenWidgets: newHidden
        }));
    },

    setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),

    resetLayout: () => {
        const defaults = getDefaultLayouts();
        set({ layouts: defaults, hiddenWidgets: [] });
        localStorage.removeItem(STORAGE_KEY);
    },

    loadLayout: () => {
        const defaults = getDefaultLayouts();
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                const savedLayouts = parsed.layouts as Layout[] | undefined;
                const savedHidden = parsed.hiddenWidgets as string[] | undefined;

                if (!Array.isArray(savedLayouts) || savedLayouts.length === 0) {
                    set({ layouts: defaults, hiddenWidgets: [] });
                    return;
                }

                // Filter out ghosts (widgets no longer in registry)
                const validLayouts = savedLayouts.filter((l: Layout) =>
                    WIDGET_REGISTRY.some(w => w.id === l.i)
                );

                // Add missing registry items
                WIDGET_REGISTRY.forEach(reg => {
                    if (!validLayouts.find((l: Layout) => l.i === reg.id)) {
                        validLayouts.push({
                            i: reg.id,
                            ...reg.defaultLayout
                        });
                    }
                });

                const hidden = Array.isArray(savedHidden) ? savedHidden : [];

                // Safety: if all widgets would be hidden, reset
                const visibleCount = validLayouts.filter(l => !hidden.includes(l.i)).length;
                if (visibleCount === 0) {
                    set({ layouts: defaults, hiddenWidgets: [] });
                    localStorage.removeItem(STORAGE_KEY);
                    return;
                }

                set({ layouts: validLayouts, hiddenWidgets: hidden });
            } else {
                set({ layouts: defaults, hiddenWidgets: [] });
            }
        } catch (e) {
            console.error("Failed to load layout", e);
            set({ layouts: defaults, hiddenWidgets: [] });
        }
    }
}));
