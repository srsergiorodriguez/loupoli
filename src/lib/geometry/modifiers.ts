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
  /** Keep the negative local side instead of the positive side. */
  readonly flip: boolean;
  /** Clip geometry to the kept side before reflecting. */
  readonly clip: boolean;
  /** Snap near-plane vertices onto the mirror plane. */
  readonly merge: boolean;
  /** World-unit distance used by the merge snap. */
  readonly mergeThreshold: number;
  /** Mirror the U texture coordinate on the reflected copy. */
  readonly mirrorUv: boolean;
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

/** Unit used by the outline extrusion width. */
export type OutlineUnits = 'world' | 'screen';

/** Stencil-masked silhouette dilation with screen-pixel or world-unit width. */
export interface OutlineModifier {
  readonly id: string;
  readonly type: 'outline';
  readonly enabled: boolean;
  /** Extrusion width in screen pixels or world units. */
  readonly thickness: number;
  /** Width interpretation; missing legacy values normalize to world. */
  readonly units: OutlineUnits;
  /** Six-digit CSS hex color. */
  readonly color: string;
}

/** Thickness shell for open surfaces and cards. */
export interface SolidifyModifier {
  readonly id: string;
  readonly type: 'solidify';
  readonly enabled: boolean;
  /** Shell thickness in world units. */
  readonly thickness: number;
  /** -1 keeps the outer surface fixed, 1 keeps the inner surface fixed. */
  readonly offset: number;
}

/** Bend, twist, or taper deformation around a local axis. */
export interface DeformModifier {
  readonly id: string;
  readonly type: 'deform';
  readonly enabled: boolean;
  readonly mode: 'bend' | 'twist' | 'taper';
  readonly axis: ModifierAxis;
  /** Degrees for bend/twist, or the positive-end factor for taper. */
  readonly amount: number;
}

/** Deterministic noise displacement along evaluated vertex normals. */
export interface NoiseDisplaceModifier {
  readonly id: string;
  readonly type: 'noise-displace';
  readonly enabled: boolean;
  /** Peak displacement in local units. */
  readonly strength: number;
  /** Noise cycles per local unit. */
  readonly frequency: number;
  readonly seed: number;
}

/** Collapse nearby vertices to one position. */
export interface WeldModifier {
  readonly id: string;
  readonly type: 'weld';
  readonly enabled: boolean;
  /** World/local unit distance within which vertices merge. */
  readonly threshold: number;
}

/** Serializable modifier union evaluated over a node's base DCEL. */
export type Modifier =
  | MirrorModifier
  | GridArrayModifier
  | RadialArrayModifier
  | OutlineModifier
  | SolidifyModifier
  | DeformModifier
  | NoiseDisplaceModifier
  | WeldModifier;

/** Modifier types exposed by the stack UI. */
export const MODIFIER_KINDS = [
  'mirror',
  'grid-array',
  'radial-array',
  'deform',
  'noise-displace',
  'weld',
  'outline',
  'solidify'
] as const;

/** Modifier type name. */
export type ModifierKind = (typeof MODIFIER_KINDS)[number];

/** Whether a modifier changes geometry or is a render-only effect. */
export type ModifierCategory = 'geometry' | 'render';

/** One self-contained modifier implementation used by creation, validation, and evaluation. */
export interface ModifierDefinition {
  readonly kind: ModifierKind;
  readonly label: string;
  readonly category: ModifierCategory;
  readonly create: () => Modifier;
  readonly validate: (
    value: Record<string, unknown>,
    id: string,
    enabled: boolean
  ) => Modifier;
  /** Geometry evaluation. Render effects use their own render path. */
  readonly evaluate?: (
    mesh: HalfEdgeMesh,
    provenance: ModifierProvenance,
    modifier: Modifier
  ) => EvaluatedModifierMesh;
}

