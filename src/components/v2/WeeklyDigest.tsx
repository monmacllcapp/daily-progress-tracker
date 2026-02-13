import React from 'react';
import { TrendingUp, Target, Zap, Flame, Calendar } from 'lucide-react';
import type { ProductivityPattern } from '../../types/signals';

export interface WeeklyDigestProps {
  patterns?: ProductivityPattern[];
  tasksCompleted?: number;
  signalsGenerated?: number;
  streaksActive?: number;
  weekStart?: string;
  isLoading?: boolean;
}

export const WeeklyDigest: React.FC<WeeklyDigestProps> = ({
  patterns = [],
  tasksCompleted = 0,
  signalsGenerated = 0,
  streaksActive = 0,
  weekStart,
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <div className="p-4 text-slate-400">
        Loading weekly digest...
      </div>
    );
  }

  const hasData = tasksCompleted > 0 || signalsGenerated > 0 || streaksActive > 0 || patterns.length > 0;

  if (!hasData) {
    return (
      <div className="p-4 text-center text-slate-500 py-4">
        <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No weekly data available</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Week header */}
      {weekStart && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Calendar className="w-3 h-3" />
          <span>Week of {new Date(weekStart).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
        </div>
      )}

      {/* Summary stats */}
      {(tasksCompleted > 0 || signalsGenerated > 0 || streaksActive > 0) && (
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 bg-slate-800/30 border border-white/5 rounded-lg">
            <div className="flex items-center gap-1 mb-1">
              <Target className="w-3 h-3 text-blue-400" />
              <span className="text-xs text-slate-400">Tasks</span>
            </div>
            <div className="text-lg font-semibold text-white">{tasksCompleted}</div>
          </div>

          <div className="p-3 bg-slate-800/30 border border-white/5 rounded-lg">
            <div className="flex items-center gap-1 mb-1">
              <Zap className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-slate-400">Signals</span>
            </div>
            <div className="text-lg font-semibold text-white">{signalsGenerated}</div>
          </div>

          <div className="p-3 bg-slate-800/30 border border-white/5 rounded-lg">
            <div className="flex items-center gap-1 mb-1">
              <Flame className="w-3 h-3 text-orange-400" />
              <span className="text-xs text-slate-400">Streaks</span>
            </div>
            <div className="text-lg font-semibold text-white">{streaksActive}</div>
          </div>
        </div>
      )}

      {/* Productivity patterns */}
      {patterns.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-slate-400 uppercase tracking-wide">Insights</div>
          {patterns.map(pattern => (
            <div
              key={pattern.id}
              className="p-3 bg-slate-800/30 border border-white/5 rounded-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-sm text-slate-300">{pattern.description}</div>
                </div>
                <div className="text-xs font-medium text-emerald-400 flex-shrink-0">
                  {Math.round(pattern.confidence * 100)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
