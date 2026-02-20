import { JournalHistory } from '../components/JournalHistory';
import { SignalFeed } from '../components/v2/SignalFeed';
import { useSignalStore } from '../store/signalStore';

export default function JournalPage() {
  const growthSignals = useSignalStore(s => {
    const now = new Date().toISOString();
    return s.signals.filter(sig =>
      !sig.is_dismissed &&
      (!sig.expires_at || sig.expires_at > now) &&
      sig.domain === 'personal_growth'
    );
  });

  return (
    <div className="animate-fade-up space-y-6">
      {/* Personal Growth Signals */}
      {growthSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Growth Insights
          </div>
          <SignalFeed filterDomain="personal_growth" maxSignals={3} />
        </div>
      )}

      <div className="glass-card p-4 sm:p-6 min-h-[60vh]">
        <JournalHistory />
      </div>
    </div>
  );
}
