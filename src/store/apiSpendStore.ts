/**
 * API Spend Store
 *
 * Tracks real AI API costs across all providers. Fires Signal alerts
 * at every $20 increment. Monthly totals persist to localStorage;
 * individual call records are session-only (capped at 500).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { calculateCost, type AIProviderType } from '../config/modelTiers';
import { useSignalStore } from './signalStore';
import type { Signal } from '../types/signals';

export interface SpendRecord {
  id: string;
  timestamp: string;
  provider: AIProviderType;
  model: string;
  role: string;
  agentId?: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface MonthlySpend {
  month: string; // YYYY-MM
  totalCost: number;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  callCount: number;
}

interface ApiSpendState {
  // Persisted
  monthlySpend: MonthlySpend;
  lastAlertThreshold: number; // last $20 threshold crossed

  // Session-only
  records: SpendRecord[];

  // Actions
  logCall: (record: Omit<SpendRecord, 'id' | 'timestamp' | 'cost'>) => void;
  resetMonth: () => void;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function emptyMonth(month: string): MonthlySpend {
  return { month, totalCost: 0, byProvider: {}, byModel: {}, callCount: 0 };
}

const ALERT_INCREMENT = 20; // fire alert every $20
const MAX_RECORDS = 500;

function fireSpendAlert(totalCost: number, threshold: number) {
  const signal: Signal = {
    id: `api-spend-${threshold}`,
    type: 'api_spend_alert',
    severity: totalCost >= 100 ? 'urgent' : 'attention',
    domain: 'finance',
    source: 'api-spend-tracker',
    title: `API spend crossed $${threshold}`,
    context: `Monthly AI API cost has reached $${totalCost.toFixed(2)}. Next alert at $${threshold + ALERT_INCREMENT}.`,
    auto_actionable: false,
    is_dismissed: false,
    is_acted_on: false,
    related_entity_ids: [],
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  useSignalStore.getState().addSignal(signal);
}

export const useApiSpendStore = create<ApiSpendState>()(
  persist(
    (set, get) => ({
      monthlySpend: emptyMonth(currentMonth()),
      lastAlertThreshold: 0,
      records: [],

      logCall: (record) => {
        const cost = calculateCost(record.model, record.inputTokens, record.outputTokens);
        const now = new Date().toISOString();
        const month = now.slice(0, 7);

        const spendRecord: SpendRecord = {
          ...record,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: now,
          cost,
        };

        set((state) => {
          // Reset monthly if month changed
          let monthly = state.monthlySpend;
          if (monthly.month !== month) {
            monthly = emptyMonth(month);
          }

          const newTotal = monthly.totalCost + cost;
          const byProvider = { ...monthly.byProvider };
          byProvider[record.provider] = (byProvider[record.provider] || 0) + cost;

          const byModel = { ...monthly.byModel };
          byModel[record.model] = (byModel[record.model] || 0) + cost;

          const updatedMonthly: MonthlySpend = {
            month,
            totalCost: newTotal,
            byProvider,
            byModel,
            callCount: monthly.callCount + 1,
          };

          // Check threshold
          let lastThreshold = state.lastAlertThreshold;
          if (monthly.month !== month) lastThreshold = 0; // reset on new month
          const nextThreshold = lastThreshold + ALERT_INCREMENT;
          if (newTotal >= nextThreshold) {
            const crossedThreshold = Math.floor(newTotal / ALERT_INCREMENT) * ALERT_INCREMENT;
            fireSpendAlert(newTotal, crossedThreshold);
            lastThreshold = crossedThreshold;
          }

          // Cap session records
          const records = [...state.records, spendRecord].slice(-MAX_RECORDS);

          return {
            monthlySpend: updatedMonthly,
            lastAlertThreshold: lastThreshold,
            records,
          };
        });
      },

      resetMonth: () => {
        set({
          monthlySpend: emptyMonth(currentMonth()),
          lastAlertThreshold: 0,
          records: [],
        });
      },
    }),
    {
      name: 'maple-api-spend',
      partialize: (state) => ({
        monthlySpend: state.monthlySpend,
        lastAlertThreshold: state.lastAlertThreshold,
      }),
    }
  )
);
