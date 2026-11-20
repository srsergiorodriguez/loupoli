import {
  HalfEdgeMesh,
  type MeshCornerSpec,
  type MeshFaceSpec,
  type Vec2,
  type Vec3
} from './HalfEdgeMesh';

/** Result of one single-edge bevel operation. */
export interface BevelEdgeResult {
  readonly mesh: HalfEdgeMesh;
  /** Chamfer face in the rebuilt mesh. */
  readonly chamferFace: number;
}

interface FaceCorner {
  readonly halfEdge: number;
  readonly vertex: number;
  readonly position: Vec3;
  readonly uv: Vec2;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(v: Vec3, amount: number): Vec3 {
  return [v[0] * amount, v[1] * amount, v[2] * amount];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length <= 1e-9) {
    throw new Error('Bevel cannot use a zero-length edge or face normal.');
  }
  return [v[0] / length, v[1] / length, v[2] / length];
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function faceCorners(mesh: HalfEdgeMesh, face: number): FaceCorner[] {
  const corners: FaceCorner[] = [];
  const start = mesh.faceHalfEdge[face];
  let current = start;
  do {
    const vertex = mesh.heOrigin[current];
    const offset = vertex * 3;
    const uvOffset = current * 2;
    corners.push({
      halfEdge: current,
      vertex,
      position: [
        mesh.positions[offset],
        mesh.positions[offset + 1],
        mesh.positions[offset + 2]
      ],
      uv: [mesh.heUv[uvOffset], mesh.heUv[uvOffset + 1]]
    });
    current = mesh.heNext[current];
  } while (current !== start);
  return corners;
}

/** Newell normal for a potentially non-planar polygon. */
function faceNormal(corners: readonly FaceCorner[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const a = corners[index].position;
    const b = corners[(index + 1) % corners.length].position;
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return normalize([x, y, z]);
}

interface OffsetPoints {
  readonly atStart: MeshCornerSpec;
  readonly atEnd: MeshCornerSpec;
  readonly startParameter: number;
  readonly endParameter: number;
}

/**
 * Offset the selected edge inside one adjacent face.
 *
 * The offset line is parallel to the edge. Its intersections with the previous
 * and next face edges become the two replacement corners, which keeps the
 * neighboring face boundaries split at the same points.
 */
function offsetEdgeInFace(
  mesh: HalfEdgeMesh,
  face: number,
  halfEdge: number,
  amount: number
): OffsetPoints {
  const corners = faceCorners(mesh, face);
  const index = corners.findIndex((corner) => corner.halfEdge === halfEdge);
  if (index < 0) {
    throw new Error('The selected edge does not belong to its adjacent face.');
  }
  const start = corners[index];
  const end = corners[(index + 1) % corners.length];
  const previous = corners[(index - 1 + corners.length) % corners.length];
  const next = corners[(index + 2) % corners.length];
  const direction = normalize(subtract(end.position, start.position));
  const normal = faceNormal(corners);
  const inward = normalize(cross(normal, direction));
  const previousDistance = dot(subtract(previous.position, start.position), inward);
  const nextDistance = dot(subtract(next.position, end.position), inward);
  const limit = Math.min(previousDistance, nextDistance);
  if (limit <= 1e-5 || amount >= limit * 0.95) {
    throw new Error('Bevel amount is too large for the adjacent face.');
  }
  const startParameter = 1 - amount / previousDistance;
  const endParameter = amount / nextDistance;
  if (
    startParameter <= 0.001 ||
    startParameter >= 0.999 ||
    endParameter <= 0.001 ||
    endParameter >= 0.999
  ) {
    throw new Error('Bevel amount is too close to the adjacent face edge.');
  }
  return {
    atStart: {
      position: add(
        previous.position,
        scale(subtract(start.position, previous.position), startParameter)
      ),
      uv: lerp(previous.uv, start.uv, startParameter)
    },
    atEnd: {
      position: add(
        end.position,
        scale(subtract(next.position, end.position), endParameter)
      ),
      uv: lerp(end.uv, next.uv, endParameter)
    },
    startParameter,
    endParameter
  };
}

function cornerSpec(corner: FaceCorner): MeshCornerSpec {
  return {
    position: [...corner.position] as Vec3,
    uv: [...corner.uv] as Vec2
  };
}

function detach(spec: MeshCornerSpec): MeshCornerSpec {
  return {
    position: [...spec.position] as Vec3,
    uv: [...spec.uv] as Vec2
  };
}

/**
 * Bevel one interior manifold edge by a world-space amount.
 *
 * This first pass intentionally handles exactly one edge. It replaces the edge
 * in both adjacent faces with an offset segment, inserts the offset points into
 * the neighboring faces, and caps the two endpoints with triangles. That keeps
 * the result manifold and gives a deterministic chamfer quad without needing a
 * general vertex-miter solver.
 */
export function bevelEdge(
  mesh: HalfEdgeMesh,
  edge: number,
  amount: number
): BevelEdgeResult {
  if (!Number.isInteger(edge) || edge < 0 || edge >= mesh.edgeCount) {
    throw new RangeError(`Edge ${edge} is outside the mesh.`);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Bevel amount must be a positive finite number.');
  }
  const firstHalfEdge = mesh.edgeHalfEdge[edge];
  const secondHalfEdge = mesh.heTwin[firstHalfEdge];
  const firstFace = mesh.heFace[firstHalfEdge];
  const secondFace = mesh.heFace[secondHalfEdge];
  if (firstFace < 0 || secondFace < 0) {
    throw new Error('Bevel requires an interior edge with two adjacent faces.');
  }
  if (firstFace === secondFace) {
    throw new Error('Bevel requires two distinct adjacent faces.');
  }

  const first = faceCorners(mesh, firstFace);
  const firstIndex = first.findIndex(
    (corner) => corner.halfEdge === firstHalfEdge
  );
  if (firstIndex < 0) {
    throw new Error('The bevel edge is not part of its first face.');
  }
  const firstStart = first[firstIndex];
  const firstEnd = first[(firstIndex + 1) % first.length];
  const firstPrevious = first[(firstIndex - 1 + first.length) % first.length];
  const firstPreviousHalfEdge = firstPrevious.halfEdge;
  const firstNextHalfEdge = firstEnd.halfEdge;

  const second = faceCorners(mesh, secondFace);
  const secondIndex = second.findIndex(
    (corner) => corner.halfEdge === secondHalfEdge
  );
  if (secondIndex < 0) {
    throw new Error('The bevel edge is not part of its second face.');
  }
  const secondStart = second[secondIndex];
  const secondEnd = second[(secondIndex + 1) % second.length];
  const secondPrevious = second[(secondIndex - 1 + second.length) % second.length];
  const secondPreviousHalfEdge = secondPrevious.halfEdge;
  const secondNextHalfEdge = secondEnd.halfEdge;

  const firstOffsets = offsetEdgeInFace(
    mesh,
    firstFace,
    firstHalfEdge,
    amount
  );
  const secondOffsets = offsetEdgeInFace(
    mesh,
    secondFace,
    secondHalfEdge,
    amount
  );

  const firstStartSpec = detach(firstOffsets.atStart);
  const firstEndSpec = detach(firstOffsets.atEnd);
  const secondStartSpec = detach(secondOffsets.atStart);
  const secondEndSpec = detach(secondOffsets.atEnd);

  const neighbors = [
    firstPreviousHalfEdge,
    firstNextHalfEdge,
    secondPreviousHalfEdge,
    secondNextHalfEdge
  ].map((halfEdge) => {
    const twin = mesh.heTwin[halfEdge];
    if (twin < 0) {
      throw new Error('Bevel reached an open boundary.');
    }
    const face = mesh.heFace[twin];
    if (face < 0) {
      throw new Error('Bevel reached an open boundary.');
    }
    if (face === firstFace || face === secondFace) {
      throw new Error('Bevel cannot split a face that borders both sides of the edge.');
    }
    return { halfEdge: twin, face };
  });

  // Preserve every original face, replacing the selected-edge corners in the
  // two adjacent faces and splitting neighboring boundary edges at the four
  // offset points.
  const firstReplacements = new Map<number, MeshCornerSpec>([
    [firstStart.vertex, firstStartSpec],
    [firstEnd.vertex, firstEndSpec]
  ]);
  const secondReplacements = new Map<number, MeshCornerSpec>([
    [secondStart.vertex, secondStartSpec],
    [secondEnd.vertex, secondEndSpec]
  ]);

  const insertions = new Map<number, Map<number, MeshCornerSpec>>();
  const addInsertion = (
    face: number,
    halfEdge: number,
    spec: MeshCornerSpec
  ): void => {
    let byHalfEdge = insertions.get(face);
    if (!byHalfEdge) {
      byHalfEdge = new Map();
      insertions.set(face, byHalfEdge);
    }
    if (!byHalfEdge.has(halfEdge)) {
      byHalfEdge.set(halfEdge, detach(spec));
    }
  };
  addInsertion(neighbors[0].face, neighbors[0].halfEdge, firstStartSpec);
  addInsertion(neighbors[1].face, neighbors[1].halfEdge, firstEndSpec);
  addInsertion(neighbors[2].face, neighbors[2].halfEdge, secondStartSpec);
  addInsertion(neighbors[3].face, neighbors[3].halfEdge, secondEndSpec);

  const faces: MeshFaceSpec[] = [];
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const corners = faceCorners(mesh, face);
    const outputs: MeshCornerSpec[] = [];
    for (const corner of corners) {
      const replacement =
        face === firstFace
          ? firstReplacements.get(corner.vertex)
          : face === secondFace
            ? secondReplacements.get(corner.vertex)
            : undefined;
      outputs.push(replacement ?? cornerSpec(corner));
      const insertion = insertions.get(face)?.get(corner.halfEdge);
      if (insertion) {
        outputs.push(detach(insertion));
      }
    }
    const deduped: MeshCornerSpec[] = [];
    for (const corner of outputs) {
      const previous = deduped[deduped.length - 1];
      if (
        !previous ||
        previous.position[0] !== corner.position[0] ||
        previous.position[1] !== corner.position[1] ||
        previous.position[2] !== corner.position[2]
      ) {
        deduped.push(corner);
      }
    }
    if (deduped.length < 3) {
      throw new Error('Bevel would collapse an adjacent face.');
    }
    faces.push({ corners: deduped, material: mesh.faceMaterial[face] });
  }

  const startCorner = cornerSpec(firstStart);
  const endCorner = cornerSpec(firstEnd);
  // F1 runs A -> B and F2 runs B -> A. The chamfer therefore opposes both
  // edges, while the endpoint caps oppose the chamfer and the split neighbors.
  faces.push({
    material: mesh.faceMaterial[firstFace],
    corners: [firstEndSpec, firstStartSpec, secondEndSpec, secondStartSpec]
  });
  faces.push({
    material: mesh.faceMaterial[firstFace],
    corners: [firstStartSpec, startCorner, secondEndSpec]
  });
  faces.push({
    material: mesh.faceMaterial[firstFace],
    corners: [endCorner, firstEndSpec, secondStartSpec]
  });

  const result = HalfEdgeMesh.fromPolygons(faces);
  return {
    mesh: result,
    chamferFace: faces.length - 3
  };
}

/** Result of one vertex bevel operation. */
export interface BevelVertexResult {
  readonly mesh: HalfEdgeMesh;
  /** New corner polygon in the rebuilt mesh. */
  readonly cornerFace: number;
  /** Clamped distance used along every incident edge. */
  readonly distance: number;
}

/**
 * Bevel one interior vertex into a planar corner polygon.
 *
 * Each incident edge is split at the same distance from the vertex. The
 * surrounding faces replace the vertex with the two split points, and a new
 * n-gon closes the corner. This is the operation needed to remove the sharp
 * endpoint left by a single-edge chamfer.
 */
export function bevelVertex(
  mesh: HalfEdgeMesh,
  vertex: number,
  amount: number
): BevelVertexResult {
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= mesh.vertexCount) {
    throw new RangeError(`Vertex ${vertex} is outside the mesh.`);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Bevel amount must be a positive finite number.');
  }
  const startHalfEdge = mesh.vertexOut[vertex];
  if (startHalfEdge < 0) {
    throw new Error('Bevel requires a connected interior vertex.');
  }

