import { forwardRef, useRef } from 'react';
import { GripHorizontal } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { useThemeStore } from '../../store/themeStore';
import { hexToRgba } from '../../lib/color-utils';

interface WidgetWrapperProps extends React.HTMLAttributes<HTMLDivElement> {
    title: string;
    widgetId?: string;
    children: React.ReactNode;
}

export const WidgetWrapper = forwardRef<HTMLDivElement, WidgetWrapperProps>(
    ({ title, widgetId, children, style, className, onMouseDown, onMouseUp, onTouchEnd, ...props }, ref) => {
        const widgetColor = useThemeStore((s) =>
            widgetId ? s.widgetColors[widgetId] : undefined
        );
        const glassOpacity = useThemeStore((s) => s.glassOpacity);
        const contentRef = useRef<HTMLDivElement>(null);

        const mergedStyle = widgetColor
            ? { ...style, backgroundColor: hexToRgba(widgetColor, glassOpacity + 0.1) }
            : style;

        const headerStyle = widgetColor
            ? { backgroundColor: hexToRgba(widgetColor, glassOpacity) }
            : undefined;

        return (
            <div
                ref={ref}
                style={mergedStyle}
                className={twMerge(
                    "flex flex-col h-full w-full overflow-hidden bg-slate-900/50 backdrop-blur-md border border-white/10 rounded-xl shadow-lg transition-all hover:shadow-xl hover:border-white/20",
                    className
                )}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
                onTouchEnd={onTouchEnd}
                {...props}
            >
                {/* Drag Handle Header */}
                <div
                    className="drag-handle flex items-center justify-between px-4 py-3 border-b border-white/5 cursor-grab active:cursor-grabbing group bg-slate-900/30"
                    style={headerStyle}
                >
                    <span className="font-semibold text-xs uppercase tracking-wider text-slate-400 group-hover:text-emerald-400 transition-colors truncate">
                        {title}
                    </span>
                    <GripHorizontal className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                </div>

                {/* Content Area — overflow-y-auto as fallback while auto-grow catches up */}
                <div ref={contentRef} className="flex-1 overflow-y-auto min-h-0 relative flex flex-col">
                    {children}
                </div>
            </div>
        );
    }
);
