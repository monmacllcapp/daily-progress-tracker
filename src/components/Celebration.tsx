import { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CelebrationProps {
    show: boolean;
    message?: string;
    onComplete?: () => void;
}

const CONFETTI_COLORS = ['#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#EF4444', '#EC4899', '#F97316'];

interface Particle {
    id: number;
    x: number;
    y: number;
    color: string;
    size: number;
    rotation: number;
    dx: number;
    dy: number;
    borderRadius: string;
}

function generateParticles(count: number): Particle[] {
    return Array.from({ length: count }, (_, i) => ({
        id: i,
        x: 50 + (Math.random() - 0.5) * 40,
        y: 30,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 4 + Math.random() * 6,
        rotation: Math.random() * 360,
        dx: (Math.random() - 0.5) * 80,
        dy: 40 + Math.random() * 60,
        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
    }));
}

export function Celebration({ show, message, onComplete }: CelebrationProps) {
    // Generate particles only when `show` transitions to true
    const particles = useMemo(() => {
        if (!show) return [];
        return generateParticles(30);
    }, [show]);

    useEffect(() => {
        if (show) {
            const timer = setTimeout(() => {
                onComplete?.();
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, [show, onComplete]);

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 pointer-events-none z-50"
                >
                    {/* Confetti particles */}
                    {particles.map(p => (
                        <motion.div
                            key={p.id}
                            initial={{
                                left: `${p.x}%`,
                                top: `${p.y}%`,
                                rotate: 0,
                                opacity: 1,
                            }}
                            animate={{
                                left: `${p.x + p.dx}%`,
                                top: `${p.y + p.dy}%`,
                                rotate: p.rotation,
                                opacity: 0,
                            }}
                            transition={{ duration: 2, ease: 'easeOut' }}
                            className="absolute"
                            style={{
                                width: p.size,
                                height: p.size,
                                backgroundColor: p.color,
                                borderRadius: p.borderRadius,
                            }}
                        />
                    ))}

                    {/* Message */}
                    {message && (
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <div className="bg-zinc-900/90 backdrop-blur px-8 py-4 rounded-2xl border border-zinc-700/50 shadow-2xl">
                                <p className="text-lg font-bold text-center bg-gradient-to-r from-amber-400 to-rose-400 bg-clip-text text-transparent">
                                    {message}
                                </p>
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