/** Display labels for stack rows. */
export const MODIFIER_LABELS: Readonly<Record<ModifierKind, string>> = {
  mirror: 'Mirror',
  'grid-array': 'Grid Array',
  'radial-array': 'Radial Array',
  deform: 'Deform',
  'noise-displace': 'Noise Displace',
  weld: 'Weld',
  outline: 'Outline',
  solidify: 'Solidify'
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
  return MODIFIER_DEFINITIONS[kind].create();
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

/**
 * Remove consecutive and wrap-around duplicate corners.
 *
 * Clipping and plane snapping can leave two corners at the same position. If
 * that reaches the DCEL builder it becomes a zero-length directed edge, which
 * is rejected as non-manifold. A face with fewer than three distinct corners
 * has no area and is dropped by the caller.
 */
function removeDuplicateCorners(
  corners: readonly ProvenanceCorner[]
): ProvenanceCorner[] {
  const output: ProvenanceCorner[] = [];
  for (const corner of corners) {
    const previous = output[output.length - 1];
    if (
      !previous ||
      positionKey(previous.position) !== positionKey(corner.position)
    ) {
      output.push(corner);
    }
  }
  while (
    output.length > 1 &&
    positionKey(output[0].position) ===
      positionKey(output[output.length - 1].position)
  ) {
    output.pop();
  }
  return output;
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

  const cleaned = removeDuplicateCorners(output);
  const unique = new Set(
    cleaned.map((corner) => positionKey(corner.position))
  );
  if (cleaned.length < 3 || unique.size < 3) {
    return null;
  }
  return { corners: cleaned, material: face.material, baseFace: face.baseFace };
}

function faceOnPlane(face: ProvenanceFace, axis: ModifierAxis): boolean {
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  return face.corners.every(
    (corner) => Math.abs(corner.position[index]) <= 1e-6
  );
}

function reflectProvenanceFace(
  face: ProvenanceFace,
  axis: ModifierAxis,
  mirrorUv: boolean
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
      uv: mirrorUv
        ? ([1 - corner.uv[0], corner.uv[1]] as [number, number])
        : corner.uv,
      baseVertex: corner.baseVertex,
      baseEdge: sourceEdge.baseEdge,
      baseLinear: multiplyLinear(reflection, corner.baseLinear)
    };
  });
  return { corners, material: face.material, baseFace: face.baseFace };
}

/** Snap vertices near the mirror plane onto it before DCEL construction. */
function mergeMirrorPlane(
  faces: readonly ProvenanceFace[],
  axis: ModifierAxis,
  threshold: number
): void {
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  for (const face of faces) {
    for (const corner of face.corners) {
      if (Math.abs(corner.position[index]) <= threshold) {
        corner.position[index] = 0;
      }
    }
  }
}

