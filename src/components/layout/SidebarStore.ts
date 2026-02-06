import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SidebarConfig } from '../../types/sidebar';
import { DEFAULT_SIDEBAR_CONFIG } from '../../types/sidebar';

interface SidebarState {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  editMode: boolean;
  config: SidebarConfig;
  toggleCollapsed: () => void;
  setMobileOpen: (open: boolean) => void;
  setEditMode: (enabled: boolean) => void;
  toggleSectionCollapse: (sectionId: string) => void;
  updateSectionTitle: (sectionId: string, title: string) => void;
  createSection: (title: string) => void;
  deleteSection: (sectionId: string) => void;
  moveItem: (itemId: string, fromSectionId: string, toSectionId: string, newIndex: number) => void;
  reorderItems: (sectionId: string, fromIndex: number, toIndex: number) => void;
  resetConfig: () => void;
}

function validateConfig(config: unknown): SidebarConfig | null {
  if (!config || typeof config !== 'object') return null;
  const c = config as SidebarConfig;
  if (c.version !== DEFAULT_SIDEBAR_CONFIG.version) return null;
  if (!Array.isArray(c.sections) || !Array.isArray(c.items)) return null;
  return c;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      isMobileOpen: false,
      editMode: false,
      config: DEFAULT_SIDEBAR_CONFIG,

      toggleCollapsed: () => set((s) => ({ isCollapsed: !s.isCollapsed })),
      setMobileOpen: (open) => set({ isMobileOpen: open }),
      setEditMode: (enabled) => set({ editMode: enabled }),

      toggleSectionCollapse: (sectionId) =>
        set((s) => ({
          config: {
            ...s.config,
            sections: s.config.sections.map((sec) =>
              sec.id === sectionId ? { ...sec, isCollapsed: !sec.isCollapsed } : sec
            ),
          },
        })),

      updateSectionTitle: (sectionId, title) =>
        set((s) => ({
          config: {
            ...s.config,
            sections: s.config.sections.map((sec) =>
              sec.id === sectionId ? { ...sec, title } : sec
            ),
          },
        })),

      createSection: (title) =>
        set((s) => ({
          config: {
            ...s.config,
            sections: [
              ...s.config.sections,
              {
                id: `section-${Date.now()}`,
                title,
                isCollapsed: false,
                itemIds: [],
              },
            ],
          },
        })),

      deleteSection: (sectionId) =>
        set((s) => {
          const section = s.config.sections.find((sec) => sec.id === sectionId);
          if (!section || section.itemIds.length > 0) return s;
          return {
            config: {
              ...s.config,
              sections: s.config.sections.filter((sec) => sec.id !== sectionId),
            },
          };
        }),

      moveItem: (itemId, fromSectionId, toSectionId, newIndex) =>
        set((s) => ({
          config: {
            ...s.config,
            sections: s.config.sections.map((sec) => {
              if (sec.id === fromSectionId && sec.id === toSectionId) {
                // Same section — handled by reorderItems, but support it here too
                const ids = [...sec.itemIds];
                const oldIdx = ids.indexOf(itemId);
                if (oldIdx === -1) return sec;
                ids.splice(oldIdx, 1);
                ids.splice(newIndex, 0, itemId);
                return { ...sec, itemIds: ids };
              }
              if (sec.id === fromSectionId) {
                return { ...sec, itemIds: sec.itemIds.filter((id) => id !== itemId) };
              }
              if (sec.id === toSectionId) {
                const ids = [...sec.itemIds];
                ids.splice(newIndex, 0, itemId);
                return { ...sec, itemIds: ids };
              }
              return sec;
            }),
          },
        })),

      reorderItems: (sectionId, fromIndex, toIndex) =>
        set((s) => ({
          config: {
            ...s.config,
            sections: s.config.sections.map((sec) => {
              if (sec.id !== sectionId) return sec;
              const ids = [...sec.itemIds];
              const [moved] = ids.splice(fromIndex, 1);
              ids.splice(toIndex, 0, moved);
              return { ...sec, itemIds: ids };
            }),
          },
        })),

      resetConfig: () =>
        set({ config: DEFAULT_SIDEBAR_CONFIG, editMode: false }),
    }),
    {
      name: 'titan-sidebar-config-v1',
      partialize: (state) => ({
        isCollapsed: state.isCollapsed,
        config: state.config,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<SidebarState>;
        const validConfig = p.config ? validateConfig(p.config) : null;
        return {
          ...current,
          isCollapsed: p.isCollapsed ?? current.isCollapsed,
          config: validConfig ?? DEFAULT_SIDEBAR_CONFIG,
        };
      },
    }
  )
);
