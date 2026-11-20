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

/** Outgoing half-edges around one vertex in deterministic face order. */
function outgoingHalfEdges(mesh: HalfEdgeMesh, vertex: number): number[] {
  const start = mesh.vertexOut[vertex];
  if (start < 0) {
    throw new Error('Bevel requires a connected vertex.');
  }
  const result: number[] = [];
  let current = start;
  do {
    result.push(current);
    let previous = current;
    while (mesh.heNext[previous] !== current) {
      previous = mesh.heNext[previous];
    }
    const twin = mesh.heTwin[previous];
    if (twin < 0) {
      throw new Error('Bevel reached an open boundary.');
    }
    current = twin;
  } while (current !== start && result.length <= mesh.halfEdgeCount);
  return result;
}

/** Offset point on an edge leaving one endpoint. */
function endpointPoint(
  mesh: HalfEdgeMesh,
  halfEdge: number,
  vertexPosition: Vec3,
  distance: number
): MeshCornerSpec {
  const next = mesh.heOrigin[mesh.heNext[halfEdge]];
  const position = mesh.getVertexPosition(next);
  const length = Math.hypot(
    position[0] - vertexPosition[0],
    position[1] - vertexPosition[1],
    position[2] - vertexPosition[2]
  );
  if (length <= 1e-8) {
    throw new Error('Bevel encountered a zero-length edge.');
  }
  const t = distance / Math.max(length, 1e-9);
  if (t <= 0 || t >= 0.999) {
    throw new Error('Bevel amount is too large for the endpoint corner.');
  }
  const startUv = mesh.getCornerUv(halfEdge);
  const endUv = mesh.getCornerUv(mesh.heNext[halfEdge]);
  return {
    position: [
      vertexPosition[0] + (position[0] - vertexPosition[0]) * t,
      vertexPosition[1] + (position[1] - vertexPosition[1]) * t,
      vertexPosition[2] + (position[2] - vertexPosition[2]) * t
    ],
    uv: [
      startUv[0] + (endUv[0] - startUv[0]) * t,
      startUv[1] + (endUv[1] - startUv[1]) * t
    ]
  };
}

interface EndpointBevel {
  readonly vertex: number;
  readonly faceReplacements: Map<number, readonly [MeshCornerSpec, MeshCornerSpec]>;
}

/**
 * Build the corner cut at one endpoint of a selected edge.
 *
 * The selected edge is excluded from the corner cycle. Every other incident
 * edge receives one offset point. The face outside the two selected-edge faces
 * replaces the endpoint with both points. This is the topology Blender
 * produces for a one-edge bevel at a valence-three corner: the original
 * endpoint is removed and the adjacent face becomes a pentagon.
 */
function buildEndpointBevel(
  mesh: HalfEdgeMesh,
  vertex: number,
  selectedEdge: number,
  knownEdges: ReadonlyMap<number, MeshCornerSpec>,
  firstFace: number,
  secondFace: number,
  amount: number
): EndpointBevel {
  const vertexPosition = mesh.getVertexPosition(vertex);
  const outgoing = outgoingHalfEdges(mesh, vertex);
  const points = new Map<number, MeshCornerSpec>(knownEdges);
  const otherEdges: number[] = [];
  const edgeLengths = new Map<number, number>();
  for (const halfEdge of outgoing) {
    const edge = mesh.heEdge[halfEdge];
    if (edge === selectedEdge) {
      continue;
    }
    const next = mesh.heOrigin[mesh.heNext[halfEdge]];
    const position = mesh.getVertexPosition(next);
    const length = Math.hypot(
      position[0] - vertexPosition[0],
      position[1] - vertexPosition[1],
      position[2] - vertexPosition[2]
    );
    edgeLengths.set(edge, length);
    otherEdges.push(edge);
  }
  if (otherEdges.length !== 2) {
    // Valence-three endpoints are the verified Blender topology: the two
    // neighboring faces absorb the endpoint directly. Higher-valence
    // endpoints need a general miter solver and are rejected rather than
    // emitting an unverified corner fan.
    throw new Error(
      'Bevel currently requires three incident edges at each endpoint.'
    );
  }
  const distance = Math.min(
    amount,
    Math.min(...edgeLengths.values()) * 0.45
  );
  for (const halfEdge of outgoing) {
    const edge = mesh.heEdge[halfEdge];
    if (edge === selectedEdge || points.has(edge)) {
      continue;
    }
    points.set(
      edge,
      endpointPoint(mesh, halfEdge, vertexPosition, distance)
    );
  }

  const otherFaces: number[] = [];
  const faceReplacements = new Map<
    number,
    readonly [MeshCornerSpec, MeshCornerSpec]
  >();
  for (let face = 0; face < mesh.faceCount; face += 1) {
    if (face === firstFace || face === secondFace) {
      continue;
    }
    const corners = faceCorners(mesh, face);
    const index = corners.findIndex((corner) => corner.vertex === vertex);
    if (index < 0) {
      continue;
    }
    const previous = corners[(index - 1 + corners.length) % corners.length];
    const incomingEdge = mesh.heEdge[previous.halfEdge];
    const outgoingEdge = mesh.heEdge[corners[index].halfEdge];
    const incoming = points.get(incomingEdge);
    const outgoingPoint = points.get(outgoingEdge);
    if (!incoming || !outgoingPoint) {
      throw new Error('Bevel could not resolve an endpoint face.');
    }
    otherFaces.push(face);
    faceReplacements.set(face, [incoming, outgoingPoint]);
  }
  if (otherFaces.length === 0) {
    throw new Error('Bevel cannot close an endpoint without adjacent faces.');
  }

  return { vertex, faceReplacements };
}

