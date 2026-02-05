import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, Users, TrendingUp, Target, Maximize2, X, ChevronLeft,
  ChevronRight, RefreshCw, Upload, Edit2, ChevronDown, ChevronUp,
  Check, Minus, Phone, UserCheck, Briefcase, Shield, Package, Megaphone,
  FileText
} from 'lucide-react';
import { useDatabase } from '../hooks/useDatabase';
import { useRxQuery } from '../hooks/useRxQuery';
import { isHubstaffConnected } from '../services/hubstaff';
import { parseStaffingWorkbook, recomputeKpiSummary, getStaffSummaries } from '../services/staffing-data';
import { syncHubstaffHours, getLastSyncTime } from '../services/staffing-sync';
import type { ImportResult } from '../services/staffing-data';
import type { StaffMember, StaffPayPeriod, StaffExpense, StaffKpiSummary, StaffRole, PayType } from '../types/schema';

// Role configuration
interface RoleConfig {
  label: string;
  icon: typeof Phone;
  className: string;
}

const ROLE_CONFIG: Record<StaffRole, RoleConfig> = {
  cold_caller: { label: 'Cold Caller', icon: Phone, className: 'bg-blue-500/20 text-blue-300' },
  admin_caller: { label: 'Admin Caller', icon: UserCheck, className: 'bg-cyan-500/20 text-cyan-300' },
  closer: { label: 'Closer', icon: Briefcase, className: 'bg-purple-500/20 text-purple-300' },
  lead_manager: { label: 'Lead Manager', icon: Shield, className: 'bg-amber-500/20 text-amber-300' },
};

// Formatting helpers
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}

function getRoleBadge(role: StaffRole) {
  const config = ROLE_CONFIG[role];
  return {
    label: config.label,
    className: config.className,
  };
}

