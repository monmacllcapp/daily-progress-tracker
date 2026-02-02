import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore, THEME_PRESETS } from '../themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    useThemeStore.getState().resetTheme();
  });

  it('has correct default values', () => {
    const state = useThemeStore.getState();
    expect(state.backgroundColor).toBe('#0a0e1a');
    expect(state.accentColor).toBe('#3b82f6');
    expect(state.widgetColors).toEqual({});
    expect(state.activePresetId).toBeNull();
    expect(state.glassOpacity).toBe(0.4);
  });

  it('setBackgroundColor updates background and clears preset', () => {
    useThemeStore.getState().applyPreset('forest');
    useThemeStore.getState().setBackgroundColor('#111111');
    const state = useThemeStore.getState();
    expect(state.backgroundColor).toBe('#111111');
    expect(state.activePresetId).toBeNull();
  });

  it('setAccentColor updates accent and clears preset', () => {
    useThemeStore.getState().applyPreset('forest');
    useThemeStore.getState().setAccentColor('#ff0000');
    const state = useThemeStore.getState();
    expect(state.accentColor).toBe('#ff0000');
    expect(state.activePresetId).toBeNull();
  });

  it('setWidgetColor adds a per-widget color override', () => {
    useThemeStore.getState().setWidgetColor('task-dashboard', '#22c55e');
    const state = useThemeStore.getState();
    expect(state.widgetColors['task-dashboard']).toBe('#22c55e');
  });

  it('clearWidgetColor removes a per-widget color override', () => {
    useThemeStore.getState().setWidgetColor('task-dashboard', '#22c55e');
    useThemeStore.getState().clearWidgetColor('task-dashboard');
    const state = useThemeStore.getState();
    expect(state.widgetColors['task-dashboard']).toBeUndefined();
  });

  it('applyPreset sets bg, accent, and activePresetId from a known preset', () => {
    useThemeStore.getState().applyPreset('deep-purple');
    const state = useThemeStore.getState();
    const preset = THEME_PRESETS.find((p) => p.id === 'deep-purple')!;
    expect(state.backgroundColor).toBe(preset.backgroundColor);
    expect(state.accentColor).toBe(preset.accentColor);
    expect(state.activePresetId).toBe('deep-purple');
  });

  it('applyPreset does nothing for an unknown preset id', () => {
    const before = useThemeStore.getState();
    useThemeStore.getState().applyPreset('nonexistent');
    const after = useThemeStore.getState();
    expect(after.backgroundColor).toBe(before.backgroundColor);
    expect(after.accentColor).toBe(before.accentColor);
    expect(after.activePresetId).toBe(before.activePresetId);
  });

  it('setGlassOpacity updates opacity and rounds to 2 decimal places', () => {
    useThemeStore.getState().setGlassOpacity(0.75);
    expect(useThemeStore.getState().glassOpacity).toBe(0.75);
    useThemeStore.getState().setGlassOpacity(0.333);
    expect(useThemeStore.getState().glassOpacity).toBe(0.33);
  });

  it('resetTheme restores all defaults including glass opacity', () => {
    useThemeStore.getState().setBackgroundColor('#111111');
    useThemeStore.getState().setAccentColor('#ff0000');
    useThemeStore.getState().setWidgetColor('task-dashboard', '#22c55e');
    useThemeStore.getState().setGlassOpacity(0.8);
    useThemeStore.getState().resetTheme();
    const state = useThemeStore.getState();
    expect(state.backgroundColor).toBe('#0a0e1a');
    expect(state.accentColor).toBe('#3b82f6');
    expect(state.widgetColors).toEqual({});
    expect(state.activePresetId).toBeNull();
    expect(state.glassOpacity).toBe(0.4);
  });

  it('exports 6 theme presets', () => {
    expect(THEME_PRESETS).toHaveLength(6);
    THEME_PRESETS.forEach((p) => {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.backgroundColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(p.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});
