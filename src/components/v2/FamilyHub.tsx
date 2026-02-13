import React from 'react';
import { Users, AlertCircle, Heart } from 'lucide-react';
import type { FamilyEvent, Signal } from '../../types/signals';

export interface FamilyHubProps {
  events?: FamilyEvent[];
  signals?: Signal[];
  isLoading?: boolean;
}

export const FamilyHub: React.FC<FamilyHubProps> = ({
  events = [],
  signals = [],
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <div className="p-4 text-slate-400">
        Loading family data...
      </div>
    );
  }

  const familySignals = signals.filter(s => s.domain === 'family');
  const todayEvents = events; // assume pre-filtered by caller

  return (
    <div className="p-4 space-y-4">
      {/* Family signals banner */}
      {familySignals.length > 0 && (
        <div className="space-y-1">
          {familySignals.map(signal => (
            <div
              key={signal.id}
              className="flex items-center gap-2 p-2 bg-pink-500/10 border border-pink-500/20 rounded-lg"
            >
              <AlertCircle className="w-3 h-3 text-pink-400 flex-shrink-0" />
              <span className="text-sm text-pink-200">{signal.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Today's family events */}
      {todayEvents.length === 0 ? (
        <div className="text-center text-slate-500 py-4">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No family events today</p>
        </div>
      ) : (
        <div className="space-y-2">
          {todayEvents.map(event => (
            <div
              key={event.id}
              className="p-3 bg-slate-800/30 border border-white/5 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <Heart className="w-3 h-3 text-pink-400" />
                <span className="text-sm font-medium text-white">{event.member}</span>
              </div>
              <div className="text-sm text-slate-300 mt-1">{event.summary}</div>
              <div className="text-xs text-slate-500 mt-1">
                {new Date(event.start_time).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
