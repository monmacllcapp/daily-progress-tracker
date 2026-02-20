import { useMemo } from 'react';
import { EmailDashboard } from '../components/EmailDashboard';
import { useDatabase } from '../hooks/useDatabase';
import { useSnoozedEmailTimer } from '../hooks/useSnoozedEmailTimer';
import { useSignalStore } from '../store/signalStore';

export default function EmailPage() {
  const [db] = useDatabase();
  useSnoozedEmailTimer(db);

  const signals = useSignalStore(s => s.signals);
  const emailSignals = useMemo(() => {
    const now = new Date().toISOString();
    return signals.filter(s =>
      !s.is_dismissed && (!s.expires_at || s.expires_at > now) &&
      s.type === 'aging_email'
    );
  }, [signals]);

  return (
    <div className="animate-fade-up space-y-6">
      {/* Email Signals */}
      {emailSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Email Alerts
          </div>
          <div className="p-3 space-y-2">
            {emailSignals.slice(0, 5).map(signal => (
              <div
                key={signal.id}
                className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                  signal.severity === 'critical' || signal.severity === 'urgent'
                    ? 'bg-red-500/10 border border-red-500/20 text-red-200'
                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-200'
                }`}
              >
                <span className="truncate">{signal.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card p-4 sm:p-6 min-h-[60vh] h-[85vh] flex flex-col">
        <EmailDashboard />
      </div>
    </div>
  );
}
