import { TradingDashboard } from '../components/v2/TradingDashboard';
import { BusinessKPIs } from '../components/v2/BusinessKPIs';
import { SignalFeed } from '../components/v2/SignalFeed';
import { useSignalStore } from '../store/signalStore';

export default function TradingPage() {
  const signals = useSignalStore(s => s.signals);

  // Filter active signals for trading domain
  const now = new Date().toISOString();
  const tradingSignals = signals.filter(s =>
    !s.is_dismissed && (!s.expires_at || s.expires_at > now) && s.domain === 'business_trading'
  );

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Domain Signal Feed */}
      {tradingSignals.length > 0 && (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Trading Signals
          </div>
          <SignalFeed filterDomain="business_trading" maxSignals={5} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Portfolio
          </div>
          <TradingDashboard signals={tradingSignals} />
        </div>
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Business KPIs
          </div>
          <BusinessKPIs signals={tradingSignals} />
        </div>
      </div>
    </div>
  );
}
