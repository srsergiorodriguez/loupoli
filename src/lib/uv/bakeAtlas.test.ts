import { describe, expect, it } from 'vitest';
import { hasUvOverlap } from '../lighting/bake';
import { createCubeMesh } from '../geometry/primitives';
import { buildBakeAtlasPlan } from './bakeAtlas';

function splitCube() {
  const mesh = createCubeMesh(2);
  for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
    mesh.setEdgeSeam(edge, true);
  }
  return mesh;
}

describe('unique bake atlas planning', () => {
  it('packs every source chart into a unique UV cell', () => {
    const mesh = splitCube();
    for (let face = 0; face < mesh.faceCount; face += 1) {
      const start = mesh.faceHalfEdge[face];
      let corner = start;
      let index = 0;
      do {
        mesh.setCornerUv(corner, [
          index === 1 || index === 2 ? 0.25 : 0.05,
          index >= 2 ? 0.25 : 0.05
        ]);
        index += 1;
        corner = mesh.heNext[corner];
      } while (corner !== start);
    }
    expect(hasUvOverlap(mesh)).toBe(true);
    const plan = buildBakeAtlasPlan(mesh, 1024);
    expect(plan).not.toBeNull();
    expect(plan?.charts).toHaveLength(mesh.faceCount);
    const repacked = mesh.withPositions(mesh.positions);
    repacked.setAllCornerUvs(plan!.uvs);
    expect(hasUvOverlap(repacked)).toBe(false);
    for (const uv of plan!.uvs) {
      expect(uv).toBeGreaterThanOrEqual(0);
      expect(uv).toBeLessThanOrEqual(1);
    }
  });

  it('splits an intentionally stacked default chart into unique faces', () => {
    const mesh = createCubeMesh(2);
    expect(hasUvOverlap(mesh)).toBe(true);
    const plan = buildBakeAtlasPlan(mesh, 1024);
    expect(plan).not.toBeNull();
    const repacked = mesh.withPositions(mesh.positions);
    repacked.setAllCornerUvs(plan!.uvs);
    expect(hasUvOverlap(repacked)).toBe(false);
  });

  it('rejects an atlas whose charts cannot fit', () => {
    const mesh = splitCube();
    for (let face = 0; face < mesh.faceCount; face += 1) {
      const start = mesh.faceHalfEdge[face];
      let corner = start;
      do {
        mesh.setCornerUv(corner, [0, 0]);
        corner = mesh.heNext[corner];
      } while (corner !== start);
    }
    expect(buildBakeAtlasPlan(mesh, 1024)).toBeNull();
  });
});
