import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importObjNodes } from '../io/obj';
import { hasUvOverlap } from '../lighting/bake';
import { createCubeMesh, createGridMesh } from '../geometry/primitives';
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
    const plan = buildBakeAtlasPlan(mesh, 1024, 1024);
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
    const plan = buildBakeAtlasPlan(mesh, 1024, 1024);
    expect(plan).not.toBeNull();
    const repacked = mesh.withPositions(mesh.positions);
    repacked.setAllCornerUvs(plan!.uvs);
    expect(hasUvOverlap(repacked)).toBe(false);
  });


  it('keeps UV-disconnected faces in independent islands', () => {
    const mesh = createCubeMesh(2);
    const rects = [
      [0.05, 0.05, 0.25, 0.25],
      [0.05, 0.05, 0.25, 0.25],
      [0.3, 0.3, 0.5, 0.5],
      [0.3, 0.3, 0.5, 0.5],
      [0.55, 0.55, 0.75, 0.75],
      [0.55, 0.55, 0.75, 0.75]
    ];
    for (let face = 0; face < mesh.faceCount; face += 1) {
      const [minU, minV, maxU, maxV] = rects[face];
      const points: [number, number][] = [
        [minU, minV],
        [maxU, minV],
        [maxU, maxV],
        [minU, maxV]
      ];
      const start = mesh.faceHalfEdge[face];
      let corner = start;
      let index = 0;
      do {
        mesh.setCornerUv(corner, points[index % points.length]);
        index += 1;
        corner = mesh.heNext[corner];
      } while (corner !== start);
    }
    const plan = buildBakeAtlasPlan(mesh, 1024, 1024);
    expect(plan).not.toBeNull();
    expect(plan?.charts).toHaveLength(6);
    expect(plan?.charts.every((chart) => chart.faces.length === 1)).toBe(true);
    const repacked = mesh.withPositions(mesh.positions);
    repacked.setAllCornerUvs(plan!.uvs);
    expect(hasUvOverlap(repacked)).toBe(false);
  });



  it('packs every true gorilla island without splitting it', () => {
    const source = readFileSync('gorillaModel/gorilla.obj', 'utf8');
    const nodes = importObjNodes(source, '', { upAxis: 'y', scale: 1 });
    const plan = buildBakeAtlasPlan(nodes[0].mesh, 1024, 1024);
    expect(plan).not.toBeNull();
    expect(plan?.charts.length).toBeGreaterThanOrEqual(15);
    const counts = plan!.charts.map((chart) => chart.faces.length).sort((a, b) => b - a);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(136);
    const repacked = nodes[0].mesh.withPositions(nodes[0].mesh.positions);
    repacked.setAllCornerUvs(plan!.uvs);
    expect(hasUvOverlap(repacked)).toBe(false);
    for (const chart of plan!.charts) {
      expect(chart.faceIndices.length).toBe(chart.faces.length);
      const inChart = new Set(chart.faceIndices);
      const seen = new Set<number>();
      const stack = [chart.faceIndices[0]];
      seen.add(chart.faceIndices[0]);
      while (stack.length > 0) {
        const face = stack.pop()!;
        const start = nodes[0].mesh.faceHalfEdge[face];
        let halfEdge = start;
        do {
          const twin = nodes[0].mesh.heTwin[halfEdge];
          if (twin >= 0) {
            const neighbor = nodes[0].mesh.heFace[twin];
            if (inChart.has(neighbor) && !seen.has(neighbor)) {
              seen.add(neighbor);
              stack.push(neighbor);
            }
          }
          halfEdge = nodes[0].mesh.heNext[halfEdge];
        } while (halfEdge !== start);
      }
      expect(seen.size).toBe(inChart.size);
    }
  });

  it('supports rectangular atlas dimensions without distortion', () => {
    const mesh = splitCube();
    const plan = buildBakeAtlasPlan(mesh, 512, 1024);
    expect(plan).not.toBeNull();
    expect(plan?.width).toBe(512);
    expect(plan?.height).toBe(1024);
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
    expect(buildBakeAtlasPlan(mesh, 1024, 1024)).toBeNull();
  });
});


describe('painted island continuity', () => {
  it('keeps continuous UVs in one island across seam flags', () => {
    const mesh = createGridMesh(4, 2);
    for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
      mesh.setEdgeSeam(edge, true);
    }
    const plan = buildBakeAtlasPlan(mesh, 1024, 1024);
    expect(plan).not.toBeNull();
    expect(plan?.charts).toHaveLength(1);
  });
});
