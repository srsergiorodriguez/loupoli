import { describe, expect, it } from 'vitest';
import { createCubeMesh, createGridMesh, createQuadSphereMesh } from './primitives';
import { extractUvCharts } from './uvCharts';
import { LscmError, unwrapUvCharts } from './lscm';

describe('LSCM unwrap', () => {
  it('unwraps a single quad into finite, non-degenerate UVs', () => {
    const grid = createGridMesh(1, 1);
    const charts = extractUvCharts(grid);
    const uvs = unwrapUvCharts(grid, charts);
    const corners = new Set<string>();
    for (let face = 0; face < grid.faceCount; face += 1) {
      const start = grid.faceHalfEdge[face];
      let corner = start;
      do {
        const u = uvs[corner * 2];
        const v = uvs[corner * 2 + 1];
        expect(Number.isFinite(u)).toBe(true);
        expect(Number.isFinite(v)).toBe(true);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        corners.add(`${u.toFixed(5)}|${v.toFixed(5)}`);
        corner = grid.heNext[corner];
      } while (corner !== start);
    }
    expect(corners.size).toBe(4);
    const face = grid.faceHalfEdge[0];
    const points: [number, number][] = [];
    let corner = face;
    do {
      points.push([uvs[corner * 2], uvs[corner * 2 + 1]]);
      corner = grid.heNext[corner];
    } while (corner !== face);
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const next = points[(index + 1) % points.length];
      area += points[index][0] * next[1] - next[0] * points[index][1];
    }
    expect(Math.abs(area)).toBeGreaterThan(1e-4);
  });

  it('unwraps seam-separated cube charts', () => {
    const cube = createCubeMesh(1);
    const start = cube.faceHalfEdge[0];
    let halfEdge = start;
    do {
      cube.setEdgeSeam(cube.heEdge[halfEdge], true);
      halfEdge = cube.heNext[halfEdge];
    } while (halfEdge !== start);
    const charts = extractUvCharts(cube);
    expect(charts).toHaveLength(2);
    const uvs = unwrapUvCharts(cube, charts);
    for (let corner = 0; corner < cube.halfEdgeCount; corner += 1) {
      expect(Number.isFinite(uvs[corner * 2])).toBe(true);
      expect(Number.isFinite(uvs[corner * 2 + 1])).toBe(true);
    }
    // The isolated quad must not collapse to one point.
    const isolated = charts.find((chart) => chart.faces.length === 1);
    expect(isolated).toBeDefined();
    const points = new Set<string>();
    for (const face of isolated?.faces ?? []) {
      for (const h of [cube.faceHalfEdge[face]]) {
        let corner = h;
        do {
          points.add(`${uvs[corner * 2].toFixed(5)}|${uvs[corner * 2 + 1].toFixed(5)}`);
          corner = cube.heNext[corner];
        } while (corner !== h);
      }
    }
    expect(points.size).toBe(4);
  });

  it('accepts explicit chart pins', () => {
    const grid = createGridMesh(2, 2);
    const charts = extractUvCharts(grid);
    const uvs = unwrapUvCharts(grid, charts, [0, 8]);
    for (let corner = 0; corner < grid.halfEdgeCount; corner += 1) {
      expect(Number.isFinite(uvs[corner * 2])).toBe(true);
      expect(Number.isFinite(uvs[corner * 2 + 1])).toBe(true);
    }
  });

  it('rejects a closed chart instead of applying collapsed UVs', () => {
    const sphere = createQuadSphereMesh(1.5, 2);
    const charts = extractUvCharts(sphere);
    expect(charts[0].boundaryHalfEdges).toHaveLength(0);
    expect(() => unwrapUvCharts(sphere, charts)).toThrow(LscmError);
    expect(() => unwrapUvCharts(sphere, [])).toThrow(LscmError);
  });
});
