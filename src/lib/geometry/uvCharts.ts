import type { HalfEdgeMesh } from './HalfEdgeMesh';

/** One connected set of faces bounded by seams, open boundaries, or both. */
export interface UvChart {
  /** Face indices in deterministic order. */
  readonly faces: readonly number[];
  /** Unique topological vertex indices used by the chart. */
  readonly vertices: readonly number[];
  /** Half-edges on the chart boundary (seams and open boundary loops). */
  readonly boundaryHalfEdges: readonly number[];
}

/**
 * Split a mesh into UV charts across seams and open boundaries.
 *
 * Faces remain connected across an interior edge only when that edge is not a
 * seam. The boundary list includes both sides of a seam and all open boundary
 * half-edges, which is the input a future pin/constraint UI needs.
 */
export function extractUvCharts(mesh: HalfEdgeMesh): UvChart[] {
  const parent = new Int32Array(mesh.faceCount);
  for (let face = 0; face < mesh.faceCount; face += 1) {
    parent[face] = face;
  }
  const find = (value: number): number => {
    let current = value;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[rb] = ra;
    }
  };

  for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
    if (mesh.isEdgeSeam(edge)) {
      continue;
    }
    const halfEdge = mesh.edgeHalfEdge[edge];
    const twin = mesh.heTwin[halfEdge];
    if (twin < 0) {
      continue;
    }
    const a = mesh.heFace[halfEdge];
    const b = mesh.heFace[twin];
    if (a >= 0 && b >= 0) {
      union(a, b);
    }
  }

  const facesByRoot = new Map<number, number[]>();
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const root = find(face);
    const faces = facesByRoot.get(root);
    if (faces) {
      faces.push(face);
    } else {
      facesByRoot.set(root, [face]);
    }
  }

  const charts: UvChart[] = [];
  for (const faces of facesByRoot.values()) {
    const vertices = new Set<number>();
    const boundaryHalfEdges: number[] = [];
    for (const face of faces) {
      const start = mesh.faceHalfEdge[face];
      let halfEdge = start;
      do {
        vertices.add(mesh.heOrigin[halfEdge]);
        const twin = mesh.heTwin[halfEdge];
        if (
          twin < 0 ||
          mesh.heFace[twin] < 0 ||
          mesh.isEdgeSeam(mesh.heEdge[halfEdge])
        ) {
          boundaryHalfEdges.push(halfEdge);
        }
        halfEdge = mesh.heNext[halfEdge];
      } while (halfEdge !== start);
    }
    charts.push({
      faces: [...faces].sort((a, b) => a - b),
      vertices: [...vertices].sort((a, b) => a - b),
      boundaryHalfEdges: boundaryHalfEdges.sort((a, b) => a - b)
    });
  }
  charts.sort((a, b) => a.faces[0] - b.faces[0]);
  return charts;
}
