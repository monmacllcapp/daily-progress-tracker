import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TabConfigState {
  tabOrders: Record<string, string[]>; // pageId → ordered tab IDs
  getTabOrder: (pageId: string, defaults: string[]) => string[];
  setTabOrder: (pageId: string, order: string[]) => void;
}

export const useTabConfigStore = create<TabConfigState>()(
  persist(
    (set, get) => ({
      tabOrders: {},
      getTabOrder: (pageId: string, defaults: string[]) => {
        const stored = get().tabOrders[pageId];
        if (!stored) return defaults;
        // Merge: keep stored order for known tabs, append any new defaults
        const known = stored.filter((id) => defaults.includes(id));
        const newTabs = defaults.filter((id) => !stored.includes(id));
        return [...known, ...newTabs];
      },
      setTabOrder: (pageId: string, order: string[]) => {
        set((state) => ({
          tabOrders: { ...state.tabOrders, [pageId]: order },
        }));
      },
    }),
    {
      name: 'titan-tab-config-v1',
      partialize: (state) => ({ tabOrders: state.tabOrders }),
    }
  )
);