function mirrorEvaluated(
  mesh: HalfEdgeMesh,
  provenance: ModifierProvenance,
  modifier: MirrorModifier
): EvaluatedModifierMesh {
  const axis = modifier.axis;
  const sign: 1 | -1 = modifier.flip ? -1 : 1;
  const threshold = modifier.merge ? modifier.mergeThreshold : 1e-6;
  // Keep equality inclusive after floating-point transcription of the
  // pointer delta; otherwise a vertex exactly on the threshold clips first
  // and collapses into a hole.
  const snapThreshold = threshold + 1e-9;

  const faces: ProvenanceFace[] = [];
  const sourceFaces = collectProvenanceFaces(mesh, provenance);
  // Snap before clipping as well as after. Otherwise a plane vertex moved by
  // less than the merge threshold clips into a sliver and collapses later.
  if (modifier.merge) {
    mergeMirrorPlane(sourceFaces, axis, snapThreshold);
  }
  for (const sourceFace of sourceFaces) {
    let kept: ProvenanceFace | null = sourceFace;
    if (modifier.clip) {
      kept = clipProvenanceFace(sourceFace, axis, sign);
    }
    if (!kept) {
      continue;
    }
    if (modifier.merge) {
      const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      for (const corner of kept.corners) {
        if (Math.abs(corner.position[index]) <= snapThreshold) {
          corner.position[index] = 0;
        }
      }
      const cleaned = removeDuplicateCorners(kept.corners);
      if (cleaned.length < 3) {
        continue;
      }
      kept = { ...kept, corners: cleaned };
    }
    faces.push(kept);
    if (!faceOnPlane(kept, axis)) {
      faces.push(
        reflectProvenanceFace(kept, axis, modifier.mirrorUv)
      );
    }
  }
  if (modifier.merge) {
    mergeMirrorPlane(faces, axis, snapThreshold);
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

function solidifyEvaluated(
  mesh: HalfEdgeMesh,
  provenance: ModifierProvenance,
  thickness: number,
  offset: number
): EvaluatedModifierMesh {
  if (!Number.isFinite(thickness) || thickness <= 0) {
    throw new Error('Solidify thickness must be a positive finite number.');
  }
  if (!Number.isFinite(offset) || offset < -1 || offset > 1) {
    throw new Error('Solidify offset must be between -1 and 1.');
  }
  if (mesh.faceCount * 2 > MAX_MODIFIER_FACES) {
    throw new Error('Solidify exceeds the modifier face limit.');
  }

  const vertexNormals = new Float32Array(mesh.vertexCount * 3);
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const normal = mesh.computeFaceNormal(face);
    const start = mesh.faceHalfEdge[face];
    let halfEdge = start;
    do {
      const vertex = mesh.heOrigin[halfEdge];
      const offset3 = vertex * 3;
      vertexNormals[offset3] += normal[0];
      vertexNormals[offset3 + 1] += normal[1];
      vertexNormals[offset3 + 2] += normal[2];
      halfEdge = mesh.heNext[halfEdge];
    } while (halfEdge !== start);
  }
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    const offset3 = vertex * 3;
    const length = Math.hypot(
      vertexNormals[offset3],
      vertexNormals[offset3 + 1],
      vertexNormals[offset3 + 2]
    );
    if (length <= 1e-8) {
      throw new Error('Solidify found a vertex without a stable normal.');
    }
    vertexNormals[offset3] /= length;
    vertexNormals[offset3 + 1] /= length;
    vertexNormals[offset3 + 2] /= length;
  }

  const outerShift = thickness * ((offset + 1) / 2);
  const innerShift = outerShift - thickness;
  const shiftedCorner = (
    vertex: number,
    uv: readonly [number, number],
    baseEdge: number,
    amount: number
  ): ProvenanceCorner => {
    const offset3 = vertex * 3;
    const position = mesh.getVertexPosition(vertex);
    return {
      position: [
        position[0] + vertexNormals[offset3] * amount,
        position[1] + vertexNormals[offset3 + 1] * amount,
        position[2] + vertexNormals[offset3 + 2] * amount
      ],
      uv: [uv[0], uv[1]],
      baseVertex: provenance.vertexBase[vertex] ?? -1,
      baseEdge,
      baseLinear: Array.from(
        provenance.vertexLinear.subarray(vertex * 9, vertex * 9 + 9)
      )
    };
  };

  const faces: ProvenanceFace[] = [];
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const start = mesh.faceHalfEdge[face];
    const corners: ProvenanceCorner[] = [];
    let halfEdge = start;
    do {
      const vertex = mesh.heOrigin[halfEdge];
      const uvOffset = halfEdge * 2;
      corners.push(
        shiftedCorner(
          vertex,
          [mesh.heUv[uvOffset], mesh.heUv[uvOffset + 1]],
          provenance.edgeBase[mesh.heEdge[halfEdge]] ?? -1,
          outerShift
        )
      );
      halfEdge = mesh.heNext[halfEdge];
    } while (halfEdge !== start);

    const inner: ProvenanceCorner[] = [];
    halfEdge = start;
    do {
      const vertex = mesh.heOrigin[halfEdge];
      const uvOffset = halfEdge * 2;
      inner.push(
        shiftedCorner(
          vertex,
          [mesh.heUv[uvOffset], mesh.heUv[uvOffset + 1]],
          provenance.edgeBase[mesh.heEdge[halfEdge]] ?? -1,
          innerShift
        )
      );
      halfEdge = mesh.heNext[halfEdge];
    } while (halfEdge !== start);
    inner.reverse();

    faces.push({
      corners,
      material: mesh.faceMaterial[face],
      baseFace: provenance.faceBase[face] ?? face
    });
    faces.push({
      corners: inner,
      material: mesh.faceMaterial[face],
      baseFace: provenance.faceBase[face] ?? face
    });
  }

  // Rim faces close every open boundary. The outer shell follows the source
  // winding; the reversed inner shell and outward rim make a closed solid.
  for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
    const halfEdge = mesh.edgeHalfEdge[edge];
    const twin = mesh.heTwin[halfEdge];
    const face = mesh.heFace[halfEdge];
    const twinFace = twin >= 0 ? mesh.heFace[twin] : -1;
    if ((face >= 0) === (twinFace >= 0)) {
      continue;
    }
    const boundary = face >= 0 ? halfEdge : twin;
    if (boundary < 0 || mesh.heFace[boundary] < 0) {
      continue;
    }
    const a = mesh.heOrigin[boundary];
    const b = mesh.heOrigin[mesh.heNext[boundary]];
    const uvAOffset = boundary * 2;
    const uvBOffset = mesh.heNext[boundary] * 2;
    faces.push({
      corners: [
        shiftedCorner(
          b,
          [mesh.heUv[uvBOffset], mesh.heUv[uvBOffset + 1]],
          -1,
          outerShift
        ),
        shiftedCorner(
          a,
          [mesh.heUv[uvAOffset], mesh.heUv[uvAOffset + 1]],
          -1,
          outerShift
        ),
        shiftedCorner(
          a,
          [mesh.heUv[uvAOffset], mesh.heUv[uvAOffset + 1]],
          -1,
          innerShift
        ),
        shiftedCorner(
          b,
          [mesh.heUv[uvBOffset], mesh.heUv[uvBOffset + 1]],
          -1,
          innerShift
        )
      ],
      material: mesh.faceMaterial[mesh.heFace[boundary]],
      baseFace: provenance.faceBase[mesh.heFace[boundary]] ?? -1
    });
  }
  if (faces.length > MAX_MODIFIER_FACES) {
    throw new Error('Solidify exceeds the modifier face limit.');
  }
  return buildEvaluated(faces);
}


