import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, normalizeHexColor } from './color';

describe('paint color conversion', () => {
  it('normalizes hex colors', () => {
    expect(normalizeHexColor('FF8000')).toBe('#ff8000');
    expect(normalizeHexColor('#abc')).toBeNull();
  });

  it('converts red to HSV and back', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000');
  });

  it('round-trips a non-primary color', () => {
    expect(hsvToHex(hexToHsv('#3a7bd5'))).toBe('#3a7bd5');
  });
});
