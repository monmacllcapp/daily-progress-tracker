import { FinancialDashboard } from '../components/FinancialDashboard';
import { SignalFeed } from '../components/v2/SignalFeed';
import { useSignalStore } from '../store/signalStore';

export default function FinancialPage() {
  const signals = useSignalStore(s => s.signals);

  const now = new Date().toISOString();
  const financeSignals = signals.filter(s =>
    !s.is_dismissed && (!s.expires_at || s.expires_at > now) && s.domain === 'finance'
  );

  return (
    <div className="animate-fade-up space-y-6">
      {/* Finance Signals */}
      {financeSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Financial Alerts
          </div>
          <SignalFeed filterDomain="finance" maxSignals={5} />
        </div>
      )}

      <div className="glass-card p-4 sm:p-6 min-h-[80vh]">
        <FinancialDashboard pageMode />
      </div>
    </div>
  );
}
