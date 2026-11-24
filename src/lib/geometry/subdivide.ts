import {
  HalfEdgeMesh,
  type MeshFaceSpec,
  type Vec2,
  type Vec3
} from './HalfEdgeMesh';

/** Hard ceiling on the source faces a single Subdivide action may process. */
export const MAX_SUBDIVIDE_FACES = 20_000;

/** One original corner used while building the subdivided faces. */
interface SourceCorner {
  readonly vertex: number;
  readonly position: Vec3;
  readonly uv: Vec2;
}

function positionKey(position: readonly number[]): string {
  return `${position[0]}|${position[1]}|${position[2]}`;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Subdivide faces once.
 *
 * With no selection, or with every face selected, each face is split into
 * quads around its centroid and shared edge midpoints. A partial face
 * selection is poked into triangles per selected face so the boundary between
 * selected and unselected faces stays free of T-junctions. Original vertices
 * stay fixed, so this is a linear split rather than a smoothing subdivision;
 * UVs are interpolated per source face and materials are preserved.
 */
export function subdivideMesh(
  mesh: HalfEdgeMesh,
  selectedFaces?: ReadonlySet<number>
): HalfEdgeMesh {
  if (mesh.faceCount > MAX_SUBDIVIDE_FACES) {
    throw new Error('Subdivide exceeds the face limit.');
  }
  const edgeMidpoints = new Map<string, { vertex: number; position: Vec3 }>();
  const faces: MeshFaceSpec[] = [];
  const seamSegments = new Set<string>();
  const sourceFaces: SourceCorner[][] = [];

  for (let face = 0; face < mesh.faceCount; face += 1) {
    const start = mesh.faceHalfEdge[face];
    const corners: SourceCorner[] = [];
    let halfEdge = start;
    do {
      const vertex = mesh.heOrigin[halfEdge];
      const offset = vertex * 3;
      const uvOffset = halfEdge * 2;
      corners.push({
        vertex,
        position: [
          mesh.positions[offset],
          mesh.positions[offset + 1],
          mesh.positions[offset + 2]
        ],
        uv: [mesh.heUv[uvOffset], mesh.heUv[uvOffset + 1]]
      });
      halfEdge = mesh.heNext[halfEdge];
    } while (halfEdge !== start);
    sourceFaces.push(corners);
  }

  const facesToPoke = selectedFaces
    ? new Set(
        [...selectedFaces].filter(
          (face) => Number.isInteger(face) && face >= 0 && face < mesh.faceCount
        )
      )
    : new Set<number>();
  if (facesToPoke.size === mesh.faceCount) {
    facesToPoke.clear();
  }

  if (facesToPoke.size > 0) {
    const faces: MeshFaceSpec[] = [];
    const seamPairs = new Set<string>();
    for (let face = 0; face < mesh.faceCount; face += 1) {
      const corners = sourceFaces[face];
      if (!facesToPoke.has(face)) {
        faces.push({
          material: mesh.faceMaterial[face],
          corners: corners.map((corner) => ({
            position: corner.position,
            uv: corner.uv
          }))
        });
        continue;
      }
      const center: Vec3 = [0, 0, 0];
      const centerUv: Vec2 = [0, 0];
      for (const corner of corners) {
        center[0] += corner.position[0];
        center[1] += corner.position[1];
        center[2] += corner.position[2];
        centerUv[0] += corner.uv[0];
        centerUv[1] += corner.uv[1];
      }
      center[0] /= corners.length;
      center[1] /= corners.length;
      center[2] /= corners.length;
      centerUv[0] /= corners.length;
      centerUv[1] /= corners.length;
      for (let index = 0; index < corners.length; index += 1) {
        const nextCorner = corners[(index + 1) % corners.length];
        faces.push({
          material: mesh.faceMaterial[face],
          corners: [
            { position: corners[index].position, uv: corners[index].uv },
            { position: nextCorner.position, uv: nextCorner.uv },
            { position: center, uv: centerUv }
          ]
        });
      }
    }
    for (let face = 0; face < mesh.faceCount; face += 1) {
      const start = mesh.faceHalfEdge[face];
      let halfEdge = start;
      let index = 0;
      const corners = sourceFaces[face];
      do {
        if (mesh.isEdgeSeam(mesh.heEdge[halfEdge])) {
          seamPairs.add(
            positionKey(corners[index].position) +
              '|' +
              positionKey(corners[(index + 1) % corners.length].position)
          );
        }
        index += 1;
        halfEdge = mesh.heNext[halfEdge];
      } while (halfEdge !== start);
    }
    // Poked faces reuse all original outer edges, so the seam set only needs
    // edges that survive unchanged. Interior fan edges are never seams.
    const result = HalfEdgeMesh.fromPolygons(faces);
    for (let edge = 0; edge < result.edgeCount; edge += 1) {
      const halfEdge = result.edgeHalfEdge[edge];
      const from = result.heOrigin[halfEdge];
      const to = result.heOrigin[result.heNext[halfEdge]];
      const fromKey = positionKey([
        result.positions[from * 3],
        result.positions[from * 3 + 1],
        result.positions[from * 3 + 2]
      ]);
      const toKey = positionKey([
        result.positions[to * 3],
        result.positions[to * 3 + 1],
        result.positions[to * 3 + 2]
      ]);
      if (seamPairs.has(`${fromKey}|${toKey}`) || seamPairs.has(`${toKey}|${fromKey}`)) {
        result.setEdgeSeam(edge, true);
      }
    }
    return result;
  }

  let nextVertex = mesh.vertexCount;
  const midpointFor = (
    a: SourceCorner,
    b: SourceCorner
  ): { vertex: number; position: Vec3; uv: Vec2 } => {
    const key = edgeKey(a.vertex, b.vertex);
    let midpoint = edgeMidpoints.get(key);
    if (!midpoint) {
      midpoint = {
        vertex: nextVertex,
        position: [
          (a.position[0] + b.position[0]) / 2,
          (a.position[1] + b.position[1]) / 2,
          (a.position[2] + b.position[2]) / 2
        ]
      };
      nextVertex += 1;
      edgeMidpoints.set(key, midpoint);
    }
    return {
      vertex: midpoint.vertex,
      position: midpoint.position,
      uv: [(a.uv[0] + b.uv[0]) / 2, (a.uv[1] + b.uv[1]) / 2]
    };
  };

  for (let face = 0; face < mesh.faceCount; face += 1) {
    const corners = sourceFaces[face];
    if (corners.length < 3) {
      continue;
    }
    const center: Vec3 = [0, 0, 0];
    const centerUv: Vec2 = [0, 0];
    for (const corner of corners) {
      center[0] += corner.position[0];
      center[1] += corner.position[1];
      center[2] += corner.position[2];
      centerUv[0] += corner.uv[0];
      centerUv[1] += corner.uv[1];
    }
    center[0] /= corners.length;
    center[1] /= corners.length;
    center[2] /= corners.length;
    centerUv[0] /= corners.length;
    centerUv[1] /= corners.length;

    const edgeMidpointsForFace = corners.map((corner, index) =>
      midpointFor(corner, corners[(index + 1) % corners.length])
    );

    for (let index = 0; index < corners.length; index += 1) {
      const previous = (index + corners.length - 1) % corners.length;
      const midNext = edgeMidpointsForFace[index];
      const midPrevious = edgeMidpointsForFace[previous];
      faces.push({
        material: mesh.faceMaterial[face],
        corners: [
          { position: corners[index].position, uv: corners[index].uv },
          { position: midNext.position, uv: midNext.uv },
          { position: center, uv: centerUv },
          { position: midPrevious.position, uv: midPrevious.uv }
        ]
      });
    }
  }

  // Collect seam segments by source edge. The face loop above does not retain
  // source half-edges, so walk the original mesh once more.
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const corners = sourceFaces[face];
    const start = mesh.faceHalfEdge[face];
    let halfEdge = start;
    let index = 0;
    do {
      if (mesh.isEdgeSeam(mesh.heEdge[halfEdge])) {
        const a = corners[index];
        const b = corners[(index + 1) % corners.length];
        const midpoint = edgeMidpoints.get(edgeKey(a.vertex, b.vertex));
        if (midpoint) {
          seamSegments.add(
            positionKey(a.position) + '|' + positionKey(midpoint.position)
          );
          seamSegments.add(
            positionKey(midpoint.position) + '|' + positionKey(b.position)
          );
        }
      }
      index += 1;
      halfEdge = mesh.heNext[halfEdge];
    } while (halfEdge !== start);
  }

  const result = HalfEdgeMesh.fromPolygons(faces);
  if (seamSegments.size > 0) {
    for (let edge = 0; edge < result.edgeCount; edge += 1) {
      const halfEdge = result.edgeHalfEdge[edge];
      const from = result.heOrigin[halfEdge];
      const to = result.heOrigin[result.heNext[halfEdge]];
      const fromKey = positionKey([
        result.positions[from * 3],
        result.positions[from * 3 + 1],
        result.positions[from * 3 + 2]
      ]);
      const toKey = positionKey([
        result.positions[to * 3],
        result.positions[to * 3 + 1],
        result.positions[to * 3 + 2]
      ]);
      if (
        seamSegments.has(`${fromKey}|${toKey}`) ||
        seamSegments.has(`${toKey}|${fromKey}`)
      ) {
        result.setEdgeSeam(edge, true);
      }
    }
  }
  return result;
}
