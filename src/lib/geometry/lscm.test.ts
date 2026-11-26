import { describe, expect, it } from 'vitest';
import { createCubeMesh, createGridMesh, createQuadSphereMesh } from './primitives';
import { extractUvCharts } from './uvCharts';
import { LscmError, packUvChartRects, unwrapUvCharts } from './lscm';

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
    const uvs = unwrapUvCharts(grid, charts, [
      grid.faceHalfEdge[0],
      grid.faceHalfEdge[grid.faceCount - 1]
    ]);
    for (let corner = 0; corner < grid.halfEdgeCount; corner += 1) {
      expect(Number.isFinite(uvs[corner * 2])).toBe(true);
      expect(Number.isFinite(uvs[corner * 2 + 1])).toBe(true);
    }
  });

  it('unwraps one cube net with split corner fans', () => {
    const cube = createCubeMesh(1);
    for (let edge = 0; edge < cube.edgeCount; edge += 1) {
      cube.setEdgeSeam(edge, true);
    }
    const connect = (firstFace: number, secondFace: number): void => {
      for (let edge = 0; edge < cube.edgeCount; edge += 1) {
        const halfEdge = cube.edgeHalfEdge[edge];
        const twin = cube.heTwin[halfEdge];
        if (twin < 0) {
          continue;
        }
        const a = cube.heFace[halfEdge];
        const b = cube.heFace[twin];
        if (
          (a === firstFace && b === secondFace) ||
          (a === secondFace && b === firstFace)
        ) {
          cube.setEdgeSeam(edge, false);
        }
      }
    };
    for (const [a, b] of [
      [0, 2],
      [1, 2],
      [2, 3],
      [2, 5],
      [4, 5]
    ]) {
      connect(a, b);
    }
    const charts = extractUvCharts(cube);
    expect(charts).toHaveLength(1);
    const meshVertices = new Set(charts[0].uvVertices.map((vertex) => vertex.vertex));
    expect(charts[0].uvVertices.length).toBeGreaterThan(meshVertices.size);
    const uvs = unwrapUvCharts(cube, charts);
    expect(uvs).toHaveLength(cube.halfEdgeCount * 2);
    expect(Array.from(uvs).every((value) => Number.isFinite(value))).toBe(true);
  });

  it('rejects a closed chart with its face range instead of applying collapsed UVs', () => {
    const sphere = createQuadSphereMesh(1.5, 2);
    const charts = extractUvCharts(sphere);
    expect(charts[0].boundaryHalfEdges).toHaveLength(0);
    try {
      unwrapUvCharts(sphere, charts);
      throw new Error('Expected the closed chart to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(LscmError);
      const lscmError = error as LscmError;
      expect(lscmError.message).toMatch(/Mark seams that cut it open/);
      expect(lscmError.message).toMatch(/Chart 1\/1/);
      expect(lscmError.message).toMatch(/faces 0/);
      expect(lscmError.context).toEqual({
        chartIndex: 1,
        chartCount: 1,
        faces: charts[0].faces
      });
    }
    expect(() => unwrapUvCharts(sphere, [])).toThrow(LscmError);
  });
});
  it('packs variable-size chart rectangles without overlap', () => {
    const placements = packUvChartRects([
      { index: 0, spanU: 1.2, spanV: 0.4 },
      { index: 1, spanU: 0.3, spanV: 1.1 },
      { index: 2, spanU: 0.6, spanV: 0.5 },
      { index: 3, spanU: 0.2, spanV: 0.2 }
    ]);
    expect(placements).not.toBeNull();
    const boxes = placements!.map((placement, index) => {
      const rect = [
        { spanU: 1.2, spanV: 0.4 },
        { spanU: 0.3, spanV: 1.1 },
        { spanU: 0.6, spanV: 0.5 },
        { spanU: 0.2, spanV: 0.2 }
      ][index];
      return {
        minU: placement.originU,
        minV: placement.originV,
        maxU: placement.originU + rect.spanU * placement.scale,
        maxV: placement.originV + rect.spanV * placement.scale
      };
    });
    for (const box of boxes) {
      expect(box.minU).toBeGreaterThanOrEqual(0);
      expect(box.minV).toBeGreaterThanOrEqual(0);
      expect(box.maxU).toBeLessThanOrEqual(1);
      expect(box.maxV).toBeLessThanOrEqual(1);
    }
    for (let first = 0; first < boxes.length; first += 1) {
      for (let second = first + 1; second < boxes.length; second += 1) {
        const a = boxes[first];
        const b = boxes[second];
        const separated =
          a.maxU <= b.minU ||
          b.maxU <= a.minU ||
          a.maxV <= b.minV ||
          b.maxV <= a.minV;
        expect(separated).toBe(true);
      }
    }
  });