function computedVertexNormals(mesh: HalfEdgeMesh): Float32Array {
  const normals = new Float32Array(mesh.vertexCount * 3);
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const normal = mesh.computeFaceNormal(face);
    const start = mesh.faceHalfEdge[face];
    let halfEdge = start;
    do {
      const vertex = mesh.heOrigin[halfEdge];
      const offset = vertex * 3;
      normals[offset] += normal[0];
      normals[offset + 1] += normal[1];
      normals[offset + 2] += normal[2];
      halfEdge = mesh.heNext[halfEdge];
    } while (halfEdge !== start);
  }
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const length = Math.hypot(
      normals[offset],
      normals[offset + 1],
      normals[offset + 2]
    );
    if (length <= 1e-8) {
      throw new Error('A vertex has no stable normal for displacement.');
    }
    normals[offset] /= length;
    normals[offset + 1] /= length;
    normals[offset + 2] /= length;
  }
  return normals;
}

function deformEvaluated(
  mesh: HalfEdgeMesh,
  provenance: ModifierProvenance,
  modifier: DeformModifier
): EvaluatedModifierMesh {
  const axisIndex = modifier.axis === 'x' ? 0 : modifier.axis === 'y' ? 1 : 2;
  const bounds = mesh.getBounds();
  const center = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2
  ];
  const span = Math.max(
    1e-6,
    bounds.max[axisIndex] - bounds.min[axisIndex]
  );
  const positions = mesh.positions.slice();
  const radians = (modifier.amount * Math.PI) / 180;

  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const point = [
      positions[offset],
      positions[offset + 1],
      positions[offset + 2]
    ] as [number, number, number];

    if (modifier.mode === 'twist') {
      const t = (point[axisIndex] - center[axisIndex]) / span;
      const angle = radians * t;
      const rotated = rotatePosition(point, modifier.axis, angle);
      positions[offset] = rotated[0];
      positions[offset + 1] = rotated[1];
      positions[offset + 2] = rotated[2];
    } else if (modifier.mode === 'taper') {
      const t = (point[axisIndex] - center[axisIndex]) / span + 0.5;
      const factor = 1 + (modifier.amount - 1) * t;
      const a = (axisIndex + 1) % 3;
      const b = (axisIndex + 2) % 3;
      point[a] = center[a] + (point[a] - center[a]) * factor;
      point[b] = center[b] + (point[b] - center[b]) * factor;
      positions[offset] = point[0];
      positions[offset + 1] = point[1];
      positions[offset + 2] = point[2];
    } else {
      const u = (axisIndex + 1) % 3;
      const v = (axisIndex + 2) % 3;
      if (Math.abs(radians) > 1e-9) {
        const radius = span / radians;
        const theta = ((point[u] - center[u]) / span) * radians;
        point[u] = center[u] + Math.sin(theta) * radius;
        point[v] =
          center[v] +
          (1 - Math.cos(theta)) * radius +
          (point[v] - center[v]);
        positions[offset] = point[0];
        positions[offset + 1] = point[1];
        positions[offset + 2] = point[2];
      }
    }
  }
  return { mesh: mesh.withPositions(positions), provenance };
}

