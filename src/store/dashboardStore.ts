import { create } from 'zustand';
import type { Layout } from 'react-grid-layout';
import { WIDGET_REGISTRY } from '../config/widgetRegistry';


interface DashboardState {
    layouts: Layout[];
    hiddenWidgets: string[];
    isSidebarOpen: boolean;

    // Actions
    updateLayout: (newLayout: Layout[]) => void;
    toggleWidgetVisibility: (widgetId: string) => void;
    setSidebarOpen: (isOpen: boolean) => void;
    resetLayout: () => void;
    loadLayout: () => void;
}

const STORAGE_KEY = 'titan_glass_layout_v4';

export const useDashboardStore = create<DashboardState>((set, get) => ({
    layouts: [],
    hiddenWidgets: [],
    isSidebarOpen: false,

    updateLayout: (newLayout) => {
        set({ layouts: newLayout });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            layouts: newLayout,
            hiddenWidgets: get().hiddenWidgets
        }));
    },

    toggleWidgetVisibility: (widgetId) => {
        const { hiddenWidgets, layouts } = get();
        const isHidden = hiddenWidgets.includes(widgetId);

        const newHidden = isHidden
            ? hiddenWidgets.filter(id => id !== widgetId)
            : [...hiddenWidgets, widgetId];

        // If unhiding, we might need to add it back to layout if missing,
        // but typically RGL handles the "layout" array separate from "children".
        // Use default layout from registry if not found in current layouts
        const newLayouts = [...layouts];
        if (isHidden) { // We are showing it now
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
        const defaults = WIDGET_REGISTRY.map(w => ({
            i: w.id,
            ...w.defaultLayout
        }));
        set({ layouts: defaults, hiddenWidgets: [] });
        localStorage.removeItem(STORAGE_KEY);
    },

    loadLayout: () => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const { layouts, hiddenWidgets } = JSON.parse(saved);

                // Robust Merge: Ensure all registry items exist (or are handled)
                // Filter out ghosts (widgets no longer in registry)
                const validLayouts = layouts.filter((l: Layout) =>
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

                set({ layouts: validLayouts, hiddenWidgets: hiddenWidgets || [] });
            } else {
                // Initial Load defaults
                const defaults = WIDGET_REGISTRY.map(w => ({
                    i: w.id,
                    ...w.defaultLayout
                }));
                set({ layouts: defaults, hiddenWidgets: [] });
            }
        } catch (e) {
            console.error("Failed to load layout", e);
            // Fallback
            const defaults = WIDGET_REGISTRY.map(w => ({
                i: w.id,
                ...w.defaultLayout
            }));
            set({ layouts: defaults, hiddenWidgets: [] });
        }
    }
}));
