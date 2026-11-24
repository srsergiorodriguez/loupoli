import { describe, expect, it } from 'vitest';
import { createCubeMesh, createGridMesh } from './primitives';
import { subdivideMesh } from './subdivide';

describe('subdivideMesh', () => {
  it('splits a closed cube into uniform quads without opening it', () => {
    const cube = createCubeMesh(1);
    const result = subdivideMesh(cube);
    expect(result.vertexCount).toBe(26);
    expect(result.faceCount).toBe(24);
    expect(result.boundaryEdgeCount).toBe(0);
    for (let face = 0; face < result.faceCount; face += 1) {
      expect(result.faceVertexCount(face)).toBe(4);
    }
    expect(() => result.validate()).not.toThrow();
  });

  it('keeps an open grid manifold and preserves its boundary', () => {
    const grid = createGridMesh(4, 4);
    const result = subdivideMesh(grid);
    expect(result.faceCount).toBe(64);
    expect(result.boundaryEdgeCount).toBe(32);
    expect(() => result.validate()).not.toThrow();
  });

  it('carries seams onto split child edges', () => {
    const cube = createCubeMesh(1);
    const seam = cube.edgeHalfEdge[0];
    cube.setEdgeSeam(cube.heEdge[seam], true);
    const result = subdivideMesh(cube);
    let seams = 0;
    for (let edge = 0; edge < result.edgeCount; edge += 1) {
      if (result.isEdgeSeam(edge)) {
        seams += 1;
      }
    }
    expect(seams).toBeGreaterThanOrEqual(2);
  });
});