function hashNoise(value: number, seed: number): number {
  const n = Math.sin(value * 127.1 + seed * 311.7) * 43758.5453123;
  return (n - Math.floor(n)) * 2 - 1;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function valueNoise3D(
  x: number,
  y: number,
  z: number,
  seed: number
): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);
  const fz = smoothstep(z - iz);
  const sample = (dx: number, dy: number, dz: number): number =>
    hashNoise(ix + dx + (iy + dy) * 57 + (iz + dz) * 131, seed);
  const x00 = sample(0, 0, 0) * (1 - fx) + sample(1, 0, 0) * fx;
  const x10 = sample(0, 1, 0) * (1 - fx) + sample(1, 1, 0) * fx;
  const x01 = sample(0, 0, 1) * (1 - fx) + sample(1, 0, 1) * fx;
  const x11 = sample(0, 1, 1) * (1 - fx) + sample(1, 1, 1) * fx;
  const y0 = x00 * (1 - fy) + x10 * fy;
  const y1 = x01 * (1 - fy) + x11 * fy;
  return y0 * (1 - fz) + y1 * fz;
}

function noiseDisplaceEvaluated(
  mesh: HalfEdgeMesh,
  provenance: ModifierProvenance,
  modifier: NoiseDisplaceModifier
): EvaluatedModifierMesh {
  if (modifier.strength === 0) {
    return { mesh, provenance };
  }
  const normals = computedVertexNormals(mesh);
  const positions = mesh.positions.slice();
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const x = mesh.positions[offset] * modifier.frequency;
    const y = mesh.positions[offset + 1] * modifier.frequency;
    const z = mesh.positions[offset + 2] * modifier.frequency;
    const displacement =
      valueNoise3D(x, y, z, modifier.seed) * modifier.strength;
    positions[offset] += normals[offset] * displacement;
    positions[offset + 1] += normals[offset + 1] * displacement;
    positions[offset + 2] += normals[offset + 2] * displacement;
  }
  return { mesh: mesh.withPositions(positions), provenance };
}

function weldEvaluated(
  mesh: HalfEdgeMesh,
  provenance: ModifierProvenance,
  threshold: number
): EvaluatedModifierMesh {
  if (threshold <= 0) {
    return { mesh, provenance };
  }
  const parent = new Int32Array(mesh.vertexCount);
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    parent[vertex] = vertex;
  }
  const find = (vertex: number): number => {
    let root = vertex;
    while (parent[root] !== root) {
      root = parent[root];
    }
    while (parent[vertex] !== vertex) {
      const next = parent[vertex];
      parent[vertex] = root;
      vertex = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[rootB] = rootA;
    }
  };
  const cell = Math.max(1e-6, threshold);
  const buckets = new Map<string, number[]>();
  const bucketKey = (x: number, y: number, z: number): string =>
    `${x}|${y}|${z}`;
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const key = bucketKey(
      Math.floor(mesh.positions[offset] / cell),
      Math.floor(mesh.positions[offset + 1] / cell),
      Math.floor(mesh.positions[offset + 2] / cell)
    );
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(vertex);
    } else {
      buckets.set(key, [vertex]);
    }
  }
  const thresholdSquared = threshold * threshold;
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const gx = Math.floor(mesh.positions[offset] / cell);
    const gy = Math.floor(mesh.positions[offset + 1] / cell);
    const gz = Math.floor(mesh.positions[offset + 2] / cell);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = buckets.get(bucketKey(gx + dx, gy + dy, gz + dz));
          if (!bucket) {
            continue;
          }
          for (const other of bucket) {
            if (other <= vertex) {
              continue;
            }
            const otherOffset = other * 3;
            const distance =
              (mesh.positions[offset] - mesh.positions[otherOffset]) ** 2 +
              (mesh.positions[offset + 1] - mesh.positions[otherOffset + 1]) ** 2 +
              (mesh.positions[offset + 2] - mesh.positions[otherOffset + 2]) ** 2;
            if (distance <= thresholdSquared) {
              union(vertex, other);
            }
          }
        }
      }
    }
  }
  const representative = new Int32Array(mesh.vertexCount);
  const positions = new Float32Array(mesh.vertexCount * 3);
  const counts = new Uint32Array(mesh.vertexCount);
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    const root = find(vertex);
    representative[vertex] = root;
    counts[root] += 1;
    const offset = vertex * 3;
    positions[root * 3] += mesh.positions[offset];
    positions[root * 3 + 1] += mesh.positions[offset + 1];
    positions[root * 3 + 2] += mesh.positions[offset + 2];
  }
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    if (counts[vertex] > 0) {
      positions[vertex * 3] /= counts[vertex];
      positions[vertex * 3 + 1] /= counts[vertex];
      positions[vertex * 3 + 2] /= counts[vertex];
    }
  }
  const source = collectProvenanceFaces(mesh, provenance);
  const vertexByPosition = new Map<string, number>();
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    const offset = vertex * 3;
    vertexByPosition.set(
      `${mesh.positions[offset]}|${mesh.positions[offset + 1]}|${mesh.positions[offset + 2]}`,
      vertex
    );
  }
  const faces: ProvenanceFace[] = [];
  const faceKeys = new Set<string>();
  for (const face of source) {
    const corners: ProvenanceCorner[] = [];
    const seen = new Set<number>();
    for (const corner of face.corners) {
      const sourceVertex = vertexByPosition.get(
        `${corner.position[0]}|${corner.position[1]}|${corner.position[2]}`
      );
      if (sourceVertex === undefined) {
        continue;
      }
      const root = representative[sourceVertex];
      if (seen.has(root)) {
        continue;
      }
      seen.add(root);
      corners.push({
        position: [
          positions[root * 3],
          positions[root * 3 + 1],
          positions[root * 3 + 2]
        ],
        uv: [corner.uv[0], corner.uv[1]],
        baseVertex: corner.baseVertex,
        baseEdge: corner.baseEdge,
        baseLinear: [...corner.baseLinear]
      });
    }
    if (corners.length < 3) {
      continue;
    }
    const key = corners
      .map((corner) => `${corner.position[0]}|${corner.position[1]}|${corner.position[2]}`)
      .sort()
      .join('/');
    if (faceKeys.has(key)) {
      continue;
    }
    faceKeys.add(key);
    faces.push({
      corners,
      material: face.material,
      baseFace: face.baseFace
    });
  }
  if (faces.length === 0) {
    throw new Error('Weld collapsed every face.');
  }
  if (faces.length > MAX_MODIFIER_FACES) {
    throw new Error('Weld exceeds the modifier face limit.');
  }
  return buildEvaluated(faces);
}


