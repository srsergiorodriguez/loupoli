import {
  HalfEdgeMesh,
  type Vec3
} from '../geometry/HalfEdgeMesh';
import {
  PRIMITIVE_KINDS,
  type PrimitiveKind
} from '../geometry/primitives';
import type { ShadingMode } from '../editor/types';
import {
  cloneModifiers,
  validateModifiers,
  type Modifier
} from '../geometry/modifiers';
import { MeshNode, type NodeTransform } from '../scene/MeshNode';
import { SceneGroup } from '../scene/SceneGroup';
import { SceneDocument } from '../scene/SceneDocument';
import type {
  TextureLayerRecord,
  TextureProjectData
} from '../texture/TextureStack';

const MAGIC = new Uint8Array([0x4c, 0x50, 0x4f, 0x4c, 0x59, 0x00, 0x00, 0x00]); // LPOLY\0\0\0
const FORMAT_VERSION = 2;
const MIN_SUPPORTED_VERSION = 1;
const HEADER_BYTES = 28;
const MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_NODES = 1024;
const MAX_GROUPS = 512;
const MAX_VERTICES = 1_000_000;
const MAX_HALF_EDGES = 4_000_000;
const MAX_EDGES = 2_000_000;
const MAX_FACES = 2_000_000;
const MAX_NAME_LENGTH = 200;
const MAX_TEXTURE_LAYERS = 8;
const MAX_TEXTURE_DIMENSION = 2048;
const MAX_TEXTURE_PNG_BYTES = 32 * 1024 * 1024;

/** Project-level settings saved with a document but not part of its DCEL. */
export interface ProjectSettings {
  readonly shading: ShadingMode;
  readonly ps1Snap: boolean;
  readonly ps1Affine: boolean;
}

/** Decoded scene, viewport settings, and optional v2 texture data. */
export interface DecodedProject {
  readonly document: SceneDocument;
  readonly settings: ProjectSettings;
  readonly textures?: TextureProjectData;
}

/** Counts and typed columns that fully describe one serialized mesh. */
export interface MeshSnapshot {
  readonly positions: Float32Array;
  readonly vertexOut: Int32Array;
  readonly heOrigin: Uint32Array;
  readonly heTwin: Uint32Array;
  readonly heNext: Uint32Array;
  readonly heFace: Int32Array;
  readonly heEdge: Uint32Array;
  readonly heUv: Float32Array;
  readonly edgeHalfEdge: Uint32Array;
  readonly edgeFlags: Uint8Array;
  readonly faceHalfEdge: Uint32Array;
  readonly faceMaterial: Int32Array;
  readonly vertexCount: number;
  readonly halfEdgeCount: number;
  readonly edgeCount: number;
  readonly faceCount: number;
}

/** Detached, structured-clone-safe snapshot of one mesh node. */
export interface NodeSnapshot {
  readonly id: string;
  readonly name: string;
  readonly primitive: PrimitiveKind;
  readonly visible: boolean;
  readonly transform: NodeTransform;
  readonly parentId: string | null;
  readonly modifiers: readonly Modifier[];
  readonly mesh: MeshSnapshot;
}

/** Detached, structured-clone-safe snapshot of one scene group. */
export interface GroupSnapshot {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly transform: NodeTransform;
}

interface MeshManifest {
  readonly vertexCount: number;
  readonly halfEdgeCount: number;
  readonly edgeCount: number;
  readonly faceCount: number;
}

interface NodeManifest {
  readonly id: string;
  readonly name: string;
  readonly primitive: PrimitiveKind;
  readonly visible: boolean;
  readonly transform: NodeTransform;
  readonly parentId?: string | null;
  readonly modifiers?: readonly Modifier[];
  readonly mesh: MeshManifest;
}

interface GroupManifest {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly transform: NodeTransform;
}

interface TextureLayerManifest {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly color: string;
  readonly pattern: 'checker' | 'solid';
  readonly pngLength: number;
}

