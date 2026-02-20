import { DealAnalyzer } from '../components/v2/DealAnalyzer';
import { SignalFeed } from '../components/v2/SignalFeed';
import { useSignalStore } from '../store/signalStore';

export default function DealsPage() {
  const signals = useSignalStore(s => s.signals);

  const now = new Date().toISOString();
  const reSignals = signals.filter(s =>
    !s.is_dismissed && (!s.expires_at || s.expires_at > now) && s.domain === 'business_re'
  );

  return (
    <div className="space-y-6 animate-fade-up">
      {/* RE Domain Signals */}
      {reSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Deal Signals
          </div>
          <SignalFeed filterDomain="business_re" maxSignals={5} />
        </div>
      )}

      <div className="bg-slate-900/50 border border-white/10 rounded-xl">
        <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Deal Pipeline
        </div>
        <DealAnalyzer signals={reSignals} />
      </div>
    </div>
  );
}