function isModifierAxis(value: unknown): value is ModifierAxis {
  return value === 'x' || value === 'y' || value === 'z';
}

const MIRROR_DEFINITION: ModifierDefinition = {
  kind: 'mirror',
  label: MODIFIER_LABELS.mirror,
  category: 'geometry',
  create: () => ({
    id: createModifierId(),
    type: 'mirror',
    enabled: true,
    axis: 'x',
    flip: false,
    clip: true,
    merge: true,
    mergeThreshold: 0.001,
    mirrorUv: false
  }),
  validate: (value, id, enabled) => {
    if (!isModifierAxis(value.axis)) {
      throw new Error('Mirror axis is invalid.');
    }
    const flip = typeof value.flip === 'boolean' ? value.flip : false;
    const clip = typeof value.clip === 'boolean' ? value.clip : true;
    const merge = typeof value.merge === 'boolean' ? value.merge : true;
    const mergeThreshold =
      typeof value.mergeThreshold === 'number' &&
      Number.isFinite(value.mergeThreshold)
        ? Math.min(10, Math.max(1e-6, value.mergeThreshold))
        : 0.001;
    const mirrorUv = typeof value.mirrorUv === 'boolean' ? value.mirrorUv : false;
    return {
      id,
      type: 'mirror',
      enabled,
      axis: value.axis,
      flip,
      clip,
      merge,
      mergeThreshold,
      mirrorUv
    };
  },
  evaluate: (mesh, provenance, modifier) => {
    if (modifier.type !== 'mirror') {
      throw new Error('Mirror evaluator received another modifier kind.');
    }
    return mirrorEvaluated(mesh, provenance, modifier);
  }
};

const GRID_ARRAY_DEFINITION: ModifierDefinition = {
  kind: 'grid-array',
  label: MODIFIER_LABELS['grid-array'],
  category: 'geometry',
  create: () => ({
    id: createModifierId(),
    type: 'grid-array',
    enabled: true,
    countX: 2,
    countY: 1,
    spacingX: 1.5,
    spacingY: 1.5
  }),
  validate: (value, id, enabled) => {
    const { countX, countY, spacingX, spacingY } = value;
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
      id,
      type: 'grid-array',
      enabled,
      countX: countX as number,
      countY: countY as number,
      spacingX,
      spacingY
    };
  },
  evaluate: (mesh, provenance, modifier) => {
    if (modifier.type !== 'grid-array') {
      throw new Error('Grid array evaluator received another modifier kind.');
    }
    if (modifier.countX < 1 || modifier.countY < 1) {
      throw new Error('Grid array counts must be at least one.');
    }
    return gridEvaluated(
      mesh,
      provenance,
      modifier.countX,
      modifier.countY,
      modifier.spacingX,
      modifier.spacingY
    );
  }
};

