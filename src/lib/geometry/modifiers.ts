import {
  HalfEdgeMesh,
  type MeshCornerSpec,
  type MeshFaceSpec
} from './HalfEdgeMesh';

/** A local object axis used by mirror and radial modifiers. */
export type ModifierAxis = 'x' | 'y' | 'z';

/** Reflection across the local X, Y, or Z plane through the object origin. */
export interface MirrorModifier {
  readonly id: string;
  readonly type: 'mirror';
  readonly enabled: boolean;
  readonly axis: ModifierAxis;
}

/** Repetition of local geometry on an X/Y grid. */
export interface GridArrayModifier {
  readonly id: string;
  readonly type: 'grid-array';
  readonly enabled: boolean;
  readonly countX: number;
  readonly countY: number;
  readonly spacingX: number;
  readonly spacingY: number;
}

/** Repetition of local geometry around a local axis. */
export interface RadialArrayModifier {
  readonly id: string;
  readonly type: 'radial-array';
  readonly enabled: boolean;
  readonly axis: ModifierAxis;
  readonly count: number;
}

/** Serializable modifier union evaluated over a node's base DCEL. */
export type Modifier = MirrorModifier | GridArrayModifier | RadialArrayModifier;

/** Modifier types exposed by the stack UI. */
export const MODIFIER_KINDS = ['mirror', 'grid-array', 'radial-array'] as const;

/** Modifier type name. */
export type ModifierKind = (typeof MODIFIER_KINDS)[number];

/** Display labels for stack rows. */
export const MODIFIER_LABELS: Readonly<Record<ModifierKind, string>> = {
  mirror: 'Mirror',
  'grid-array': 'Grid Array',
  'radial-array': 'Radial Array'
};

/** Hard ceiling on generated faces from a modifier evaluation. */
export const MAX_MODIFIER_FACES = 100_000;

let modifierIdCounter = 0;

function createModifierId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  modifierIdCounter += 1;
  return `modifier-${modifierIdCounter}`;
}

/** Construct a modifier with safe defaults. */
export function createModifier(kind: ModifierKind): Modifier {
  const id = createModifierId();
  switch (kind) {
    case 'mirror':
      return { id, type: 'mirror', enabled: true, axis: 'x' };
    case 'grid-array':
      return {
        id,
        type: 'grid-array',
        enabled: true,
        countX: 2,
        countY: 1,
        spacingX: 1.5,
        spacingY: 1.5
      };
    case 'radial-array':
      return { id, type: 'radial-array', enabled: true, axis: 'z', count: 6 };
  }
}

/** Deep-copy a modifier stack for commands, persistence, and snapshots. */
export function cloneModifiers(modifiers: readonly Modifier[]): Modifier[] {
  return modifiers.map((modifier) => ({ ...modifier }));
}

/** Human-readable name for a stack row. */
export function modifierLabel(modifier: Modifier): string {
  return MODIFIER_LABELS[modifier.type];
}

/** Whether at least one modifier is enabled. */
export function hasEnabledModifier(
  modifiers: readonly Modifier[]
): boolean {
  return modifiers.some((modifier) => modifier.enabled);
}

const IDENTITY_LINEAR = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;

function multiplyLinear(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(9);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] =
        a[row * 3] * b[col] +
        a[row * 3 + 1] * b[3 + col] +
        a[row * 3 + 2] * b[6 + col];
    }
  }
  return out;
}

function reflectionLinear(axis: ModifierAxis): number[] {
  const out: number[] = [...IDENTITY_LINEAR];
  out[axis === 'x' ? 0 : axis === 'y' ? 4 : 8] = -1;
  return out;
}

function rotationLinear(axis: ModifierAxis, angle: number): number[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  if (axis === 'z') {
    return [cos, -sin, 0, sin, cos, 0, 0, 0, 1];
  }
  if (axis === 'x') {
    return [1, 0, 0, 0, cos, -sin, 0, sin, cos];
  }
  return [cos, 0, sin, 0, 1, 0, -sin, 0, cos];
}

/** Apply a row-major 3x3 delta transform. */
export function applyLinearTransform(
  matrix: readonly number[],
  vector: readonly [number, number, number]
): [number, number, number] {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2]
  ];
}

