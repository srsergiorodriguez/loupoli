import { describe, expect, it } from 'vitest';
import { createCubeMesh, createGridMesh } from './primitives';
import { extractUvCharts } from './uvCharts';

describe('UV chart extraction', () => {
  it('keeps an unseamed cube in one closed chart', () => {
    const cube = createCubeMesh(1);
    const charts = extractUvCharts(cube);
    expect(charts).toHaveLength(1);
    expect(charts[0].faces).toHaveLength(6);
    expect(charts[0].vertices).toHaveLength(8);
    expect(charts[0].uvVertices).toHaveLength(8);
    expect(charts[0].boundaryHalfEdges).toHaveLength(0);
  });

  it('splits a face surrounded by seams into its own chart', () => {
    const cube = createCubeMesh(1);
    const start = cube.faceHalfEdge[0];
    let halfEdge = start;
    do {
      cube.setEdgeSeam(cube.heEdge[halfEdge], true);
      halfEdge = cube.heNext[halfEdge];
    } while (halfEdge !== start);
    const charts = extractUvCharts(cube);
    expect(charts.map((chart) => chart.faces.length).sort((a, b) => a - b)).toEqual([
      1,
      5
    ]);
    expect(charts[0].boundaryHalfEdges.length).toBeGreaterThan(0);
  });

  it('keeps an open grid as one chart with an explicit boundary', () => {
    const grid = createGridMesh(4, 4);
    const charts = extractUvCharts(grid);
    expect(charts).toHaveLength(1);
    expect(charts[0].boundaryHalfEdges.length).toBeGreaterThan(0);
  });
});
