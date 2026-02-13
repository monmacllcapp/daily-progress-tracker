import { TradingDashboard } from '../components/v2/TradingDashboard';
import { BusinessKPIs } from '../components/v2/BusinessKPIs';

export default function TradingPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Portfolio
          </div>
          <TradingDashboard />
        </div>
        <div className="bg-slate-900/50 border border-white/10 rounded-xl">
          <div className="px-4 py-3 border-b border-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Business KPIs
          </div>
          <BusinessKPIs />
        </div>
      </div>
    </div>
  );
}
