import { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, TrendingUp, TrendingDown, CreditCard, Maximize2, X,
  ChevronLeft, ChevronRight, RefreshCw, Plus, Edit2, AlertTriangle,
  Wallet, Building2, User, Clock, Search, Sparkles, Check,
  Link2, ArrowUpDown
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';
import { isPlaidConfigured, createLinkToken, exchangePublicToken, syncTransactions, saveAccountsToDb } from '../services/plaid';
import { detectSubscriptions, flagUnusedSubscriptions, analyzeSpending, categorizeTransaction, recomputeMonthlySummary } from '../services/financial-analysis';
import type { SpendingInsight } from '../services/financial-analysis';
import type {
  FinancialAccount, FinancialTransaction, FinancialSubscription,
  FinancialMonthlySummary, TransactionCategory, TransactionScope
} from '../types/schema';

// Formatting helpers
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount);
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split('-').map(Number);
  const date = new Date(year, monthNum - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  const date = new Date(year, monthNum - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  income: 'Income', subscription: 'Subscription', utilities: 'Utilities',
  rent_mortgage: 'Rent/Mortgage', payroll: 'Payroll', software: 'Software',
  marketing: 'Marketing', food: 'Food & Dining', entertainment: 'Entertainment',
  travel: 'Travel', insurance: 'Insurance', taxes: 'Taxes', office: 'Office',
  supplies: 'Supplies', professional_services: 'Professional Services',
  healthcare: 'Healthcare', education: 'Education', transfer: 'Transfer', other: 'Other',
};

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  alert: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-300', icon: 'text-red-400' },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', icon: 'text-amber-400' },
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-300', icon: 'text-blue-400' },
};

interface FinancialDashboardProps {
  pageMode?: boolean;
}