/** Invert a row-major 3x3 linear transform, or return null when singular. */
export function invertLinearTransform(
  matrix: readonly number[]
): number[] | null {
  const a = matrix[0];
  const b = matrix[1];
  const c = matrix[2];
  const d = matrix[3];
  const e = matrix[4];
  const f = matrix[5];
  const g = matrix[6];
  const h = matrix[7];
  const i = matrix[8];
  const determinant =
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) {
    return null;
  }
  const inv = 1 / determinant;
  return [
    (e * i - f * h) * inv,
    (c * h - b * i) * inv,
    (b * f - c * e) * inv,
    (f * g - d * i) * inv,
    (a * i - c * g) * inv,
    (c * d - a * f) * inv,
    (d * h - e * g) * inv,
    (b * g - a * h) * inv,
    (a * e - b * d) * inv
  ];
}

interface ProvenanceCorner extends MeshCornerSpec {
  readonly baseVertex: number;
  readonly baseEdge: number;
  readonly baseLinear: readonly number[];
}

interface ProvenanceFace {
  readonly corners: readonly ProvenanceCorner[];
  readonly material: number;
  readonly baseFace: number;
}

/** Per-evaluated-element mapping back to original base DCEL indices. */
export interface ModifierProvenance {
  readonly vertexBase: Int32Array;
  readonly edgeBase: Int32Array;
  readonly faceBase: Int32Array;
  /** Row-major 3x3 base-delta to evaluated-delta maps, 9 per vertex. */
  readonly vertexLinear: Float32Array;
}

/** Evaluated geometry and its provenance to the unchanged base mesh. */
export interface EvaluatedModifierMesh {
  readonly mesh: HalfEdgeMesh;
  readonly provenance: ModifierProvenance;
}

/** Identity map used when no modifier is active. */
function identityProvenance(mesh: HalfEdgeMesh): ModifierProvenance {
  return {
    vertexBase: Int32Array.from(
      { length: mesh.vertexCount },
      (_, index) => index
    ),
    edgeBase: Int32Array.from(
      { length: mesh.edgeCount },
      (_, index) => index
    ),
    faceBase: Int32Array.from(
      { length: mesh.faceCount },
      (_, index) => index
    ),
    vertexLinear: Float32Array.from(
      { length: mesh.vertexCount * 9 },
      (_, index) => IDENTITY_LINEAR[index % 9]
    )
  };
}

function collectProvenanceFaces(
  mesh: HalfEdgeMesh,
  provenance: ModifierProvenance
): ProvenanceFace[] {
  const faces: ProvenanceFace[] = [];
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const corners: ProvenanceCorner[] = [];
    const start = mesh.faceHalfEdge[face];
    let current = start;
    do {
      const vertex = mesh.heOrigin[current];
      const positionOffset = vertex * 3;
      const uvOffset = current * 2;
      corners.push({
        position: [
          mesh.positions[positionOffset],
          mesh.positions[positionOffset + 1],
          mesh.positions[positionOffset + 2]
        ],
        uv: [mesh.heUv[uvOffset], mesh.heUv[uvOffset + 1]],
        baseVertex: provenance.vertexBase[vertex] ?? -1,
        baseEdge: provenance.edgeBase[mesh.heEdge[current]] ?? -1,
        baseLinear: Array.from(
          provenance.vertexLinear.subarray(vertex * 9, vertex * 9 + 9)
        )
      });
      current = mesh.heNext[current];
    } while (current !== start);
    faces.push({
      corners,
      material: mesh.faceMaterial[face],
      baseFace: provenance.faceBase[face] ?? face
    });
  }
  return faces;
}

function positionKey(position: readonly number[]): string {
  return `${position[0]}|${position[1]}|${position[2]}`;
}

function meshPositionKey(position: readonly number[]): string {
  return `${Math.fround(position[0])}|${Math.fround(position[1])}|${Math.fround(position[2])}`;
}

function edgeKey(a: readonly number[], b: readonly number[]): string {
  const first = meshPositionKey(a);
  const second = meshPositionKey(b);
  return first < second ? `${first}/${second}` : `${second}/${first}`;
}

