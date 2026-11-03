import { describe, expect, it } from 'vitest';
import { collectEdgeLoop } from './topology';
import { createCubeMesh, createGridMesh } from './primitives';

describe('edge loop collection', () => {
  it('collects a closed quad loop on a cube', () => {
    const cube = createCubeMesh(2);
    const loop = collectEdgeLoop(cube, 0);
    expect(loop.edges.length).toBeGreaterThanOrEqual(4);
    expect(loop.closed).toBe(true);
    expect(new Set(loop.edges).size).toBe(loop.edges.length);
    expect(loop.edges.every((edge) => edge >= 0 && edge < cube.edgeCount)).toBe(
      true
    );
  });

  it('stops at an open boundary on a grid', () => {
    const grid = createGridMesh(2, 2);
    const loop = collectEdgeLoop(grid, 0);
    expect(loop.edges.length).toBeGreaterThan(0);
    expect(loop.edges.every((edge) => edge >= 0 && edge < grid.edgeCount)).toBe(
      true
    );
  });
});
