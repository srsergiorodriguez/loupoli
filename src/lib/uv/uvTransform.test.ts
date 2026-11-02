import { describe, expect, it } from 'vitest';
import { rotateUv, scaleUv, uvMedian } from './uvTransform';

describe('UV transform math', () => {
  it('computes a finite median', () => {
    expect(uvMedian([[0, 0], [1, 0], [1, 1], [0, 1]])).toEqual([0.5, 0.5]);
    expect(uvMedian([])).toEqual([0, 0]);
  });

  it('rotates around the pivot', () => {
    const result = rotateUv([1, 0], [0, 0], Math.PI / 2);
    expect(result[0]).toBeCloseTo(0);
    expect(result[1]).toBeCloseTo(1);
  });

  it('scales uniformly or along one axis', () => {
    expect(scaleUv([2, 1], [1, 1], 2)).toEqual([3, 1]);
    expect(scaleUv([2, 1], [1, 1], 2, 'u')).toEqual([3, 1]);
    expect(scaleUv([2, 1], [1, 1], 2, 'v')).toEqual([2, 1]);
  });
});
