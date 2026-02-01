import React, { useMemo } from 'react';
import { Responsive } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { WidthProvider } from './WidthProvider';
import { usePlannerStore } from '../../store/plannerStore';
import { WidgetWrapper } from '../dashboard/WidgetWrapper';
import { ProjectCard } from '../ProjectCard';

const ResponsiveGridLayout = WidthProvider(Responsive);

export const TitanGrid: React.FC = () => {
    const { widgets, updateLayout } = usePlannerStore();

    // Derive layout from store widgets (no effect needed)
    const layouts = useMemo<{ lg: Layout[] }>(() => ({
        lg: widgets.map(w => ({
            i: w.id,
            x: w.layout.x,
            y: w.layout.y,
            w: w.layout.w,
            h: w.layout.h,
        })),
    }), [widgets]);

    const handleLayoutChange = (currentLayout: Layout[]) => {
        // We only want to update if it's a real user interaction change
        // to avoid infinite loops. Usually RGL triggers this on mount too.
        // For now, we trust the store update logic to handle diffs or debounce.

        // Transform back to our schema
        const updates = currentLayout.map(l => ({
            id: l.i,
            layout: { x: l.x, y: l.y, w: l.w, h: l.h }
        }));

        updateLayout(updates);
    };

    return (
        <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            // Breakpoints for responsive behavior (desktop focused for now)
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={50} // 50px base row height
            margin={[20, 20]}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".drag-handle"
            resizeHandles={['se']} // South-East resize only
            isDraggable
            isResizable
            compactType="vertical" // Gravity setting
            preventCollision={false}
        >
            {widgets.map(widget => (
                <div key={widget.id} className="relative">
                    <WidgetWrapper title={widget.data.title || "Untitled"}>
                        {widget.type === 'project-card' && (
                            <ProjectCard data={widget.data} configId={widget.id} />
                        )}
                        {/* Placeholder for other widget types */}
                        {widget.type === 'note-card' && (
                            <div className="p-4 text-slate-400">Note: {widget.data.description}</div>
                        )}
                    </WidgetWrapper>
                </div>
            ))}
        </ResponsiveGridLayout>
    );
};
