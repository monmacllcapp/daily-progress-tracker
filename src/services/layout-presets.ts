/**
 * Layout Presets Service
 *
 * Save/load/delete layout presets for the Email Dashboard.
 * Stores in localStorage for fast access (UI preferences, not data).
 */

import type { EmailTier } from '../types/schema';

export interface TierColorOverride {
  color: string;
  bgColor: string;
  bgLight: string;
  bgMedium: string;
  borderColor: string;
}

export interface LayoutPresetConfig {
  expandedGroups: string[];
  learningMode: boolean;
  showNewsletters: boolean;
  showSnoozed: boolean;
  tierColors: Partial<Record<EmailTier, TierColorOverride>>;
}

export interface LayoutPreset {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  config: LayoutPresetConfig;
}

const STORAGE_KEY = 'titan_email_layout_presets';
const ACTIVE_PRESET_KEY = 'titan_email_active_preset';

function readPresets(): LayoutPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as LayoutPreset[] : [];
  } catch {
    return [];
  }
}

function writePresets(presets: LayoutPreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function listPresets(): LayoutPreset[] {
  return readPresets().sort((a, b) => a.name.localeCompare(b.name));
}

export function getPreset(id: string): LayoutPreset | null {
  return readPresets().find(p => p.id === id) ?? null;
}

export function savePreset(name: string, config: LayoutPresetConfig): LayoutPreset {
  const presets = readPresets();
  const existing = presets.find(p => p.name === name);
  const now = new Date().toISOString();

  if (existing) {
    existing.config = config;
    existing.updatedAt = now;
    writePresets(presets);
    return existing;
  }

  const preset: LayoutPreset = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    config,
  };
  presets.push(preset);
  writePresets(presets);
  return preset;
}

export function savePresetAs(name: string, config: LayoutPresetConfig): LayoutPreset {
  const presets = readPresets();
  const now = new Date().toISOString();
  const preset: LayoutPreset = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    config,
  };
  presets.push(preset);
  writePresets(presets);
  return preset;
}

export function deletePreset(id: string): void {
  const presets = readPresets().filter(p => p.id !== id);
  writePresets(presets);
  // Clear active if it was the deleted one
  if (getActivePresetId() === id) {
    clearActivePreset();
  }
}

export function getActivePresetId(): string | null {
  return localStorage.getItem(ACTIVE_PRESET_KEY);
}

export function setActivePresetId(id: string): void {
  localStorage.setItem(ACTIVE_PRESET_KEY, id);
}

export function clearActivePreset(): void {
  localStorage.removeItem(ACTIVE_PRESET_KEY);
}

/** Built-in color palette options for tier customization */
export const COLOR_PALETTES: Record<string, TierColorOverride> = {
  red:    { color: 'text-red-400',    bgColor: 'bg-red-500',    bgLight: 'bg-red-500/20',    bgMedium: 'bg-red-500/30',    borderColor: 'border-red-500' },
  orange: { color: 'text-orange-400', bgColor: 'bg-orange-500', bgLight: 'bg-orange-500/20', bgMedium: 'bg-orange-500/30', borderColor: 'border-orange-500' },
  amber:  { color: 'text-amber-400',  bgColor: 'bg-amber-500',  bgLight: 'bg-amber-500/20',  bgMedium: 'bg-amber-500/30',  borderColor: 'border-amber-500' },
  yellow: { color: 'text-yellow-400', bgColor: 'bg-yellow-500', bgLight: 'bg-yellow-500/20', bgMedium: 'bg-yellow-500/30', borderColor: 'border-yellow-500' },
  lime:   { color: 'text-lime-400',   bgColor: 'bg-lime-500',   bgLight: 'bg-lime-500/20',   bgMedium: 'bg-lime-500/30',   borderColor: 'border-lime-500' },
  emerald:{ color: 'text-emerald-400',bgColor: 'bg-emerald-500',bgLight: 'bg-emerald-500/20',bgMedium: 'bg-emerald-500/30',borderColor: 'border-emerald-500' },
  cyan:   { color: 'text-cyan-400',   bgColor: 'bg-cyan-500',   bgLight: 'bg-cyan-500/20',   bgMedium: 'bg-cyan-500/30',   borderColor: 'border-cyan-500' },
  blue:   { color: 'text-blue-400',   bgColor: 'bg-blue-500',   bgLight: 'bg-blue-500/20',   bgMedium: 'bg-blue-500/30',   borderColor: 'border-blue-500' },
  indigo: { color: 'text-indigo-400', bgColor: 'bg-indigo-500', bgLight: 'bg-indigo-500/20', bgMedium: 'bg-indigo-500/30', borderColor: 'border-indigo-500' },
  violet: { color: 'text-violet-400', bgColor: 'bg-violet-500', bgLight: 'bg-violet-500/20', bgMedium: 'bg-violet-500/30', borderColor: 'border-violet-500' },
  purple: { color: 'text-purple-400', bgColor: 'bg-purple-500', bgLight: 'bg-purple-500/20', bgMedium: 'bg-purple-500/30', borderColor: 'border-purple-500' },
  pink:   { color: 'text-pink-400',   bgColor: 'bg-pink-500',   bgLight: 'bg-pink-500/20',   bgMedium: 'bg-pink-500/30',   borderColor: 'border-pink-500' },
  rose:   { color: 'text-rose-400',   bgColor: 'bg-rose-500',   bgLight: 'bg-rose-500/20',   bgMedium: 'bg-rose-500/30',   borderColor: 'border-rose-500' },
  slate:  { color: 'text-slate-400',  bgColor: 'bg-slate-500',  bgLight: 'bg-slate-500/20',  bgMedium: 'bg-slate-500/30',  borderColor: 'border-slate-500' },
};

export const PALETTE_NAMES = Object.keys(COLOR_PALETTES);