  const outgoing: number[] = [];
  let current = startHalfEdge;
  do {
    if (mesh.heFace[current] < 0 || mesh.heFace[mesh.heTwin[current]] < 0) {
      throw new Error('Bevel requires an interior vertex without an open boundary.');
    }
    outgoing.push(current);
    let previous = current;
    while (mesh.heNext[previous] !== current) {
      previous = mesh.heNext[previous];
    }
    const twin = mesh.heTwin[previous];
    if (twin < 0) {
      throw new Error('Bevel requires an interior vertex without an open boundary.');
    }
    current = twin;
  } while (current !== startHalfEdge && outgoing.length <= mesh.halfEdgeCount);

  const incidentEdges = outgoing.map((halfEdge) => mesh.heEdge[halfEdge]);
  if (new Set(incidentEdges).size !== outgoing.length) {
    throw new Error('Bevel found a non-manifold vertex.');
  }

  const vertexPosition = mesh.getVertexPosition(vertex);
  const edgeLengths = outgoing.map((halfEdge) => {
    const next = mesh.heOrigin[mesh.heNext[halfEdge]];
    const position = mesh.getVertexPosition(next);
    return Math.hypot(
      position[0] - vertexPosition[0],
      position[1] - vertexPosition[1],
      position[2] - vertexPosition[2]
    );
  });
  const distance = Math.min(amount, Math.min(...edgeLengths) * 0.45);
  if (distance <= 1e-5) {
    throw new Error('Bevel amount is too large or the vertex edges are too short.');
  }

