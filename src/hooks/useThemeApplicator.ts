import { useEffect } from 'react';
import { useThemeStore } from '../store/themeStore';
import { hexToRgba } from '../lib/color-utils';

/**
 * Syncs theme store values to CSS custom properties on document.documentElement
 * and updates body background gradients derived from the accent color.
 */
export function useThemeApplicator() {
  const backgroundColor = useThemeStore((s) => s.backgroundColor);
  const accentColor = useThemeStore((s) => s.accentColor);
  const glassOpacity = useThemeStore((s) => s.glassOpacity);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-background', backgroundColor);
    root.style.setProperty('--color-primary', accentColor);

    // Glass opacity
    const elevated = Math.min(glassOpacity + 0.2, 1);
    root.style.setProperty('--glass-bg', `rgba(15, 23, 42, ${glassOpacity})`);
    root.style.setProperty('--glass-bg-elevated', `rgba(15, 23, 42, ${elevated})`);

    document.body.style.backgroundColor = backgroundColor;
    document.body.style.backgroundImage = [
      `radial-gradient(ellipse at 20% 50%, ${hexToRgba(accentColor, 0.06)} 0%, transparent 50%)`,
      `radial-gradient(ellipse at 80% 20%, ${hexToRgba(accentColor, 0.04)} 0%, transparent 50%)`,
    ].join(', ');

    return () => {
      root.style.setProperty('--color-background', '#0a0e1a');
      root.style.setProperty('--color-primary', '#3b82f6');
      root.style.setProperty('--glass-bg', 'rgba(15, 23, 42, 0.4)');
      root.style.setProperty('--glass-bg-elevated', 'rgba(15, 23, 42, 0.6)');
      document.body.style.backgroundColor = '';
      document.body.style.backgroundImage = '';
    };
  }, [backgroundColor, accentColor, glassOpacity]);
}
