import { describe, expect, it } from 'vitest';
import { collectEdgeLoop, collectEdgeLoops, edgeLoopSlidePlan } from './topology';
import { createCubeMesh, createGridMesh } from './primitives';
import type { HalfEdgeMesh } from './HalfEdgeMesh';

function edgeVertices(mesh: HalfEdgeMesh, edge: number): [number, number] {
  const halfEdge = mesh.edgeHalfEdge[edge];
  return [mesh.heOrigin[halfEdge], mesh.heOrigin[mesh.heNext[halfEdge]]];
}

function expectConnectedLoop(mesh: HalfEdgeMesh, edges: readonly number[]): void {
  const byVertex = new Map<number, number>();
  const adjacency = new Map<number, number[]>();
  for (const edge of edges) {
    const [a, b] = edgeVertices(mesh, edge);
    byVertex.set(a, (byVertex.get(a) ?? 0) + 1);
    byVertex.set(b, (byVertex.get(b) ?? 0) + 1);
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  }
  expect([...byVertex.values()].every((degree) => degree === 1 || degree === 2)).toBe(true);
  const start = edgeVertices(mesh, edges[0])[0];
  const seen = new Set<number>([start]);
  const pending = [start];
  while (pending.length > 0) {
    const vertex = pending.pop() as number;
    for (const next of adjacency.get(vertex) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        pending.push(next);
      }
    }
  }
  expect(seen.size).toBe(byVertex.size);
}

describe('edge loop collection', () => {
  it('collects a connected quad loop on a cube', () => {
    const cube = createCubeMesh(2);
    const loop = collectEdgeLoop(cube, 0);
    expect(loop.edges).toEqual([0, 1, 2, 3]);
    expect(loop.closed).toBe(true);
    expect(new Set(loop.edges).size).toBe(loop.edges.length);
    expectConnectedLoop(cube, loop.edges);
  });

  it('walks a completed side-face loop through a valence-three corner', () => {
    const cube = createCubeMesh(2);
    const loop = collectEdgeLoop(cube, 8);
    expect(loop.edges).toEqual([3, 4, 8, 9]);
    expect(loop.closed).toBe(true);
    expectConnectedLoop(cube, loop.edges);
  });

  it('follows the boundary loop on a grid', () => {
    const grid = createGridMesh(2, 2);
    const loop = collectEdgeLoop(grid, 0);
    expect(loop.closed).toBe(true);
    expect(loop.edges.length).toBeGreaterThan(3);
    expectConnectedLoop(grid, loop.edges);
  });

  it('plans a slide for a selected closed loop', () => {
    const cube = createCubeMesh(2);
    const plan = edgeLoopSlidePlan(cube, [0, 1, 2, 3]);
    expect(plan).not.toBeNull();
    expect(plan?.vertices).toHaveLength(4);
    for (const vertex of plan?.vertices ?? []) {
      expect(plan?.candidates.get(vertex)?.length).toBeGreaterThan(0);
    }
  });

  it('rejects a single edge or disconnected loop selection', () => {
    const cube = createCubeMesh(2);
    expect(edgeLoopSlidePlan(cube, [0])).toBeNull();
    expect(edgeLoopSlidePlan(cube, [0, 8])).toBeNull();
  });

  it('unions loops for a multi-edge selection', () => {
    const cube = createCubeMesh(2);
    expect(collectEdgeLoops(cube, [0])).toEqual([0, 1, 2, 3]);
    expect(collectEdgeLoops(cube, [0, 8])).toEqual([0, 1, 2, 3, 4, 8, 9]);
    expect(collectEdgeLoops(cube, [])).toEqual([]);
    expect(collectEdgeLoops(cube, [-1, 999])).toEqual([]);
  });

  it('stops an interior loop at open boundaries', () => {
    const grid = createGridMesh(3, 3);
    const loop = collectEdgeLoop(grid, 5);
    expect(loop.closed).toBe(false);
    expect(loop.edges).toEqual([5, 13, 20]);
    expectConnectedLoop(grid, loop.edges);
  });
});