function buildEvaluated(faces: readonly ProvenanceFace[]): EvaluatedModifierMesh {
  const specs: MeshFaceSpec[] = faces.map((face) => ({
    corners: face.corners.map((corner) => ({
      position: [...corner.position] as [number, number, number],
      uv: [...corner.uv] as [number, number]
    })),
    material: face.material
  }));
  const mesh = HalfEdgeMesh.fromPolygons(specs);

  const baseByPosition = new Map<
    string,
    { vertex: number; linear: readonly number[] }
  >();
  const baseByEdge = new Map<string, number>();
  for (const face of faces) {
    const n = face.corners.length;
    for (let index = 0; index < n; index += 1) {
      const corner = face.corners[index];
      if (corner.baseVertex >= 0) {
        const key = meshPositionKey(corner.position);
        if (!baseByPosition.has(key)) {
          baseByPosition.set(key, {
            vertex: corner.baseVertex,
            linear: corner.baseLinear
          });
        }
      }
      if (corner.baseEdge >= 0) {
        const key = edgeKey(
          corner.position,
          face.corners[(index + 1) % n].position
        );
        if (!baseByEdge.has(key)) {
          baseByEdge.set(key, corner.baseEdge);
        }
      }
    }
  }

  const vertexBase = new Int32Array(mesh.vertexCount).fill(-1);
  const vertexLinear = new Float32Array(
    Float32Array.from(
      { length: mesh.vertexCount * 9 },
      (_, index) => IDENTITY_LINEAR[index % 9]
    )
  );
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const key = positionKey([
      mesh.positions[offset],
      mesh.positions[offset + 1],
      mesh.positions[offset + 2]
    ]);
    const mapped = baseByPosition.get(key);
    if (mapped) {
      vertexBase[vertex] = mapped.vertex;
      vertexLinear.set(mapped.linear, vertex * 9);
    }
  }

  const edgeBase = new Int32Array(mesh.edgeCount).fill(-1);
  for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
    const [from, to] = mesh.getEdgeVertices(edge);
    const key = edgeKey(
      [
        mesh.positions[from * 3],
        mesh.positions[from * 3 + 1],
        mesh.positions[from * 3 + 2]
      ],
      [
        mesh.positions[to * 3],
        mesh.positions[to * 3 + 1],
        mesh.positions[to * 3 + 2]
      ]
    );
    edgeBase[edge] = baseByEdge.get(key) ?? -1;
  }

  const faceBase = new Int32Array(
    faces.map((face) => face.baseFace)
  );
  return {
    mesh,
    provenance: { vertexBase, edgeBase, faceBase, vertexLinear }
  };
}

function clipProvenanceFace(
  face: ProvenanceFace,
  axis: ModifierAxis,
  sign: 1 | -1
): ProvenanceFace | null {
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const signed = (corner: ProvenanceCorner): number =>
    sign * corner.position[index];
  const corners = face.corners;
  const output: ProvenanceCorner[] = [];

  for (let i = 0; i < corners.length; i += 1) {
    const current = corners[i];
    const next = corners[(i + 1) % corners.length];
    const currentInside = signed(current) >= -1e-6;
    const nextInside = signed(next) >= -1e-6;

    if (currentInside) {
      output.push(current);
    }
    if (currentInside !== nextInside) {
      const a = signed(current);
      const b = signed(next);
      const denominator = a - b;
      const t = Math.abs(denominator) < 1e-12 ? 0 : a / denominator;
      output.push({
        position: [
          current.position[0] + (next.position[0] - current.position[0]) * t,
          current.position[1] + (next.position[1] - current.position[1]) * t,
          current.position[2] + (next.position[2] - current.position[2]) * t
        ],
        uv: [
          current.uv[0] + (next.uv[0] - current.uv[0]) * t,
          current.uv[1] + (next.uv[1] - current.uv[1]) * t
        ],
        // The cut introduces vertices/edges that have no single base element.
        baseVertex: -1,
        baseEdge: -1,
        baseLinear: [...IDENTITY_LINEAR]
      });
    }
  }

  if (
    output.length > 1 &&
    positionKey(output[0].position) ===
      positionKey(output[output.length - 1].position)
  ) {
    output.pop();
  }
  const unique = new Set(output.map((corner) => positionKey(corner.position)));
  if (output.length < 3 || unique.size < 3) {
    return null;
  }
  return { corners: output, material: face.material, baseFace: face.baseFace };
}

function faceOnPlane(face: ProvenanceFace, axis: ModifierAxis): boolean {
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  return face.corners.every(
    (corner) => Math.abs(corner.position[index]) <= 1e-6
  );
}

function reflectProvenanceFace(
  face: ProvenanceFace,
  axis: ModifierAxis
): ProvenanceFace {
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const source = face.corners;
  const n = source.length;
  const reflection = reflectionLinear(axis);
  const corners = [...source].reverse().map((corner, j) => {
    const position = [...corner.position] as [number, number, number];
    position[index] = -position[index];
    const sourceEdge = source[(n - 2 - j + n * 2) % n];
    return {
      position,
      uv: corner.uv,
      baseVertex: corner.baseVertex,
      baseEdge: sourceEdge.baseEdge,
      baseLinear: multiplyLinear(reflection, corner.baseLinear)
    };
  });
  return { corners, material: face.material, baseFace: face.baseFace };
}

