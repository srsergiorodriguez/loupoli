import { describe, expect, it } from 'vitest';
import { rotateUv, uvScaleFactor } from './uvTransform';

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

describe('UV rotation direction', () => {
  it('rotates positive angles counterclockwise in UV space', () => {
    const rotated = rotateUv([100, 0], [0, 0], Math.PI / 2);
    expect(rotated[0]).toBeCloseTo(0);
    expect(rotated[1]).toBeCloseTo(100);
  });
});
