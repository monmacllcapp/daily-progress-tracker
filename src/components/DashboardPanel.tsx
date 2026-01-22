import type { ReactNode } from 'react';
import { GripVertical } from 'lucide-react';

interface DashboardPanelProps {
    title: string;
    children: ReactNode;
    className?: string;
}

export function DashboardPanel({ title, children, className = '' }: DashboardPanelProps) {
    return (
        <div className={`h-full flex flex-col bg-zinc-900 bg-opacity-50 border border-white border-opacity-10 rounded-xl overflow-hidden ${className}`}>
            {/* Panel Header with Drag Handle */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white border-opacity-10 bg-zinc-900 bg-opacity-80 cursor-grab active:cursor-grabbing">
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
