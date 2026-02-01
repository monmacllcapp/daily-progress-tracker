import { useState, useCallback } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { DraggablePanel } from './DraggablePanel';
import { VisionBoardGallery } from './VisionBoardGallery';
import { WheelOfLife } from './WheelOfLife';
import { TodaysStressors } from './TodaysStressors';
import { RotateCcw } from 'lucide-react';

interface PanelConfig {
    id: string;
    title: string;
    component: React.ReactNode;
}

const defaultPanels: PanelConfig[] = [
    { id: 'vision-board', title: 'Vision Board', component: <VisionBoardGallery /> },
    { id: 'wheel-of-life', title: 'Wheel of Life', component: <WheelOfLife /> },
    { id: 'todays-stressors', title: "Today's Stressors", component: <TodaysStressors /> },
    {
        id: 'add-vision', title: 'Quick Add', component: (
            <div className="flex items-center justify-center h-full">
                <button className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl font-bold transition-all">
                    + Add Vision
                </button>
            </div>
        )
    },
];

export function DndGridDashboard() {
    console.log('[DndGridDashboard] Rendering...');

    const [panels, setPanels] = useState<PanelConfig[]>(() => {
        const saved = localStorage.getItem('dashboard_panels');
        return saved ? JSON.parse(saved) : defaultPanels;
    });

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setPanels((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over.id);
                const newOrder = arrayMove(items, oldIndex, newIndex);
                localStorage.setItem('dashboard_panels', JSON.stringify(newOrder));
                return newOrder;
            });
        }
    }, []);

    const handleReset = () => {
        if (confirm('Reset dashboard to default layout?')) {
            localStorage.removeItem('dashboard_panels');
            setPanels(defaultPanels);
        }
    };

    console.log('[DndGridDashboard] Rendering with', panels.length, 'panels');

    return (
        <div className="relative py-8">
            <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

            {/* Reset Button */}
            <button
                onClick={handleReset}
                className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-white/10 rounded-lg hover:bg-zinc-800 transition-all shadow-lg"
                title="Reset Layout"
            >
                <RotateCcw className="w-4 h-4" />
                <span className="text-sm">Reset Layout</span>
            </button>

            {/* Draggable Grid */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={panels.map(p => p.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 auto-rows-[500px]">
                        {panels.map((panel) => (
                            <DraggablePanel key={panel.id} id={panel.id} title={panel.title}>
                                {panel.component}
                            </DraggablePanel>
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}
