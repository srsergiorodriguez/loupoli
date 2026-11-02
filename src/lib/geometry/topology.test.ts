import { describe, expect, it } from 'vitest';
import { HalfEdgeMesh, type MeshFaceSpec } from './HalfEdgeMesh';
import { createCubeMesh, createGridMesh, createQuadSphereMesh } from './primitives';
import { bridgeSelectedEdges, deleteSelectedElements, mergeSelectedVertices } from './topology';

describe('destructive element deletion', () => {
  it('removes selected faces and leaves valid boundary loops', () => {
    const mesh = createQuadSphereMesh(1.25, 2);
    const next = deleteSelectedElements(mesh, 'face', [0, 2]);

    expect(next.faceCount).toBe(mesh.faceCount - 2);
    expect(next.boundaryEdgeCount).toBeGreaterThan(0);
    expect(() => next.validate()).not.toThrow();
  });

  it('removes all faces incident to selected vertices and edges', () => {
    const sphere = createQuadSphereMesh(1.25, 2);
    const vertexMesh = deleteSelectedElements(sphere, 'vertex', [0]);
    expect(vertexMesh.faceCount).toBeLessThan(sphere.faceCount);
    expect(() => vertexMesh.validate()).not.toThrow();

    const cube = createCubeMesh(2);
    const edgeMesh = deleteSelectedElements(cube, 'edge', [0]);
    expect(edgeMesh.faceCount).toBe(cube.faceCount - 2);
    expect(edgeMesh.boundaryEdgeCount).toBeGreaterThan(0);
    expect(() => edgeMesh.validate()).not.toThrow();
  });


  it('merges selected vertices toward their centroid', () => {
    const grid = createGridMesh(4, 2);
    const beforeVertices = grid.vertexCount;
    const merged = mergeSelectedVertices(grid, [0, 1]);
    expect(merged.vertexCount).toBeLessThan(beforeVertices);
    expect(merged.faceCount).toBeLessThanOrEqual(grid.faceCount);
    expect(() => merged.validate()).not.toThrow();
    expect(() => mergeSelectedVertices(grid, [0])).toThrow(/two vertices/);
  });

  it('bridges two boundary edges with a new quad', () => {
    const quad = (z: number): MeshFaceSpec => ({
      corners: [
        { position: [0, 0, z], uv: [0, 0] },
        { position: [1, 0, z], uv: [1, 0] },
        { position: [1, 1, z], uv: [1, 1] },
        { position: [0, 1, z], uv: [0, 1] }
      ]
    });
    const open = HalfEdgeMesh.fromPolygons([quad(0), quad(1)]);
    const boundaryEdges: number[] = [];
    for (let edge = 0; edge < open.edgeCount; edge += 1) {
      const halfEdge = open.edgeHalfEdge[edge];
      if (
        open.heFace[halfEdge] === -1 ||
        open.heFace[open.heTwin[halfEdge]] === -1
      ) {
        boundaryEdges.push(edge);
      }
    }
    expect(boundaryEdges.length).toBe(8);
    const bridged = bridgeSelectedEdges(open, [
      boundaryEdges[0],
      boundaryEdges[5]
    ]);
    expect(bridged.faceCount).toBe(3);
    expect(() => bridged.validate()).not.toThrow();
    expect(() =>
      bridgeSelectedEdges(open, [0, 1])
    ).toThrow(/boundary edges/);
  });

  it('preserves open grid topology and rejects deleting every face', () => {
    const grid = createGridMesh(4, 2);
    const next = deleteSelectedElements(grid, 'face', [0, 1]);
    expect(next.faceCount).toBe(grid.faceCount - 2);
    expect(next.boundaryEdgeCount).toBeGreaterThan(0);
    expect(() => next.validate()).not.toThrow();

    const allFaces = Array.from({ length: grid.faceCount }, (_, i) => i);
    expect(() => deleteSelectedElements(grid, 'face', allFaces)).toThrow(
      /every face/
    );
    expect(() => deleteSelectedElements(grid, 'face', [])).toThrow(
      /No elements/
    );
  });
});
