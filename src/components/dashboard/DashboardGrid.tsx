import { useEffect, useState, useRef } from 'react';
import { Responsive } from 'react-grid-layout';

import { useDashboardStore } from '../../store/dashboardStore';
import { WIDGET_REGISTRY } from '../../config/widgetRegistry';
import { WidgetWrapper } from './WidgetWrapper';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

export function DashboardGrid() {
    const { layouts, updateLayout, loadLayout, hiddenWidgets } = useDashboardStore();
    const [mounted, setMounted] = useState(false);
    const [width, setWidth] = useState(1200);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadLayout();
        setMounted(true);

        const updateWidth = () => {
            if (containerRef.current) {
                setWidth(containerRef.current.offsetWidth);
            }
        };

        // Initial measure
        updateWidth();

        // Resize observer for robust width tracking
        const observer = new ResizeObserver(() => {
            window.requestAnimationFrame(updateWidth);
        });

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        window.addEventListener('resize', updateWidth);

        // Force an extra check
        setTimeout(updateWidth, 100);
        setTimeout(updateWidth, 500);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateWidth);
        };
    }, []);

    if (!mounted) return null;

    // Filter visible items
    const activeLayout = layouts.filter(l => !hiddenWidgets.includes(l.i));

    return (
        <div ref={containerRef} className="w-full h-full pb-20">
            <Responsive
                className="layout"
                width={width}
                layouts={{
                    lg: activeLayout,
                    md: activeLayout,
                    sm: activeLayout
                }}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={100}
                draggableHandle=".drag-handle"
                onLayoutChange={(currentLayout) => updateLayout(currentLayout)}
                isDraggable={true}
                isResizable={true}
                margin={[16, 16]}
            >
                {activeLayout.map(item => {
                    const config = WIDGET_REGISTRY.find(w => w.id === item.i);
                    if (!config) return <div key={item.i} className="hidden" />;

                    const Component = config.component;

                    return (
                        <WidgetWrapper key={item.i} title={config.title}>
                            <Component />
                        </WidgetWrapper>
                    );
                })}
            </Responsive>
        </div>
    );
}
