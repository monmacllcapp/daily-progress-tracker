import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ThemePreset {
  id: string;
  name: string;
  backgroundColor: string;
  accentColor: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'default-dark', name: 'Default Dark', backgroundColor: '#0a0e1a', accentColor: '#3b82f6' },
  { id: 'midnight-blue', name: 'Midnight Blue', backgroundColor: '#0c1222', accentColor: '#60a5fa' },
  { id: 'deep-purple', name: 'Deep Purple', backgroundColor: '#13051e', accentColor: '#a855f7' },
  { id: 'forest', name: 'Forest', backgroundColor: '#071210', accentColor: '#22c55e' },
  { id: 'obsidian', name: 'Obsidian', backgroundColor: '#111111', accentColor: '#f59e0b' },
  { id: 'rose-noir', name: 'Rose Noir', backgroundColor: '#1a0a10', accentColor: '#f43f5e' },
];

const DEFAULT_BG = '#0a0e1a';
const DEFAULT_ACCENT = '#3b82f6';
const DEFAULT_GLASS_OPACITY = 0.4;

interface ThemeState {
  backgroundColor: string;
  accentColor: string;
  widgetColors: Record<string, string>;
  activePresetId: string | null;
  glassOpacity: number;

  setBackgroundColor: (hex: string) => void;
  setAccentColor: (hex: string) => void;
  setWidgetColor: (id: string, hex: string) => void;
  clearWidgetColor: (id: string) => void;
  applyPreset: (presetId: string) => void;
  setGlassOpacity: (opacity: number) => void;
  resetTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      backgroundColor: DEFAULT_BG,
      accentColor: DEFAULT_ACCENT,
      widgetColors: {},
      activePresetId: null,
      glassOpacity: DEFAULT_GLASS_OPACITY,

      setBackgroundColor: (hex) =>
        set({ backgroundColor: hex, activePresetId: null }),

      setAccentColor: (hex) =>
        set({ accentColor: hex, activePresetId: null }),

      setWidgetColor: (id, hex) =>
        set((state) => ({
          widgetColors: { ...state.widgetColors, [id]: hex },
        })),

      clearWidgetColor: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.widgetColors;
          return { widgetColors: rest };
        }),

      applyPreset: (presetId) => {
        const preset = THEME_PRESETS.find((p) => p.id === presetId);
        if (preset) {
          set({
            backgroundColor: preset.backgroundColor,
            accentColor: preset.accentColor,
            activePresetId: presetId,
          });
        }
      },

      setGlassOpacity: (opacity) =>
        set({ glassOpacity: Math.round(opacity * 100) / 100 }),

      resetTheme: () =>
        set({
          backgroundColor: DEFAULT_BG,
          accentColor: DEFAULT_ACCENT,
          widgetColors: {},
          activePresetId: null,
          glassOpacity: DEFAULT_GLASS_OPACITY,
        }),
    }),
    {
      name: 'titan-theme-v1',
      partialize: (state) => ({
        backgroundColor: state.backgroundColor,
        accentColor: state.accentColor,
        widgetColors: state.widgetColors,
        activePresetId: state.activePresetId,
        glassOpacity: state.glassOpacity,
      }),
    }
  )
);