function mirrorEvaluated(
  mesh: HalfEdgeMesh,
  provenance: ModifierProvenance,
  axis: ModifierAxis
): EvaluatedModifierMesh {
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  let sum = 0;
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    sum += mesh.positions[vertex * 3 + index];
  }
  const centroid = sum / Math.max(1, mesh.vertexCount);
  const sign: 1 | -1 = centroid < 0 ? -1 : 1;

  const faces: ProvenanceFace[] = [];
  for (const face of collectProvenanceFaces(mesh, provenance)) {
    const clipped = clipProvenanceFace(face, axis, sign);
    if (!clipped) {
      continue;
    }
    faces.push(clipped);
    if (!faceOnPlane(clipped, axis)) {
      faces.push(reflectProvenanceFace(clipped, axis));
    }
  }
  if (faces.length === 0) {
    throw new Error('Mirror clipping removed every face.');
  }
  if (faces.length > MAX_MODIFIER_FACES) {
    throw new Error('Mirror exceeds the modifier face limit.');
  }
  return buildEvaluated(faces);
}

function gridEvaluated(
  mesh: HalfEdgeMesh,
  provenance: ModifierProvenance,
  countX: number,
  countY: number,
  spacingX: number,
  spacingY: number
): EvaluatedModifierMesh {
  const source = collectProvenanceFaces(mesh, provenance);
  if (source.length * countX * countY > MAX_MODIFIER_FACES) {
    throw new Error('Grid array exceeds the modifier face limit.');
  }
  const faces: ProvenanceFace[] = [];
  for (let x = 0; x < countX; x += 1) {
    for (let y = 0; y < countY; y += 1) {
      for (const face of source) {
        faces.push({
          material: face.material,
          baseFace: face.baseFace,
          corners: face.corners.map((corner) => ({
            position: [
              corner.position[0] + x * spacingX,
              corner.position[1] + y * spacingY,
              corner.position[2]
            ],
            uv: [...corner.uv] as [number, number],
            baseVertex: corner.baseVertex,
            baseEdge: corner.baseEdge,
            baseLinear: corner.baseLinear
          }))
        });
      }
    }
  }
  return buildEvaluated(faces);
}

function rotatePosition(
  position: [number, number, number],
  axis: ModifierAxis,
  angle: number
): [number, number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [x, y, z] = position;
  if (axis === 'z') {
    return [x * cos - y * sin, x * sin + y * cos, z];
  }
  if (axis === 'x') {
    return [x, y * cos - z * sin, y * sin + z * cos];
  }
  return [x * cos + z * sin, y, -x * sin + z * cos];
}

function radialEvaluated(
  mesh: HalfEdgeMesh,
  provenance: ModifierProvenance,
  axis: ModifierAxis,
  count: number
): EvaluatedModifierMesh {
  const source = collectProvenanceFaces(mesh, provenance);
  if (source.length * count > MAX_MODIFIER_FACES) {
    throw new Error('Radial array exceeds the modifier face limit.');
  }
  const step = (Math.PI * 2) / count;
  const faces: ProvenanceFace[] = [];
  for (let copy = 0; copy < count; copy += 1) {
    const angle = step * copy;
    const rotation = rotationLinear(axis, angle);
    for (const face of source) {
      faces.push({
        material: face.material,
        baseFace: face.baseFace,
        corners: face.corners.map((corner) => ({
          position: rotatePosition(
            [...corner.position] as [number, number, number],
            axis,
            angle
          ),
          uv: [...corner.uv] as [number, number],
          baseVertex: corner.baseVertex,
          baseEdge: corner.baseEdge,
          baseLinear: multiplyLinear(rotation, corner.baseLinear)
        }))
      });
    }
  }
  return buildEvaluated(faces);
}

/**
 * Evaluate the enabled modifier stack and return provenance maps back to the
 * unchanged base mesh.
 *
 * Mirror is clipped to one side of the local plane, then reflected with
 * reversed winding; the shared seam is welded by the DCEL builder. Arrays
 * preserve per-corner UVs and materials. Cut vertices/edges introduced by
 * mirror clipping have no single base element and map to -1.
 */
