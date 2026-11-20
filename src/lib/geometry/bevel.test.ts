import { describe, expect, it } from 'vitest';
import { createCubeMesh, createGridMesh } from './primitives';
import { bevelEdge } from './bevel';
import type { HalfEdgeMesh } from './HalfEdgeMesh';

function signedVolume(mesh: HalfEdgeMesh): number {
  let volume = 0;
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const start = mesh.faceHalfEdge[face];
    let current = start;
    const points: [number, number, number][] = [];
    do {
      const vertex = mesh.heOrigin[current];
      const offset = vertex * 3;
      points.push([
        mesh.positions[offset],
        mesh.positions[offset + 1],
        mesh.positions[offset + 2]
      ]);
      current = mesh.heNext[current];
    } while (current !== start);
    for (let index = 1; index + 1 < points.length; index += 1) {
      const a = points[0];
      const b = points[index];
      const c = points[index + 1];
      volume +=
        (a[0] * (b[1] * c[2] - b[2] * c[1]) +
          a[1] * (b[2] * c[0] - b[0] * c[2]) +
          a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6;
    }
  }
  return volume;
}

describe('edge bevel', () => {
  it('chamfers one cube edge into a valid closed mesh', () => {
    const source = createCubeMesh(2);
    const result = bevelEdge(source, 0, 0.25);
    result.mesh.validate();
    expect(result.mesh.faceCount).toBe(source.faceCount + 3);
    expect(result.mesh.vertexCount).toBe(source.vertexCount + 4);
    expect(result.mesh.boundaryEdgeCount).toBe(0);
    expect(result.mesh.faceVertexCount(result.chamferFace)).toBe(4);
    expect(result.mesh.faceCount).toBe(9);
    const volume = signedVolume(result.mesh);
    expect(volume).toBeGreaterThan(7);
    expect(volume).toBeLessThan(8);
  });

  it('bevels every cube edge independently', () => {
    const source = createCubeMesh(2);
    for (let edge = 0; edge < source.edgeCount; edge += 1) {
      const result = bevelEdge(source, edge, 0.12);
      result.mesh.validate();
      expect(result.mesh.boundaryEdgeCount).toBe(0);
    }
  });

  it('rejects boundary edges and excessive amounts', () => {
    const cube = createCubeMesh(2);
    expect(() => bevelEdge(cube, 0, 0)).toThrow(/positive/);
    expect(() => bevelEdge(cube, 0, 10)).toThrow(/too large/);
    const grid = createGridMesh(4, 4);
    expect(() => bevelEdge(grid, 0, 0.1)).toThrow(/interior/);
  });
});
