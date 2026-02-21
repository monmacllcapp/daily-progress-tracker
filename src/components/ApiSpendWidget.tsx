/**
 * API Spend Widget
 *
 * Compact dashboard widget showing monthly AI API costs.
 * Expands to full detail view with per-model breakdown and recent calls.
 */

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, X, Cpu, Zap, RefreshCw } from 'lucide-react';
import { useApiSpendStore, type SpendRecord } from '../store/apiSpendStore';
import { TOKEN_PRICING } from '../config/modelTiers';

const PROVIDER_COLORS: Record<string, string> = {
  claude: 'bg-orange-500',
  gemini: 'bg-blue-500',
  kimi: 'bg-purple-500',
  deepseek: 'bg-teal-500',
  ollama: 'bg-green-500',
};

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
  ollama: 'Ollama',
};

function formatCost(cost: number): string {
  return cost < 0.01 && cost > 0 ? '<$0.01' : `$${cost.toFixed(2)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function ProviderBar({ provider, cost, total }: { provider: string; cost: number; total: number }) {
  const pct = total > 0 ? (cost / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-slate-400 truncate">{PROVIDER_LABELS[provider] || provider}</span>
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${PROVIDER_COLORS[provider] || 'bg-slate-500'}`}
          style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
        />
      </div>
      <span className="w-14 text-right text-slate-300">{formatCost(cost)}</span>
    </div>
  );
}

function RecentCallRow({ record }: { record: SpendRecord }) {
  const time = new Date(record.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div className="flex items-center gap-3 py-1.5 text-xs border-b border-white/5 last:border-0">
      <span className="text-slate-500 w-14">{time}</span>
      <span className={`w-2 h-2 rounded-full ${PROVIDER_COLORS[record.provider] || 'bg-slate-500'}`} />
      <span className="text-slate-300 flex-1 truncate">{record.model}</span>
      <span className="text-slate-500">{record.role}</span>
      <span className="text-slate-300 w-16 text-right">{formatCost(record.cost)}</span>
    </div>
  );
}

function ModelCostTable({ byModel }: { byModel: Record<string, number> }) {
  const sorted = useMemo(
    () => Object.entries(byModel).sort((a, b) => b[1] - a[1]),
    [byModel]
  );

  if (sorted.length === 0) {
    return <div className="text-xs text-slate-500 py-2">No calls yet this month.</div>;
  }

  return (
    <div className="space-y-1">
      <div className="flex text-[10px] uppercase tracking-wider text-slate-500 pb-1 border-b border-white/5">
        <span className="flex-1">Model</span>
        <span className="w-20 text-right">Input $/1M</span>
        <span className="w-20 text-right">Output $/1M</span>
        <span className="w-16 text-right">Spent</span>
      </div>
      {sorted.map(([model, cost]) => {
        const pricing = TOKEN_PRICING[model] || [0, 0];
        return (
          <div key={model} className="flex items-center text-xs py-1">
            <span className="flex-1 text-slate-300 truncate">{model}</span>
            <span className="w-20 text-right text-slate-500">${pricing[0]}</span>
            <span className="w-20 text-right text-slate-500">${pricing[1]}</span>
            <span className="w-16 text-right text-slate-200 font-medium">{formatCost(cost)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ApiSpendWidget() {
  const [isMaximized, setIsMaximized] = useState(false);
  const { monthlySpend, records, resetMonth } = useApiSpendStore();

  const nextThreshold = useMemo(() => {
    const current = monthlySpend.totalCost;
    return Math.ceil((current + 1) / 20) * 20;
  }, [monthlySpend.totalCost]);

  const progressPct = useMemo(() => {
    const prevThreshold = nextThreshold - 20;
    const range = nextThreshold - prevThreshold;
    const progress = monthlySpend.totalCost - prevThreshold;
    return Math.min(Math.max((progress / range) * 100, 0), 100);
  }, [monthlySpend.totalCost, nextThreshold]);

  const providerEntries = useMemo(
    () =>
      Object.entries(monthlySpend.byProvider).sort((a, b) => b[1] - a[1]),
    [monthlySpend.byProvider]
  );

  const recentCalls = useMemo(() => [...records].reverse().slice(0, 50), [records]);

  const totalTokens = useMemo(
    () => records.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0),
    [records]
  );

  // --- Compact view ---
  const compactContent = (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">API Spend</span>
        </div>
        <button
          onClick={() => setIsMaximized(true)}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Monthly total */}
      <div className="mb-3">
        <div className="text-2xl font-bold text-white">{formatCost(monthlySpend.totalCost)}</div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider">
          {monthlySpend.month} &middot; {monthlySpend.callCount} calls
          {totalTokens > 0 && ` \u00b7 ${formatTokens(totalTokens)} tokens`}
        </div>
      </div>

      {/* Progress to next $20 threshold */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
          <span>Next alert: ${nextThreshold}</span>
          <span>{Math.round(progressPct)}%</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Provider bars */}
      <div className="flex-1 space-y-1.5 overflow-hidden">
        {providerEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-600">
            <Zap className="w-4 h-4 mr-2" />
            No API calls yet
          </div>
        ) : (
          providerEntries.map(([provider, cost]) => (
            <ProviderBar
              key={provider}
              provider={provider}
              cost={cost}
              total={monthlySpend.totalCost}
            />
          ))
        )}
      </div>
    </div>
  );

  // --- Maximized view ---
  const maximizedContent = (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => setIsMaximized(false)}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-3xl max-h-[85vh] bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-lg font-bold text-white">API Spend Tracker</h2>
              <p className="text-xs text-slate-500">{monthlySpend.month} &middot; {monthlySpend.callCount} calls</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (confirm('Reset monthly spend data?')) resetMonth();
              }}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Reset month"
            >
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={() => setIsMaximized(false)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Spend</div>
              <div className="text-xl font-bold text-white">{formatCost(monthlySpend.totalCost)}</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">API Calls</div>
              <div className="text-xl font-bold text-white">{monthlySpend.callCount.toLocaleString()}</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3 border border-white/5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Tokens Used</div>
              <div className="text-xl font-bold text-white">{formatTokens(totalTokens)}</div>
            </div>
          </div>

          {/* Provider breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">By Provider</h3>
            <div className="space-y-2">
              {providerEntries.map(([provider, cost]) => (
                <ProviderBar
                  key={provider}
                  provider={provider}
                  cost={cost}
                  total={monthlySpend.totalCost}
                />
              ))}
            </div>
          </div>

          {/* Model cost table */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">By Model</h3>
            <ModelCostTable byModel={monthlySpend.byModel} />
          </div>

          {/* Recent calls */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">
              Recent Calls ({recentCalls.length})
            </h3>
            <div className="bg-slate-800/30 rounded-xl p-3 border border-white/5 max-h-64 overflow-y-auto">
              {recentCalls.length === 0 ? (
                <div className="text-xs text-slate-600 py-4 text-center">No calls this session</div>
              ) : (
                recentCalls.map((r) => <RecentCallRow key={r.id} record={r} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="h-full bg-slate-900/50 backdrop-blur-md rounded-xl border border-white/10 p-4">
      {compactContent}
      <AnimatePresence>
        {isMaximized && createPortal(maximizedContent, document.body)}
      </AnimatePresence>
    </div>
  );
}
