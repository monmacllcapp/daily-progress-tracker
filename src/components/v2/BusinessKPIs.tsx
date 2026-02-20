import React from 'react';
import { AlertCircle, Info, AlertTriangle, XCircle, Building2 } from 'lucide-react';
import type { Signal, Deal } from '../../types/signals';

interface BusinessKPIsProps {
  signals?: Signal[];
  deals?: Deal[];
}

export const BusinessKPIs: React.FC<BusinessKPIsProps> = ({
  signals = [],
  deals = []
}) => {
  // Count signals by severity
  const criticalCount = signals.filter(s => s.severity === 'critical' && !s.is_dismissed).length;
  const urgentCount = signals.filter(s => s.severity === 'urgent' && !s.is_dismissed).length;
  const attentionCount = signals.filter(s => s.severity === 'attention' && !s.is_dismissed).length;
  const infoCount = signals.filter(s => s.severity === 'info' && !s.is_dismissed).length;

  // Count deals by status
  const prospectCount = deals.filter(d => d.status === 'prospect').length;
  const analyzingCount = deals.filter(d => d.status === 'analyzing').length;
  const offerCount = deals.filter(d => d.status === 'offer').length;
  const underContractCount = deals.filter(d => d.status === 'under_contract').length;

  const totalSignals = criticalCount + urgentCount + attentionCount + infoCount;
  const activeDeals = prospectCount + analyzingCount + offerCount + underContractCount;

  if (totalSignals === 0 && activeDeals === 0) {
    return (
      <div className="p-4 bg-slate-900/50 rounded-lg border border-white/10">
        <div className="text-center text-slate-500">
          <Info className="w-6 h-6 mx-auto mb-2" />
          <p className="text-sm">No active signals or deals to display.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-900/50 rounded-lg border border-white/10 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-semibold text-white">Business KPIs</h2>
      </div>

      {/* Signal severity cards */}
      {totalSignals > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Active Signals
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-xs text-red-300 font-medium uppercase">Critical</span>
              </div>
              <div className="text-2xl font-bold text-red-400">{criticalCount}</div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-amber-300 font-medium uppercase">Urgent</span>
              </div>
              <div className="text-2xl font-bold text-amber-400">{urgentCount}</div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-blue-300 font-medium uppercase">Attention</span>
              </div>
              <div className="text-2xl font-bold text-blue-400">{attentionCount}</div>
            </div>

            <div className="bg-slate-500/10 border border-slate-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-300 font-medium uppercase">Info</span>
              </div>
              <div className="text-2xl font-bold text-slate-400">{infoCount}</div>
            </div>
          </div>
        </div>
      )}

      {/* Deal status breakdown */}
      {activeDeals > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Deal Pipeline Status
          </h3>
          <div className="space-y-2">
            {prospectCount > 0 && (
              <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-300">Prospect</span>
                </div>
                <span className="text-sm font-bold text-white">{prospectCount}</span>
              </div>
            )}

            {analyzingCount > 0 && (
              <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-slate-300">Analyzing</span>
                </div>
                <span className="text-sm font-bold text-white">{analyzingCount}</span>
              </div>
            )}

            {offerCount > 0 && (
              <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-slate-300">Offer</span>
                </div>
                <span className="text-sm font-bold text-white">{offerCount}</span>
              </div>
            )}

            {underContractCount > 0 && (
              <div className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-slate-300">Under Contract</span>
                </div>
                <span className="text-sm font-bold text-white">{underContractCount}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
