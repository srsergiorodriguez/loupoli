import { describe, expect, it } from 'vitest';
import { applyDefaultSeams } from './defaultSeams';
import { createCubeMesh, createCylinderMesh, createGridMesh, createQuadSphereMesh } from './primitives';
import { extractUvCharts } from './uvCharts';
import { unwrapUvCharts } from './lscm';

describe('default primitive seams', () => {
  it('cuts a cube into one six-face cross-net chart', () => {
    const cube = createCubeMesh(2);
    applyDefaultSeams(cube, 'cube');
    const charts = extractUvCharts(cube);
    expect(charts).toHaveLength(1);
    expect(charts[0].faces).toHaveLength(6);
    expect(() => unwrapUvCharts(cube, charts)).not.toThrow();
  });

  it('cuts a quadsphere into six patch charts', () => {
    const sphere = createQuadSphereMesh(1.25, 2);
    applyDefaultSeams(sphere, 'quadsphere');
    const charts = extractUvCharts(sphere);
    expect(charts).toHaveLength(6);
    expect(() => unwrapUvCharts(sphere, charts)).not.toThrow();
  });

  it('splits cylinder caps and cuts the side into two strips', () => {
    const cylinder = createCylinderMesh(1, 2, 12);
    applyDefaultSeams(cylinder, 'cylinder');
    const charts = extractUvCharts(cylinder);
    expect(charts).toHaveLength(4);
    expect(() => unwrapUvCharts(cylinder, charts)).not.toThrow();
  });

  it('seams only the grid perimeter and keeps one chart', () => {
    const grid = createGridMesh(4, 4);
    applyDefaultSeams(grid, 'grid');
    expect(extractUvCharts(grid)).toHaveLength(1);
    let boundaryCount = 0;
    for (let edge = 0; edge < grid.edgeCount; edge += 1) {
      const halfEdge = grid.edgeHalfEdge[edge];
      const twin = grid.heTwin[halfEdge];
      const boundary = twin < 0 || grid.heFace[twin] < 0;
      if (boundary) {
        boundaryCount += 1;
        expect(grid.isEdgeSeam(edge)).toBe(true);
      } else {
        expect(grid.isEdgeSeam(edge)).toBe(false);
      }
    }
    expect(boundaryCount).toBeGreaterThan(0);
  });
});
