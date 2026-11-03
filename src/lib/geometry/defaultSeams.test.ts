import { describe, expect, it } from 'vitest';
import { applyDefaultSeams } from './defaultSeams';
import { createCubeMesh, createCylinderMesh, createGridMesh, createQuadSphereMesh } from './primitives';
import { extractUvCharts } from './uvCharts';
import { unwrapUvCharts } from './lscm';

describe('default primitive seams', () => {
  it('cuts a cube into three two-face charts', () => {
    const cube = createCubeMesh(2);
    applyDefaultSeams(cube, 'cube');
    const charts = extractUvCharts(cube);
    expect(charts).toHaveLength(3);
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

  it('leaves open grids unseamed', () => {
    const grid = createGridMesh(4, 4);
    applyDefaultSeams(grid, 'grid');
    expect(extractUvCharts(grid)).toHaveLength(1);
    expect(
      Array.from({ length: grid.edgeCount }, (_, edge) => grid.isEdgeSeam(edge))
    ).not.toContain(true);
  });
});
