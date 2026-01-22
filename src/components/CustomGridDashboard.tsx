import { useState, useEffect } from 'react';
import { GripVertical, RotateCcw, Maximize2 } from 'lucide-react';
import { VisionBoardGallery } from './VisionBoardGallery';
import { WheelOfLife } from './WheelOfLife';
import { TodaysStressors } from './TodaysStressors';

interface GridItem {
    id: string;
    title: string;
    component: React.ReactNode;
    x: number;
    y: number;
    w: number;
    h: number;
}

const defaultItems: GridItem[] = [
    { id: 'vision', title: 'Vision Board', component: <VisionBoardGallery />, x: 0, y: 0, w: 6, h: 400 },
    { id: 'wheel', title: 'Wheel of Life', component: <WheelOfLife />, x: 6, y: 0, w: 6, h: 400 },
    { id: 'stressors', title: "Today's Stressors", component: <TodaysStressors />, x: 0, y: 400, w: 12, h: 400 },
];

type DragMode = 'move' | 'resize' | null;

export function CustomGridDashboard() {
    const [items, setItems] = useState<GridItem[]>(() => {
        try {
            const saved = localStorage.getItem('custom_grid_layout');
            return saved ? JSON.parse(saved) : defaultItems;
        } catch {
            return defaultItems;
        }
    });

    const [dragging, setDragging] = useState<string | null>(null);
    const [dragMode, setDragMode] = useState<DragMode>(null);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0, itemX: 0, itemY: 0, itemW: 0, itemH: 0 });

    // Save to localStorage whenever items change
    useEffect(() => {
        try {
            localStorage.setItem('custom_grid_layout', JSON.stringify(items));
        } catch (error) {
            console.error('Failed to save layout:', error);
        }
    }, [items]);

    const handleMouseDown = (e: React.MouseEvent, item: GridItem, mode: DragMode) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(item.id);
        setDragMode(mode);
        setDragStart({
            x: e.clientX,
            y: e.clientY,
            itemX: item.x,
            itemY: item.y,
            itemW: item.w,
            itemH: item.h
        });
    };

    useEffect(() => {
        if (!dragging || !dragMode) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - dragStart.x;
            const deltaY = e.clientY - dragStart.y;

            setItems(prev => prev.map(item => {
                if (item.id === dragging) {
                    if (dragMode === 'move') {
                        // Move: update position
                        const gridDeltaX = Math.round(deltaX / 100);
                        const newX = Math.max(0, Math.min(12 - item.w, dragStart.itemX + gridDeltaX));
                        const newY = Math.max(0, dragStart.itemY + deltaY);
                        return { ...item, x: newX, y: newY };
                    } else if (dragMode === 'resize') {
                        // Resize: update width and height
                        const gridDeltaW = Math.round(deltaX / 100);
                        const newW = Math.max(2, Math.min(12 - item.x, dragStart.itemW + gridDeltaW));
                        const newH = Math.max(200, dragStart.itemH + deltaY);
                        return { ...item, w: newW, h: newH };
                    }
                }
                return item;
            }));
        };

        const handleMouseUp = () => {
            setDragging(null);
            setDragMode(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, dragMode, dragStart]);

    const handleReset = () => {
        if (confirm('Reset dashboard to default layout?')) {
            localStorage.removeItem('custom_grid_layout');
            setItems(defaultItems);
        }
    };

    return (
        <div className="relative pb-8">
            {/* Reset Button */}
            <button
                onClick={handleReset}
                className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-white border-opacity-10 rounded-lg hover:bg-zinc-800 transition-all shadow-lg"
                title="Reset Layout"
            >
                <RotateCcw className="w-4 h-4" />
                <span className="text-sm">Reset Layout</span>
            </button>

            {/* Grid Container */}
            <div className="relative w-full" style={{ minHeight: '1200px' }}>
                {items.map((item) => (
                    <div
                        key={item.id}
                        className="absolute bg-zinc-900 bg-opacity-50 border border-white border-opacity-10 rounded-xl overflow-hidden"
                        style={{
                            left: `${(item.x / 12) * 100}%`,
                            top: `${item.y}px`,
                            width: `${(item.w / 12) * 100}%`,
                            height: `${item.h}px`,
                            transition: dragging === item.id ? 'none' : 'all 0.2s ease',
                            zIndex: dragging === item.id ? 50 : 1,
                        }}
                    >
                        {/* Header with Drag Handle */}
                        <div
                            className="flex items-center gap-2 px-4 py-3 border-b border-white border-opacity-10 bg-zinc-900 bg-opacity-80 cursor-grab active:cursor-grabbing"
                            onMouseDown={(e) => handleMouseDown(e, item, 'move')}
                        >
                            <GripVertical className="w-4 h-4 text-secondary" />
                            <h3 className="font-bold text-sm uppercase tracking-wide flex-1">{item.title}</h3>
                            <Maximize2 className="w-4 h-4 text-secondary opacity-50" />
                        </div>

                        {/* Content */}
                        <div className="p-4 overflow-auto" style={{ height: `${item.h - 52}px` }}>
                            {item.component}
                        </div>

                        {/* Resize Handle - Bottom Right Corner */}
                        <div
                            className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize group"
                            onMouseDown={(e) => handleMouseDown(e, item, 'resize')}
                        >
                            <div className="absolute bottom-1 right-1 w-3 h-3 border-r-2 border-b-2 border-white border-opacity-30 group-hover:border-white group-hover:border-opacity-60 transition-colors" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
