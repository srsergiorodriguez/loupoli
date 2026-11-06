import { describe, expect, it } from 'vitest';
import type { BakeAtlasChart } from '../uv/bakeAtlas';
import { bakeChartImageTransform } from './bakeAtlasTexture';

function chart(overrides: Partial<BakeAtlasChart> = {}): BakeAtlasChart {
  return {
    index: 0,
    minU: 0,
    minV: 0,
    originU: 0,
    originV: 0,
    scale: 1,
    faces: [],
    ...overrides
  };
}

describe('bake atlas texture transform', () => {
  it('maps a full source chart without flipping it', () => {
    expect(bakeChartImageTransform(chart(), 100, 100, 100, 100)).toEqual([
      1, 0, 0, 1, 0, 0
    ]);
  });


  it('keeps pixel proportions on a rectangular atlas', () => {
    const transform = bakeChartImageTransform(chart(), 200, 100, 100, 100);
    expect(transform[0]).toBe(2);
    expect(transform[3]).toBe(1);
  });

  it('keeps source top at the top of its destination cell', () => {
    const transform = bakeChartImageTransform(
      chart({ minV: 0.25, originV: 0.5, scale: 0.5 }),
      100,
      100,
      100,
      100
    );
    expect(transform[3]).toBeCloseTo(0.5);
    expect(transform[5]).toBeCloseTo(12.5);
  });
});