interface TextureManifest {
  readonly width: number;
  readonly height: number;
  readonly activeId: string | null;
  readonly layers: readonly TextureLayerManifest[];
}

interface Manifest {
  readonly format: 'lpoly';
  readonly version: number;
  readonly settings: ProjectSettings;
  readonly nodes: readonly NodeManifest[];
  readonly groups?: readonly GroupManifest[];
  readonly textures?: TextureManifest;
}

const TYPED_COLUMNS = [
  { key: 'positions', Type: Float32Array, length: (m: MeshManifest) => m.vertexCount * 3 },
  { key: 'vertexOut', Type: Int32Array, length: (m: MeshManifest) => m.vertexCount },
  { key: 'heOrigin', Type: Uint32Array, length: (m: MeshManifest) => m.halfEdgeCount },
  { key: 'heTwin', Type: Uint32Array, length: (m: MeshManifest) => m.halfEdgeCount },
  { key: 'heNext', Type: Uint32Array, length: (m: MeshManifest) => m.halfEdgeCount },
  { key: 'heFace', Type: Int32Array, length: (m: MeshManifest) => m.halfEdgeCount },
  { key: 'heEdge', Type: Uint32Array, length: (m: MeshManifest) => m.halfEdgeCount },
  { key: 'heUv', Type: Float32Array, length: (m: MeshManifest) => m.halfEdgeCount * 2 },
  { key: 'edgeHalfEdge', Type: Uint32Array, length: (m: MeshManifest) => m.edgeCount },
  { key: 'edgeFlags', Type: Uint8Array, length: (m: MeshManifest) => m.edgeCount },
  { key: 'faceHalfEdge', Type: Uint32Array, length: (m: MeshManifest) => m.faceCount },
  { key: 'faceMaterial', Type: Int32Array, length: (m: MeshManifest) => m.faceCount }
] as const;

type TypedColumnKey = (typeof TYPED_COLUMNS)[number]['key'];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function isPrimitiveKind(value: unknown): value is PrimitiveKind {
  return typeof value === 'string' && (PRIMITIVE_KINDS as readonly string[]).includes(value);
}

function isShadingMode(value: unknown): value is ShadingMode {
  return (
    value === 'wireframe' ||
    value === 'solid' ||
    value === 'unlit' ||
    value === 'texture-wire' ||
    value === 'lit'
  );
}

function validateTransform(value: unknown): NodeTransform {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid node transform.');
  }
  const transform = value as Partial<NodeTransform>;
  for (const key of ['position', 'rotation', 'scale'] as const) {
    const vector = transform[key];
    if (
      !Array.isArray(vector) ||
      vector.length !== 3 ||
      !vector.every((component) => typeof component === 'number' && Number.isFinite(component))
    ) {
      throw new Error(`Invalid ${key} in node transform.`);
    }
  }
  return {
    position: [...transform.position!] as Vec3,
    rotation: [...transform.rotation!] as Vec3,
    scale: [...transform.scale!] as Vec3
  };
}

function validateMeshCounts(value: unknown): MeshManifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid mesh counts.');
  }
  const mesh = value as Partial<Record<keyof MeshManifest, unknown>>;
  const v = mesh.vertexCount;
  const h = mesh.halfEdgeCount;
  const e = mesh.edgeCount;
  const f = mesh.faceCount;
  if (
    !Number.isInteger(v) ||
    !Number.isInteger(h) ||
    !Number.isInteger(e) ||
    !Number.isInteger(f) ||
    (v as number) < 1 ||
    (h as number) < 3 ||
    (e as number) < 3 ||
    (f as number) < 1 ||
    (v as number) > MAX_VERTICES ||
    (h as number) > MAX_HALF_EDGES ||
    (e as number) > MAX_EDGES ||
    (f as number) > MAX_FACES
  ) {
    throw new Error('Mesh counts are outside the supported limits.');
  }
  return {
    vertexCount: v as number,
    halfEdgeCount: h as number,
    edgeCount: e as number,
    faceCount: f as number
  };
}