  const edgePoint = new Map<number, MeshCornerSpec>();
  for (const halfEdge of outgoing) {
    const edge = mesh.heEdge[halfEdge];
    const next = mesh.heOrigin[mesh.heNext[halfEdge]];
    const position = mesh.getVertexPosition(next);
    const length = Math.hypot(
      position[0] - vertexPosition[0],
      position[1] - vertexPosition[1],
      position[2] - vertexPosition[2]
    );
    const t = distance / Math.max(length, 1e-9);
    const corner = mesh.getCornerUv(halfEdge);
    const nextCorner = mesh.getCornerUv(mesh.heNext[halfEdge]);
    edgePoint.set(edge, {
      position: [
        vertexPosition[0] + (position[0] - vertexPosition[0]) * t,
        vertexPosition[1] + (position[1] - vertexPosition[1]) * t,
        vertexPosition[2] + (position[2] - vertexPosition[2]) * t
      ],
      uv: [
        corner[0] + (nextCorner[0] - corner[0]) * t,
        corner[1] + (nextCorner[1] - corner[1]) * t
      ]
    });
  }

  const faces: MeshFaceSpec[] = [];
  const cutNext = new Map<number, number>();
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const corners = faceCorners(mesh, face);
    const index = corners.findIndex((corner) => corner.vertex === vertex);
    if (index < 0) {
      faces.push({
        corners: corners.map(cornerSpec),
        material: mesh.faceMaterial[face]
      });
      continue;
    }
    const previous = corners[(index - 1 + corners.length) % corners.length];
    const incomingEdge = mesh.heEdge[previous.halfEdge];
    const outgoingEdge = mesh.heEdge[corners[index].halfEdge];
    const incomingPoint = edgePoint.get(incomingEdge);
    const outgoingPoint = edgePoint.get(outgoingEdge);
    if (!incomingPoint || !outgoingPoint) {
      throw new Error('Bevel could not resolve an incident edge.');
    }
    // The face keeps a notch cut across the corner: prev -> inPoint ->
    // outPoint -> next. The corner face will use the opposite edge.
    cutNext.set(outgoingEdge, incomingEdge);
    const output: MeshCornerSpec[] = [];
    for (const corner of corners) {
      if (corner.vertex !== vertex) {
        output.push(cornerSpec(corner));
        continue;
      }
      const incoming = edgePoint.get(edgeOfCorner(mesh, previous));
      const outgoing = edgePoint.get(edgeOfCorner(mesh, corner));
      if (!incoming || !outgoing) {
        throw new Error('Bevel could not split an incident face.');
      }
      output.push(detach(incoming), detach(outgoing));
    }
    faces.push({ corners: output, material: mesh.faceMaterial[face] });
  }

  // The corner polygon is opposite every face's cut edge (outPoint -> inPoint).
  const corner: MeshCornerSpec[] = [];
  let cursor: number | undefined = incidentEdges[0];
  const seen = new Set<number>();
  while (cursor !== undefined && !seen.has(cursor)) {
    seen.add(cursor);
    const point = edgePoint.get(cursor);
    if (!point) {
      throw new Error('Bevel could not build the corner polygon.');
    }
    corner.push(detach(point));
    cursor = cutNext.get(cursor);
  }
  if (seen.size !== incidentEdges.length) {
    throw new Error('Bevel could not close the vertex corner.');
  }
  faces.push({
    corners: corner,
    material: mesh.faceMaterial[mesh.heFace[startHalfEdge]]
  });

  const result = HalfEdgeMesh.fromPolygons(faces);
  return { mesh: result, cornerFace: faces.length - 1, distance };
}