// Get current month as YYYY-MM
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Navigate month
function addMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split('-').map(Number);
  const date = new Date(year, monthNum - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Format month for display
function formatMonth(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  const date = new Date(year, monthNum - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

interface StaffingDashboardProps {
  pageMode?: boolean;
}

export function StaffingDashboard({ pageMode = false }: StaffingDashboardProps) {
  const [db] = useDatabase();
  const [allStaff] = useRxQuery<StaffMember>(db?.staff_members);
  const [payPeriods] = useRxQuery<StaffPayPeriod>(db?.staff_pay_periods);
  const [expenses] = useRxQuery<StaffExpense>(db?.staff_expenses);
  const [kpiSummaries] = useRxQuery<StaffKpiSummary>(db?.staff_kpi_summaries);

  const [isMaximized, setIsMaximized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<StaffMember | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());
  const [expandedExpenseGroups, setExpandedExpenseGroups] = useState<Set<string>>(new Set(['platform']));
  const [showInactive, setShowInactive] = useState(false);

  // Filter staff by active status
  const staff = useMemo(() => {
    if (showInactive) return allStaff;
    return allStaff.filter(s => s.is_active !== false);
  }, [allStaff, showInactive]);

  const [toast, setToast] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Edit modal state
  const [editFormData, setEditFormData] = useState<Partial<StaffMember>>({});

  // Load last sync time on mount
  useEffect(() => {
    setLastSyncTime(getLastSyncTime());
  }, []);

  // Show toast helper
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Current month summary
  const currentSummary = useMemo(() => {
    return kpiSummaries.find(s => s.month === selectedMonth);
  }, [kpiSummaries, selectedMonth]);

  // Filter pay periods and expenses by selected month
  const monthPayPeriods = useMemo(() => {
    return payPeriods.filter(p => p.period_start.startsWith(selectedMonth));
  }, [payPeriods, selectedMonth]);

  const monthExpenses = useMemo(() => {
    return expenses.filter(e => e.month === selectedMonth);
  }, [expenses, selectedMonth]);

  // Group expenses by category
  const expensesByCategory = useMemo(() => {
    const groups = {
      platform: monthExpenses.filter(e => e.category === 'platform'),
      marketing: monthExpenses.filter(e => e.category === 'marketing'),
      other_opex: monthExpenses.filter(e => e.category === 'other_opex'),
    };
    return groups;
  }, [monthExpenses]);

  // Summary metrics
  const summaryMetrics = useMemo(() => {
    const totalBurn = currentSummary?.total_burn ?? 0;
    const staffCost = currentSummary?.total_staff_cost ?? 0;
    const totalLeads = currentSummary?.total_leads ?? 0;
    const avgCostPerLead = currentSummary?.avg_cost_per_lead ?? 0;

    return { totalBurn, staffCost, totalLeads, avgCostPerLead };
  }, [currentSummary]);

  // Staff summaries with their pay periods
  const staffWithPeriods = useMemo(() => {
    return staff.map(member => {
      const periods = monthPayPeriods.filter(p => p.staff_id === member.id);
      const totalPay = periods.reduce((sum, p) => sum + p.total_pay, 0);
      const totalHours = periods.reduce((sum, p) => sum + (p.hours_worked ?? 0), 0);
      const totalLeads = periods.reduce((sum, p) => sum + (p.num_leads ?? 0), 0);
      const totalDeals = periods.reduce((sum, p) => sum + (p.deals_closed ?? 0), 0);
      return { member, periods, totalPay, totalHours, totalLeads, totalDeals };
    });
  }, [staff, monthPayPeriods]);

  // Handlers
  const handleSync = async () => {
    if (!isHubstaffConnected()) {
      showToast('Hubstaff is not connected');
      return;
    }
    setIsSyncing(true);
    try {
      const result = await syncHubstaffHours(db!);
      setLastSyncTime(getLastSyncTime());
      if (result.errors.length > 0) {
        console.warn('[StaffingDashboard] Sync errors:', result.errors);
        showToast(`Sync: ${result.synced} updated. Errors: ${result.errors[0]}`);
      } else if (result.synced === 0) {
        showToast('Sync complete — no pay periods to update');
      } else {
        showToast(`Synced ${result.synced} pay period${result.synced > 1 ? 's' : ''} from Hubstaff`);
      }
    } catch (err) {
      console.error('[StaffingDashboard] Sync failed:', err);
      showToast('Sync failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFileImport = async (file: File) => {
    console.log('[StaffingDashboard] Import starting:', file.name, file.size, 'bytes');
    if (!db) {
      showToast('Database not ready — please wait and try again');
      return;
    }
    setIsImporting(true);
    try {
      // Clear existing staffing data before fresh import (prevents stale/misassigned records)
      console.log('[StaffingDashboard] Clearing staffing collections before import...');
      const staffDocs = await db.staff_members.find().exec();
      await Promise.all(staffDocs.map(d => d.remove()));
      const ppDocs = await db.staff_pay_periods.find().exec();
      await Promise.all(ppDocs.map(d => d.remove()));
      const expDocs = await db.staff_expenses.find().exec();
      await Promise.all(expDocs.map(d => d.remove()));
      const kpiDocs = await db.staff_kpi_summaries.find().exec();
      await Promise.all(kpiDocs.map(d => d.remove()));
      console.log('[StaffingDashboard] Cleared:', staffDocs.length, 'staff,', ppDocs.length, 'pay periods,', expDocs.length, 'expenses,', kpiDocs.length, 'KPI summaries');

      const result = await parseStaffingWorkbook(file, db);
      console.log('[StaffingDashboard] Import result:', result);
      setImportResult(result);
      if (result.staffImported === 0 && result.payPeriodsImported === 0 && result.expensesImported === 0) {
        showToast(result.errors.length > 0
          ? `Import failed: ${result.errors[0]}`
          : 'No data found — check sheet names match staff names (Anita, Andie, Emma, etc.)');
      } else {
        showToast(`Imported: ${result.staffImported} staff, ${result.payPeriodsImported} periods, ${result.expensesImported} expenses`);
      }
      // Recompute KPI summary after import
      await recomputeKpiSummary(db, selectedMonth);
    } catch (err) {
      console.error('[StaffingDashboard] Import failed:', err);
      showToast('Import failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsImporting(false);
    }
  };

  const handleSaveStaff = async () => {
    if (!db) return;
    try {
      if (showEditModal?.id) {
        // Update existing
        const doc = await db.staff_members.findOne(showEditModal.id).exec();
        if (doc) {
          await doc.patch(editFormData);
        }
      } else {
        // Create new
        await db.staff_members.insert({
          id: crypto.randomUUID(),
          name: editFormData.name ?? '',
          role: editFormData.role ?? 'cold_caller',
          pay_type: editFormData.pay_type ?? 'hourly',
          base_rate: editFormData.base_rate ?? 0,
          payment_method: editFormData.payment_method,
          hubstaff_user_id: editFormData.hubstaff_user_id,
          is_active: true,
          created_at: new Date().toISOString(),
        });
      }
      showToast('Staff member saved');
      setShowEditModal(null);
      setEditFormData({});
    } catch (err) {
      console.error('[StaffingDashboard] Save failed:', err);
      showToast('Save failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const toggleStaffExpanded = (staffId: string) => {
    setExpandedStaff(prev => {
      const next = new Set(prev);
      if (next.has(staffId)) {
        next.delete(staffId);
      } else {
        next.add(staffId);
      }
      return next;
    });
  };

  const toggleExpenseGroup = (group: string) => {
    setExpandedExpenseGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const togglePeriodPaid = async (period: StaffPayPeriod) => {
    if (!db) return;
    try {
      const doc = await db.staff_pay_periods.findOne(period.id).exec();
      if (doc) {
        await doc.patch({ is_paid: !period.is_paid });
      }
    } catch (err) {
      console.error('[StaffingDashboard] Toggle paid failed:', err);
      showToast('Failed to update paid status');
    }
  };

  // Render compact view
  const renderCompact = () => {
    return (
      <div className="h-full flex flex-col bg-slate-800 rounded-lg p-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold text-sm">Staffing KPIs</h3>
          <button
            onClick={() => setIsMaximized(true)}
            className="text-slate-400 hover:text-white transition-colors"
            title="Maximize"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Summary cards - 2x2 grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
            <div className="flex items-center gap-1 mb-1">
              <DollarSign className="w-3 h-3 text-red-400" />
              <span className="text-xs text-red-300">Total Burn</span>
            </div>
            <div className="text-lg font-bold text-white">{formatCurrency(summaryMetrics.totalBurn)}</div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2">
            <div className="flex items-center gap-1 mb-1">
              <Users className="w-3 h-3 text-blue-400" />
              <span className="text-xs text-blue-300">Staff Cost</span>
            </div>
            <div className="text-lg font-bold text-white">{formatCurrency(summaryMetrics.staffCost)}</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="w-3 h-3 text-green-400" />
              <span className="text-xs text-green-300">Total Leads</span>
            </div>
            <div className="text-lg font-bold text-white">{summaryMetrics.totalLeads}</div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2">
            <div className="flex items-center gap-1 mb-1">
              <Target className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-amber-300">Avg CPL</span>
            </div>
            <div className="text-lg font-bold text-white">{formatCurrency(summaryMetrics.avgCostPerLead)}</div>
          </div>
        </div>

        {/* Condensed staff list */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {staffWithPeriods.map(({ member, totalPay, totalHours, totalLeads, totalDeals }) => {
            const badge = getRoleBadge(member.role);
            const keyMetric = member.role === 'closer' ? totalDeals : totalHours;
            const metricLabel = member.role === 'closer' ? 'deals' : 'hrs';
            return (
              <div key={member.id} className="bg-slate-700/50 rounded p-2 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-white font-medium truncate">{member.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${badge.className} whitespace-nowrap`}>
                    {badge.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                  <span className="font-semibold">{formatCurrency(totalPay)}</span>
                  <span className="text-slate-400">{keyMetric} {metricLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render expanded view (used for both maximized modal and pageMode inline)
  const renderExpandedContent = () => (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {!pageMode && <h2 className="text-2xl font-bold text-white">Staffing KPIs</h2>}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedMonth(addMonth(selectedMonth, -1))}
              className="p-1 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-white font-medium min-w-[140px] text-center">{formatMonth(selectedMonth)}</span>
            <button
              onClick={() => setSelectedMonth(addMonth(selectedMonth, 1))}
              className="p-1 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
        {!pageMode && (
          <button
            onClick={() => setIsMaximized(false)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

          {/* Sync controls */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleSync}
              disabled={!isHubstaffConnected() || isSyncing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Hubstaff
            </button>
            <button
              onClick={() => { console.log('[StaffingDashboard] Import Excel clicked, setting showImportModal=true'); setShowImportModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import Excel
            </button>
            {lastSyncTime && (
              <span className="text-sm text-slate-400">
                Last sync: {new Date(lastSyncTime).toLocaleString()}
              </span>
            )}
            {!isHubstaffConnected() && (
              <span className="text-xs text-amber-400/80">
                Set VITE_HUBSTAFF_PAT and VITE_HUBSTAFF_ORG_ID in .env to enable sync
              </span>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-red-400" />
                <span className="text-sm text-red-300 font-medium">Total Burn</span>
              </div>
              <div className="text-3xl font-bold text-white">{formatCurrency(summaryMetrics.totalBurn)}</div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-blue-400" />
                <span className="text-sm text-blue-300 font-medium">Staff Cost</span>
              </div>
              <div className="text-3xl font-bold text-white">{formatCurrency(summaryMetrics.staffCost)}</div>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <span className="text-sm text-green-300 font-medium">Total Leads</span>
              </div>
              <div className="text-3xl font-bold text-white">{summaryMetrics.totalLeads}</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-amber-400" />
                <span className="text-sm text-amber-300 font-medium">Avg Cost/Lead</span>
              </div>
              <div className="text-3xl font-bold text-white">{formatCurrency(summaryMetrics.avgCostPerLead)}</div>
            </div>
          </div>

          {/* Staff section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-semibold text-white">Staff Members</h3>
              <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                />
                Show former staff
              </label>
            </div>
            <div className="space-y-3">
              {staffWithPeriods.map(({ member, periods, totalPay }) => {
                const isExpanded = expandedStaff.has(member.id);
                const badge = getRoleBadge(member.role);
                const RoleIcon = ROLE_CONFIG[member.role].icon;

                return (
                  <div key={member.id} className={`bg-slate-800 rounded-lg border ${member.is_active === false ? 'border-slate-700/50 opacity-50' : 'border-slate-700'}`}>
                    {/* Header */}
                    <div
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-700/50 transition-colors"
                      onClick={() => toggleStaffExpanded(member.id)}
                    >
                      <div className="flex items-center gap-3">
                        <RoleIcon className="w-5 h-5 text-slate-400" />
                        <span className="text-white font-semibold">{member.name}</span>
                        <span className={`px-2 py-1 rounded text-sm ${badge.className}`}>{badge.label}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowEditModal(member);
                            setEditFormData({});
                          }}
                          className="text-slate-400 hover:text-blue-400 transition-colors"
                          title="Edit staff member"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!db) return;
                            const doc = await db.staff_members.findOne(member.id).exec();
                            if (doc) {
                              await doc.patch({ is_active: member.is_active === false ? true : false, updated_at: new Date().toISOString() });
                              showToast(member.is_active === false ? `${member.name} reactivated` : `${member.name} hidden from active view`);
                            }
                          }}
                          className={`transition-colors ${member.is_active === false ? 'text-green-400 hover:text-green-300' : 'text-slate-400 hover:text-amber-400'}`}
                          title={member.is_active === false ? 'Reactivate staff member' : 'Hide from active view'}
                        >
                          {member.is_active === false ? <UserCheck className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                        </button>
                        <span className="text-white font-bold">{formatCurrency(totalPay)}</span>
                        <button className="text-slate-400 hover:text-white">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && periods.length > 0 && (
                      <div className="border-t border-slate-700 p-4">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-slate-400 border-b border-slate-700">
                                <th className="pb-2">Period</th>
                                {(member.role === 'cold_caller' || member.role === 'admin_caller') && (
                                  <>
                                    <th className="pb-2 text-right">Hours</th>
                                    <th className="pb-2 text-right">Activity</th>
                                    <th className="pb-2 text-right">Leads</th>
                                    <th className="pb-2 text-right">Passes</th>
                                    <th className="pb-2 text-right">CPL</th>
                                    <th className="pb-2 text-right">Bonus</th>
                                  </>
                                )}
                                {member.role === 'closer' && (
                                  <>
                                    <th className="pb-2 text-right">Convos</th>
                                    <th className="pb-2 text-right">Quality</th>
                                    <th className="pb-2 text-right">Apt Set</th>
                                    <th className="pb-2 text-right">Apt Met</th>
                                    <th className="pb-2 text-right">Offers</th>
                                    <th className="pb-2 text-right">Accepted</th>
                                    <th className="pb-2 text-right">Deals</th>
                                    <th className="pb-2 text-right">Comm</th>
                                  </>
                                )}
                                {member.role === 'lead_manager' && (
                                  <>
                                    <th className="pb-2 text-right">Dials</th>
                                    <th className="pb-2 text-right">Processed</th>
                                    <th className="pb-2 text-right">Underwrote</th>
                                    <th className="pb-2 text-right">Apt Set</th>
                                    <th className="pb-2 text-right">Apt Met</th>
                                    <th className="pb-2 text-right">Offers</th>
                                    <th className="pb-2 text-right">Accepted</th>
                                    <th className="pb-2 text-right">Deals</th>
                                    <th className="pb-2 text-right">Fell Through</th>
                                  </>
                                )}
                                <th className="pb-2 text-right">Total Pay</th>
                                <th className="pb-2 text-center">Paid</th>
                              </tr>
                            </thead>
                            <tbody>
                              {periods.map(period => (
                                <tr key={period.id} className="border-b border-slate-700/50 text-slate-300">
                                  <td className="py-2">
                                    {new Date(period.period_start).toLocaleDateString()} - {new Date(period.period_end).toLocaleDateString()}
                                  </td>
                                  {(member.role === 'cold_caller' || member.role === 'admin_caller') && (
                                    <>
                                      <td className="py-2 text-right">{period.hours_worked?.toFixed(1) ?? '-'}</td>
                                      <td className="py-2 text-right">{period.activity_pct ? formatPct(period.activity_pct) : '-'}</td>
                                      <td className="py-2 text-right">{period.num_leads ?? '-'}</td>
                                      <td className="py-2 text-right">{period.num_passes ?? '-'}</td>
                                      <td className="py-2 text-right">{period.cost_per_lead ? formatCurrency(period.cost_per_lead) : '-'}</td>
                                      <td className="py-2 text-right">{period.bonus ? formatCurrency(period.bonus) : '-'}</td>
                                    </>
                                  )}
                                  {member.role === 'closer' && (
                                    <>
                                      <td className="py-2 text-right">{period.convos ?? '-'}</td>
                                      <td className="py-2 text-right">{period.quality_convos ?? '-'}</td>
                                      <td className="py-2 text-right">{period.apt_set ?? '-'}</td>
                                      <td className="py-2 text-right">{period.apt_met ?? '-'}</td>
                                      <td className="py-2 text-right">{period.offers_made ?? '-'}</td>
                                      <td className="py-2 text-right">{period.offers_accepted ?? '-'}</td>
                                      <td className="py-2 text-right">{period.deals_closed ?? '-'}</td>
                                      <td className="py-2 text-right">{period.commission ? formatCurrency(period.commission) : '-'}</td>
                                    </>
                                  )}
                                  {member.role === 'lead_manager' && (
                                    <>
                                      <td className="py-2 text-right">{period.dials ?? '-'}</td>
                                      <td className="py-2 text-right">{period.calls_processed ?? '-'}</td>
                                      <td className="py-2 text-right">{period.underwrote ?? '-'}</td>
                                      <td className="py-2 text-right">{period.apt_set ?? '-'}</td>
                                      <td className="py-2 text-right">{period.apt_met ?? '-'}</td>
                                      <td className="py-2 text-right">{period.offers_made ?? '-'}</td>
                                      <td className="py-2 text-right">{period.offers_accepted ?? '-'}</td>
                                      <td className="py-2 text-right">{period.deals_closed ?? '-'}</td>
                                      <td className="py-2 text-right">{period.deals_fellthrough ?? '-'}</td>
                                    </>
                                  )}
                                  <td className="py-2 text-right font-semibold text-white">{formatCurrency(period.total_pay)}</td>
                                  <td className="py-2 text-center">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        togglePeriodPaid(period);
                                      }}
                                      className={`p-1 rounded ${period.is_paid ? 'text-green-400 hover:text-green-300' : 'text-red-400 hover:text-red-300'}`}
                                    >
                                      {period.is_paid ? <Check className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Expense breakdown */}
          <div>
            <h3 className="text-xl font-semibold text-white mb-3">Expenses</h3>
            <div className="space-y-3">
              {/* Platform */}
              <div className="bg-slate-800 rounded-lg border border-slate-700">
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-700/50 transition-colors"
                  onClick={() => toggleExpenseGroup('platform')}
                >
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-slate-400" />
                    <span className="text-white font-semibold">Platform</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-white font-bold">
                      {formatCurrency(expensesByCategory.platform.reduce((sum, e) => sum + e.amount, 0))}
                    </span>
                    <button className="text-slate-400 hover:text-white">
                      {expandedExpenseGroups.has('platform') ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                {expandedExpenseGroups.has('platform') && expensesByCategory.platform.length > 0 && (
                  <div className="border-t border-slate-700 p-4">
                    <div className="space-y-2">
                      {expensesByCategory.platform.map(exp => (
                        <div key={exp.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3 flex-1">
                            <span className="text-slate-300">{exp.vendor}</span>
                            {exp.channel && <span className="text-slate-500 text-xs">({exp.channel})</span>}
                          </div>
                          <span className="text-white font-semibold">{formatCurrency(exp.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Marketing */}
              <div className="bg-slate-800 rounded-lg border border-slate-700">
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-700/50 transition-colors"
                  onClick={() => toggleExpenseGroup('marketing')}
                >
                  <div className="flex items-center gap-3">
                    <Megaphone className="w-5 h-5 text-slate-400" />
                    <span className="text-white font-semibold">Marketing</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-white font-bold">
                      {formatCurrency(expensesByCategory.marketing.reduce((sum, e) => sum + e.amount, 0))}
                    </span>
                    <button className="text-slate-400 hover:text-white">
                      {expandedExpenseGroups.has('marketing') ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                {expandedExpenseGroups.has('marketing') && expensesByCategory.marketing.length > 0 && (
                  <div className="border-t border-slate-700 p-4">
                    <div className="space-y-2">
                      {expensesByCategory.marketing.map(exp => (
                        <div key={exp.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3 flex-1">
                            <span className="text-slate-300">{exp.vendor}</span>
                            {exp.channel && <span className="text-slate-500 text-xs">({exp.channel})</span>}
                          </div>
                          <span className="text-white font-semibold">{formatCurrency(exp.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Other OpEx */}
              <div className="bg-slate-800 rounded-lg border border-slate-700">
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-700/50 transition-colors"
                  onClick={() => toggleExpenseGroup('other_opex')}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-slate-400" />
                    <span className="text-white font-semibold">Other OpEx</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-white font-bold">
                      {formatCurrency(expensesByCategory.other_opex.reduce((sum, e) => sum + e.amount, 0))}
                    </span>
                    <button className="text-slate-400 hover:text-white">
                      {expandedExpenseGroups.has('other_opex') ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                {expandedExpenseGroups.has('other_opex') && expensesByCategory.other_opex.length > 0 && (
                  <div className="border-t border-slate-700 p-4">
                    <div className="space-y-2">
                      {expensesByCategory.other_opex.map(exp => (
                        <div key={exp.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3 flex-1">
                            <span className="text-slate-300">{exp.vendor}</span>
                            {exp.channel && <span className="text-slate-500 text-xs">({exp.channel})</span>}
                          </div>
                          <span className="text-white font-semibold">{formatCurrency(exp.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
    </>
  );

  // Render maximized view (portal overlay — used when NOT in pageMode)
  const renderMaximized = () => {
    const content = (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-900/95 overflow-y-auto"
      >
        <div className="min-h-screen p-6">
          {renderExpandedContent()}
        </div>
      </motion.div>
    );

    return createPortal(content, document.body);
  };

  // Import modal
  const renderImportModal = () => {
    console.log('[StaffingDashboard] renderImportModal called, showImportModal=', showImportModal);
    if (!showImportModal) return null;

    const content = (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        onClick={() => setShowImportModal(false)}
      >
        <div
          className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Import Excel Workbook</h3>
            <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {isImporting ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
              <p className="text-slate-300">Importing workbook...</p>
            </div>
          ) : importResult ? (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/30 rounded p-4">
                <h4 className="text-green-400 font-semibold mb-2">Import Complete</h4>
                <ul className="text-sm text-slate-300 space-y-1">
                  <li>{importResult.staffImported} staff members imported</li>
                  <li>{importResult.payPeriodsImported} pay periods imported</li>
                  <li>{importResult.expensesImported} expenses imported</li>
                </ul>
              </div>
              {importResult.errors.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded p-4">
                  <h4 className="text-red-400 font-semibold mb-2">Errors</h4>
                  <ul className="text-sm text-slate-300 space-y-1 max-h-32 overflow-y-auto">
                    {importResult.errors.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportResult(null);
                }}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                Select an Excel workbook (.xlsx or .xls) containing staffing data with sheets: Staff, PayPeriods, Expenses.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileImport(file);
                  }
                }}
                className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>
    );

    return createPortal(content, document.body);
  };

  // Staff edit modal
  const renderEditModal = () => {
    if (!showEditModal) return null;

    const content = (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
        onClick={() => { setShowEditModal(null); setEditFormData({}); }}
      >
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.95 }}
          className="bg-slate-800 rounded-lg border border-slate-700 p-6 max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Edit Staff Member</h3>
            <button onClick={() => { setShowEditModal(null); setEditFormData({}); }} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={editFormData.name ?? showEditModal.name}
                onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Role</label>
              <select
                value={editFormData.role ?? showEditModal.role}
                onChange={(e) => setEditFormData(prev => ({ ...prev, role: e.target.value as StaffRole }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="cold_caller">Cold Caller</option>
                <option value="admin_caller">Admin Caller</option>
                <option value="closer">Closer</option>
                <option value="lead_manager">Lead Manager</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Pay Type</label>
              <select
                value={editFormData.pay_type ?? showEditModal.pay_type}
                onChange={(e) => setEditFormData(prev => ({ ...prev, pay_type: e.target.value as 'hourly' | 'weekly_flat' }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="hourly">Hourly</option>
                <option value="weekly_flat">Weekly Flat</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Base Rate ($)</label>
              <input
                type="number"
                step="0.01"
                value={editFormData.base_rate ?? showEditModal.base_rate}
                onChange={(e) => setEditFormData(prev => ({ ...prev, base_rate: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Payment Method</label>
              <input
                type="text"
                value={editFormData.payment_method ?? showEditModal.payment_method ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, payment_method: e.target.value }))}
                placeholder="e.g. Wise, PayPal"
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Hubstaff User ID</label>
              <input
                type="text"
                value={editFormData.hubstaff_user_id ?? showEditModal.hubstaff_user_id ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, hubstaff_user_id: e.target.value }))}
                placeholder="Hubstaff user ID for sync"
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-400">Active Staff Member</label>
              <button
                onClick={() => setEditFormData(prev => ({ ...prev, is_active: !(prev.is_active ?? showEditModal?.is_active ?? true) }))}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  (editFormData.is_active ?? showEditModal?.is_active ?? true)
                    ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}
              >
                {(editFormData.is_active ?? showEditModal?.is_active ?? true) ? 'Active' : 'Inactive'}
              </button>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSaveStaff}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => { setShowEditModal(null); setEditFormData({}); }}
                className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );

    return createPortal(content, document.body);
  };

  // Toast
  const renderToast = () => {
    if (!toast) return null;

    const content = (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[70] bg-slate-800 border border-slate-700 rounded-lg px-6 py-3 shadow-xl"
      >
        <p className="text-white text-sm">{toast}</p>
      </motion.div>
    );

    return createPortal(content, document.body);
  };

  return (
    <>
      {pageMode
        ? renderExpandedContent()
        : isMaximized
          ? renderMaximized()
          : renderCompact()}
      {renderImportModal()}
      <AnimatePresence>
        {renderEditModal()}
        {renderToast()}
      </AnimatePresence>
    </>
  );
}
