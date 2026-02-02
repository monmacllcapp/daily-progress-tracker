/**
 * Converts a hex color string to an rgba() string.
 * @param hex - Color in #RRGGBB format
 * @param alpha - Opacity value between 0 and 1
 * @returns rgba string, e.g. "rgba(59,130,246,0.5)"
 */
export function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Validates whether a string is a valid #RRGGBB hex color.
 */
export function isValidHex(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}
