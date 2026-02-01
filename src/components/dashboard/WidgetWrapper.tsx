import { forwardRef } from 'react';
import { GripHorizontal } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

interface WidgetWrapperProps extends React.HTMLAttributes<HTMLDivElement> {
    title: string;
    children: React.ReactNode;
}

export const WidgetWrapper = forwardRef<HTMLDivElement, WidgetWrapperProps>(
    ({ title, children, style, className, onMouseDown, onMouseUp, onTouchEnd, ...props }, ref) => {
        return (
            <div
                ref={ref}
                style={style}
                className={twMerge(
                    "flex flex-col h-full w-full bg-slate-900/50 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-lg transition-all hover:shadow-xl hover:border-white/20",
                    className
                )}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
                onTouchEnd={onTouchEnd}
                {...props}
            >
                {/* Drag Handle Header */}
                <div className="drag-handle flex items-center justify-between px-4 py-3 border-b border-white/5 cursor-grab active:cursor-grabbing group bg-slate-900/30">
                    <span className="font-semibold text-xs uppercase tracking-wider text-slate-400 group-hover:text-emerald-400 transition-colors truncate">
                        {title}
                    </span>
                    <GripHorizontal className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                </div>

                {/* Content Area - No internal scrollbar on the wrapper itself if possible, let child handle it */}
                <div className="flex-1 overflow-hidden relative flex flex-col">
                    {children}
                </div>
            </div>
        );
    }
);
