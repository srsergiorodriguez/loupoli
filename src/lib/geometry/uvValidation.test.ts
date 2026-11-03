import { describe, expect, it } from 'vitest';
import { chartHasUvOverlap, uvTrianglesOverlap } from './uvValidation';

describe('UV overlap validation', () => {
  it('detects intersecting triangles', () => {
    expect(
      uvTrianglesOverlap(
        [[0, 0], [2, 0], [0, 2]],
        [[0.5, 0.5], [2.5, 0.5], [0.5, 2.5]]
      )
    ).toBe(true);
  });

  it('accepts separated triangles and shared-edge triangles', () => {
    expect(
      uvTrianglesOverlap(
        [[0, 0], [1, 0], [0, 1]],
        [[3, 0], [4, 0], [3, 1]]
      )
    ).toBe(false);
    expect(
      uvTrianglesOverlap(
        [[0, 0], [1, 0], [0, 1]],
        [[1, 0], [1, 1], [0, 1]]
      )
    ).toBe(false);
  });

  it('skips triangle pairs that share chart vertices', () => {
    const uvs = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0.5, 0.5]
    ] as [number, number][];
    expect(
      chartHasUvOverlap(uvs, [
        { a: 0, b: 1, c: 2 },
        { a: 1, b: 2, c: 3 }
      ])
    ).toBe(false);
    expect(
      chartHasUvOverlap(uvs, [
        { a: 0, b: 1, c: 2 },
        { a: 0, b: 1, c: 4 }
      ])
    ).toBe(false);
  });
});
