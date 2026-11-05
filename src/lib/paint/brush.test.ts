import { describe, expect, it } from 'vitest';
import { rgbaColor } from './brush';

describe('paint color alpha', () => {
  it('converts a hex color and alpha to canvas CSS', () => {
    expect(rgbaColor('#ff8000', 0.5)).toBe('rgba(255,128,0,0.5)');
  });

  it('clamps alpha to the supported range', () => {
    expect(rgbaColor('#ffffff', 2)).toBe('rgba(255,255,255,1)');
    expect(rgbaColor('#ffffff', -1)).toBe('rgba(255,255,255,0)');
  });
});
