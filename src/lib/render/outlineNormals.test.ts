import { describe, expect, it } from 'vitest';
import { writeSmoothedOutlineNormals } from './outlineNormals';

describe('outline normals', () => {
  it('miter-extrudes split normals at coincident hard-edge positions', () => {
    // Two coplanar triangles meeting at a 90-degree edge: each face has its
    // own split normal, but the shared corner must extrude in one direction.
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 1, 0, -1, 0, 0
    ]);
    const normals = new Float32Array([
      0, 0, 1, 0, 0, 1, 0, 0, 1,
      1, 0, 0, 1, 0, 0, 1, 0, 0
    ]);
    const out = new Float32Array(positions.length);

    writeSmoothedOutlineNormals(positions, normals, out);

    // The shared corner is mitered to the intersection of the two offset
    // face planes: (1, 0, 1), not the normalized bisector.
    expect(out[0]).toBeCloseTo(1, 6);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(1, 6);
    expect(out[9]).toBeCloseTo(1, 6);
    expect(out[11]).toBeCloseTo(1, 6);
    // The unshared tips retain their own face normal.
    expect(Array.from(out.slice(3, 6))).toEqual([0, 0, 1]);
    expect(Array.from(out.slice(15, 18))).toEqual([1, 0, 0]);
  });

  it('keeps a source normal when coincident faces cancel', () => {
    const positions = new Float32Array([0, 0, 0, 0, 0, 0]);
    const normals = new Float32Array([1, 0, 0, -1, 0, 0]);
    const out = new Float32Array(positions.length);

    writeSmoothedOutlineNormals(positions, normals, out);

    expect(Array.from(out)).toEqual(Array.from(normals));
  });

  it('rejects mismatched buffers', () => {
    expect(() =>
      writeSmoothedOutlineNormals(
        new Float32Array(3),
        new Float32Array(6),
        new Float32Array(3)
      )
    ).toThrow('matching lengths');
  });
});
