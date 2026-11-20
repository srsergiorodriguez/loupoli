import { describe, expect, it } from 'vitest';
import {
  clampScale,
  snapRotationRadians,
  transformPivot
} from './transformPivot';

describe('transformPivot', () => {
  it('uses the median of unique selected vertices', () => {
    expect(
      transformPivot(
        [
          [0, 0, 0],
          [4, 2, 0],
          [2, 4, 6]
        ],
        'median'
      )
    ).toEqual([2, 2, 2]);
  });

  it('uses the active object origin when requested', () => {
    expect(
      transformPivot(
        [
          [8, 8, 8],
          [10, 10, 10]
        ],
        'origin'
      )
    ).toEqual([0, 0, 0]);
  });

  it('falls back to the origin for an empty selection', () => {
    expect(transformPivot([], 'median')).toEqual([0, 0, 0]);
  });

  it('clamps zero and negative object scale components', () => {
    expect(clampScale([0, -2, 3])).toEqual([0.001, 0.001, 3]);
  });

  it('snaps rotation angles to the configured degree step', () => {
    expect(snapRotationRadians(Math.PI / 7, 15, true)).toBeCloseTo(
      Math.PI / 6
    );
    expect(snapRotationRadians(Math.PI / 7, 15, false)).toBe(Math.PI / 7);
  });
});
