import { describe, expect, it } from 'vitest';
import { uvScaleFactor } from './uvTransform';

describe('UV scale gesture factor', () => {
  it('stays neutral at the drag start', () => {
    expect(uvScaleFactor(80, 80)).toBeCloseTo(1);
    expect(uvScaleFactor(0, 0)).toBeCloseTo(1);
  });

  it('grows outward and shrinks inward without exploding near the pivot', () => {
    expect(uvScaleFactor(80, 120)).toBeGreaterThan(1);
    expect(uvScaleFactor(80, 40)).toBeLessThan(1);
    expect(uvScaleFactor(0, 40)).toBeCloseTo(Math.exp(40 / 80));
    expect(uvScaleFactor(0, 10_000)).toBe(100);
  });

  it('slows the factor in fine mode', () => {
    expect(uvScaleFactor(80, 120, 0.1)).toBeLessThan(uvScaleFactor(80, 120, 1));
  });
});
