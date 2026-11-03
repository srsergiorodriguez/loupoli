import { describe, expect, it } from 'vitest';
import { applyDefaultSeams } from './defaultSeams';
import { createCubeMesh, createCylinderMesh, createGridMesh, createQuadSphereMesh } from './primitives';
import { extractUvCharts } from './uvCharts';

describe('default primitive seams', () => {
  it('cuts a cube into one unfold net', () => {
    const cube = createCubeMesh(2);
    applyDefaultSeams(cube, 'cube');
    expect(extractUvCharts(cube)).toHaveLength(1);
  });

  it('cuts a quadsphere into one unfold net', () => {
    const sphere = createQuadSphereMesh(1.25, 2);
    applyDefaultSeams(sphere, 'quadsphere');
    expect(extractUvCharts(sphere)).toHaveLength(1);
  });

  it('splits cylinder caps from the side and adds a side seam', () => {
    const cylinder = createCylinderMesh(1, 2, 12);
    applyDefaultSeams(cylinder, 'cylinder');
    expect(extractUvCharts(cylinder)).toHaveLength(3);
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