/** Copy one mesh into detached typed arrays for storage or structured clone. */
export function snapshotMesh(mesh: HalfEdgeMesh): MeshSnapshot {
  return {
    positions: mesh.positions.slice(),
    vertexOut: mesh.vertexOut.slice(),
    heOrigin: mesh.heOrigin.slice(),
    heTwin: mesh.heTwin.slice(),
    heNext: mesh.heNext.slice(),
    heFace: mesh.heFace.slice(),
    heEdge: mesh.heEdge.slice(),
    heUv: mesh.heUv.slice(),
    edgeHalfEdge: mesh.edgeHalfEdge.slice(),
    edgeFlags: mesh.edgeFlags.slice(),
    faceHalfEdge: mesh.faceHalfEdge.slice(),
    faceMaterial: mesh.faceMaterial.slice(),
    vertexCount: mesh.vertexCount,
    halfEdgeCount: mesh.halfEdgeCount,
    edgeCount: mesh.edgeCount,
    faceCount: mesh.faceCount
  };
}

/** Restore a validated mesh from a detached snapshot. */
export function restoreMesh(snapshot: MeshSnapshot): HalfEdgeMesh {
  return HalfEdgeMesh.fromColumns(snapshot);
}

/** Copy a node's metadata and mesh columns into a standalone payload. */
export function snapshotNode(node: MeshNode): NodeSnapshot {
  return {
    id: node.id,
    name: node.name,
    primitive: node.primitive,
    visible: node.visible,
    transform: {
      position: [...node.transform.position] as Vec3,
      rotation: [...node.transform.rotation] as Vec3,
      scale: [...node.transform.scale] as Vec3
    },
    parentId: node.parentId,
    modifiers: cloneModifiers(node.modifiers),
    mesh: snapshotMesh(node.mesh)
  };
}

/** Copy one scene group into a standalone payload. */
export function snapshotGroup(group: SceneGroup): GroupSnapshot {
  return {
    id: group.id,
    name: group.name,
    visible: group.visible,
    transform: {
      position: [...group.transform.position] as Vec3,
      rotation: [...group.transform.rotation] as Vec3,
      scale: [...group.transform.scale] as Vec3
    }
  };
}

/** Rebuild a group from a structured-clone-safe snapshot. */
export function restoreGroup(snapshot: GroupSnapshot): SceneGroup {
  if (
    typeof snapshot.id !== 'string' ||
    snapshot.id.length === 0 ||
    typeof snapshot.name !== 'string' ||
    snapshot.name.length === 0 ||
    snapshot.name.length > MAX_NAME_LENGTH
  ) {
    throw new Error('Invalid group snapshot metadata.');
  }
  const group = new SceneGroup(snapshot.name, snapshot.id);
  group.visible = snapshot.visible;
  group.transform = validateTransform(snapshot.transform);
  return group;
}

/** Rebuild a node from a structured-clone-safe snapshot. */
export function restoreNode(snapshot: NodeSnapshot): MeshNode {
  if (
    typeof snapshot.id !== 'string' ||
    snapshot.id.length === 0 ||
    typeof snapshot.name !== 'string' ||
    snapshot.name.length === 0 ||
    snapshot.name.length > MAX_NAME_LENGTH ||
    !isPrimitiveKind(snapshot.primitive)
  ) {
    throw new Error('Invalid node snapshot metadata.');
  }
  const node = new MeshNode(
    restoreMesh(snapshot.mesh),
    snapshot.primitive,
    snapshot.name,
    snapshot.id
  );
  node.visible = snapshot.visible;
  node.transform = validateTransform(snapshot.transform);
  node.parentId = snapshot.parentId ?? null;
  node.setModifiers(validateModifiers(snapshot.modifiers));
  return node;
}

