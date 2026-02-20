import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import type { UserProfile } from '../types/schema';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';
import { getLevelProgress } from '../services/gamification';

export function LevelBadge() {
    const [db] = useDatabase();
    const [profiles] = useRxQuery<UserProfile>(db?.user_profile);
    const profile = profiles[0];

    if (!profile) return null;

    const progress = getLevelProgress(profile.xp);
    const progressPercent = progress; // 0-99 out of 100 XP per level

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-900/60 border border-white/10 rounded-lg"
        >
            {/* Level circle */}
            <div className="relative w-8 h-8 flex items-center justify-center">
                {/* Background ring */}
                <svg className="absolute inset-0 w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                    <circle
                        cx="16" cy="16" r="13"
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="3"
                    />
                    <circle
                        cx="16" cy="16" r="13"
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 13}`}
                        strokeDashoffset={`${2 * Math.PI * 13 * (1 - progressPercent / 100)}`}
                        className="transition-all duration-500"
                    />
                </svg>
                <span className="text-[10px] font-bold text-blue-400 z-10">
                    {profile.level}
                </span>
            </div>

            {/* XP + Gold */}
            <div className="hidden sm:flex flex-col leading-none">
                <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-blue-400" />
                    <span className="text-[11px] font-medium text-slate-300">
                        {profile.xp} XP
                    </span>
                </div>
                <span className="text-[10px] text-amber-400 mt-0.5">
                    {profile.gold}g
                </span>
            </div>
        </motion.div>
    );
}
