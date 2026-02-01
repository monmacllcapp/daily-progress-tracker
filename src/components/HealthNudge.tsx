import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Droplets, StretchHorizontal, Eye } from 'lucide-react';

export type NudgeType = 'HYDRATE' | 'STRETCH' | 'EYE_BREAK';

interface HealthNudgeProps {
    type: NudgeType | null;
    onDismiss: () => void;
    onSnooze: (type: NudgeType) => void;
}

const NUDGE_CONFIG: Record<NudgeType, { icon: React.ComponentType<{ className?: string }>; title: string; message: string; color: string; emoji: string }> = {
    HYDRATE: {
        icon: Droplets,
        title: 'Hydration Check',
        message: 'Time to drink some water. Stay hydrated for peak focus.',
        color: 'text-blue-400',
        emoji: '💧',
    },
    STRETCH: {
        icon: StretchHorizontal,
        title: 'Stretch Break',
        message: 'Stand up and stretch. Move your body for a minute or two.',
        color: 'text-green-400',
        emoji: '🧘',
    },
    EYE_BREAK: {
        icon: Eye,
        title: 'Eye Rest',
        message: 'Look at something far away for 20 seconds. Rest your eyes.',
        color: 'text-purple-400',
        emoji: '👁️',
    },
};

export function HealthNudge({ type, onDismiss, onSnooze }: HealthNudgeProps) {
    // Auto-dismiss after 15 seconds
    useEffect(() => {
        if (!type) return;
        const timer = setTimeout(onDismiss, 15000);
        return () => clearTimeout(timer);
    }, [type, onDismiss]);

    if (!type) return null;
    const config = NUDGE_CONFIG[type];
    const Icon = config.icon;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 50, x: 0 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="fixed bottom-6 right-6 z-50 w-80"
            >
                <div className="bg-zinc-900/95 backdrop-blur-lg border border-zinc-700/50 rounded-xl shadow-2xl p-4">
                    <div className="flex items-start gap-3">
                        <div className={`flex-shrink-0 p-2 rounded-lg bg-zinc-800 ${config.color}`}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold">{config.emoji} {config.title}</p>
                            <p className="text-xs text-secondary mt-0.5">{config.message}</p>
                        </div>
                        <button
                            onClick={onDismiss}
                            className="flex-shrink-0 p-1 hover:bg-zinc-800 rounded"
                        >
                            <X className="w-4 h-4 text-secondary" />
                        </button>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                        <button
                            onClick={onDismiss}
                            className="flex-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-medium transition-colors"
                        >
                            Done
                        </button>
                        <button
                            onClick={() => onSnooze(type)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-medium transition-colors text-secondary"
                        >
                            <Clock className="w-3 h-3" />
                            10 min
                        </button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
