import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, LayoutDashboard, ChevronDown, Palette, GripVertical, Eye, EyeOff } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    type DragStartEvent,
    type DragOverEvent,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDashboardStore } from '../../store/dashboardStore';
import { useThemeStore, THEME_PRESETS } from '../../store/themeStore';
import { WIDGET_REGISTRY } from '../../config/widgetRegistry';
import { ColorPicker } from '../ui/ColorPicker';
import { clsx } from 'clsx';

const VALID_COLUMN_COUNTS = [1, 2, 3, 4, 6] as const;
type ColumnCount = (typeof VALID_COLUMN_COUNTS)[number];

function CollapsibleSection({
    title,
    defaultOpen = false,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full mb-3"
            >
                <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider">
                    {title}
                </h3>
                <ChevronDown
                    className={clsx(
                        'w-4 h-4 text-white/30 transition-transform',
                        isOpen && 'rotate-180'
                    )}
                />
            </button>
            {isOpen && children}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Sortable widget card used inside Kanban columns & DragOverlay     */
/* ------------------------------------------------------------------ */

function SortableWidgetCard({
    id,
    title,
    type,
    onHide,
}: {
    id: string;
    title: string;
    type: string;
    onHide: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.4 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={clsx(
                'flex items-center gap-2 p-2.5 rounded-lg border transition-all',
                'bg-blue-600/20 border-blue-500/50',
                isDragging && 'shadow-lg shadow-blue-500/20'
            )}
        >
            <button
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60 touch-none"
                aria-label={`Drag to reorder ${title}`}
            >
                <GripVertical className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">{title}</p>
                <p className="text-[10px] text-slate-500 capitalize">{type}</p>
            </div>
            <button
                onClick={onHide}
                className="text-blue-400 hover:text-blue-300 transition-colors p-0.5"
                aria-label={`Hide ${title}`}
            >
                <Eye className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

/** Static card rendered inside DragOverlay (no sortable hooks). */
function WidgetCardOverlay({ id }: { id: string }) {
    const widget = WIDGET_REGISTRY.find(w => w.id === id);
    if (!widget) return null;
    return (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-blue-600/30 border-blue-400/60 shadow-xl shadow-blue-500/30 w-48">
            <GripVertical className="w-4 h-4 text-white/50" />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-100 truncate">{widget.title}</p>
                <p className="text-[10px] text-slate-400 capitalize">{widget.type}</p>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Single Kanban column — a droppable + sortable container           */
/* ------------------------------------------------------------------ */

function KanbanColumn({
    columnIndex,
    widgetIds,
    onHide,
}: {
    columnIndex: number;
    widgetIds: string[];
    onHide: (id: string) => void;
}) {
    const { setNodeRef } = useSortable({
        id: `column-${columnIndex}`,
        data: { type: 'column', columnIndex },
        disabled: true,         // columns themselves are not draggable
    });

    return (
        <div
            ref={setNodeRef}
            className="flex-1 min-w-[120px] flex flex-col"
        >
            <div className="text-[10px] font-bold text-white/25 uppercase tracking-wider mb-2 text-center">
                Col {columnIndex + 1}
            </div>
            <SortableContext items={widgetIds} strategy={verticalListSortingStrategy}>
                <div className="flex-1 space-y-1.5 min-h-[60px] p-1.5 rounded-lg bg-white/[0.02] border border-dashed border-white/5">
                    {widgetIds.map(id => {
                        const widget = WIDGET_REGISTRY.find(w => w.id === id);
                        if (!widget) return null;
                        return (
                            <SortableWidgetCard
                                key={id}
                                id={id}
                                title={widget.title}
                                type={widget.type}
                                onHide={() => onHide(id)}
                            />
                        );
                    })}
                    {widgetIds.length === 0 && (
                        <p className="text-[10px] text-slate-600 italic text-center py-4">
                            Drop here
                        </p>
                    )}
                </div>
            </SortableContext>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Kanban Board — multi-container DnD                                */
/* ------------------------------------------------------------------ */

function deriveColumnsFromLayouts(
    layouts: Array<{ i: string; x: number; y: number; w: number }>,
    hiddenWidgets: string[],
    columnCount: number
): string[][] {
    const w = 12 / columnCount;
    const columns: string[][] = Array.from({ length: columnCount }, () => []);

    const visible = layouts
        .filter(l => !hiddenWidgets.includes(l.i))
        .sort((a, b) => a.y - b.y || a.x - b.x);

    visible.forEach(layout => {
        let colIdx = Math.round(layout.x / w);
        // Clamp to valid range
        if (colIdx < 0) colIdx = 0;
        if (colIdx >= columnCount) colIdx = columnCount - 1;
        columns[colIdx].push(layout.i);
    });

    return columns;
}

function findColumnOfWidget(columns: string[][], widgetId: string): number {
    return columns.findIndex(col => col.includes(widgetId));
}

function KanbanBoard({
    layouts,
    hiddenWidgets,
    columnCount,
    onApply,
    onHide,
}: {
    layouts: Array<{ i: string; x: number; y: number; w: number }>;
    hiddenWidgets: string[];
    columnCount: number;
    onApply: (columns: string[][]) => void;
    onHide: (id: string) => void;
}) {
    const [columns, setColumns] = useState<string[][]>(() =>
        deriveColumnsFromLayouts(layouts, hiddenWidgets, columnCount)
    );
    const [activeId, setActiveId] = useState<string | null>(null);

    // Re-derive when columnCount or visible set changes
    const visibleKey = useMemo(() => {
        const visible = layouts
            .filter(l => !hiddenWidgets.includes(l.i))
            .map(l => l.i)
            .sort()
            .join(',');
        return `${columnCount}:${visible}`;
    }, [layouts, hiddenWidgets, columnCount]);

    // Sync local columns when the store changes externally
    useMemo(() => {
        setColumns(deriveColumnsFromLayouts(layouts, hiddenWidgets, columnCount));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleKey]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    }, []);

    const handleDragOver = useCallback((event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeWidgetId = active.id as string;
        const overId = over.id as string;

        setColumns(prev => {
            const sourceCol = findColumnOfWidget(prev, activeWidgetId);
            if (sourceCol === -1) return prev;

            // Determine target column
            let targetCol: number;
            if (overId.startsWith('column-')) {
                targetCol = parseInt(overId.replace('column-', ''), 10);
            } else {
                targetCol = findColumnOfWidget(prev, overId);
                if (targetCol === -1) return prev;
            }

            if (sourceCol === targetCol) return prev; // same column — handled by onDragEnd

            const newColumns = prev.map(col => [...col]);
            // Remove from source
            const sourceIndex = newColumns[sourceCol].indexOf(activeWidgetId);
            newColumns[sourceCol].splice(sourceIndex, 1);

            // Insert into target at the over item's index, or at end
            if (overId.startsWith('column-')) {
                newColumns[targetCol].push(activeWidgetId);
            } else {
                const overIndex = newColumns[targetCol].indexOf(overId);
                if (overIndex === -1) {
                    newColumns[targetCol].push(activeWidgetId);
                } else {
                    newColumns[targetCol].splice(overIndex, 0, activeWidgetId);
                }
            }

            return newColumns;
        });
    }, []);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const activeWidgetId = active.id as string;
        const overId = over.id as string;

        setColumns(prev => {
            const col = findColumnOfWidget(prev, activeWidgetId);
            if (col === -1) return prev;

            // Within-column reorder
            if (!overId.startsWith('column-')) {
                const overCol = findColumnOfWidget(prev, overId);
                if (overCol === col) {
                    const oldIndex = prev[col].indexOf(activeWidgetId);
                    const newIndex = prev[col].indexOf(overId);
                    if (oldIndex !== newIndex) {
                        const newColumns = prev.map(c => [...c]);
                        newColumns[col] = arrayMove(newColumns[col], oldIndex, newIndex);
                        // Persist
                        setTimeout(() => onApply(newColumns), 0);
                        return newColumns;
                    }
                }
            }

            // Cross-column move already handled by onDragOver — just persist
            setTimeout(() => onApply(prev), 0);
            return prev;
        });
    }, [onApply]);

    // Collect all sortable IDs (widgets + column droppable IDs)
    const allIds = useMemo(() => {
        const ids: string[] = [];
        columns.forEach((col, i) => {
            ids.push(`column-${i}`);
            ids.push(...col);
        });
        return ids;
    }, [columns]);

    if (columns.every(col => col.length === 0)) {
        return <p className="text-xs text-slate-500 italic">No visible widgets</p>;
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
                <div
                    className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin"
                    style={{ minHeight: 80 }}
                >
                    {columns.map((col, idx) => (
                        <KanbanColumn
                            key={idx}
                            columnIndex={idx}
                            widgetIds={col}
                            onHide={onHide}
                        />
                    ))}
                </div>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
                {activeId ? <WidgetCardOverlay id={activeId} /> : null}
            </DragOverlay>
        </DndContext>
    );
}

/* ------------------------------------------------------------------ */
/*  Column count selector                                             */
/* ------------------------------------------------------------------ */

function ColumnCountSelector({
    value,
    onChange,
}: {
    value: ColumnCount;
    onChange: (count: ColumnCount) => void;
}) {
    return (
        <div className="flex gap-1.5">
            {VALID_COLUMN_COUNTS.map(count => (
                <button
                    key={count}
                    onClick={() => onChange(count)}
                    className={clsx(
                        'flex-1 py-1.5 rounded-md text-xs font-bold transition-all border',
                        value === count
                            ? 'bg-blue-600/40 border-blue-500/60 text-blue-300'
                            : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
                    )}
                >
                    {count}
                </button>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Hidden Widgets list                                               */
/* ------------------------------------------------------------------ */

function HiddenWidgetsList({
    hiddenWidgets,
    onToggle,
}: {
    hiddenWidgets: string[];
    onToggle: (id: string) => void;
}) {
    const hiddenItems = WIDGET_REGISTRY.filter(w => hiddenWidgets.includes(w.id));

    if (hiddenItems.length === 0) {
        return <p className="text-xs text-slate-500 italic">All widgets are visible</p>;
    }

    return (
        <div className="space-y-2">
            {hiddenItems.map(widget => (
                <div
                    key={widget.id}
                    onClick={() => onToggle(widget.id)}
                    className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all bg-slate-800/50 border-white/5 hover:bg-slate-800"
                >
                    <EyeOff className="w-4 h-4 text-white/20" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-500 truncate">{widget.title}</p>
                        <p className="text-xs text-slate-600 capitalize">{widget.type} Widget</p>
                    </div>
                    <span className="text-[10px] text-slate-600 uppercase tracking-wider">Click to show</span>
                </div>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Main sidebar                                                      */
/* ------------------------------------------------------------------ */

export function CustomizationSidebar() {
    const {
        isSidebarOpen,
        setSidebarOpen,
        hiddenWidgets,
        toggleWidgetVisibility,
        applyKanbanLayout,
        setColumnCount,
        columnCount,
        layouts,
        resetLayout,
    } = useDashboardStore();
    const {
        backgroundColor,
        accentColor,
        activePresetId,
        widgetColors,
        glassOpacity,
        setBackgroundColor,
        setAccentColor,
        setWidgetColor,
        clearWidgetColor,
        applyPreset,
        setGlassOpacity,
        resetTheme,
    } = useThemeStore();

    return (
        <AnimatePresence>
            {isSidebarOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
                        onClick={() => setSidebarOpen(false)}
                    />

                    {/* Sidebar Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 bottom-0 w-96 bg-slate-900 border-l border-white/10 z-50 shadow-2xl flex flex-col backdrop-blur-xl"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/10 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-white/90">
                                <LayoutDashboard className="w-5 h-5 text-blue-500" />
                                <h2 className="font-bold text-lg">Customize</h2>
                            </div>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="text-white/40 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">

                            {/* Theme Presets */}
                            <CollapsibleSection title="Theme Presets" defaultOpen>
                                <div className="grid grid-cols-2 gap-2">
                                    {THEME_PRESETS.map((preset) => (
                                        <button
                                            key={preset.id}
                                            onClick={() => applyPreset(preset.id)}
                                            className={clsx(
                                                'flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all text-xs',
                                                activePresetId === preset.id
                                                    ? 'border-white/30 bg-white/10'
                                                    : 'border-white/5 bg-slate-800/50 hover:bg-slate-800'
                                            )}
                                        >
                                            <div className="flex -space-x-1">
                                                <div
                                                    className="w-4 h-4 rounded-full border border-white/20"
                                                    style={{ backgroundColor: preset.backgroundColor }}
                                                />
                                                <div
                                                    className="w-4 h-4 rounded-full border border-white/20"
                                                    style={{ backgroundColor: preset.accentColor }}
                                                />
                                            </div>
                                            <span className="text-slate-300 truncate">{preset.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </CollapsibleSection>

                            {/* Global Colors */}
                            <CollapsibleSection title="Colors" defaultOpen>
                                <div className="space-y-4">
                                    <ColorPicker
                                        label="Background"
                                        value={backgroundColor}
                                        onChange={setBackgroundColor}
                                    />
                                    <ColorPicker
                                        label="Accent"
                                        value={accentColor}
                                        onChange={setAccentColor}
                                    />
                                </div>
                            </CollapsibleSection>

                            {/* Glass Opacity */}
                            <CollapsibleSection title="Glass Effect" defaultOpen>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-400">Opacity</span>
                                        <span className="text-[10px] font-mono text-slate-500">
                                            {Math.round(glassOpacity * 100)}%
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={Math.round(glassOpacity * 100)}
                                        onChange={(e) => setGlassOpacity(Number(e.target.value) / 100)}
                                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-700 accent-blue-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-slate-600">
                                        <span>Clear</span>
                                        <span>Solid</span>
                                    </div>
                                </div>
                            </CollapsibleSection>

                            {/* Per-Widget Colors */}
                            <CollapsibleSection title="Widget Colors">
                                <div className="space-y-4">
                                    {WIDGET_REGISTRY.map((widget) => {
                                        const isHidden = hiddenWidgets.includes(widget.id);
                                        if (isHidden) return null;

                                        return (
                                            <ColorPicker
                                                key={widget.id}
                                                label={widget.title}
                                                value={widgetColors[widget.id] || accentColor}
                                                onChange={(hex) => setWidgetColor(widget.id, hex)}
                                                onClear={
                                                    widgetColors[widget.id]
                                                        ? () => clearWidgetColor(widget.id)
                                                        : undefined
                                                }
                                            />
                                        );
                                    })}
                                </div>
                            </CollapsibleSection>

                            {/* Layout Columns */}
                            <CollapsibleSection title="Layout Columns" defaultOpen>
                                <ColumnCountSelector
                                    value={columnCount}
                                    onChange={setColumnCount}
                                />
                            </CollapsibleSection>

                            {/* Arrange Widgets — Kanban board */}
                            <CollapsibleSection title="Arrange Widgets" defaultOpen>
                                <KanbanBoard
                                    layouts={layouts}
                                    hiddenWidgets={hiddenWidgets}
                                    columnCount={columnCount}
                                    onApply={applyKanbanLayout}
                                    onHide={toggleWidgetVisibility}
                                />
                            </CollapsibleSection>

                            {/* Hidden Widgets — click to show */}
                            <CollapsibleSection title="Hidden Widgets">
                                <HiddenWidgetsList
                                    hiddenWidgets={hiddenWidgets}
                                    onToggle={toggleWidgetVisibility}
                                />
                            </CollapsibleSection>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 border-t border-white/10 bg-white/5 relative space-y-2">
                            <button
                                onClick={() => {
                                    if (confirm('Reset all colors to default?')) {
                                        resetTheme();
                                    }
                                }}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition-all text-sm font-medium"
                            >
                                <Palette className="w-4 h-4" />
                                Reset Colors
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm('Are you sure you want to reset the layout to default?')) {
                                        resetLayout();
                                    }
                                }}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition-all text-sm font-medium"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Reset to Default Layout
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
