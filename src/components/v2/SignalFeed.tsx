import React, { useMemo } from 'react';
import { AlertTriangle, AlertCircle, Info, Bell, X, CheckCircle } from 'lucide-react';
import { useSignalStore } from '../../store/signalStore';
import type { Signal, SignalSeverity } from '../../types/signals';

// Severity badge helper
const severityConfig: Record<SignalSeverity, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  urgent: { icon: AlertCircle, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  attention: { icon: Bell, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
};

interface SignalCardProps {
  signal: Signal;
  onDismiss: (id: string) => void;
  onAct: (id: string) => void;
}

const SignalCard: React.FC<SignalCardProps> = ({ signal, onDismiss, onAct }) => {
  const config = severityConfig[signal.severity];
  const Icon = config.icon;

  return (
    <div className={`p-3 border rounded-lg ${config.bg} flex items-start gap-3`}>
      <Icon className={`w-4 h-4 ${config.color} mt-0.5 flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{signal.title}</div>
        <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{signal.context}</div>
        {signal.suggested_action && (
          <div className="text-xs text-slate-500 mt-1 italic">{signal.suggested_action}</div>
        )}
        <div className="text-xs text-slate-600 mt-1">{signal.source} · {signal.domain}</div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={() => onAct(signal.id)}
          className="p-1 hover:bg-white/10 rounded transition-colors"
          title="Mark as acted on"
        >
          <CheckCircle className="w-4 h-4 text-emerald-400" />
        </button>
        <button
          onClick={() => onDismiss(signal.id)}
          className="p-1 hover:bg-white/10 rounded transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>
    </div>
  );
};

export interface SignalFeedProps {
  maxSignals?: number;
  filterDomain?: string;
}

export const SignalFeed: React.FC<SignalFeedProps> = ({ maxSignals = 20, filterDomain }) => {
  const signals = useSignalStore((s) => s.signals);
  const dismissSignal = useSignalStore((s) => s.dismissSignal);
  const actOnSignal = useSignalStore((s) => s.actOnSignal);

  const filteredSignals = useMemo(() => {
    // Compute active signals inline
    const now = new Date().toISOString();
    let activeSignals = signals.filter(s =>
      !s.is_dismissed && (!s.expires_at || s.expires_at > now)
    );

    if (filterDomain) {
      activeSignals = activeSignals.filter(s => s.domain === filterDomain);
    }

    // Sort by severity weight (critical first)
    const severityOrder: Record<SignalSeverity, number> = { critical: 0, urgent: 1, attention: 2, info: 3 };
    activeSignals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    return activeSignals.slice(0, maxSignals);
  }, [signals, filterDomain, maxSignals]);

  const signalCount = useMemo(() => {
    const now = new Date().toISOString();
    const active = signals.filter(s =>
      !s.is_dismissed && (!s.expires_at || s.expires_at > now)
    );
    return {
      total: active.length,
      urgent: active.filter(s => s.severity === 'urgent' || s.severity === 'critical').length,
      attention: active.filter(s => s.severity === 'attention').length,
      info: active.filter(s => s.severity === 'info').length,
    };
  }, [signals]);

  if (filteredSignals.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500">
        <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No active signals</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-slate-400">{signalCount.total} active</span>
        {signalCount.urgent > 0 && (
          <span className="text-red-400 font-medium">{signalCount.urgent} urgent</span>
        )}
        {signalCount.attention > 0 && (
          <span className="text-amber-400">{signalCount.attention} attention</span>
        )}
      </div>

      {/* Signal cards */}
      <div className="space-y-2">
        {filteredSignals.map(signal => (
          <SignalCard
            key={signal.id}
            signal={signal}
            onDismiss={dismissSignal}
            onAct={actOnSignal}
          />
        ))}
      </div>
    </div>
  );
};
