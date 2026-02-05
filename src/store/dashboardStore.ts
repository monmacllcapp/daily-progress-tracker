import { create } from 'zustand';
import type { Layout } from 'react-grid-layout';
import { WIDGET_REGISTRY } from '../config/widgetRegistry';

const VALID_COLUMN_COUNTS = [1, 2, 3, 4, 6] as const;
type ColumnCount = (typeof VALID_COLUMN_COUNTS)[number];

interface DashboardState {
    layouts: Layout[];
    hiddenWidgets: string[];
    columnCount: ColumnCount;
    isSidebarOpen: boolean;

    // Actions
    updateLayout: (newLayout: Layout[]) => void;
    toggleWidgetVisibility: (widgetId: string) => void;
    applyKanbanLayout: (columns: string[][]) => void;
    setColumnCount: (count: ColumnCount) => void;
    setSidebarOpen: (isOpen: boolean) => void;
    resetLayout: () => void;
    loadLayout: () => void;
}

const STORAGE_KEY = 'titan_glass_layout_v6';

function getDefaultLayouts(): Layout[] {
    return WIDGET_REGISTRY.map(w => ({
        i: w.id,
        ...w.defaultLayout
    }));
}

function persistState(layouts: Layout[], hiddenWidgets: string[], columnCount: ColumnCount) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        layouts,
        hiddenWidgets,
        columnCount
    }));
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
    // Start with defaults so widgets render immediately
    layouts: getDefaultLayouts(),
    hiddenWidgets: [],
    columnCount: 2,
    isSidebarOpen: false,

    updateLayout: (newLayout) => {
        set({ layouts: newLayout });
        persistState(newLayout, get().hiddenWidgets, get().columnCount);
    },

    toggleWidgetVisibility: (widgetId) => {
        const { hiddenWidgets, layouts, columnCount } = get();
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
                    // Place re-shown widget at the bottom of the last column
                    const w = 12 / columnCount;
                    const lastColIndex = columnCount - 1;
                    const x = lastColIndex * w;
                    // Find max y in that column
                    const colWidgets = newLayouts.filter(l =>
                        !newHidden.includes(l.i) && Math.round(l.x / w) === lastColIndex
                    );
                    const maxY = colWidgets.reduce((max, l) => Math.max(max, l.y + l.h), 0);
                    newLayouts.push({
                        i: config.id,
                        x,
                        y: maxY,
                        w,
                        h: config.defaultLayout.h,
                        minW: config.defaultLayout.minW,
                        minH: config.defaultLayout.minH
                    });
                }
            }
        }

        set({ hiddenWidgets: newHidden, layouts: newLayouts });
        persistState(newLayouts, newHidden, columnCount);
    },

    applyKanbanLayout: (columns) => {
        const { layouts, hiddenWidgets, columnCount } = get();
        const w = 12 / columnCount;
        const updatedLayouts: Layout[] = [];

        columns.forEach((colWidgets, colIdx) => {
            let currentY = 0;
            colWidgets.forEach(widgetId => {
                const existing = layouts.find(l => l.i === widgetId);
                if (!existing) return;
                updatedLayouts.push({
                    ...existing,
                    x: colIdx * w,
                    y: currentY,
                    w,
                });
                currentY += existing.h;
            });
        });

        // Keep hidden widget layouts unchanged
        const hiddenLayouts = layouts.filter(l => hiddenWidgets.includes(l.i));
        const newLayouts = [...updatedLayouts, ...hiddenLayouts];

        set({ layouts: newLayouts });
        persistState(newLayouts, hiddenWidgets, columnCount);
    },

    setColumnCount: (count) => {
        if (!VALID_COLUMN_COUNTS.includes(count)) return;
        const { layouts, hiddenWidgets } = get();

        const w = 12 / count;
        // Get visible widgets sorted by their current position (top-left first)
        const visibleWidgets = layouts
            .filter(l => !hiddenWidgets.includes(l.i))
            .sort((a, b) => a.y - b.y || a.x - b.x);

        // Redistribute round-robin across new columns
        const columns: Layout[][] = Array.from({ length: count }, () => []);
        visibleWidgets.forEach((layout, idx) => {
            columns[idx % count].push(layout);
        });

        // Recalculate positions
        const updatedLayouts: Layout[] = [];
        columns.forEach((colWidgets, colIdx) => {
            let currentY = 0;
            colWidgets.forEach(layout => {
                updatedLayouts.push({
                    ...layout,
                    x: colIdx * w,
                    y: currentY,
                    w,
                });
                currentY += layout.h;
            });
        });

        // Keep hidden widget layouts unchanged
        const hiddenLayouts = layouts.filter(l => hiddenWidgets.includes(l.i));
        const newLayouts = [...updatedLayouts, ...hiddenLayouts];

        set({ layouts: newLayouts, columnCount: count });
        persistState(newLayouts, hiddenWidgets, count);
    },

    setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),

    resetLayout: () => {
        const defaults = getDefaultLayouts();
        set({ layouts: defaults, hiddenWidgets: [], columnCount: 2 });
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
                const savedColumnCount = parsed.columnCount as ColumnCount | undefined;

                if (!Array.isArray(savedLayouts) || savedLayouts.length === 0) {
                    set({ layouts: defaults, hiddenWidgets: [], columnCount: 2 });
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
                const colCount = VALID_COLUMN_COUNTS.includes(savedColumnCount as ColumnCount)
                    ? savedColumnCount as ColumnCount
                    : 2;

                // Safety: if all widgets would be hidden, reset
                const visibleCount = validLayouts.filter(l => !hidden.includes(l.i)).length;
                if (visibleCount === 0) {
                    set({ layouts: defaults, hiddenWidgets: [], columnCount: 2 });
                    localStorage.removeItem(STORAGE_KEY);
                    return;
                }

                set({ layouts: validLayouts, hiddenWidgets: hidden, columnCount: colCount });
            } else {
                set({ layouts: defaults, hiddenWidgets: [], columnCount: 2 });
            }
        } catch (e) {
            console.error("Failed to load layout", e);
            set({ layouts: defaults, hiddenWidgets: [], columnCount: 2 });
        }
    }
}));
