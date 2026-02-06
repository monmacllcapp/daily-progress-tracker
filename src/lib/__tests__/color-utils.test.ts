import { describe, it, expect } from 'vitest';
import { hexToRgba, isValidHex } from '../color-utils';

describe('hexToRgba', () => {
  it('converts a standard hex color to rgba', () => {
    expect(hexToRgba('#3b82f6', 0.5)).toBe('rgba(59,130,246,0.5)');
  });

  it('converts black', () => {
    expect(hexToRgba('#000000', 1)).toBe('rgba(0,0,0,1)');
  });

  it('converts white', () => {
    expect(hexToRgba('#ffffff', 0)).toBe('rgba(255,255,255,0)');
  });

  it('handles uppercase hex', () => {
    expect(hexToRgba('#FF5733', 0.8)).toBe('rgba(255,87,51,0.8)');
  });

  it('handles alpha of 0', () => {
    expect(hexToRgba('#3b82f6', 0)).toBe('rgba(59,130,246,0)');
  });
});

describe('isValidHex', () => {
  it('accepts valid 6-digit hex with #', () => {
    expect(isValidHex('#3b82f6')).toBe(true);
    expect(isValidHex('#000000')).toBe(true);
    expect(isValidHex('#FFFFFF')).toBe(true);
    expect(isValidHex('#AbCdEf')).toBe(true);
  });

  it('rejects hex without #', () => {
    expect(isValidHex('3b82f6')).toBe(false);
  });

  it('rejects short hex', () => {
    expect(isValidHex('#fff')).toBe(false);
  });

  it('rejects 8-digit hex', () => {
    expect(isValidHex('#3b82f6ff')).toBe(false);
  });

  it('rejects invalid characters', () => {
    expect(isValidHex('#gggggg')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidHex('')).toBe(false);
  });
});
