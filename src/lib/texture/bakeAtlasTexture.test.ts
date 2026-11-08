import { describe, expect, it } from 'vitest';
import type { BakeAtlasChart } from '../uv/bakeAtlas';
import {
  bakeChartImageTransform,
  erodeCoverage
} from './bakeAtlasTexture';

function chart(overrides: Partial<BakeAtlasChart> = {}): BakeAtlasChart {
  return {
    index: 0,
    minU: 0,
    minV: 0,
    originU: 0,
    originV: 0,
    scale: 1,
    faces: [],
    faceIndices: [],
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


describe('bake atlas donor erosion', () => {
  function coverage(
    width: number,
    height: number,
    paint: (x: number, y: number) => boolean
  ): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!paint(x, y)) {
          continue;
        }
        const offset = (y * width + x) * 4;
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        data[offset + 3] = 255;
      }
    }
    return data;
  }

  it('keeps a thin 2px strip from eroding to zero donors', () => {
    const width = 32;
    const height = 8;
    const core = erodeCoverage(
      coverage(width, height, (_x, y) => y === 3 || y === 4),
      width,
      height,
      1
    );
    expect(core.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
  });

  it('keeps a one-pixel diagonal strip', () => {
    const width = 16;
    const height = 16;
    const core = erodeCoverage(
      coverage(width, height, (x, y) => x === y),
      width,
      height,
      1
    );
    expect(core.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
  });

  it('does not restore the boundary of a wide island', () => {
    const width = 32;
    const height = 8;
    const core = erodeCoverage(
      coverage(width, height, (_x, y) => y >= 2 && y <= 5),
      width,
      height,
      1
    );
    let count = 0;
    for (const value of core) {
      count += value;
    }
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(32 * 4);
    expect(core[3 * width]).toBe(0);
  });
});