/**
 * Encode a scene document into the versioned `.lpoly` binary container.
 *
 * The payload is a deterministic sequence of aligned typed-array columns per
 * node. The manifest carries metadata and counts; the CRC covers everything
 * after the fixed header.
 */
/**
 * Validate and normalize v2 texture data for the manifest.
 *
 * PNG bytes are copied into aligned payload chunks; layer metadata is bounded
 * before allocation so malformed projects cannot exhaust memory.
 */
function buildTextureManifest(
  textures: TextureProjectData
): { manifest: TextureManifest; totalPngBytes: number } {
  if (
    !Number.isInteger(textures.width) ||
    !Number.isInteger(textures.height) ||
    textures.width < 1 ||
    textures.height < 1 ||
    textures.width > MAX_TEXTURE_DIMENSION ||
    textures.height > MAX_TEXTURE_DIMENSION
  ) {
    throw new Error('Texture dimensions are outside the supported limits.');
  }
  if (
    textures.layers.length < 1 ||
    textures.layers.length > MAX_TEXTURE_LAYERS
  ) {
    throw new Error('Texture layer count is outside the supported limits.');
  }
  const ids = new Set<string>();
  let totalPngBytes = 0;
  const layers: TextureLayerManifest[] = textures.layers.map((layer) => {
    if (
      typeof layer.id !== 'string' ||
      layer.id.length === 0 ||
      ids.has(layer.id) ||
      typeof layer.name !== 'string' ||
      layer.name.length === 0 ||
      layer.name.length > MAX_NAME_LENGTH ||
      typeof layer.visible !== 'boolean' ||
      typeof layer.opacity !== 'number' ||
      !Number.isFinite(layer.opacity) ||
      layer.opacity < 0 ||
      layer.opacity > 1 ||
      typeof layer.color !== 'string' ||
      layer.color.length > 32 ||
      (layer.pattern !== 'checker' && layer.pattern !== 'solid') ||
      !(layer.png instanceof Uint8Array) ||
      layer.png.byteLength < 1 ||
      layer.png.byteLength > MAX_TEXTURE_PNG_BYTES
    ) {
      throw new Error('Texture layer metadata is invalid.');
    }
    ids.add(layer.id);
    totalPngBytes += layer.png.byteLength;
    return {
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      color: layer.color,
      pattern: layer.pattern,
      pngLength: layer.png.byteLength
    };
  });
  if (totalPngBytes > MAX_TEXTURE_PNG_BYTES * MAX_TEXTURE_LAYERS) {
    throw new Error('Texture PNG payload is too large.');
  }
  return {
    manifest: {
      width: textures.width,
      height: textures.height,
      activeId: textures.activeId,
      layers
    },
    totalPngBytes
  };
}

/** Encode a v1 project without texture layers. */
export function encodeLpoly(
  document: SceneDocument,
  settings: ProjectSettings
): Uint8Array {
  return encodeInternal(document, settings, 1, null);
}

/** Encode a v2 project with per-layer binary PNG chunks. */
export function encodeLpolyV2(
  document: SceneDocument,
  settings: ProjectSettings,
  textures: TextureProjectData
): Uint8Array {
  return encodeInternal(document, settings, 2, textures);
}

