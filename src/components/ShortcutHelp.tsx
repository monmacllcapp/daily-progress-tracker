import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';

interface ShortcutHelpProps {
    isOpen: boolean;
    onClose: () => void;
    shortcuts: Array<{ key: string; ctrl?: boolean; shift?: boolean; description: string }>;
}

function formatKeyCombo(s: { key: string; ctrl?: boolean; shift?: boolean }): string {
    const parts: string[] = [];
    if (s.ctrl) parts.push('Ctrl');
    if (s.shift) parts.push('Shift');
    parts.push(s.key.toUpperCase());
    return parts.join(' + ');
}

export function ShortcutHelp({ isOpen, onClose, shortcuts }: ShortcutHelpProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={e => e.stopPropagation()}
                        className="glass-card p-8 max-w-md w-full"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <Keyboard className="w-5 h-5 text-blue-400" />
                                <h2 className="text-lg font-bold">Keyboard Shortcuts</h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-2">
                            {shortcuts.map(s => (
                                <div key={s.key + s.description} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                    <span className="text-sm text-slate-300">{s.description}</span>
                                    <kbd className="px-2 py-1 bg-slate-800 border border-white/10 rounded text-xs font-mono text-slate-400">
                                        {formatKeyCombo(s)}
                                    </kbd>
                                </div>
                            ))}

                            {/* Help shortcut itself */}
                            <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                <span className="text-sm text-slate-300">Show this help</span>
                                <kbd className="px-2 py-1 bg-slate-800 border border-white/10 rounded text-xs font-mono text-slate-400">
                                    ?
                                </kbd>
                            </div>
                        </div>

                        <p className="text-xs text-slate-600 mt-6 text-center">
                            Press <kbd className="px-1 bg-slate-800 rounded text-xs">Esc</kbd> to close
                        </p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
