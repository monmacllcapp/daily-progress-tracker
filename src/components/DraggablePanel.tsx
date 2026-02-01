import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface DraggablePanelProps {
    id: string;
    title: string;
    children: ReactNode;
}

export function DraggablePanel({ id, title, children }: DraggablePanelProps) {
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
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="h-full flex flex-col bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden"
        >
            {/* Panel Header with Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-zinc-900/80 cursor-grab active:cursor-grabbing"
            >
                <GripVertical className="w-4 h-4 text-secondary" />
                <h3 className="font-bold text-sm uppercase tracking-wide">{title}</h3>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-auto p-4">
                {children}
            </div>
        </div>
    );
}
