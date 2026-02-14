import { create } from 'zustand';
import type { Signal, LifeDomain, SignalType } from '../types/signals';

interface SignalState {
  signals: Signal[];

  // Computed getters via get()
  activeSignals: () => Signal[];      // Not dismissed and not expired
  urgentSignals: () => Signal[];      // severity: urgent or critical
  signalsByDomain: (domain: LifeDomain) => Signal[];
  signalsByType: (type: SignalType) => Signal[];
  signalCount: () => { total: number; urgent: number; attention: number; info: number };

  // Actions
  addSignals: (signals: Signal[]) => void;    // Batch add from anticipation cycle
  addSignal: (signal: Signal) => void;        // Single add
  dismissSignal: (id: string) => void;
  actOnSignal: (id: string) => void;          // Mark as acted on
  clearExpired: () => void;                   // Remove signals past expires_at
  clearAll: () => void;
  replaceAll: (signals: Signal[]) => void;    // Full replacement from DB sync
}

export const useSignalStore = create<SignalState>((set, get) => ({
  signals: [],

  activeSignals: () => {
    const now = new Date().toISOString();
    return get().signals.filter(s =>
      !s.is_dismissed && (!s.expires_at || s.expires_at > now)
    );
  },

  urgentSignals: () => {
    return get().activeSignals().filter(s =>
      s.severity === 'urgent' || s.severity === 'critical'
    );
  },

  signalsByDomain: (domain: LifeDomain) => {
    return get().activeSignals().filter(s => s.domain === domain);
  },

  signalsByType: (type: SignalType) => {
    return get().activeSignals().filter(s => s.type === type);
  },

  signalCount: () => {
    const active = get().activeSignals();
    return {
      total: active.length,
      urgent: active.filter(s => s.severity === 'urgent' || s.severity === 'critical').length,
      attention: active.filter(s => s.severity === 'attention').length,
      info: active.filter(s => s.severity === 'info').length,
    };
  },

  addSignals: (newSignals) => set((state) => ({
    signals: [...state.signals.filter(existing =>
      !newSignals.some(n => n.id === existing.id)
    ), ...newSignals]
  })),

  addSignal: (signal) => set((state) => ({
    signals: [...state.signals.filter(s => s.id !== signal.id), signal]
  })),

  dismissSignal: (id) => set((state) => ({
    signals: state.signals.map(s =>
      s.id === id ? { ...s, is_dismissed: true } : s
    )
  })),

  actOnSignal: (id) => set((state) => ({
    signals: state.signals.map(s =>
      s.id === id ? { ...s, is_acted_on: true } : s
    )
  })),

  clearExpired: () => set((state) => {
    const now = new Date().toISOString();
    return {
      signals: state.signals.filter(s =>
        !s.expires_at || s.expires_at > now
      )
    };
  }),

  clearAll: () => set({ signals: [] }),

  replaceAll: (signals) => set({ signals }),
}));