export function FinancialDashboard({ pageMode = false }: FinancialDashboardProps) {
  const [db] = useDatabase();
  const [accounts] = useRxQuery<FinancialAccount>(db?.financial_accounts);
  const [transactions] = useRxQuery<FinancialTransaction>(db?.financial_transactions);
  const [subscriptions] = useRxQuery<FinancialSubscription>(db?.financial_subscriptions);
  const [monthlySummaries] = useRxQuery<FinancialMonthlySummary>(db?.financial_monthly_summaries);

  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'subscriptions' | 'insights'>('overview');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showEditTxModal, setShowEditTxModal] = useState<FinancialTransaction | null>(null);
  const [showManualTxModal, setShowManualTxModal] = useState(false);
  const [insights, setInsights] = useState<SpendingInsight[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [connectScope, setConnectScope] = useState<'business' | 'personal'>('personal');

  // Transaction filters
  const [txSearch, setTxSearch] = useState('');
  const [txScopeFilter, setTxScopeFilter] = useState<TransactionScope | 'all'>('all');
  const [txCategoryFilter, setTxCategoryFilter] = useState<TransactionCategory | 'all'>('all');

  // Edit form state
  const [editCategory, setEditCategory] = useState<TransactionCategory>('other');
  const [editScope, setEditScope] = useState<TransactionScope>('personal');
  const [editNotes, setEditNotes] = useState('');

  // Manual tx form
  const [manualTx, setManualTx] = useState({
    name: '', amount: '', category: 'other' as TransactionCategory,
    scope: 'personal' as TransactionScope, date: new Date().toISOString().split('T')[0],
  });

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Current month summary
  const currentSummary = useMemo(() => {
    return monthlySummaries.find(s => s.month === selectedMonth) || null;
  }, [monthlySummaries, selectedMonth]);

  // Monthly trend data (last 6 months)
  const trendData = useMemo(() => {
    const months: string[] = [];
    let m = selectedMonth;
    for (let i = 0; i < 6; i++) {
      months.unshift(m);
      m = addMonth(m, -1);
    }
    return months.map(month => {
      const summary = monthlySummaries.find(s => s.month === month);
      return {
        month: month.substring(5),
        income: summary?.total_income || 0,
        expenses: summary?.total_expenses || 0,
        net: summary?.net_cash_flow || 0,
      };
    });
  }, [monthlySummaries, selectedMonth]);

  // Filtered transactions
  const monthTransactions = useMemo(() => {
    return transactions
      .filter(tx => tx.month === selectedMonth)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, selectedMonth]);

  const filteredTransactions = useMemo(() => {
    return monthTransactions.filter(tx => {
      if (txScopeFilter !== 'all' && tx.scope !== txScopeFilter) return false;
      if (txCategoryFilter !== 'all' && tx.category !== txCategoryFilter) return false;
      if (txSearch && !tx.name.toLowerCase().includes(txSearch.toLowerCase()) &&
          !(tx.merchant_name || '').toLowerCase().includes(txSearch.toLowerCase())) return false;
      return true;
    });
  }, [monthTransactions, txScopeFilter, txCategoryFilter, txSearch]);

  // Active subscriptions
  const activeSubscriptions = useMemo(() => {
    return subscriptions.filter(s => s.is_active).sort((a, b) => b.amount - a.amount);
  }, [subscriptions]);

  // Summary metrics
  const metrics = useMemo(() => ({
    netCashFlow: currentSummary?.net_cash_flow ?? 0,
    totalIncome: currentSummary?.total_income ?? 0,
    totalExpenses: currentSummary?.total_expenses ?? 0,
    subscriptionBurn: currentSummary?.subscription_burn ?? 0,
  }), [currentSummary]);

  // Active accounts
  const activeAccounts = useMemo(() => accounts.filter(a => a.is_active), [accounts]);

  // Handlers
  const handleConnectAccount = useCallback(async () => {
    if (!db) return;
    setIsConnecting(true);
    try {
      const linkToken = await createLinkToken();
      // Dynamic import for react-plaid-link to avoid SSR issues
      const { usePlaidLink } = await import('react-plaid-link');
      // Store link token for the PlaidLink component
      (window as any).__plaidLinkToken = linkToken;
      (window as any).__plaidOnSuccess = async (publicToken: string) => {
        try {
          const result = await exchangePublicToken(publicToken);
          await saveAccountsToDb(db, result.accounts, connectScope);
          showToast(`Connected ${result.accounts.length} account(s)`);
          setShowConnectModal(false);
          // Trigger initial sync
          if (result.accounts[0]?.plaid_item_id) {
            await syncTransactions(result.accounts[0].plaid_item_id);
            await recomputeMonthlySummary(db, selectedMonth);
          }
        } catch (err) {
          showToast('Failed to connect: ' + (err instanceof Error ? err.message : String(err)));
        }
      };
      setShowConnectModal(true);
    } catch (err) {
      showToast('Failed to create link: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsConnecting(false);
    }
  }, [db, connectScope, selectedMonth]);

  const handleSyncAll = useCallback(async () => {
    if (!db) return;
    setIsSyncing(true);
    try {
      const itemIds = [...new Set(activeAccounts.map(a => a.plaid_item_id).filter(Boolean))];
      for (const itemId of itemIds) {
        await syncTransactions(itemId!);
      }
      await recomputeMonthlySummary(db, selectedMonth);
      // Detect subscriptions from all transactions
      await detectSubscriptions(db, transactions);
      await flagUnusedSubscriptions(db, subscriptions);
      showToast('Sync complete');
    } catch (err) {
      showToast('Sync failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSyncing(false);
    }
  }, [db, activeAccounts, selectedMonth, transactions, subscriptions]);

  const handleAnalyze = useCallback(async () => {
    if (!db) return;
    setIsAnalyzing(true);
    try {
      const previousMonths = monthlySummaries
        .filter(s => s.month < selectedMonth)
        .sort((a, b) => b.month.localeCompare(a.month));
      const result = await analyzeSpending(currentSummary, previousMonths, subscriptions, monthTransactions);
      setInsights(result);
      if (result.length === 0) showToast('No insights generated — add more data');
    } catch (err) {
      showToast('Analysis failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsAnalyzing(false);
    }
  }, [db, currentSummary, monthlySummaries, subscriptions, monthTransactions, selectedMonth]);

  const handleSaveTxEdit = useCallback(async () => {
    if (!db || !showEditTxModal) return;
    try {
      const doc = await db.financial_transactions.findOne(showEditTxModal.id).exec();
      if (doc) {
        await doc.patch({
          category: editCategory,
          scope: editScope,
          notes: editNotes,
          updated_at: new Date().toISOString(),
        });
        await recomputeMonthlySummary(db, selectedMonth);
        showToast('Transaction updated');
      }
      setShowEditTxModal(null);
    } catch (err) {
      showToast('Save failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, [db, showEditTxModal, editCategory, editScope, editNotes, selectedMonth]);

  const handleAddManualTx = useCallback(async () => {
    if (!db || !manualTx.name || !manualTx.amount) return;
    try {
      const amount = parseFloat(manualTx.amount);
      if (isNaN(amount)) { showToast('Invalid amount'); return; }
      await db.financial_transactions.insert({
        id: crypto.randomUUID(),
        account_id: 'manual',
        date: manualTx.date,
        amount,
        name: manualTx.name,
        category: manualTx.category,
        scope: manualTx.scope,
        is_recurring: false,
        is_subscription: false,
        pending: false,
        month: manualTx.date.substring(0, 7),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await recomputeMonthlySummary(db, manualTx.date.substring(0, 7));
      showToast('Transaction added');
      setShowManualTxModal(false);
      setManualTx({ name: '', amount: '', category: 'other', scope: 'personal', date: new Date().toISOString().split('T')[0] });
    } catch (err) {
      showToast('Failed to add: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, [db, manualTx]);

  // Compact widget view
  const renderCompact = () => (
    <div className="h-full flex flex-col bg-slate-800 rounded-lg p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">Finances</h3>
        <button onClick={() => setIsMaximized(true)} className="text-slate-400 hover:text-white transition-colors" title="Maximize">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className={`${metrics.netCashFlow >= 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'} border rounded p-2`}>
          <div className="flex items-center gap-1 mb-1">
            {metrics.netCashFlow >= 0 ? <TrendingUp className="w-3 h-3 text-green-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
            <span className={`text-xs ${metrics.netCashFlow >= 0 ? 'text-green-300' : 'text-red-300'}`}>Net Cash Flow</span>
          </div>
          <div className="text-lg font-bold text-white">{formatCurrency(metrics.netCashFlow)}</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2">
          <div className="flex items-center gap-1 mb-1">
            <DollarSign className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-300">Income</span>
          </div>
          <div className="text-lg font-bold text-white">{formatCurrency(metrics.totalIncome)}</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2">
          <div className="flex items-center gap-1 mb-1">
            <CreditCard className="w-3 h-3 text-amber-400" />
            <span className="text-xs text-amber-300">Expenses</span>
          </div>
          <div className="text-lg font-bold text-white">{formatCurrency(metrics.totalExpenses)}</div>
        </div>
        <div className="bg-purple-500/10 border border-purple-500/30 rounded p-2">
          <div className="flex items-center gap-1 mb-1">
            <Clock className="w-3 h-3 text-purple-400" />
            <span className="text-xs text-purple-300">Sub Burn</span>
          </div>
          <div className="text-lg font-bold text-white">{formatCurrency(metrics.subscriptionBurn)}</div>
        </div>
      </div>
      {activeAccounts.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <button onClick={handleConnectAccount} disabled={isConnecting} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors">
            <Link2 className="w-4 h-4 inline mr-1" /> Connect Account
          </button>
        </div>
      )}
    </div>
  );

  // Page/expanded content
  const renderExpandedContent = () => (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {!pageMode && <h2 className="text-2xl font-bold text-white">Finances</h2>}
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedMonth(addMonth(selectedMonth, -1))} className="p-1 text-slate-400 hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-white font-medium min-w-[140px] text-center">{formatMonth(selectedMonth)}</span>
            <button onClick={() => setSelectedMonth(addMonth(selectedMonth, 1))} className="p-1 text-slate-400 hover:text-white transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!pageMode && (
            <button onClick={() => setIsMaximized(false)} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={handleConnectAccount} disabled={isConnecting} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded transition-colors">
          <Link2 className={`w-4 h-4 ${isConnecting ? 'animate-spin' : ''}`} /> Connect Account
        </button>
        {activeAccounts.length > 0 && (
          <button onClick={handleSyncAll} disabled={isSyncing} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white rounded transition-colors">
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /> Sync All
          </button>
        )}
        <button onClick={() => setShowManualTxModal(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors">
          <Plus className="w-4 h-4" /> Manual Entry
        </button>
        {!isPlaidConfigured() && (
          <span className="text-xs text-amber-400/80">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env for Plaid sync</span>
        )}
      </div>

      {/* Linked accounts */}
      {activeAccounts.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {activeAccounts.map(acc => (
            <div key={acc.id} className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 flex items-center gap-2 text-sm">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-white">{acc.account_name}</span>
              {acc.mask && <span className="text-slate-500">****{acc.mask}</span>}
              <span className={`text-xs px-1.5 py-0.5 rounded ${acc.account_scope === 'business' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>
                {acc.account_scope}
              </span>
              <span className="text-slate-400 font-medium">{formatCurrency(acc.current_balance)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-700">
        {(['overview', 'transactions', 'subscriptions', 'insights'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${activeTab === tab ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'transactions' && renderTransactionsTab()}
      {activeTab === 'subscriptions' && renderSubscriptionsTab()}
      {activeTab === 'insights' && renderInsightsTab()}
    </>
  );

  const renderOverviewTab = () => (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className={`${metrics.netCashFlow >= 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'} border rounded-lg p-4`}>
          <div className="flex items-center gap-2 mb-2">
            {metrics.netCashFlow >= 0 ? <TrendingUp className="w-5 h-5 text-green-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
            <span className={`text-sm font-medium ${metrics.netCashFlow >= 0 ? 'text-green-300' : 'text-red-300'}`}>Net Cash Flow</span>
          </div>
          <div className="text-3xl font-bold text-white">{formatCurrency(metrics.netCashFlow)}</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-blue-400" />
            <span className="text-sm text-blue-300 font-medium">Total Income</span>
          </div>
          <div className="text-3xl font-bold text-white">{formatCurrency(metrics.totalIncome)}</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-5 h-5 text-amber-400" />
            <span className="text-sm text-amber-300 font-medium">Total Expenses</span>
          </div>
          <div className="text-3xl font-bold text-white">{formatCurrency(metrics.totalExpenses)}</div>
        </div>
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-purple-400" />
            <span className="text-sm text-purple-300 font-medium">Subscription Burn</span>
          </div>
          <div className="text-3xl font-bold text-white">{formatCurrency(metrics.subscriptionBurn)}</div>
        </div>
      </div>

      {/* Monthly trend chart */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
        <h3 className="text-white font-semibold mb-4">Income vs Expenses (6 months)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Area type="monotone" dataKey="income" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} name="Income" />
            <Area type="monotone" dataKey="expenses" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} name="Expenses" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Business / Personal split */}
      {currentSummary && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-purple-400" />
              <h4 className="text-white font-semibold">Business</h4>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Income</span><span className="text-green-400">{formatCurrency(currentSummary.business_income)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Expenses</span><span className="text-red-400">{formatCurrency(currentSummary.business_expenses)}</span></div>
              <div className="flex justify-between border-t border-slate-700 pt-2"><span className="text-slate-300 font-medium">Net</span><span className="text-white font-bold">{formatCurrency(currentSummary.business_income - currentSummary.business_expenses)}</span></div>
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-blue-400" />
              <h4 className="text-white font-semibold">Personal</h4>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Income</span><span className="text-green-400">{formatCurrency(currentSummary.personal_income)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Expenses</span><span className="text-red-400">{formatCurrency(currentSummary.personal_expenses)}</span></div>
              <div className="flex justify-between border-t border-slate-700 pt-2"><span className="text-slate-300 font-medium">Net</span><span className="text-white font-bold">{formatCurrency(currentSummary.personal_income - currentSummary.personal_expenses)}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Account balances */}
      {activeAccounts.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3">Account Balances</h3>
          <div className="space-y-2">
            {activeAccounts.map(acc => (
              <div key={acc.id} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                <div className="flex items-center gap-3">
                  <Wallet className="w-4 h-4 text-slate-400" />
                  <div>
                    <span className="text-white text-sm">{acc.account_name}</span>
                    <span className="text-slate-500 text-xs ml-2">{acc.institution_name}</span>
                  </div>
                </div>
                <span className="text-white font-semibold">{formatCurrency(acc.current_balance)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const renderTransactionsTab = () => (
    <>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text" value={txSearch} onChange={e => setTxSearch(e.target.value)}
            placeholder="Search transactions..."
            className="w-full bg-slate-800 border border-slate-700 rounded pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
          />
        </div>
        <select value={txScopeFilter} onChange={e => setTxScopeFilter(e.target.value as any)}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
          <option value="all">All Scopes</option>
          <option value="business">Business</option>
          <option value="personal">Personal</option>
        </select>
        <select value={txCategoryFilter} onChange={e => setTxCategoryFilter(e.target.value as any)}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Transaction table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="p-3">Date</th>
              <th className="p-3">Name</th>
              <th className="p-3">Category</th>
              <th className="p-3">Scope</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3 text-center">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">No transactions found</td></tr>
            ) : filteredTransactions.map(tx => (
              <tr key={tx.id} className="border-b border-slate-700/50 text-slate-300 hover:bg-slate-700/30">
                <td className="p-3 text-slate-400">{formatDate(tx.date)}</td>
                <td className="p-3">
                  <div className="text-white">{tx.merchant_name || tx.name}</div>
                  {tx.pending && <span className="text-xs text-amber-400">Pending</span>}
                </td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-300">
                    {CATEGORY_LABELS[tx.category] || tx.category}
                  </span>
                </td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${tx.scope === 'business' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>
                    {tx.scope}
                  </span>
                </td>
                <td className={`p-3 text-right font-medium ${tx.amount < 0 ? 'text-green-400' : 'text-white'}`}>
                  {tx.amount < 0 ? '+' : ''}{formatCurrency(Math.abs(tx.amount))}
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={() => {
                      setShowEditTxModal(tx);
                      setEditCategory(tx.category);
                      setEditScope(tx.scope);
                      setEditNotes(tx.notes || '');
                    }}
                    className="text-slate-400 hover:text-blue-400 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const renderSubscriptionsTab = () => {
    const businessSubs = activeSubscriptions.filter(s => s.scope === 'business');
    const personalSubs = activeSubscriptions.filter(s => s.scope === 'personal');
    const totalBurn = activeSubscriptions.reduce((sum, s) => {
      if (s.frequency === 'monthly') return sum + s.amount;
      if (s.frequency === 'weekly') return sum + s.amount * 4.33;
      if (s.frequency === 'quarterly') return sum + s.amount / 3;
      if (s.frequency === 'annual') return sum + s.amount / 12;
      return sum;
    }, 0);

    const renderSubList = (subs: FinancialSubscription[], label: string, icon: typeof Building2) => {
      const Icon = icon;
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon className="w-4 h-4 text-slate-400" />
            <h4 className="text-white font-semibold">{label}</h4>
            <span className="text-slate-500 text-sm">({subs.length})</span>
          </div>
          {subs.length === 0 ? (
            <p className="text-slate-500 text-sm">No subscriptions detected</p>
          ) : (
            <div className="space-y-2">
              {subs.map(sub => (
                <div key={sub.id} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-white text-sm">{sub.merchant_name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">{sub.frequency}</span>
                        <span className="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-400">
                          {CATEGORY_LABELS[sub.category] || sub.category}
                        </span>
                        {sub.flagged_unused && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Unused
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-semibold">{formatCurrency(sub.amount)}</div>
                    <div className="text-xs text-slate-500">/{sub.frequency}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    };

    return (
      <>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold">Monthly Subscription Burn</h3>
              <p className="text-slate-400 text-sm">Estimated monthly cost across all subscriptions</p>
            </div>
            <div className="text-3xl font-bold text-purple-400">{formatCurrency(totalBurn)}<span className="text-sm text-slate-500">/mo</span></div>
          </div>
        </div>
        {renderSubList(businessSubs, 'Business', Building2)}
        {renderSubList(personalSubs, 'Personal', User)}
      </>
    );
  };

  const renderInsightsTab = () => (
    <>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={handleAnalyze} disabled={isAnalyzing} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white rounded transition-colors">
          <Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} /> {isAnalyzing ? 'Analyzing...' : 'Generate Insights'}
        </button>
        {!import.meta.env.VITE_GEMINI_API_KEY && (
          <span className="text-xs text-amber-400/80">Set VITE_GEMINI_API_KEY in .env for AI insights</span>
        )}
      </div>
      {insights.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
          <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Click "Generate Insights" to analyze your spending patterns</p>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight, i) => {
            const style = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info;
            return (
              <div key={i} className={`${style.bg} border ${style.border} rounded-lg p-4`}>
                <div className="flex items-start gap-3">
                  {insight.severity === 'alert' ? <AlertTriangle className={`w-5 h-5 ${style.icon} flex-shrink-0 mt-0.5`} /> :
                   insight.severity === 'warning' ? <AlertTriangle className={`w-5 h-5 ${style.icon} flex-shrink-0 mt-0.5`} /> :
                   <Sparkles className={`w-5 h-5 ${style.icon} flex-shrink-0 mt-0.5`} />}
                  <div>
                    <h4 className={`font-semibold ${style.text}`}>{insight.title}</h4>
                    <p className="text-slate-300 text-sm mt-1">{insight.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  // Maximized portal
  const renderMaximized = () => {
    const content = (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-900/95 overflow-y-auto">
        <div className="min-h-screen p-6">{renderExpandedContent()}</div>
      </motion.div>
    );
    return createPortal(content, document.body);
  };

  // Edit transaction modal
  const renderEditTxModal = () => {
    if (!showEditTxModal) return null;
    const content = (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        onClick={() => setShowEditTxModal(null)}>
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Edit Transaction</h3>
            <button onClick={() => setShowEditTxModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="mb-3 p-3 bg-slate-700/50 rounded">
            <div className="text-white font-medium">{showEditTxModal.merchant_name || showEditTxModal.name}</div>
            <div className="text-slate-400 text-sm">{formatDate(showEditTxModal.date)} &middot; {formatCurrency(Math.abs(showEditTxModal.amount))}</div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Category</label>
              <select value={editCategory} onChange={e => setEditCategory(e.target.value as TransactionCategory)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Scope</label>
              <select value={editScope} onChange={e => setEditScope(e.target.value as TransactionScope)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="personal">Personal</option>
                <option value="business">Business</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Notes</label>
              <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
                placeholder="Optional notes" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleSaveTxEdit} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">Save</button>
              <button onClick={() => setShowEditTxModal(null)} className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    );
    return createPortal(content, document.body);
  };

  // Manual transaction modal
  const renderManualTxModal = () => {
    if (!showManualTxModal) return null;
    const content = (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        onClick={() => setShowManualTxModal(false)}>
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Add Transaction</h3>
            <button onClick={() => setShowManualTxModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Name</label>
              <input type="text" value={manualTx.name} onChange={e => setManualTx(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="Transaction name" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Amount ($)</label>
              <input type="number" step="0.01" value={manualTx.amount} onChange={e => setManualTx(p => ({ ...p, amount: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="Positive = expense, negative = income" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Date</label>
              <input type="date" value={manualTx.date} onChange={e => setManualTx(p => ({ ...p, date: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Category</label>
              <select value={manualTx.category} onChange={e => setManualTx(p => ({ ...p, category: e.target.value as TransactionCategory }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Scope</label>
              <select value={manualTx.scope} onChange={e => setManualTx(p => ({ ...p, scope: e.target.value as TransactionScope }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="personal">Personal</option>
                <option value="business">Business</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handleAddManualTx} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors">Add</button>
              <button onClick={() => setShowManualTxModal(false)} className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    );
    return createPortal(content, document.body);
  };

  // Connect account modal
  const renderConnectModal = () => {
    if (!showConnectModal) return null;
    const content = (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        onClick={() => setShowConnectModal(false)}>
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Connect Bank Account</h3>
            <button onClick={() => setShowConnectModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Account Type</label>
              <div className="flex gap-3">
                <button onClick={() => setConnectScope('personal')}
                  className={`flex-1 px-4 py-2 rounded border transition-colors ${connectScope === 'personal' ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-slate-600 text-slate-400 hover:text-white'}`}>
                  <User className="w-4 h-4 inline mr-2" />Personal
                </button>
                <button onClick={() => setConnectScope('business')}
                  className={`flex-1 px-4 py-2 rounded border transition-colors ${connectScope === 'business' ? 'border-purple-500 bg-purple-500/20 text-purple-300' : 'border-slate-600 text-slate-400 hover:text-white'}`}>
                  <Building2 className="w-4 h-4 inline mr-2" />Business
                </button>
              </div>
            </div>
            <p className="text-sm text-slate-400">
              Click below to securely connect your bank through Plaid. Your credentials are never stored on our servers.
            </p>
            <button onClick={handleConnectAccount} disabled={isConnecting}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded font-medium transition-colors">
              {isConnecting ? 'Connecting...' : 'Open Plaid Link'}
            </button>
          </div>
        </div>
      </div>
    );
    return createPortal(content, document.body);
  };

  // Toast
  const renderToast = () => {
    if (!toast) return null;
    const content = (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[70] bg-slate-800 border border-slate-700 rounded-lg px-6 py-3 shadow-xl">
        <p className="text-white text-sm">{toast}</p>
      </motion.div>
    );
    return createPortal(content, document.body);
  };

  return (
    <>
      {pageMode ? renderExpandedContent() : isMaximized ? renderMaximized() : renderCompact()}
      {renderEditTxModal()}
      {renderManualTxModal()}
      {renderConnectModal()}
      <AnimatePresence>
        {renderToast()}
      </AnimatePresence>
    </>
  );
}