function encodeInternal(
  document: SceneDocument,
  settings: ProjectSettings,
  version: number,
  textures: TextureProjectData | null
): Uint8Array {
  const manifestNodes: NodeManifest[] = document.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    primitive: node.primitive,
    visible: node.visible,
    transform: {
      position: [...node.transform.position] as Vec3,
      rotation: [...node.transform.rotation] as Vec3,
      scale: [...node.transform.scale] as Vec3
    },
    parentId: node.parentId,
    modifiers: cloneModifiers(node.modifiers),
    mesh: {
      vertexCount: node.mesh.vertexCount,
      halfEdgeCount: node.mesh.halfEdgeCount,
      edgeCount: node.mesh.edgeCount,
      faceCount: node.mesh.faceCount
    }
  }));

  const manifestGroups: GroupManifest[] = document.groups.map((group) => ({
    id: group.id,
    name: group.name,
    visible: group.visible,
    transform: {
      position: [...group.transform.position] as Vec3,
      rotation: [...group.transform.rotation] as Vec3,
      scale: [...group.transform.scale] as Vec3
    }
  }));

  const textureManifest = textures
    ? buildTextureManifest(textures)
    : null;
  const manifest: Manifest = {
    format: 'lpoly',
    version,
    settings,
    nodes: manifestNodes,
    groups: manifestGroups,
    ...(textureManifest ? { textures: textureManifest.manifest } : {})
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (manifestBytes.length > 16 * 1024 * 1024) {
    throw new Error('Project manifest is too large.');
  }

  const chunks: Uint8Array[] = [];
  let payloadLength = 0;
  for (const node of document.nodes) {
    for (const column of TYPED_COLUMNS) {
      const values = node.mesh[column.key];
      const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
      const padding = (4 - (payloadLength % 4)) % 4;
      if (padding > 0) {
        chunks.push(new Uint8Array(padding));
        payloadLength += padding;
      }
      chunks.push(bytes);
      payloadLength += bytes.byteLength;
    }
  }
  if (textures) {
    for (const layer of textures.layers) {
      const padding = (4 - (payloadLength % 4)) % 4;
      if (padding > 0) {
        chunks.push(new Uint8Array(padding));
        payloadLength += padding;
      }
      chunks.push(layer.png);
      payloadLength += layer.png.byteLength;
    }
  }

  const payloadStart = align4(HEADER_BYTES + manifestBytes.length);
  const totalLength = payloadStart + payloadLength;
  if (totalLength > MAX_FILE_BYTES) {
    throw new Error('Project is too large for the current .lpoly limit.');
  }

  const file = new Uint8Array(totalLength);
  file.set(MAGIC, 0);
  const view = new DataView(file.buffer);
  view.setUint16(8, version, true);
  view.setUint16(10, 0, true);
  view.setUint32(12, manifestBytes.length, true);
  view.setUint32(16, payloadLength, true);
  view.setUint32(24, 0, true);
  file.set(manifestBytes, HEADER_BYTES);

  let cursor = payloadStart;
  for (const chunk of chunks) {
    file.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  view.setUint32(20, crc32(file.subarray(HEADER_BYTES)), true);
  return file;
}

function validateTextureManifest(value: unknown): TextureManifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error('The .lpoly texture manifest is invalid.');
  }
  const texture = value as Partial<TextureManifest>;
  if (
    !Number.isInteger(texture.width) ||
    !Number.isInteger(texture.height) ||
    (texture.width as number) < 1 ||
    (texture.height as number) < 1 ||
    (texture.width as number) > MAX_TEXTURE_DIMENSION ||
    (texture.height as number) > MAX_TEXTURE_DIMENSION ||
    !Array.isArray(texture.layers) ||
    texture.layers.length < 1 ||
    texture.layers.length > MAX_TEXTURE_LAYERS
  ) {
    throw new Error('The .lpoly texture dimensions or layer count are invalid.');
  }
  const ids = new Set<string>();
  const layers: TextureLayerManifest[] = texture.layers.map((raw) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('The .lpoly contains an invalid texture layer.');
    }
    const layer = raw as Partial<TextureLayerManifest>;
    if (
      typeof layer.id !== 'string' ||
      layer.id.length === 0 ||
      ids.has(layer.id) ||
      typeof layer.name !== 'string' ||
      layer.name.length === 0 ||
      layer.name.length > MAX_NAME_LENGTH ||
      typeof layer.visible !== 'boolean' ||
      typeof layer.opacity !== 'number' ||
      !Number.isFinite(layer.opacity) ||
      layer.opacity < 0 ||
      layer.opacity > 1 ||
      typeof layer.color !== 'string' ||
      layer.color.length > 32 ||
      (layer.pattern !== 'checker' && layer.pattern !== 'solid') ||
      !Number.isInteger(layer.pngLength) ||
      (layer.pngLength as number) < 1 ||
      (layer.pngLength as number) > MAX_TEXTURE_PNG_BYTES
    ) {
      throw new Error('The .lpoly texture layer metadata is invalid.');
    }
    ids.add(layer.id);
    return {
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      color: layer.color,
      pattern: layer.pattern,
      pngLength: layer.pngLength as number
    };
  });
  const activeId = texture.activeId;
  if (
    activeId !== null &&
    (typeof activeId !== 'string' || !ids.has(activeId))
  ) {
    throw new Error('The .lpoly active texture layer is invalid.');
  }
  return {
    width: texture.width as number,
    height: texture.height as number,
    activeId,
    layers
  };
}

