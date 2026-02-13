import React from 'react';
import { Heart, Flame, AlertCircle, CheckCircle, Circle } from 'lucide-react';
import type { Signal } from '../../types/signals';

export interface HealthTrackerProps {
  signals?: Signal[];
  streakDays?: number;
  todayHabits?: { name: string; completed: boolean }[];
  isLoading?: boolean;
}

export const HealthTracker: React.FC<HealthTrackerProps> = ({
  signals = [],
  streakDays = 0,
  todayHabits = [],
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <div className="p-4 text-slate-400">
        Loading health data...
      </div>
    );
  }

  const healthSignals = signals.filter(s => s.domain === 'health_fitness');

  if (healthSignals.length === 0 && streakDays === 0 && todayHabits.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500 py-4">
        <Heart className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No health data today</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Health signals banner */}
      {healthSignals.length > 0 && (
        <div className="space-y-1">
          {healthSignals.map(signal => (
            <div
              key={signal.id}
              className="flex items-center gap-2 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg"
            >
              <AlertCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              <span className="text-sm text-emerald-200">{signal.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Streak display */}
      {streakDays > 0 && (
        <div className="p-3 bg-slate-800/30 border border-white/5 rounded-lg">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-medium text-white">
              {streakDays} day{streakDays !== 1 ? 's' : ''} streak
            </span>
          </div>
        </div>
      )}

      {/* Today's health habits checklist */}
      {todayHabits.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-slate-400 uppercase tracking-wide">Today's Habits</div>
          {todayHabits.map((habit, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 p-2 bg-slate-800/20 rounded-lg"
            >
              {habit.completed ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-slate-600 flex-shrink-0" />
              )}
              <span className={`text-sm ${habit.completed ? 'text-slate-300' : 'text-slate-500'}`}>
                {habit.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
