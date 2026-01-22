import { motion, AnimatePresence } from 'framer-motion';
import { Activity, X } from 'lucide-react';

interface PatternInterruptProps {
    isOpen: boolean;
    onDismiss: () => void;
}

export function PatternInterrupt({ isOpen, onDismiss }: PatternInterruptProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Full-screen backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-md z-[100]"
                    />

                    {/* Center card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: 'spring', damping: 20 }}
                        className="fixed inset-0 z-[101] flex items-center justify-center p-6"
                    >
                        <div className="glass-card p-12 max-w-md w-full text-center relative">
                            {/* Animated icon */}
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                                transition={{
                                    scale: { type: 'spring', delay: 0.2 },
                                    rotate: { repeat: Infinity, duration: 2, ease: 'easeInOut' }
                                }}
                                className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 mb-6"
                            >
                                <Activity className="w-12 h-12 text-blue-400" />
                            </motion.div>

                            <h2 className="text-3xl font-bold mb-4">Pattern Interrupt</h2>
                            <p className="text-secondary text-lg mb-2">
                                You've been focused for 60 minutes
                            </p>
                            <p className="text-white text-opacity-60 text-sm mb-8">
                                Time to stand, stretch, and reset your nervous system
                            </p>

                            {/* Breathing animation */}
                            <motion.div
                                animate={{
                                    scale: [1, 1.2, 1],
                                    opacity: [0.5, 1, 0.5]
                                }}
                                transition={{
                                    repeat: Infinity,
                                    duration: 4,
                                    ease: 'easeInOut'
                                }}
                                className="w-32 h-32 mx-auto mb-8 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30"
                            />

                            <button
                                onClick={onDismiss}
                                className="px-8 py-4 bg-blue-500 hover:bg-blue-600 rounded-xl font-bold text-lg transition-all shadow-lg shadow-[rgba(59,130,246,0.2)] active:scale-95"
                            >
                                I'm Ready
                            </button>

                            <p className="text-secondary text-xs mt-6">
                                💧 Don't forget to hydrate
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