/** Decode and fully validate a versioned `.lpoly` container. */
export function decodeLpoly(bytes: Uint8Array): DecodedProject {
  if (bytes.byteLength < HEADER_BYTES) {
    throw new Error('This file is too short to be a .lpoly project.');
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error('This .lpoly project exceeds the supported size limit.');
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (bytes[i] !== MAGIC[i]) {
      throw new Error('This is not a loupoli .lpoly project.');
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(8, true);
  if (version < MIN_SUPPORTED_VERSION || version > FORMAT_VERSION) {
    throw new Error(
      `Unsupported .lpoly version ${version}; expected ${MIN_SUPPORTED_VERSION}–${FORMAT_VERSION}.`
    );
  }
  const manifestLength = view.getUint32(12, true);
  const payloadLength = view.getUint32(16, true);
  const expectedCrc = view.getUint32(20, true);
  const payloadStart = align4(HEADER_BYTES + manifestLength);
  if (payloadStart + payloadLength !== bytes.byteLength) {
    throw new Error('The .lpoly file length does not match its header.');
  }
  if (crc32(bytes.subarray(HEADER_BYTES)) !== expectedCrc) {
    throw new Error('The .lpoly checksum failed; the file may be corrupted.');
  }

  const manifestText = new TextDecoder().decode(
    bytes.subarray(HEADER_BYTES, HEADER_BYTES + manifestLength)
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch {
    throw new Error('The .lpoly manifest is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('The .lpoly manifest is invalid.');
  }
  const manifest = parsed as Partial<Manifest>;
  if (
    manifest.format !== 'lpoly' ||
    manifest.version !== version ||
    !Array.isArray(manifest.nodes) ||
    manifest.nodes.length > MAX_NODES ||
    (manifest.groups !== undefined &&
      (!Array.isArray(manifest.groups) ||
        manifest.groups.length > MAX_GROUPS)) ||
    typeof manifest.settings !== 'object' ||
    manifest.settings === null
  ) {
    throw new Error('The .lpoly manifest has an unsupported structure.');
  }
  if (version === 1 && manifest.textures !== undefined) {
    throw new Error('A v1 .lpoly cannot contain texture data.');
  }
  const textureManifest =
    version === 2 && manifest.textures !== undefined
      ? validateTextureManifest(manifest.textures)
      : null;
  const settings = manifest.settings as Partial<ProjectSettings>;
  if (
    !isShadingMode(settings.shading) ||
    typeof settings.ps1Snap !== 'boolean' ||
    typeof settings.ps1Affine !== 'boolean'
  ) {
    throw new Error('The .lpoly viewport settings are invalid.');
  }

  const document = new SceneDocument();
  let cursor = payloadStart;
  const seen = new Set<string>();
  const groupIds = new Set<string>();
  const groups: SceneGroup[] = [];

  for (const rawGroup of manifest.groups ?? []) {
    if (typeof rawGroup !== 'object' || rawGroup === null) {
      throw new Error('The .lpoly contains an invalid group.');
    }
    const group = rawGroup as Partial<GroupManifest>;
    if (
      typeof group.id !== 'string' ||
      group.id.length === 0 ||
      groupIds.has(group.id) ||
      typeof group.name !== 'string' ||
      group.name.length === 0 ||
      group.name.length > MAX_NAME_LENGTH ||
      typeof group.visible !== 'boolean'
    ) {
      throw new Error('The .lpoly contains invalid group metadata.');
    }
    groupIds.add(group.id);
    const restoredGroup = new SceneGroup(group.name, group.id);
    restoredGroup.visible = group.visible;
    restoredGroup.transform = validateTransform(group.transform);
    groups.push(restoredGroup);
  }

  for (const rawNode of manifest.nodes) {
    if (typeof rawNode !== 'object' || rawNode === null) {
      throw new Error('The .lpoly contains an invalid node.');
    }
    const node = rawNode as Partial<NodeManifest>;
    if (
      typeof node.id !== 'string' ||
      node.id.length === 0 ||
      seen.has(node.id) ||
      groupIds.has(node.id) ||
      typeof node.name !== 'string' ||
      node.name.length === 0 ||
      node.name.length > MAX_NAME_LENGTH ||
      !isPrimitiveKind(node.primitive) ||
      typeof node.visible !== 'boolean' ||
      (node.parentId !== undefined &&
        node.parentId !== null &&
        (typeof node.parentId !== 'string' ||
          !groupIds.has(node.parentId)))
    ) {
      throw new Error('The .lpoly contains invalid node metadata.');
    }
    seen.add(node.id);
    const transform = validateTransform(node.transform);
    const counts = validateMeshCounts(node.mesh);
    const meshBytes: Partial<Record<TypedColumnKey, unknown>> = {};

    for (const column of TYPED_COLUMNS) {
      const padding = (4 - (cursor % 4)) % 4;
      cursor += padding;
      const count = column.length(counts);
      const Type = column.Type;
      const byteLength = count * Type.BYTES_PER_ELEMENT;
      if (cursor + byteLength > bytes.byteLength) {
        throw new Error('The .lpoly payload ended inside a mesh column.');
      }
      const values = new Type(count);
      new Uint8Array(values.buffer).set(
        bytes.subarray(cursor, cursor + byteLength)
      );
      meshBytes[column.key] = values;
      cursor += byteLength;
    }

    const snapshot = Object.assign({}, meshBytes, counts) as unknown as MeshSnapshot;
    const mesh = restoreMesh(snapshot);
    const restored = new MeshNode(mesh, node.primitive, node.name, node.id);
    restored.visible = node.visible;
    restored.transform = transform;
    restored.parentId = node.parentId ?? null;
    restored.setModifiers(validateModifiers(node.modifiers));
    document.insertNode(restored);
  }

  for (const group of groups) {
    document.insertGroup(group);
  }

  let textures: TextureProjectData | undefined;
  if (textureManifest) {
    const textureLayers: TextureLayerRecord[] = [];
    for (const layer of textureManifest.layers) {
      const padding = (4 - (cursor % 4)) % 4;
      cursor += padding;
      if (
        cursor + layer.pngLength > bytes.byteLength ||
        cursor + layer.pngLength > payloadStart + payloadLength
      ) {
        throw new Error('The .lpoly payload ended inside a texture PNG chunk.');
      }
      textureLayers.push({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        color: layer.color,
        pattern: layer.pattern,
        png: bytes.slice(cursor, cursor + layer.pngLength)
      });
      cursor += layer.pngLength;
    }
    textures = {
      width: textureManifest.width,
      height: textureManifest.height,
      activeId: textureManifest.activeId,
      layers: textureLayers
    };
  }

  const alignedEnd = align4(cursor);
  if (alignedEnd !== bytes.byteLength) {
    throw new Error('The .lpoly payload has trailing or missing bytes.');
  }

  return {
    document,
    settings: {
      shading: settings.shading,
      ps1Snap: settings.ps1Snap,
      ps1Affine: settings.ps1Affine
    },
    ...(textures ? { textures } : {})
  };
}