const RADIAL_ARRAY_DEFINITION: ModifierDefinition = {
  kind: 'radial-array',
  label: MODIFIER_LABELS['radial-array'],
  category: 'geometry',
  create: () => ({
    id: createModifierId(),
    type: 'radial-array',
    enabled: true,
    axis: 'z',
    count: 6
  }),
  validate: (value, id, enabled) => {
    if (!isModifierAxis(value.axis) || !Number.isInteger(value.count)) {
      throw new Error('Radial array parameters are invalid.');
    }
    if ((value.count as number) < 1 || (value.count as number) > 128) {
      throw new Error('Radial array count is outside the supported range.');
    }
    return {
      id,
      type: 'radial-array',
      enabled,
      axis: value.axis,
      count: value.count as number
    };
  },
  evaluate: (mesh, provenance, modifier) => {
    if (modifier.type !== 'radial-array') {
      throw new Error('Radial array evaluator received another modifier kind.');
    }
    if (modifier.count < 1) {
      throw new Error('Radial array count must be at least one.');
    }
    return radialEvaluated(mesh, provenance, modifier.axis, modifier.count);
  }
};

const OUTLINE_DEFINITION: ModifierDefinition = {
  kind: 'outline',
  label: MODIFIER_LABELS.outline,
  category: 'render',
  create: () => ({
    id: createModifierId(),
    type: 'outline',
    enabled: true,
    thickness: 0.05,
    units: 'world',
    color: '#e07a5f'
  }),
  validate: (value, id, enabled) => {
    // Older v11 modifiers predate `units`; keep their world-space width.
    const units: OutlineUnits = value.units === 'screen' ? 'screen' : 'world';
    const fallback = units === 'screen' ? 4 : 0.08;
    const min = units === 'screen' ? 0.5 : 0.001;
    const max = units === 'screen' ? 24 : 1;
    const thickness =
      typeof value.thickness === 'number' && Number.isFinite(value.thickness)
        ? Math.min(max, Math.max(min, value.thickness))
        : fallback;
    const color =
      typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color)
        ? value.color.toLowerCase()
        : '#e07a5f';
    return { id, type: 'outline', enabled, thickness, units, color };
  }
};

const SOLIDIFY_DEFINITION: ModifierDefinition = {
  kind: 'solidify',
  label: MODIFIER_LABELS.solidify,
  category: 'geometry',
  create: () => ({
    id: createModifierId(),
    type: 'solidify',
    enabled: true,
    thickness: 0.1,
    offset: -1
  }),
  validate: (value, id, enabled) => {
    const thickness =
      typeof value.thickness === 'number' && Number.isFinite(value.thickness)
        ? Math.min(10, Math.max(0.0001, value.thickness))
        : 0.1;
    const offset =
      typeof value.offset === 'number' && Number.isFinite(value.offset)
        ? Math.min(1, Math.max(-1, value.offset))
        : -1;
    return { id, type: 'solidify', enabled, thickness, offset };
  },
  evaluate: (mesh, provenance, modifier) => {
    if (modifier.type !== 'solidify') {
      throw new Error('Solidify evaluator received another modifier kind.');
    }
    return solidifyEvaluated(
      mesh,
      provenance,
      modifier.thickness,
      modifier.offset
    );
  }
};


const DEFORM_DEFINITION: ModifierDefinition = {
  kind: 'deform',
  label: MODIFIER_LABELS.deform,
  category: 'geometry',
  create: () => ({
    id: createModifierId(),
    type: 'deform',
    enabled: true,
    mode: 'twist',
    axis: 'z',
    amount: 30
  }),
  validate: (value, id, enabled) => {
    const mode =
      value.mode === 'bend' || value.mode === 'taper' ? value.mode : 'twist';
    if (!isModifierAxis(value.axis)) {
      throw new Error('Deform axis is invalid.');
    }
    const amount =
      typeof value.amount === 'number' && Number.isFinite(value.amount)
        ? mode === 'taper'
          ? Math.min(10, Math.max(0.05, value.amount))
          : Math.min(720, Math.max(-720, value.amount))
        : mode === 'taper'
          ? 0.5
          : 30;
    return { id, type: 'deform', enabled, mode, axis: value.axis, amount };
  },
  evaluate: (mesh, provenance, modifier) => {
    if (modifier.type !== 'deform') {
      throw new Error('Deform evaluator received another modifier kind.');
    }
    return deformEvaluated(mesh, provenance, modifier);
  }
};

