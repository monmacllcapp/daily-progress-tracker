import React from 'react';
import { DollarSign, Building2, PieChart, AlertCircle } from 'lucide-react';
import type { PortfolioSnapshot, Deal, Signal } from '../../types/signals';

interface FinancialOverviewProps {
  snapshot?: PortfolioSnapshot | null;
  deals?: Deal[];
  signals?: Signal[];
}

export const FinancialOverview: React.FC<FinancialOverviewProps> = ({
  snapshot,
  deals = [],
  signals = []
}) => {
  const hasData = snapshot || deals.length > 0 || signals.filter(s => !s.is_dismissed).length > 0;

  if (!hasData) {
    return (
      <div className="p-4 bg-slate-900/50 rounded-lg border border-white/10">
        <div className="flex items-center gap-2 text-slate-500">
          <DollarSign className="w-4 h-4" />
          <span>No financial data available.</span>
        </div>
      </div>
    );
  }

  // Calculate deal pipeline value
  const activeDeals = deals.filter(d => d.status !== 'closed' && d.status !== 'dead');
  const dealPipelineValue = activeDeals.reduce((sum, d) => sum + (d.purchase_price || 0), 0);

  // Calculate net worth
  const portfolioEquity = snapshot?.equity || 0;
  const netWorth = portfolioEquity + dealPipelineValue;

  // Deal strategy breakdown
  const flipCount = activeDeals.filter(d => d.strategy === 'flip').length;
  const brrrrCount = activeDeals.filter(d => d.strategy === 'brrrr').length;
  const rentalCount = activeDeals.filter(d => d.strategy === 'rental').length;
  const wholesaleCount = activeDeals.filter(d => d.strategy === 'wholesale').length;

  // Portfolio allocation (simple cash vs positions)
  const cashPercent = snapshot && snapshot.equity > 0
    ? ((snapshot.cash / snapshot.equity) * 100).toFixed(1)
    : '0.0';
  const positionsPercent = snapshot && snapshot.equity > 0
    ? (((snapshot.equity - snapshot.cash) / snapshot.equity) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="p-4 bg-slate-900/50 rounded-lg border border-white/10 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-emerald-400" />
        <h2 className="text-lg font-semibold text-white">Financial Overview</h2>
      </div>

      {/* Financial Signals */}
      {signals.filter(s => !s.is_dismissed).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Financial Alerts
          </h3>
          <div className="space-y-1">
            {signals.filter(s => !s.is_dismissed).slice(0, 3).map(signal => (
              <div
                key={signal.id}
                className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                  signal.severity === 'critical' || signal.severity === 'urgent'
                    ? 'bg-amber-500/10 border border-amber-500/20 text-amber-200'
                    : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200'
                }`}
              >
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{signal.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Net worth summary */}
      <div className="text-center bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/30 rounded-lg p-4">
        <div className="text-xs text-emerald-300 font-medium uppercase tracking-wider mb-1">
          Total Net Worth
        </div>
        <div className="text-3xl font-bold text-white">
          ${netWorth.toLocaleString()}
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 text-xs">
          {snapshot && (
            <span className="text-blue-300">
              Portfolio: ${portfolioEquity.toLocaleString()}
            </span>
          )}
          {dealPipelineValue > 0 && (
            <span className="text-amber-300">
              Deals: ${dealPipelineValue.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Portfolio allocation */}
      {snapshot && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
            <PieChart className="w-3 h-3" />
            Portfolio Allocation
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
              <span className="text-sm text-slate-300">Cash</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">${snapshot.cash.toLocaleString()}</span>
                <span className="text-sm font-bold text-white">{cashPercent}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
              <span className="text-sm text-slate-300">Positions</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  ${(snapshot.equity - snapshot.cash).toLocaleString()}
                </span>
                <span className="text-sm font-bold text-white">{positionsPercent}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deal pipeline by strategy */}
      {activeDeals.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
            <Building2 className="w-3 h-3" />
            Deal Pipeline by Strategy
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {flipCount > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-white">{flipCount}</div>
                <div className="text-xs text-slate-400 capitalize">Flip</div>
              </div>
            )}
            {brrrrCount > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-white">{brrrrCount}</div>
                <div className="text-xs text-slate-400 uppercase">BRRRR</div>
              </div>
            )}
            {rentalCount > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-white">{rentalCount}</div>
                <div className="text-xs text-slate-400 capitalize">Rental</div>
              </div>
            )}
            {wholesaleCount > 0 && (
              <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-white">{wholesaleCount}</div>
                <div className="text-xs text-slate-400 capitalize">Wholesale</div>
              </div>
            )}
          </div>
          {flipCount === 0 && brrrrCount === 0 && rentalCount === 0 && wholesaleCount === 0 && (
            <div className="text-xs text-center text-slate-500 py-2">
              No active deals by strategy
            </div>
          )}
        </div>
      )}
    </div>
  );
};
