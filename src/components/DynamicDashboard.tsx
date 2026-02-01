import { useState } from 'react';
import GridLayout from 'react-grid-layout';
import { motion } from 'framer-motion';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

interface DashboardCard {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
}

interface DynamicDashboardProps {
    children: React.ReactNode;
}

const DEFAULT_LAYOUT: DashboardCard[] = [
    { i: 'vision-board', x: 0, y: 0, w: 12, h: 4, minW: 6, minH: 3 },
    { i: 'wheel-of-life', x: 0, y: 4, w: 4, h: 4, minW: 3, minH: 3 },
    { i: 'projects', x: 4, y: 4, w: 8, h: 8, minW: 4, minH: 4 },
];

export function DynamicDashboard({ children }: DynamicDashboardProps) {
    const [layout, setLayout] = useState<DashboardCard[]>(() => {
        const saved = localStorage.getItem('dashboard-layout');
        return saved ? JSON.parse(saved) : DEFAULT_LAYOUT;
    });

    const handleLayoutChange = (newLayout: DashboardCard[]) => {
        setLayout(newLayout);
        localStorage.setItem('dashboard-layout', JSON.stringify(newLayout));
    };

    const resetLayout = () => {
        setLayout(DEFAULT_LAYOUT);
        localStorage.setItem('dashboard-layout', JSON.stringify(DEFAULT_LAYOUT));
    };

    // Convert children to array and map to grid items
    const childArray = Array.isArray(children) ? children : [children];

    return (
        <div className="relative">
            {/* Reset Layout Button */}
            <button
                onClick={resetLayout}
                className="fixed top-4 right-4 z-50 px-4 py-2 bg-white bg-opacity-10 hover:bg-white hover:bg-opacity-20 rounded-lg text-sm font-medium transition-all backdrop-blur-sm border border-white border-opacity-10"
            >
                Reset Layout
            </button>

            <GridLayout
                className="layout"
                layout={layout}
                cols={12}
                rowHeight={100}
                width={1200}
                onLayoutChange={handleLayoutChange}
                draggableHandle=".drag-handle"
                compactType={null}
                preventCollision={false}
            >
                {childArray.map((child: React.ReactNode, index: number) => {
                    const cardId = layout[index]?.i || `card-${index}`;

                    return (
                        <div key={cardId} className="relative">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="glass-card h-full w-full overflow-hidden flex flex-col"
                            >
                                {/* Drag Handle */}
                                <div className="drag-handle cursor-move px-4 py-2 bg-gradient-to-r from-blue-500 from-10% to-purple-500 border-b border-white border-opacity-10 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-1">
                                            <div className="w-1 h-1 rounded-full bg-white bg-opacity-30" />
                                            <div className="w-1 h-1 rounded-full bg-white bg-opacity-30" />
                                            <div className="w-1 h-1 rounded-full bg-white bg-opacity-30" />
                                        </div>
                                        <span className="text-xs text-secondary uppercase tracking-wider">
                                            {cardId.replace('-', ' ')}
                                        </span>
                                    </div>
                                    <span className="text-xs text-secondary">Drag to move • Resize from corner</span>
                                </div>

                                {/* Card Content */}
                                <div className="flex-1 overflow-auto p-4">
                                    {child}
                                </div>
                            </motion.div>
                        </div>
                    );
                })}
            </GridLayout>
        </div>
    );
}
