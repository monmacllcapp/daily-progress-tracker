import { useState } from 'react';
import GridLayout from 'react-grid-layout';
import { RotateCcw } from 'lucide-react';
import { VisionBoardGallery } from './VisionBoardGallery';
import { WheelOfLife } from './WheelOfLife';
import { ProjectsList } from './ProjectsList';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const defaultLayout = [
    { i: 'vision', x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 3 },
    { i: 'wheel', x: 6, y: 0, w: 6, h: 4, minW: 3, minH: 3 },
    { i: 'stressors', x: 0, y: 4, w: 12, h: 4, minW: 4, minH: 3 },
];

export function GridDashboard() {
    const [layout, setLayout] = useState(() => {
        try {
            const saved = localStorage.getItem('grid_dashboard_layout');
            return saved ? JSON.parse(saved) : defaultLayout;
        } catch {
            return defaultLayout;
        }
    });

    const handleLayoutChange = (newLayout: GridLayout.Layout[]) => {
        setLayout(newLayout);
        try {
            localStorage.setItem('grid_dashboard_layout', JSON.stringify(newLayout));
        } catch (error) {
            console.error('Failed to save layout:', error);
        }
    };

    const handleReset = () => {
        if (confirm('Reset dashboard to default layout?')) {
            localStorage.removeItem('grid_dashboard_layout');
            setLayout(defaultLayout);
        }
    };

    return (
        <div className="relative w-full">
            {/* Reset Button */}
            <button
                onClick={handleReset}
                className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-white border-opacity-10 rounded-lg hover:bg-zinc-800 transition-all shadow-lg"
                title="Reset Layout"
            >
                <RotateCcw className="w-4 h-4" />
                <span className="text-sm">Reset Layout</span>
            </button>

            {/* Grid Layout - Centered with margin auto */}
            <div style={{ width: '1400px', margin: '0 auto' }}>
                <GridLayout
                    className="layout"
                    layout={layout}
                    cols={12}
                    rowHeight={100}
                    width={1400}
                    isDraggable={true}
                    isResizable={true}
                    compactType="vertical"
                    preventCollision={false}
                    draggableCancel=".no-drag"
                    onLayoutChange={handleLayoutChange}
                >
                    {/* Vision Board */}
                    <div key="vision" className="bg-zinc-900 bg-opacity-50 border border-white border-opacity-10 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-white border-opacity-10 bg-zinc-900 bg-opacity-80">
                            <h3 className="font-bold text-sm uppercase tracking-wide">Vision Board</h3>
                        </div>
                        <div className="p-4 overflow-auto h-[calc(100%-52px)] pointer-events-auto">
                            <VisionBoardGallery />
                        </div>
                    </div>

                    {/* Wheel of Life */}
                    <div key="wheel" className="bg-zinc-900 bg-opacity-50 border border-white border-opacity-10 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-white border-opacity-10 bg-zinc-900 bg-opacity-80">
                            <h3 className="font-bold text-sm uppercase tracking-wide">Wheel of Life</h3>
                        </div>
                        <div className="p-4 overflow-auto h-[calc(100%-52px)] pointer-events-auto">
                            <WheelOfLife />
                        </div>
                    </div>

                    {/* Projects */}
                    <div key="stressors" className="bg-zinc-900 bg-opacity-50 border border-white border-opacity-10 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-white border-opacity-10 bg-zinc-900 bg-opacity-80">
                            <h3 className="font-bold text-sm uppercase tracking-wide">Projects</h3>
                        </div>
                        <div className="p-4 overflow-auto h-[calc(100%-52px)] pointer-events-auto">
                            <ProjectsList />
                        </div>
                    </div>
                </GridLayout>
            </div>
        </div>
    );
}