const NOISE_DISPLACE_DEFINITION: ModifierDefinition = {
  kind: 'noise-displace',
  label: MODIFIER_LABELS['noise-displace'],
  category: 'geometry',
  create: () => ({
    id: createModifierId(),
    type: 'noise-displace',
    enabled: true,
    strength: 0.15,
    frequency: 2,
    seed: 1
  }),
  validate: (value, id, enabled) => {
    const strength =
      typeof value.strength === 'number' && Number.isFinite(value.strength)
        ? Math.min(100, Math.max(-100, value.strength))
        : 0.15;
    const frequency =
      typeof value.frequency === 'number' && Number.isFinite(value.frequency)
        ? Math.min(100, Math.max(0.001, value.frequency))
        : 2;
    const seed =
      typeof value.seed === 'number' && Number.isFinite(value.seed)
        ? Math.round(value.seed)
        : 1;
    return {
      id,
      type: 'noise-displace',
      enabled,
      strength,
      frequency,
      seed
    };
  },
  evaluate: (mesh, provenance, modifier) => {
    if (modifier.type !== 'noise-displace') {
      throw new Error('Noise displace evaluator received another modifier kind.');
    }
    return noiseDisplaceEvaluated(mesh, provenance, modifier);
  }
};

const WELD_DEFINITION: ModifierDefinition = {
  kind: 'weld',
  label: MODIFIER_LABELS.weld,
  category: 'geometry',
  create: () => ({
    id: createModifierId(),
    type: 'weld',
    enabled: true,
    threshold: 0.01
  }),
  validate: (value, id, enabled) => {
    const threshold =
      typeof value.threshold === 'number' && Number.isFinite(value.threshold)
        ? Math.min(10, Math.max(1e-5, value.threshold))
        : 0.01;
    return { id, type: 'weld', enabled, threshold };
  },
  evaluate: (mesh, provenance, modifier) => {
    if (modifier.type !== 'weld') {
      throw new Error('Weld evaluator received another modifier kind.');
    }
    return weldEvaluated(mesh, provenance, modifier.threshold);
  }
};

/** Complete modifier registry used by creation, validation, evaluation, and the stack UI. */
export const MODIFIER_DEFINITIONS: Readonly<
  Record<ModifierKind, ModifierDefinition>
> = {
  mirror: MIRROR_DEFINITION,
  'grid-array': GRID_ARRAY_DEFINITION,
  'radial-array': RADIAL_ARRAY_DEFINITION,
  deform: DEFORM_DEFINITION,
  'noise-displace': NOISE_DISPLACE_DEFINITION,
  weld: WELD_DEFINITION,
  outline: OUTLINE_DEFINITION,
  solidify: SOLIDIFY_DEFINITION
};

/**
 * Evaluate the enabled modifier stack and return provenance maps back to the
 * unchanged base mesh.
 *
 * Mirror keeps a stable local side by default (or the flipped negative side),
 * optionally clips to that side, snaps near-plane vertices for a welded seam,
 * and reflects with reversed winding. Arrays preserve per-corner UVs and
 * materials. Cut vertices/edges introduced by mirror clipping have no single
 * base element and map to -1.
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
    const definition = MODIFIER_DEFINITIONS[modifier.type];
    if (definition.category !== 'geometry') {
      continue;
    }
    if (!definition.evaluate) {
      throw new Error(`${definition.label} has no geometry evaluator.`);
    }
    current = definition.evaluate(current.mesh, current.provenance, modifier);
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
  const raw = value as Record<string, unknown>;
  const type = raw.type;
  if (
    typeof raw.id !== 'string' ||
    raw.id.length === 0 ||
    typeof raw.enabled !== 'boolean' ||
    typeof type !== 'string' ||
    !(type in MODIFIER_DEFINITIONS)
  ) {
    throw new Error('Modifier metadata is invalid.');
  }
  return MODIFIER_DEFINITIONS[type as ModifierKind].validate(
    raw,
    raw.id,
    raw.enabled
  );
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
