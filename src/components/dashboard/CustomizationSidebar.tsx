import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, CheckCircle, Circle, LayoutDashboard } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { WIDGET_REGISTRY } from '../../config/widgetRegistry';
import { clsx } from 'clsx';

export function CustomizationSidebar() {
    const { isSidebarOpen, setSidebarOpen, hiddenWidgets, toggleWidgetVisibility, resetLayout } = useDashboardStore();

    return (
        <AnimatePresence>
            {isSidebarOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-40"
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
                        <div className="p-6 border-b border-white border-opacity-10 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-white text-opacity-90">
                                <LayoutDashboard className="w-5 h-5 text-blue-500" />
                                <h2 className="font-bold text-lg">Customize</h2>
                            </div>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="text-white text-opacity-40 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Widget List */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">

                            <div>
                                <h3 className="text-xs font-bold text-white text-opacity-40 uppercase tracking-wider mb-4">
                                    Available Key Widgets
                                </h3>
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
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 border-t border-white border-opacity-10 bg-white bg-opacity-5 relative">
                            <button
                                onClick={() => {
                                    if (confirm('Are you sure you want to reset the layout to default?')) {
                                        resetLayout();
                                    }
                                }}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg border border-white border-opacity-10 hover:bg-white hover:bg-opacity-5 text-slate-400 hover:text-white transition-all text-sm font-medium"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Reset to Default Layout
                            </button>
                        </div>
                    </motion.div>
                </>
            )
            }
        </AnimatePresence >
    );
}