/**
 * Bevel one interior manifold edge by a world-space amount.
 *
 * This implementation matches Blender's one-segment edge bevel at
 * valence-three endpoints: both adjacent faces retract, the remaining face at
 * each endpoint absorbs the endpoint into its two edge points, and the
 * original endpoint vertices disappear. Higher-valence endpoints need a
 * general miter solver and are rejected.
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

  const firstEndpoint = buildEndpointBevel(
    mesh,
    firstStart.vertex,
    edge,
    new Map([
      [mesh.heEdge[firstPreviousHalfEdge], firstStartSpec],
      [mesh.heEdge[secondEnd.halfEdge], secondEndSpec]
    ]),
    firstFace,
    secondFace,
    amount
  );
  const secondEndpoint = buildEndpointBevel(
    mesh,
    firstEnd.vertex,
    edge,
    new Map([
      [mesh.heEdge[firstEnd.halfEdge], firstEndSpec],
      [mesh.heEdge[secondPreviousHalfEdge], secondStartSpec]
    ]),
    firstFace,
    secondFace,
    amount
  );

  const firstReplacements = new Map<number, MeshCornerSpec>([
    [firstStart.vertex, firstStartSpec],
    [firstEnd.vertex, firstEndSpec]
  ]);
  const secondReplacements = new Map<number, MeshCornerSpec>([
    [secondStart.vertex, secondStartSpec],
    [secondEnd.vertex, secondEndSpec]
  ]);

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
      if (replacement) {
        outputs.push(detach(replacement));
        continue;
      }
      const endpoint =
        corner.vertex === firstEndpoint.vertex
          ? firstEndpoint
          : corner.vertex === secondEndpoint.vertex
            ? secondEndpoint
            : null;
      if (endpoint) {
        const pair = endpoint.faceReplacements.get(face);
        if (pair) {
          outputs.push(detach(pair[0]), detach(pair[1]));
        } else {
          outputs.push(cornerSpec(corner));
        }
      } else {
        outputs.push(cornerSpec(corner));
      }
    }
    const deduped: MeshCornerSpec[] = [];
    for (const output of outputs) {
      const previous = deduped[deduped.length - 1];
      if (
        !previous ||
        previous.position[0] !== output.position[0] ||
        previous.position[1] !== output.position[1] ||
        previous.position[2] !== output.position[2]
      ) {
        deduped.push(output);
      }
    }
    if (deduped.length < 3) {
      throw new Error('Bevel would collapse an adjacent face.');
    }
    faces.push({ corners: deduped, material: mesh.faceMaterial[face] });
  }

  const chamferFace = faces.length;
  faces.push({
    material: mesh.faceMaterial[firstFace],
    corners: [firstEndSpec, firstStartSpec, secondEndSpec, secondStartSpec]
  });
  const result = HalfEdgeMesh.fromPolygons(faces);
  return { mesh: result, chamferFace };
}
