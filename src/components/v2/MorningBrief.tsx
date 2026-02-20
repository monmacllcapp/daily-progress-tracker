import React from 'react';
import { AlertTriangle, Bell, TrendingUp, Calendar, Users, Brain, Lightbulb } from 'lucide-react';
import type { MorningBrief as MorningBriefType } from '../../types/signals';

interface MorningBriefProps {
  brief?: MorningBriefType | null;
  isLoading?: boolean;
}

export const MorningBrief: React.FC<MorningBriefProps> = ({ brief, isLoading = false }) => {
  if (isLoading) {
    return <div className="p-4 text-slate-400">Generating morning brief...</div>;
  }

  if (!brief) {
    return <div className="p-4 text-slate-500">No brief available yet.</div>;
  }

  return (
    <div className="p-4 space-y-4">
      {/* Date header */}
      <div className="text-sm text-slate-400">{brief.date}</div>

      {/* AI Insight banner */}
      <div className="flex items-start gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
        <Brain className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-indigo-200">{brief.ai_insight}</p>
      </div>

      {/* Urgent Signals */}
      {brief.urgent_signals.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Urgent ({brief.urgent_signals.length})
          </h3>
          <div className="space-y-1">
            {brief.urgent_signals.map(signal => (
              <div key={signal.id} className="text-sm text-slate-300 pl-4 border-l-2 border-red-500/50">
                {signal.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attention Signals */}
      {brief.attention_signals.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1">
            <Bell className="w-3 h-3" /> Attention ({brief.attention_signals.length})
          </h3>
          <div className="space-y-1">
            {brief.attention_signals.map(signal => (
              <div key={signal.id} className="text-sm text-slate-300 pl-4 border-l-2 border-amber-500/50">
                {signal.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Portfolio Pulse */}
      {brief.portfolio_pulse && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Portfolio
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-400">Equity: <span className="text-white">${brief.portfolio_pulse.equity.toLocaleString()}</span></div>
            <div className="text-slate-400">Day P&amp;L: <span className={brief.portfolio_pulse.day_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {brief.portfolio_pulse.day_pnl >= 0 ? '+' : ''}${brief.portfolio_pulse.day_pnl.toLocaleString()}
            </span></div>
          </div>
        </div>
      )}

      {/* Calendar Summary */}
      {brief.calendar_summary.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-2 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Today&apos;s Schedule
          </h3>
          <div className="space-y-1">
            {brief.calendar_summary.map((item, i) => (
              <div key={i} className="text-sm text-slate-300">{item}</div>
            ))}
          </div>
        </div>
      )}

      {/* Family Summary */}
      {brief.family_summary.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-pink-400 mb-2 flex items-center gap-1">
            <Users className="w-3 h-3" /> Family
          </h3>
          <div className="space-y-1">
            {brief.family_summary.map((item, i) => (
              <div key={i} className="text-sm text-slate-300">{item}</div>
            ))}
          </div>
        </div>
      )}

      {/* Learned Suggestions */}
      {brief.learned_suggestions && brief.learned_suggestions.length > 0 && (
        <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Learned Insights
            </span>
          </div>
          <div className="space-y-2">
            {brief.learned_suggestions.map((suggestion, index) => (
              <p key={index} className="text-sm text-slate-300 pl-6">
                {suggestion}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
