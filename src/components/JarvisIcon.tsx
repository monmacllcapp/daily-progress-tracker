/**
 * JarvisIcon — Prominent Dashboard Circle Button
 *
 * Big, unmissable circle at the very top of the dashboard.
 * AI-first design: the first thing users see and tap.
 * Shows soundwave animation when active, nudge preview below.
 */

import { SoundwaveAnimation } from './SoundwaveAnimation';
import type { JarvisNudge } from '../store/jarvisStore';
import { AlertTriangle, Lightbulb, Bell } from 'lucide-react';

interface JarvisIconProps {
  onClick: () => void;
  nudge: JarvisNudge | null;
  isActive: boolean;
}

const nudgeIcons = {
  warning: AlertTriangle,
  insight: Lightbulb,
  reminder: Bell,
} as const;

export function JarvisIcon({ onClick, nudge, isActive }: JarvisIconProps) {
  const NudgeIcon = nudge && !nudge.dismissed ? nudgeIcons[nudge.type] : null;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Big circle button */}
      <button
        onClick={onClick}
        className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer group ${
          isActive
            ? 'bg-gradient-to-br from-cyan-500 to-blue-600 shadow-[0_0_40px_rgba(34,211,238,0.3)]'
            : 'bg-gradient-to-br from-cyan-600/80 to-blue-700/80 hover:from-cyan-500 hover:to-blue-600 shadow-lg shadow-cyan-500/20 hover:shadow-[0_0_30px_rgba(34,211,238,0.25)]'
        }`}
      >
        {/* Outer pulse ring */}
        {!isActive && (
          <span className="absolute inset-0 rounded-full bg-cyan-400/20 animate-ping" style={{ animationDuration: '3s' }} />
        )}

        {/* Inner glow ring */}
        <span className={`absolute inset-1 rounded-full border-2 transition-colors ${
          isActive ? 'border-white/30' : 'border-white/10 group-hover:border-white/20'
        }`} />

        {/* Soundwave animation */}
        <SoundwaveAnimation active={isActive} size="md" />
      </button>

      {/* Label */}
      <div className="text-center">
        <p className="text-sm font-bold text-white tracking-widest uppercase">Maple</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {isActive ? 'Chat open' : 'Tap to talk'}
        </p>
      </div>

      {/* Nudge preview */}
      {nudge && !nudge.dismissed && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/60 border border-white/5 max-w-sm">
          {NudgeIcon && (
            <NudgeIcon
              className={`w-3.5 h-3.5 flex-shrink-0 ${
                nudge.type === 'warning'
                  ? 'text-amber-400'
                  : nudge.type === 'insight'
                    ? 'text-emerald-400'
                    : 'text-cyan-400'
              }`}
            />
          )}
          <span className="text-xs text-slate-300 truncate">
            {nudge.message}
          </span>
        </div>
      )}
    </div>
  );
}
