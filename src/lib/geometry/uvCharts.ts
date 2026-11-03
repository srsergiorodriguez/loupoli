import type { HalfEdgeMesh } from './HalfEdgeMesh';

/** One welded UV vertex: corners that share a point inside a chart. */
export interface UvChartVertex {
  /** Mesh vertex supplying the 3D position. */
  readonly vertex: number;
  /** Half-edge corners welded into this UV vertex. */
  readonly corners: readonly number[];
}

/** One connected set of faces bounded by seams, open boundaries, or both. */
export interface UvChart {
  /** Face indices in deterministic order. */
  readonly faces: readonly number[];
  /** Unique topological vertex indices used by the chart. */
  readonly vertices: readonly number[];
  /** Chart-local UV vertices after splitting corner fans at seams. */
  readonly uvVertices: readonly UvChartVertex[];
  /** Half-edge corner to chart-local UV vertex index. */
  readonly cornerUvVertex: ReadonlyMap<number, number>;
  /** Half-edges on the chart boundary (seams and open boundary loops). */
  readonly boundaryHalfEdges: readonly number[];
}

/**
 * Split a mesh into UV charts across seams and open boundaries.
 *
 * Faces remain connected across an interior edge only when that edge is not a
 * seam. Within each chart, corners are welded across non-seam edges; a seam
 * that cuts through a vertex fan therefore creates multiple UV vertices for
 * the same mesh vertex instead of collapsing them into one point.
 */
export function extractUvCharts(mesh: HalfEdgeMesh): UvChart[] {
  const faceParent = new Int32Array(mesh.faceCount);
  for (let face = 0; face < mesh.faceCount; face += 1) {
    faceParent[face] = face;
  }
  const findFace = (value: number): number => {
    let current = value;
    while (faceParent[current] !== current) {
      faceParent[current] = faceParent[faceParent[current]];
      current = faceParent[current];
    }
    return current;
  };
  const unionFace = (a: number, b: number): void => {
    const ra = findFace(a);
    const rb = findFace(b);
    if (ra !== rb) {
      faceParent[rb] = ra;
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
      unionFace(a, b);
    }
  }

  const facesByRoot = new Map<number, number[]>();
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const root = findFace(face);
    const faces = facesByRoot.get(root);
    if (faces) {
      faces.push(face);
    } else {
      facesByRoot.set(root, [face]);
    }
  }

  const charts: UvChart[] = [];
  for (const faces of facesByRoot.values()) {
    const cornerParent = new Int32Array(mesh.halfEdgeCount);
    for (let corner = 0; corner < mesh.halfEdgeCount; corner += 1) {
      cornerParent[corner] = corner;
    }
    const findCorner = (value: number): number => {
      let current = value;
      while (cornerParent[current] !== current) {
        cornerParent[current] = cornerParent[cornerParent[current]];
        current = cornerParent[current];
      }
      return current;
    };
    const unionCorner = (a: number, b: number): void => {
      const ra = findCorner(a);
      const rb = findCorner(b);
      if (ra !== rb) {
        cornerParent[rb] = ra;
      }
    };

    const meshVertices = new Set<number>();
    const boundaryHalfEdges: number[] = [];
    const chartCorners: number[] = [];
    for (const face of faces) {
      const start = mesh.faceHalfEdge[face];
      let halfEdge = start;
      do {
        meshVertices.add(mesh.heOrigin[halfEdge]);
        chartCorners.push(halfEdge);
        const twin = mesh.heTwin[halfEdge];
        if (
          twin < 0 ||
          mesh.heFace[twin] < 0 ||
          mesh.isEdgeSeam(mesh.heEdge[halfEdge])
        ) {
          boundaryHalfEdges.push(halfEdge);
        } else {
          // Weld the two endpoints of the shared interior edge independently.
          unionCorner(halfEdge, mesh.heNext[twin]);
          unionCorner(mesh.heNext[halfEdge], twin);
        }
        halfEdge = mesh.heNext[halfEdge];
      } while (halfEdge !== start);
    }

    const groupsByRoot = new Map<
      number,
      { vertex: number; corners: number[] }
    >();
    for (const corner of chartCorners) {
      const root = findCorner(corner);
      const group = groupsByRoot.get(root);
      if (group) {
        group.corners.push(corner);
      } else {
        groupsByRoot.set(root, {
          vertex: mesh.heOrigin[corner],
          corners: [corner]
        });
      }
    }
    const uvVertices = [...groupsByRoot.values()]
      .map((group) => ({
        vertex: group.vertex,
        corners: group.corners.sort((a, b) => a - b)
      }))
      .sort((a, b) => a.corners[0] - b.corners[0]);
    const cornerUvVertex = new Map<number, number>();
    uvVertices.forEach((uvVertex, index) => {
      for (const corner of uvVertex.corners) {
        cornerUvVertex.set(corner, index);
      }
    });

    charts.push({
      faces: [...faces].sort((a, b) => a - b),
      vertices: [...meshVertices].sort((a, b) => a - b),
      uvVertices,
      cornerUvVertex,
      boundaryHalfEdges: boundaryHalfEdges.sort((a, b) => a - b)
    });
  }
  charts.sort((a, b) => a.faces[0] - b.faces[0]);
  return charts;
}