export function evaluateModifiersWithProvenance(
  base: HalfEdgeMesh,
  modifiers: readonly Modifier[]
): EvaluatedModifierMesh {
  const active = modifiers.filter((modifier) => modifier.enabled);
  if (active.length === 0) {
    return { mesh: base, provenance: identityProvenance(base) };
  }

  let current: EvaluatedModifierMesh = {
    mesh: base,
    provenance: identityProvenance(base)
  };
  for (const modifier of active) {
    if (modifier.type === 'mirror') {
      current = mirrorEvaluated(
        current.mesh,
        current.provenance,
        modifier.axis
      );
    } else if (modifier.type === 'grid-array') {
      if (modifier.countX < 1 || modifier.countY < 1) {
        throw new Error('Grid array counts must be at least one.');
      }
      current = gridEvaluated(
        current.mesh,
        current.provenance,
        modifier.countX,
        modifier.countY,
        modifier.spacingX,
        modifier.spacingY
      );
    } else {
      if (modifier.count < 1) {
        throw new Error('Radial array count must be at least one.');
      }
      current = radialEvaluated(
        current.mesh,
        current.provenance,
        modifier.axis,
        modifier.count
      );
    }
  }

  // Seams are authored on the base DCEL. Carry them onto every evaluated edge
  // through provenance so UV-island boundaries remain visible on duplicated or
  // mirrored output without duplicating seam state in modifiers.
  const mesh = current.mesh;
  for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
    const baseEdge = current.provenance.edgeBase[edge];
    if (baseEdge >= 0 && base.isEdgeSeam(baseEdge)) {
      mesh.setEdgeSeam(edge, true);
    }
  }
  return current;
}

/** Evaluate a modifier stack for rendering/persistence without provenance. */
export function evaluateModifiers(
  base: HalfEdgeMesh,
  modifiers: readonly Modifier[]
): HalfEdgeMesh {
  return evaluateModifiersWithProvenance(base, modifiers).mesh;
}

/** Validate one stored modifier and return a normalized copy. */
export function validateModifier(value: unknown): Modifier {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Modifier is not an object.');
  }
  const modifier = value as Partial<Modifier> & Record<string, unknown>;
  if (
    typeof modifier.id !== 'string' ||
    modifier.id.length === 0 ||
    typeof modifier.enabled !== 'boolean' ||
    (modifier.type !== 'mirror' &&
      modifier.type !== 'grid-array' &&
      modifier.type !== 'radial-array')
  ) {
    throw new Error('Modifier metadata is invalid.');
  }
  const isAxis = (axis: unknown): axis is ModifierAxis =>
    axis === 'x' || axis === 'y' || axis === 'z';

  if (modifier.type === 'mirror') {
    if (!isAxis(modifier.axis)) {
      throw new Error('Mirror axis is invalid.');
    }
    return {
      id: modifier.id,
      type: 'mirror',
      enabled: modifier.enabled,
      axis: modifier.axis
    };
  }
  if (modifier.type === 'grid-array') {
    const { countX, countY, spacingX, spacingY } = modifier;
    if (
      !Number.isInteger(countX) ||
      !Number.isInteger(countY) ||
      (countX as number) < 1 ||
      (countY as number) < 1 ||
      (countX as number) > 64 ||
      (countY as number) > 64 ||
      typeof spacingX !== 'number' ||
      typeof spacingY !== 'number' ||
      !Number.isFinite(spacingX) ||
      !Number.isFinite(spacingY) ||
      Math.abs(spacingX) > 10_000 ||
      Math.abs(spacingY) > 10_000
    ) {
      throw new Error('Grid array parameters are invalid.');
    }
    return {
      id: modifier.id,
      type: 'grid-array',
      enabled: modifier.enabled,
      countX: countX as number,
      countY: countY as number,
      spacingX,
      spacingY
    };
  }
  if (!isAxis(modifier.axis) || !Number.isInteger(modifier.count)) {
    throw new Error('Radial array parameters are invalid.');
  }
  if ((modifier.count as number) < 1 || (modifier.count as number) > 128) {
    throw new Error('Radial array count is outside the supported range.');
  }
  return {
    id: modifier.id,
    type: 'radial-array',
    enabled: modifier.enabled,
    axis: modifier.axis,
    count: modifier.count as number
  };
}

/** Validate a stored modifier stack. */
export function validateModifiers(value: unknown): Modifier[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > 32) {
    throw new Error('Modifier stack is invalid.');
  }
  return value.map(validateModifier);
}
