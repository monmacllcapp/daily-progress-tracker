import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { Responsive } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';

import { useDashboardStore } from '../../store/dashboardStore';
import { WIDGET_REGISTRY } from '../../config/widgetRegistry';
import { WidgetWrapper } from './WidgetWrapper';
import { WidgetErrorBoundary } from '../WidgetErrorBoundary';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

interface DashboardGridProps {
    filterWidgets?: string[];
}

export function DashboardGrid({ filterWidgets }: DashboardGridProps) {
    const { layouts, updateLayout, loadLayout, hiddenWidgets } = useDashboardStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        loadLayout();
    }, [loadLayout]);

    // Measure container width with ResizeObserver
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const w = entry.contentRect.width;
                if (w > 0) setWidth(w);
            }
        });
        observer.observe(el);

        // Get initial width
        const rect = el.getBoundingClientRect();
        if (rect.width > 0) setWidth(rect.width);

        return () => observer.disconnect();
    }, []);

    // Apply both hiddenWidgets and filterWidgets
    const activeLayout = layouts.filter(l => {
        // First check if widget is hidden
        if (hiddenWidgets.includes(l.i)) return false;
        // Then check if we have a filter and widget is in the filter
        if (filterWidgets && !filterWidgets.includes(l.i)) return false;
        return true;
    });

    // Save layout only on user interactions — NOT on onLayoutChange —
    // to prevent infinite re-render loops between Responsive's internal
    // layout compaction and our store updates.
    const handleDragStop = useCallback(
        (layout: Layout[]) => {
            updateLayout(layout);
        },
        [updateLayout]
    );

    const handleResizeStop = useCallback(
        (layout: Layout[]) => {
            updateLayout(layout);
        },
        [updateLayout]
    );

    return (
        <div ref={containerRef}>
            {width > 0 ? (
                <Responsive
                    className="layout"
                    width={width}
                    layouts={{
                        lg: activeLayout,
                        md: activeLayout,
                        sm: activeLayout,
                        xs: activeLayout,
                        xxs: activeLayout,
                    }}
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                    cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
                    rowHeight={100}
                    draggableHandle=".drag-handle"
                    onDragStop={handleDragStop}
                    onResizeStop={handleResizeStop}
                    isDraggable={true}
                    isResizable={true}
                    margin={[16, 16]}
                >
                    {activeLayout.map(item => {
                        const config = WIDGET_REGISTRY.find(w => w.id === item.i);
                        if (!config) return <div key={item.i} />;

                        const Component = config.component;

                        return (
                            <WidgetWrapper key={item.i} title={config.title} widgetId={item.i}>
                                <WidgetErrorBoundary widgetTitle={config.title}>
                                    <Suspense fallback={
                                        <div className="flex items-center justify-center h-full">
                                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    }>
                                        <Component />
                                    </Suspense>
                                </WidgetErrorBoundary>
                            </WidgetWrapper>
                        );
                    })}
                </Responsive>
            ) : null}
        </div>
    );
}
