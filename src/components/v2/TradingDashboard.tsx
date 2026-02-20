import React from 'react';
import { TrendingUp, TrendingDown, BarChart3, DollarSign, AlertCircle } from 'lucide-react';
import type { PortfolioSnapshot, Signal } from '../../types/signals';

interface TradingDashboardProps {
  snapshot?: PortfolioSnapshot | null;
  signals?: Signal[];
  isLoading?: boolean;
}

export const TradingDashboard: React.FC<TradingDashboardProps> = ({
  snapshot,
  signals = [],
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <div className="p-4 bg-slate-900/50 rounded-lg border border-white/10">
        <div className="flex items-center gap-2 text-slate-400">
          <BarChart3 className="w-4 h-4 animate-pulse" />
          <span>Loading portfolio...</span>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="p-4 bg-slate-900/50 rounded-lg border border-white/10">
        <div className="flex items-center gap-2 text-slate-500">
          <BarChart3 className="w-4 h-4" />
          <span>No portfolio data available.</span>
        </div>
      </div>
    );
  }

  const isProfitable = snapshot.day_pnl >= 0;
  const dayPnlPct = snapshot.equity > 0 ? (snapshot.day_pnl / snapshot.equity) * 100 : 0;

  return (
    <div className="p-4 bg-slate-900/50 rounded-lg border border-white/10 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-semibold text-white">Trading Portfolio</h2>
      </div>

      {/* Equity header */}
      <div className="text-center bg-slate-800/50 rounded-lg p-4">
        <div className="text-3xl font-bold text-white">
          ${snapshot.equity.toLocaleString()}
        </div>
        <div className="text-xs text-slate-400 mt-1">Total Equity</div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Day P&L</div>
          <div className={`text-sm font-bold flex items-center gap-1 ${
            isProfitable ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {isProfitable ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {isProfitable ? '+' : ''}${snapshot.day_pnl.toLocaleString()}
          </div>
          <div className={`text-xs mt-0.5 ${
            isProfitable ? 'text-emerald-400/70' : 'text-red-400/70'
          }`}>
            {isProfitable ? '+' : ''}{dayPnlPct.toFixed(2)}%
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Cash</div>
          <div className="text-sm font-bold text-white flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            {snapshot.cash.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Buying: ${snapshot.buying_power.toLocaleString()}
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Positions</div>
          <div className="text-sm font-bold text-white">{snapshot.positions_count}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {snapshot.positions.length} tracked
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Total P&L</div>
          <div className={`text-sm font-bold ${
            snapshot.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {snapshot.total_pnl >= 0 ? '+' : ''}${snapshot.total_pnl.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">All time</div>
        </div>
      </div>

      {/* Trading Signals */}
      {signals.filter(s => !s.is_dismissed).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Trading Alerts
          </h3>
          <div className="space-y-1">
            {signals.filter(s => !s.is_dismissed).slice(0, 3).map(signal => (
              <div
                key={signal.id}
                className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                  signal.severity === 'critical' || signal.severity === 'urgent'
                    ? 'bg-red-500/10 border border-red-500/20 text-red-200'
                    : 'bg-blue-500/10 border border-blue-500/20 text-blue-200'
                }`}
              >
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{signal.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top positions */}
      {snapshot.positions.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Top Positions
          </h3>
          <div className="space-y-1">
            {snapshot.positions.slice(0, 5).map(pos => (
              <div
                key={pos.symbol}
                className="flex items-center justify-between text-sm bg-slate-800/30 rounded px-2 py-1.5"
              >
                <span className="font-medium text-white">{pos.symbol}</span>
                <span className="text-slate-400 text-xs">{pos.qty} shares</span>
                <span className={`text-xs font-medium ${
                  pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {snapshot.positions.length > 5 && (
        <div className="text-xs text-center text-slate-500 pt-1">
          +{snapshot.positions.length - 5} more positions
        </div>
      )}
    </div>
  );
};
