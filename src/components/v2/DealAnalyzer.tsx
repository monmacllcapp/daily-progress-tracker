import React from 'react';
import { Building2, DollarSign } from 'lucide-react';
import type { Deal } from '../../types/signals';

interface DealAnalyzerProps {
  deals?: Deal[];
  isLoading?: boolean;
}

export const DealAnalyzer: React.FC<DealAnalyzerProps> = ({ deals = [], isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="p-4 bg-slate-900/50 rounded-lg border border-white/10">
        <div className="flex items-center gap-2 text-slate-400">
          <Building2 className="w-4 h-4 animate-pulse" />
          <span>Loading deals...</span>
        </div>
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="p-4 bg-slate-900/50 rounded-lg border border-white/10">
        <div className="flex items-center gap-2 text-slate-500">
          <Building2 className="w-4 h-4" />
          <span>No deals in pipeline.</span>
        </div>
      </div>
    );
  }

  const activeDeals = deals.filter(d => d.status !== 'closed' && d.status !== 'dead');
  const totalValue = activeDeals.reduce((sum, d) => sum + (d.purchase_price || 0), 0);
  const underContractCount = deals.filter(d => d.status === 'under_contract').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'under_contract':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'offer':
        return 'bg-amber-500/20 text-amber-400';
      case 'analyzing':
        return 'bg-blue-500/20 text-blue-400';
      case 'prospect':
        return 'bg-slate-500/20 text-slate-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  const formatStatus = (status: string) => {
    return status.replace('_', ' ');
  };

  return (
    <div className="p-4 bg-slate-900/50 rounded-lg border border-white/10 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-emerald-400" />
        <h2 className="text-lg font-semibold text-white">Deal Pipeline</h2>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-white">{activeDeals.length}</div>
          <div className="text-xs text-slate-400 mt-1">Active</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-emerald-400">
            ${(totalValue / 1000).toFixed(0)}k
          </div>
          <div className="text-xs text-slate-400 mt-1">Pipeline</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-400">{underContractCount}</div>
          <div className="text-xs text-slate-400 mt-1">Under Contract</div>
        </div>
      </div>

      {/* Deal cards */}
      <div className="space-y-2">
        {activeDeals.slice(0, 5).map(deal => (
          <div
            key={deal.id}
            className="p-3 bg-slate-800/30 border border-white/5 rounded-lg hover:border-white/10 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-white truncate flex-1 mr-2">
                {deal.address}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${getStatusColor(deal.status)}`}>
                {formatStatus(deal.status)}
              </span>
            </div>
            <div className="flex gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                {deal.city}, {deal.state}
              </span>
              <span className="capitalize">{deal.strategy}</span>
              {deal.purchase_price && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  {deal.purchase_price.toLocaleString()}
                </span>
              )}
            </div>
            {deal.cap_rate && (
              <div className="mt-2 text-xs text-emerald-400">
                Cap Rate: {(deal.cap_rate * 100).toFixed(2)}%
              </div>
            )}
          </div>
        ))}
      </div>

      {/* View more indicator */}
      {activeDeals.length > 5 && (
        <div className="text-xs text-center text-slate-500 pt-2">
          +{activeDeals.length - 5} more deals
        </div>
      )}
    </div>
  );
};
