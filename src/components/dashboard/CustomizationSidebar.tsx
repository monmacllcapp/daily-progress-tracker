import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, LayoutDashboard, ChevronDown, Palette } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useThemeStore, THEME_PRESETS } from '../../store/themeStore';
import { WIDGET_REGISTRY } from '../../config/widgetRegistry';
import { ColorPicker } from '../ui/ColorPicker';
import { clsx } from 'clsx';

function CollapsibleSection({
    title,
    defaultOpen = false,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full mb-3"
            >
                <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider">
                    {title}
                </h3>
                <ChevronDown
                    className={clsx(
                        'w-4 h-4 text-white/30 transition-transform',
                        isOpen && 'rotate-180'
                    )}
                />
            </button>
            {isOpen && children}
        </div>
    );
}

export function CustomizationSidebar() {
    const { isSidebarOpen, setSidebarOpen, hiddenWidgets, toggleWidgetVisibility, resetLayout } = useDashboardStore();
    const {
        backgroundColor,
        accentColor,
        activePresetId,
        widgetColors,
        glassOpacity,
        setBackgroundColor,
        setAccentColor,
        setWidgetColor,
        clearWidgetColor,
        applyPreset,
        setGlassOpacity,
        resetTheme,
    } = useThemeStore();

    return (
        <AnimatePresence>
            {isSidebarOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
                        onClick={() => setSidebarOpen(false)}
                    />

                    {/* Sidebar Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-white/10 z-50 shadow-2xl flex flex-col backdrop-blur-xl"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/10 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-white/90">
                                <LayoutDashboard className="w-5 h-5 text-blue-500" />
                                <h2 className="font-bold text-lg">Customize</h2>
                            </div>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="text-white/40 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">

                            {/* Theme Presets */}
                            <CollapsibleSection title="Theme Presets" defaultOpen>
                                <div className="grid grid-cols-2 gap-2">
                                    {THEME_PRESETS.map((preset) => (
                                        <button
                                            key={preset.id}
                                            onClick={() => applyPreset(preset.id)}
                                            className={clsx(
                                                'flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all text-xs',
                                                activePresetId === preset.id
                                                    ? 'border-white/30 bg-white/10'
                                                    : 'border-white/5 bg-slate-800/50 hover:bg-slate-800'
                                            )}
                                        >
                                            <div className="flex -space-x-1">
                                                <div
                                                    className="w-4 h-4 rounded-full border border-white/20"
                                                    style={{ backgroundColor: preset.backgroundColor }}
                                                />
                                                <div
                                                    className="w-4 h-4 rounded-full border border-white/20"
                                                    style={{ backgroundColor: preset.accentColor }}
                                                />
                                            </div>
                                            <span className="text-slate-300 truncate">{preset.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </CollapsibleSection>

                            {/* Global Colors */}
                            <CollapsibleSection title="Colors" defaultOpen>
                                <div className="space-y-4">
                                    <ColorPicker
                                        label="Background"
                                        value={backgroundColor}
                                        onChange={setBackgroundColor}
                                    />
                                    <ColorPicker
                                        label="Accent"
                                        value={accentColor}
                                        onChange={setAccentColor}
                                    />
                                </div>
                            </CollapsibleSection>

                            {/* Glass Opacity */}
                            <CollapsibleSection title="Glass Effect" defaultOpen>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-400">Opacity</span>
                                        <span className="text-[10px] font-mono text-slate-500">
                                            {Math.round(glassOpacity * 100)}%
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={Math.round(glassOpacity * 100)}
                                        onChange={(e) => setGlassOpacity(Number(e.target.value) / 100)}
                                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-700 accent-blue-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-slate-600">
                                        <span>Clear</span>
                                        <span>Solid</span>
                                    </div>
                                </div>
                            </CollapsibleSection>

                            {/* Per-Widget Colors */}
                            <CollapsibleSection title="Widget Colors">
                                <div className="space-y-4">
                                    {WIDGET_REGISTRY.map((widget) => {
                                        const isHidden = hiddenWidgets.includes(widget.id);
                                        if (isHidden) return null;

                                        return (
                                            <ColorPicker
                                                key={widget.id}
                                                label={widget.title}
                                                value={widgetColors[widget.id] || accentColor}
                                                onChange={(hex) => setWidgetColor(widget.id, hex)}
                                                onClear={
                                                    widgetColors[widget.id]
                                                        ? () => clearWidgetColor(widget.id)
                                                        : undefined
                                                }
                                            />
                                        );
                                    })}
                                </div>
                            </CollapsibleSection>

                            {/* Widget Visibility */}
                            <CollapsibleSection title="Available Key Widgets" defaultOpen>
                                <div className="space-y-2">
                                    {WIDGET_REGISTRY.map(widget => {
                                        const isHidden = hiddenWidgets.includes(widget.id);
                                        const isVisible = !isHidden;

                                        return (
                                            <div
                                                key={widget.id}
                                                onClick={() => toggleWidgetVisibility(widget.id)}
                                                className={clsx(
                                                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                                    isVisible
                                                        ? "bg-blue-600/20 border-blue-500/50"
                                                        : "bg-slate-800/50 border-white/5 hover:bg-slate-800"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "w-5 h-5 rounded-full flex items-center justify-center border",
                                                    isVisible ? "border-blue-500 text-blue-500" : "border-white/20 text-transparent"
                                                )}>
                                                    {isVisible && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />}
                                                </div>
                                                <div className="flex-1">
                                                    <p className={clsx("text-sm font-medium", isVisible ? "text-slate-200" : "text-slate-500")}>
                                                        {widget.title}
                                                    </p>
                                                    <p className="text-xs text-slate-500 capitalize">{widget.type} Widget</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CollapsibleSection>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 border-t border-white/10 bg-white/5 relative space-y-2">
                            <button
                                onClick={() => {
                                    if (confirm('Reset all colors to default?')) {
                                        resetTheme();
                                    }
                                }}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition-all text-sm font-medium"
                            >
                                <Palette className="w-4 h-4" />
                                Reset Colors
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm('Are you sure you want to reset the layout to default?')) {
                                        resetLayout();
                                    }
                                }}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition-all text-sm font-medium"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Reset to Default Layout
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