/** Edge index of one face corner. */
function edgeOfCorner(mesh: HalfEdgeMesh, corner: FaceCorner): number {
  return mesh.heEdge[corner.halfEdge];
}

/**
 * Bevel one edge and cut both endpoint corners.
 *
 * The endpoint vertices are chamfered first, then the shortened edge between
 * the new corner polygons is beveled. This removes the sharp original corner
 * points while keeping a single undoable mesh replacement.
 */
export function bevelEdgeWithCorners(
  mesh: HalfEdgeMesh,
  edge: number,
  amount: number
): BevelEdgeResult {
  if (!Number.isInteger(edge) || edge < 0 || edge >= mesh.edgeCount) {
    throw new RangeError(`Edge ${edge} is outside the mesh.`);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Bevel amount must be a positive finite number.');
  }
  const halfEdge = mesh.edgeHalfEdge[edge];
  const A = mesh.heOrigin[halfEdge];
  const B = mesh.heOrigin[mesh.heNext[halfEdge]];
  const a = mesh.getVertexPosition(A);
  const b = mesh.getVertexPosition(B);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (length <= 1e-8) {
    throw new Error('Bevel requires a non-zero length edge.');
  }
  const direction = [
    (b[0] - a[0]) / length,
    (b[1] - a[1]) / length,
    (b[2] - a[2]) / length
  ] as Vec3;

  const firstCorner = bevelVertex(mesh, A, amount);
  let secondVertex = -1;
  for (let vertex = 0; vertex < firstCorner.mesh.vertexCount; vertex += 1) {
    const point = firstCorner.mesh.getVertexPosition(vertex);
    if (Math.hypot(point[0] - b[0], point[1] - b[1], point[2] - b[2]) < 1e-5) {
      secondVertex = vertex;
      break;
    }
  }
  if (secondVertex < 0) {
    throw new Error('Bevel could not locate the second endpoint.');
  }
  const secondCorner = bevelVertex(firstCorner.mesh, secondVertex, amount);
  const targetA: Vec3 = [
    a[0] + direction[0] * firstCorner.distance,
    a[1] + direction[1] * firstCorner.distance,
    a[2] + direction[2] * firstCorner.distance
  ];
  const targetB: Vec3 = [
    b[0] - direction[0] * secondCorner.distance,
    b[1] - direction[1] * secondCorner.distance,
    b[2] - direction[2] * secondCorner.distance
  ];
  const findVertex = (target: Vec3): number => {
    for (let vertex = 0; vertex < secondCorner.mesh.vertexCount; vertex += 1) {
      const point = secondCorner.mesh.getVertexPosition(vertex);
      if (
        Math.hypot(
          point[0] - target[0],
          point[1] - target[1],
          point[2] - target[2]
        ) < 1e-4
      ) {
        return vertex;
      }
    }
    return -1;
  };
  const start = findVertex(targetA);
  const end = findVertex(targetB);
  if (start < 0 || end < 0) {
    throw new Error('Bevel could not locate the shortened edge.');
  }
  let shortenedEdge = -1;
  for (let candidate = 0; candidate < secondCorner.mesh.edgeCount; candidate += 1) {
    const [from, to] = secondCorner.mesh.getEdgeVertices(candidate);
    if ((from === start && to === end) || (from === end && to === start)) {
      shortenedEdge = candidate;
      break;
    }
  }
  if (shortenedEdge < 0) {
    throw new Error('Bevel could not find the shortened edge.');
  }
  const remaining = Math.hypot(
    targetB[0] - targetA[0],
    targetB[1] - targetA[1],
    targetB[2] - targetA[2]
  );
  if (remaining <= 1e-5) {
    throw new Error('Bevel would consume the whole edge.');
  }
  // The corner cuts leave less room for the edge chamfer. Try the requested
  // width first, then reduce it rather than leaving a failed operation.
  let candidateAmount = Math.min(amount, remaining * 0.42);
  let result: BevelEdgeResult | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      result = bevelEdge(secondCorner.mesh, shortenedEdge, candidateAmount);
      break;
    } catch (error) {
      lastError = error;
      candidateAmount *= 0.5;
      if (candidateAmount < 0.001) {
        break;
      }
    }
  }
  if (!result) {
    throw lastError instanceof Error
      ? lastError
      : new Error('The bevel could not fit the shortened edge.');
  }
  return result;
}
