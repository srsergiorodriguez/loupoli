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
import { SceneLight, type LightKind, type LightSnapshot } from '../scene/SceneLight';
import { SceneCamera, type CameraSnapshot } from '../scene/SceneCamera';
import {
  type AnimationInterpolation,
  type AnimationClipSnapshot,
  type AnimationSnapshot,
  type CameraAnimationTrackSnapshot,
  type LightAnimationTrackSnapshot,
  type MeshMotionTrackSnapshot,
  type ShapeWeightTrackSnapshot,
  type AnimationTargetKind
} from '../scene/SceneAnimation';
import type {
  TextureBlendMode,
  TextureLayerRecord,
  TextureLayerRole
} from '../texture/TextureAsset';
import type { TextureAssetRecord } from '../texture/TextureLibrary';
import {
  normalizeTextureEffect,
  type TextureEffect
} from '../texture/effects';
import {
  MAX_TEXTURE_DIMENSION,
  MAX_TEXTURE_PIXELS
} from '../texture/size';

const MAGIC = new Uint8Array([0x4c, 0x50, 0x4f, 0x4c, 0x59, 0x00, 0x00, 0x00]); // LPOLY\0\0\0
const FORMAT_VERSION = 7;
const MIN_SUPPORTED_VERSION = 3;
const HEADER_BYTES = 28;
const MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_NODES = 1024;
const MAX_GROUPS = 512;
const MAX_LIGHTS = 64;
const MAX_CAMERAS = 32;
const MAX_ANIMATION_TRACKS = 256;
const MAX_ANIMATION_CLIPS = 32;
const MAX_MESH_MOTION_VERTICES = 8192;
const MAX_ANIMATION_KEYS = 4096;
const MAX_SHAPE_KEYS = 16;
const MAX_VERTICES = 1_000_000;
const MAX_HALF_EDGES = 4_000_000;
const MAX_EDGES = 2_000_000;
const MAX_FACES = 2_000_000;
const MAX_NAME_LENGTH = 200;
const MAX_TEXTURE_LAYERS = 8;
const MAX_TEXTURE_ASSETS = 32;
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
  readonly textures?: readonly TextureAssetRecord[];
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
  readonly textureId: string | null;
  readonly materialPalette?: readonly string[];
  readonly shapeKeys?: readonly {
    readonly id: string;
    readonly name: string;
    readonly weight: number;
    readonly visible?: boolean;
    readonly targetPositions: Float32Array;
  }[];
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
  readonly textureId?: string | null;
  readonly materialPalette?: readonly string[];
  readonly shapeKeys?: readonly {
    readonly id: string;
    readonly name: string;
    readonly weight: number;
    readonly visible?: boolean;
    readonly vertexCount: number;
  }[];
  readonly modifiers?: readonly Modifier[];
  readonly mesh: MeshManifest;
}

interface GroupManifest {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly transform: NodeTransform;
}

interface LightManifest extends Omit<LightSnapshot, 'castShadows' | 'shadowSoftness'> {
  readonly castShadows?: boolean;
  readonly shadowSoftness?: number;
}

interface LightingManifest {
  readonly ambientColor: string;
  readonly ambientIntensity: number;
  readonly lights: readonly LightManifest[];
}

interface TextureLayerManifest {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly color: string;
  readonly pattern: 'checker' | 'solid';
  readonly blendMode?: TextureBlendMode;
  readonly kind?: 'fill' | 'raster' | 'effect';
  readonly role?: TextureLayerRole;
  readonly effect?: TextureEffect | null;
  readonly pngLength: number;
}

interface TextureAssetManifest {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly filter: 'nearest' | 'linear';
  readonly alphaMode?: 'opaque' | 'cutout' | 'blend';
  readonly activeId: string | null;
  readonly layers: readonly TextureLayerManifest[];
}

interface TextureManifest {
  readonly assets: readonly TextureAssetManifest[];
}

interface Manifest {
  readonly format: 'lpoly';
  readonly version: number;
  readonly settings: ProjectSettings;
  readonly nodes: readonly NodeManifest[];
  readonly groups?: readonly GroupManifest[];
  readonly textures?: TextureManifest;
  readonly lighting?: LightingManifest;
  readonly cameras?: readonly CameraSnapshot[];
  readonly animation?: AnimationSnapshot;
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
  return typeof value === 'string' && (value === 'imported' || (PRIMITIVE_KINDS as readonly string[]).includes(value));
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

function validateVec3(value: unknown, label: string): Vec3 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(
      (component) => typeof component === 'number' && Number.isFinite(component)
    )
  ) {
    throw new Error(`Invalid ${label}.`);
  }
  return [value[0], value[1], value[2]] as Vec3;
}

function validateLightingManifest(
  value: unknown,
  version: number
): LightingManifest | null {
  if (value === undefined) {
    if (version >= 4) {
      throw new Error('The .lpoli lighting manifest is missing.');
    }
    return null;
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error('The .lpoli lighting manifest is invalid.');
  }
  const lighting = value as Partial<LightingManifest>;
  if (
    typeof lighting.ambientColor !== 'string' ||
    !/^#[0-9a-fA-F]{6}$/.test(lighting.ambientColor) ||
    typeof lighting.ambientIntensity !== 'number' ||
    !Number.isFinite(lighting.ambientIntensity) ||
    lighting.ambientIntensity < 0 ||
    !Array.isArray(lighting.lights) ||
    lighting.lights.length > MAX_LIGHTS
  ) {
    throw new Error('The .lpoli ambient lighting settings are invalid.');
  }
  const ids = new Set<string>();
  const lights: LightSnapshot[] = [];
  for (const raw of lighting.lights) {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('The .lpoli contains an invalid light.');
    }
    const light = raw as Partial<LightManifest>;
    if (
      typeof light.id !== 'string' ||
      light.id.length === 0 ||
      ids.has(light.id) ||
      typeof light.name !== 'string' ||
      light.name.length === 0 ||
      light.name.length > MAX_NAME_LENGTH ||
      (light.kind !== 'directional' && light.kind !== 'point') ||
      typeof light.color !== 'string' ||
      !/^#[0-9a-fA-F]{6}$/.test(light.color) ||
      typeof light.intensity !== 'number' ||
      !Number.isFinite(light.intensity) ||
      light.intensity < 0 ||
      typeof light.enabled !== 'boolean' ||
      (light.castShadows !== undefined && typeof light.castShadows !== 'boolean') ||
      (light.shadowSoftness !== undefined &&
        (typeof light.shadowSoftness !== 'number' ||
          !Number.isFinite(light.shadowSoftness) ||
          light.shadowSoftness < 0 ||
          light.shadowSoftness > 1))
    ) {
      throw new Error('The .lpoli contains invalid light metadata.');
    }
    const position = validateVec3(light.position, 'light position');
    const direction = validateVec3(light.direction, 'light direction');
    ids.add(light.id);
    lights.push({
      id: light.id,
      name: light.name,
      kind: light.kind as LightKind,
      color: light.color,
      intensity: light.intensity,
      enabled: light.enabled,
      castShadows: light.castShadows ?? true,
      shadowSoftness: light.shadowSoftness ?? 0.35,
      position,
      direction
    });
  }
  return {
    ambientColor: lighting.ambientColor,
    ambientIntensity: lighting.ambientIntensity,
    lights
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
    textureId: node.textureId,
    materialPalette: node.materialPalette,
    shapeKeys: node.shapeKeys.map((key) => ({
      id: key.id,
      name: key.name,
      weight: key.weight,
      visible: key.visible,
      targetPositions: key.targetPositions.slice()
    })),
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
    snapshot.id,
    snapshot.textureId ?? null
  );
  node.visible = snapshot.visible;
  node.setMaterialPalette(snapshot.materialPalette ?? []);
  node.setShapeKeys(
    (snapshot.shapeKeys ?? []).map((key) => ({
      ...key,
      visible: key.visible !== false
    }))
  );
  node.transform = validateTransform(snapshot.transform);
  node.parentId = snapshot.parentId ?? null;
  node.setModifiers(validateModifiers(snapshot.modifiers));
  return node;
}

/**
 * Encode a scene document into the versioned `.lpoli` binary container.
 *
 * The payload is a deterministic sequence of aligned typed-array columns per
 * node. The manifest carries metadata and counts; the CRC covers everything
 * after the fixed header.
 */
/**
 * Validate and normalize texture asset records for the v3 manifest.
 *
 * PNG bytes stay in payload chunks; only bounded metadata enters the manifest.
 */
function buildTextureManifest(
  assets: readonly TextureAssetRecord[]
): { manifest: TextureManifest; totalPngBytes: number } {
  if (assets.length < 1 || assets.length > MAX_TEXTURE_ASSETS) {
    throw new Error('Texture asset count is outside the supported limits.');
  }
  const assetIds = new Set<string>();
  const layerIds = new Set<string>();
  let totalPngBytes = 0;
  const manifests: TextureAssetManifest[] = assets.map((asset) => {
    if (
      typeof asset.id !== 'string' ||
      asset.id.length === 0 ||
      assetIds.has(asset.id) ||
      typeof asset.name !== 'string' ||
      asset.name.length === 0 ||
      asset.name.length > MAX_NAME_LENGTH ||
      !Number.isInteger(asset.width) ||
      !Number.isInteger(asset.height) ||
      asset.width < 1 ||
      asset.height < 1 ||
      asset.width > MAX_TEXTURE_DIMENSION ||
      asset.height > MAX_TEXTURE_DIMENSION ||
      asset.width * asset.height > MAX_TEXTURE_PIXELS ||
      (asset.filter !== 'nearest' && asset.filter !== 'linear') ||
      !Array.isArray(asset.layers) ||
      asset.layers.length < 1 ||
      asset.layers.length > MAX_TEXTURE_LAYERS
    ) {
      throw new Error('Texture asset metadata is invalid.');
    }
    assetIds.add(asset.id);
    const layers: TextureLayerManifest[] = asset.layers.map((layer) => {
      if (
        typeof layer.id !== 'string' ||
        layer.id.length === 0 ||
        layerIds.has(layer.id) ||
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
        (layer.pattern !== 'checker' && layer.pattern !== 'solid' && layer.pattern !== 'transparent') ||
        (layer.kind !== undefined &&
          layer.kind !== 'fill' &&
          layer.kind !== 'raster' &&
          layer.kind !== 'effect') ||
        !(layer.png instanceof Uint8Array) ||
        layer.png.byteLength < 1 ||
        layer.png.byteLength > MAX_TEXTURE_PNG_BYTES
      ) {
        throw new Error('Texture layer metadata is invalid.');
      }
      const effect =
        layer.kind === 'effect'
          ? normalizeTextureEffect(layer.effect)
          : null;
      if (layer.kind === 'effect' && !effect) {
        throw new Error('Texture effect layer metadata is invalid.');
      }
      layerIds.add(layer.id);
      totalPngBytes += layer.png.byteLength;
      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        color: layer.color,
        pattern: layer.pattern,
        blendMode: layer.blendMode,
        kind: layer.kind,
        role: layer.role,
        ...(effect ? { effect } : {}),
        pngLength: layer.png.byteLength
      };
    });
    if (
      asset.activeId !== null &&
      (typeof asset.activeId !== 'string' || !layers.some((layer) => layer.id === asset.activeId))
    ) {
      throw new Error('Texture asset active layer is invalid.');
    }
    return {
      id: asset.id,
      name: asset.name,
      width: asset.width,
      height: asset.height,
      filter: asset.filter,
      alphaMode: asset.alphaMode,
      activeId: asset.activeId,
      layers
    };
  });
  if (totalPngBytes > MAX_TEXTURE_PNG_BYTES * MAX_TEXTURE_LAYERS * MAX_TEXTURE_ASSETS) {
    throw new Error('Texture PNG payload is too large.');
  }
  return { manifest: { assets: manifests }, totalPngBytes };
}

function validateCamerasManifest(value: unknown): CameraSnapshot[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_CAMERAS) {
    throw new Error('The .lpoli camera manifest is invalid.');
  }
  const ids = new Set<string>();
  const cameras: CameraSnapshot[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('The .lpoli contains an invalid camera.');
    }
    const camera = raw as Partial<CameraSnapshot>;
    if (
      typeof camera.id !== 'string' ||
      camera.id.length === 0 ||
      ids.has(camera.id) ||
      typeof camera.name !== 'string' ||
      camera.name.length === 0 ||
      camera.name.length > MAX_NAME_LENGTH ||
      typeof camera.fov !== 'number' ||
      !Number.isFinite(camera.fov) ||
      camera.fov < 5 ||
      camera.fov > 160
    ) {
      throw new Error('The .lpoli contains invalid camera metadata.');
    }
    ids.add(camera.id);
    cameras.push({
      id: camera.id,
      name: camera.name,
      position: validateVec3(camera.position, 'camera position'),
      target: validateVec3(camera.target, 'camera target'),
      fov: camera.fov
    });
  }
  return cameras;
}

/** Check a finite three-component vector without allocating. */
function isVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => typeof component === 'number' && Number.isFinite(component))
  );
}

/** Validate optional camera animation tracks. */
function validateCameraAnimationTracks(
  value: unknown,
  trackIds: Set<string>
): { tracks: CameraAnimationTrackSnapshot[]; keyCount: number; trackCount: number } {
  if (value === undefined) {
    return { tracks: [], keyCount: 0, trackCount: 0 };
  }
  if (!Array.isArray(value)) {
    throw new Error('The .lpoli camera animation is invalid.');
  }
  let keyCount = 0;
  const tracks = value.map((raw) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('The .lpoli camera animation track is invalid.');
    }
    const track = raw as Partial<CameraAnimationTrackSnapshot>;
    if (
      typeof track.id !== 'string' ||
      track.id.length === 0 ||
      trackIds.has(track.id) ||
      typeof track.targetId !== 'string' ||
      track.targetId.length === 0 ||
      !Array.isArray(track.keyframes)
    ) {
      throw new Error('The .lpoli camera track metadata is invalid.');
    }
    const seenFrames = new Set<number>();
    const keyframes = track.keyframes
      .map((key) => {
        if (typeof key !== 'object' || key === null) {
          throw new Error('The .lpoli camera keyframe is invalid.');
        }
        const item = key as {
          frame?: unknown;
          position?: unknown;
          target?: unknown;
          fov?: unknown;
          interpolation?: unknown;
        };
        if (
          !Number.isInteger(item.frame) ||
          seenFrames.has(item.frame as number) ||
          !isVec3(item.position) ||
          !isVec3(item.target) ||
          typeof item.fov !== 'number' ||
          !Number.isFinite(item.fov) ||
          item.fov < 5 ||
          item.fov > 160 ||
          (item.interpolation !== 'step' && item.interpolation !== 'linear')
        ) {
          throw new Error('The .lpoli camera keyframes are invalid.');
        }
        seenFrames.add(item.frame as number);
        keyCount += 1;
        return {
          frame: item.frame as number,
          position: [...item.position] as [number, number, number],
          target: [...item.target] as [number, number, number],
          fov: item.fov,
          interpolation: item.interpolation as AnimationInterpolation
        };
      })
      .sort((a, b) => a.frame - b.frame);
    trackIds.add(track.id);
    return { id: track.id, targetId: track.targetId, keyframes };
  });
  return { tracks, keyCount, trackCount: tracks.length };
}

/** Validate optional light animation tracks. */
function validateLightAnimationTracks(
  value: unknown,
  trackIds: Set<string>
): { tracks: LightAnimationTrackSnapshot[]; keyCount: number; trackCount: number } {
  if (value === undefined) {
    return { tracks: [], keyCount: 0, trackCount: 0 };
  }
  if (!Array.isArray(value)) {
    throw new Error('The .lpoli light animation is invalid.');
  }
  let keyCount = 0;
  const tracks = value.map((raw) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('The .lpoli light animation track is invalid.');
    }
    const track = raw as Partial<LightAnimationTrackSnapshot>;
    if (
      typeof track.id !== 'string' ||
      track.id.length === 0 ||
      trackIds.has(track.id) ||
      typeof track.targetId !== 'string' ||
      track.targetId.length === 0 ||
      !Array.isArray(track.keyframes)
    ) {
      throw new Error('The .lpoli light track metadata is invalid.');
    }
    const seenFrames = new Set<number>();
    const keyframes = track.keyframes
      .map((key) => {
        if (typeof key !== 'object' || key === null) {
          throw new Error('The .lpoli light keyframe is invalid.');
        }
        const item = key as {
          frame?: unknown;
          position?: unknown;
          direction?: unknown;
          intensity?: unknown;
          interpolation?: unknown;
        };
        if (
          !Number.isInteger(item.frame) ||
          seenFrames.has(item.frame as number) ||
          !isVec3(item.position) ||
          !isVec3(item.direction) ||
          typeof item.intensity !== 'number' ||
          !Number.isFinite(item.intensity) ||
          item.intensity < 0 ||
          item.intensity > 20 ||
          (item.interpolation !== 'step' && item.interpolation !== 'linear')
        ) {
          throw new Error('The .lpoli light keyframes are invalid.');
        }
        seenFrames.add(item.frame as number);
        keyCount += 1;
        return {
          frame: item.frame as number,
          position: [...item.position] as [number, number, number],
          direction: [...item.direction] as [number, number, number],
          intensity: item.intensity,
          interpolation: item.interpolation as AnimationInterpolation
        };
      })
      .sort((a, b) => a.frame - b.frame);
    trackIds.add(track.id);
    return { id: track.id, targetId: track.targetId, keyframes };
  });
  return { tracks, keyCount, trackCount: tracks.length };
}

/** Validate optional Mesh Motion tracks and their stable vertex sets. */
function validateMeshMotionTracks(
  value: unknown,
  trackIds: Set<string>
): { tracks: MeshMotionTrackSnapshot[]; keyCount: number; trackCount: number } {
  if (value === undefined) {
    return { tracks: [], keyCount: 0, trackCount: 0 };
  }
  if (!Array.isArray(value)) {
    throw new Error('The .lpoli mesh-motion tracks are invalid.');
  }
  let keyCount = 0;
  const tracks = value.map((raw) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('The .lpoli mesh-motion track is invalid.');
    }
    const track = raw as Partial<MeshMotionTrackSnapshot>;
    if (
      typeof track.id !== 'string' ||
      track.id.length === 0 ||
      trackIds.has(track.id) ||
      typeof track.targetId !== 'string' ||
      track.targetId.length === 0 ||
      !Array.isArray(track.vertexIndices) ||
      track.vertexIndices.length > MAX_MESH_MOTION_VERTICES ||
      !Array.isArray(track.keyframes)
    ) {
      throw new Error('The .lpoli mesh-motion track metadata is invalid.');
    }
    const seenVertices = new Set<number>();
    for (const vertex of track.vertexIndices) {
      if (
        !Number.isInteger(vertex) ||
        vertex < 0 ||
        seenVertices.has(vertex)
      ) {
        throw new Error('The .lpoli mesh-motion vertex set is invalid.');
      }
      seenVertices.add(vertex);
    }
    const vertexIndices = [...track.vertexIndices].sort((a, b) => a - b);
    const expectedValues = vertexIndices.length * 3;
    const seenFrames = new Set<number>();
    const keyframes = track.keyframes
      .map((key) => {
        if (typeof key !== 'object' || key === null) {
          throw new Error('The .lpoli mesh-motion keyframe is invalid.');
        }
        const item = key as {
          frame?: unknown;
          values?: unknown;
          interpolation?: unknown;
        };
        if (
          !Number.isInteger(item.frame) ||
          seenFrames.has(item.frame as number) ||
          !Array.isArray(item.values) ||
          item.values.length !== expectedValues ||
          !item.values.every(
            (entry) => typeof entry === 'number' && Number.isFinite(entry)
          ) ||
          (item.interpolation !== 'step' && item.interpolation !== 'linear')
        ) {
          throw new Error('The .lpoli mesh-motion keyframes are invalid.');
        }
        seenFrames.add(item.frame as number);
        keyCount += 1;
        return {
          frame: item.frame as number,
          values: item.values as number[],
          interpolation: item.interpolation as AnimationInterpolation
        };
      })
      .sort((a, b) => a.frame - b.frame);
    trackIds.add(track.id);
    return {
      id: track.id,
      targetId: track.targetId,
      vertexIndices,
      keyframes
    };
  });
  return { tracks, keyCount, trackCount: tracks.length };
}

/** Validate v6 clip animation or migrate a legacy flat animation manifest. */
function validateAnimationManifest(value: unknown): AnimationSnapshot | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error('The .lpoli animation manifest is invalid.');
  }
  const animation = value as Partial<AnimationSnapshot> & {
    clips?: unknown;
    activeClipId?: unknown;
  };
  if (!Array.isArray(animation.clips)) {
    return validateLegacyAnimationManifest(value);
  }
  if (
    animation.clips.length < 1 ||
    animation.clips.length > MAX_ANIMATION_CLIPS ||
    typeof animation.fps !== 'number' ||
    !Number.isFinite(animation.fps) ||
    animation.fps < 1 ||
    animation.fps > 120
  ) {
    throw new Error('The .lpoli animation clips are invalid.');
  }
  const clipIds = new Set<string>();
  const trackIds = new Set<string>();
  const weightTrackIds = new Set<string>();
  let totalTracks = 0;
  let totalKeys = 0;
  const clips = animation.clips.map((raw) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('The .lpoli animation contains an invalid clip.');
    }
    const clip = raw as Partial<AnimationClipSnapshot>;
    if (
      typeof clip.id !== 'string' ||
      clip.id.length === 0 ||
      clipIds.has(clip.id) ||
      typeof clip.name !== 'string' ||
      clip.name.length === 0 ||
      clip.name.length > MAX_NAME_LENGTH ||
      !Number.isInteger(clip.startFrame) ||
      !Number.isInteger(clip.endFrame) ||
      (clip.startFrame as number) < 0 ||
      (clip.endFrame as number) < (clip.startFrame as number) ||
      !Array.isArray(clip.tracks)
    ) {
      throw new Error('The .lpoli animation clip metadata is invalid.');
    }
    clipIds.add(clip.id);
    const validated = validateLegacyAnimationManifest({
      fps: animation.fps,
      startFrame: clip.startFrame,
      endFrame: clip.endFrame,
      tracks: clip.tracks,
      weightTracks: clip.weightTracks
    });
    if (!validated) {
      throw new Error('The .lpoli animation clip could not be validated.');
    }
    const clipTracks = validated.tracks ?? [];
    totalTracks +=
      clipTracks.length + (validated.weightTracks?.length ?? 0);
    totalKeys +=
      clipTracks.reduce((sum, track) => sum + track.keyframes.length, 0) +
      (validated.weightTracks ?? []).reduce(
        (sum, track) => sum + track.keyframes.length,
        0
      );
    for (const track of clipTracks) {
      if (trackIds.has(track.id)) {
        throw new Error('The .lpoli animation track ids must be unique.');
      }
      trackIds.add(track.id);
    }
    for (const track of validated.weightTracks ?? []) {
      if (weightTrackIds.has(track.id)) {
        throw new Error('The .lpoli shape-weight track ids must be unique.');
      }
      weightTrackIds.add(track.id);
    }
    const motion = validateMeshMotionTracks(clip.meshTracks, trackIds);
    const cameras = validateCameraAnimationTracks(clip.cameraTracks, trackIds);
    const lights = validateLightAnimationTracks(clip.lightTracks, trackIds);
    totalTracks += motion.trackCount + cameras.trackCount + lights.trackCount;
    totalKeys += motion.keyCount + cameras.keyCount + lights.keyCount;
    return {
      id: clip.id,
      name: clip.name,
      startFrame: validated.startFrame as number,
      endFrame: validated.endFrame as number,
      tracks: clipTracks,
      weightTracks: validated.weightTracks ?? [],
      meshTracks: motion.tracks,
      cameraTracks: cameras.tracks,
      lightTracks: lights.tracks
    };
  });
  if (
    totalTracks > MAX_ANIMATION_TRACKS ||
    totalKeys > MAX_ANIMATION_KEYS
  ) {
    throw new Error('The .lpoli animation exceeds its clip limits.');
  }
  const activeClipId =
    typeof animation.activeClipId === 'string' &&
    clipIds.has(animation.activeClipId)
      ? animation.activeClipId
      : clips[0].id;
  return { fps: animation.fps, activeClipId, clips };
}

function validateLegacyAnimationManifest(
  value: unknown
): AnimationSnapshot | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error('The .lpoli animation manifest is invalid.');
  }
  const animation = value as Partial<AnimationSnapshot>;
  const fps = typeof animation.fps === 'number' ? animation.fps : NaN;
  const startFrame =
    typeof animation.startFrame === 'number' ? animation.startFrame : NaN;
  const endFrame =
    typeof animation.endFrame === 'number' ? animation.endFrame : NaN;
  if (
    !Number.isFinite(fps) ||
    fps < 1 ||
    fps > 120 ||
    !Number.isInteger(startFrame) ||
    !Number.isInteger(endFrame) ||
    startFrame < 0 ||
    endFrame < startFrame ||
    !Array.isArray(animation.tracks) ||
    animation.tracks.length > MAX_ANIMATION_TRACKS
  ) {
    throw new Error('The .lpoli animation settings are invalid.');
  }
  const trackIds = new Set<string>();
  const targetIds = new Set<string>();
  let keyTotal = 0;
  const tracks = animation.tracks.map((track) => {
    if (typeof track !== 'object' || track === null) {
      throw new Error('The .lpoli animation contains an invalid track.');
    }
    const raw = track as {
      id?: unknown;
      targetId?: unknown;
      targetKind?: unknown;
      keyframes?: unknown;
    };
    if (
      typeof raw.id !== 'string' ||
      raw.id.length === 0 ||
      trackIds.has(raw.id) ||
      typeof raw.targetId !== 'string' ||
      raw.targetId.length === 0 ||
      targetIds.has(raw.targetId) ||
      (raw.targetKind !== 'node' && raw.targetKind !== 'group') ||
      !Array.isArray(raw.keyframes)
    ) {
      throw new Error('The .lpoli animation contains invalid track metadata.');
    }
    trackIds.add(raw.id);
    targetIds.add(raw.targetId);
    const frames = new Set<number>();
    const keyframes = raw.keyframes.map((key) => {
      if (typeof key !== 'object' || key === null) {
        throw new Error('The .lpoli animation contains an invalid keyframe.');
      }
      const item = key as {
        frame?: unknown;
        interpolation?: unknown;
        transform?: unknown;
      };
      if (
        !Number.isInteger(item.frame) ||
        frames.has(item.frame as number) ||
        (item.interpolation !== 'step' && item.interpolation !== 'linear')
      ) {
        throw new Error('The .lpoli animation contains invalid keyframes.');
      }
      frames.add(item.frame as number);
      keyTotal += 1;
      return {
        frame: item.frame as number,
        transform: validateTransform(item.transform),
        interpolation: item.interpolation as AnimationInterpolation
      };
    }).sort((a, b) => a.frame - b.frame);
    return {
      id: raw.id,
      targetId: raw.targetId,
      targetKind: raw.targetKind as AnimationTargetKind,
      keyframes
    };
  });
  if (keyTotal > MAX_ANIMATION_KEYS) {
    throw new Error('The .lpoli animation contains too many keyframes.');
  }
  const rawWeightTracks = (animation as Partial<AnimationSnapshot>).weightTracks;
  if (rawWeightTracks !== undefined && !Array.isArray(rawWeightTracks)) {
    throw new Error('The .lpoli shape-weight animation is invalid.');
  }
  const weightIds = new Set<string>();
  const weightPairs = new Set<string>();
  const weightTracks: ShapeWeightTrackSnapshot[] = [];
  for (const value of rawWeightTracks ?? []) {
    if (typeof value !== 'object' || value === null) {
      throw new Error('The .lpoli animation contains an invalid weight track.');
    }
    const raw = value as {
      id?: unknown;
      targetId?: unknown;
      shapeKeyId?: unknown;
      keyframes?: unknown;
    };
    if (
      typeof raw.id !== 'string' ||
      raw.id.length === 0 ||
      weightIds.has(raw.id) ||
      typeof raw.targetId !== 'string' ||
      raw.targetId.length === 0 ||
      typeof raw.shapeKeyId !== 'string' ||
      raw.shapeKeyId.length === 0 ||
      weightPairs.has(`${raw.targetId}:${raw.shapeKeyId}`) ||
      !Array.isArray(raw.keyframes)
    ) {
      throw new Error('The .lpoli shape-weight track metadata is invalid.');
    }
    weightIds.add(raw.id);
    weightPairs.add(`${raw.targetId}:${raw.shapeKeyId}`);
    const frames = new Set<number>();
    const keyframes = raw.keyframes.map((key) => {
      if (typeof key !== 'object' || key === null) {
        throw new Error('The .lpoli shape-weight keyframe is invalid.');
      }
      const item = key as {
        frame?: unknown;
        weight?: unknown;
        interpolation?: unknown;
      };
      if (
        !Number.isInteger(item.frame) ||
        frames.has(item.frame as number) ||
        typeof item.weight !== 'number' ||
        !Number.isFinite(item.weight) ||
        item.weight < 0 ||
        item.weight > 1 ||
        (item.interpolation !== 'step' && item.interpolation !== 'linear')
      ) {
        throw new Error('The .lpoli shape-weight keyframes are invalid.');
      }
      frames.add(item.frame as number);
      keyTotal += 1;
      return {
        frame: item.frame as number,
        weight: item.weight,
        interpolation: item.interpolation as AnimationInterpolation
      };
    }).sort((a, b) => a.frame - b.frame);
    weightTracks.push({
      id: raw.id,
      targetId: raw.targetId,
      shapeKeyId: raw.shapeKeyId,
      keyframes
    });
  }
  if (
    keyTotal > MAX_ANIMATION_KEYS ||
    tracks.length + weightTracks.length > MAX_ANIMATION_TRACKS
  ) {
    throw new Error('The .lpoli animation exceeds its track or key limit.');
  }
  return { fps, startFrame, endFrame, tracks, weightTracks };
}

/** Encode a project with a texture asset library. */
export function encodeLpoly(
  document: SceneDocument,
  settings: ProjectSettings,
  textures: readonly TextureAssetRecord[] | null = null
): Uint8Array {
  return encodeInternal(document, settings, textures);
}

function encodeInternal(
  document: SceneDocument,
  settings: ProjectSettings,
  textures: readonly TextureAssetRecord[] | null
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
    textureId: node.textureId,
    materialPalette: node.materialPalette,
    shapeKeys: node.shapeKeys.map((key) => ({
      id: key.id,
      name: key.name,
      weight: key.weight,
      visible: key.visible,
      vertexCount: node.mesh.vertexCount
    })),
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
    version: FORMAT_VERSION,
    settings,
    nodes: manifestNodes,
    groups: manifestGroups,
    cameras: document.cameras.map((camera) => camera.snapshot()),
    animation: document.animation.snapshot(),
    lighting: {
      ambientColor: document.ambientColor,
      ambientIntensity: document.ambientIntensity,
      lights: document.lights.map((light) => light.snapshot())
    },
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
    for (const key of node.shapeKeys) {
      const padding = (4 - (payloadLength % 4)) % 4;
      if (padding > 0) {
        chunks.push(new Uint8Array(padding));
        payloadLength += padding;
      }
      const bytes = new Uint8Array(
        key.targetPositions.buffer,
        key.targetPositions.byteOffset,
        key.targetPositions.byteLength
      );
      chunks.push(bytes);
      payloadLength += bytes.byteLength;
    }
  }
  if (textures) {
    for (const asset of textures) {
      for (const layer of asset.layers) {
        const padding = (4 - (payloadLength % 4)) % 4;
        if (padding > 0) {
          chunks.push(new Uint8Array(padding));
          payloadLength += padding;
        }
        chunks.push(layer.png);
        payloadLength += layer.png.byteLength;
      }
    }
  }

  const trailingPadding = (4 - (payloadLength % 4)) % 4;
  if (trailingPadding > 0) {
    chunks.push(new Uint8Array(trailingPadding));
    payloadLength += trailingPadding;
  }
  const payloadStart = align4(HEADER_BYTES + manifestBytes.length);
  const totalLength = payloadStart + payloadLength;
  if (totalLength > MAX_FILE_BYTES) {
    throw new Error('Project is too large for the current .lpoli limit.');
  }

  const file = new Uint8Array(totalLength);
  file.set(MAGIC, 0);
  const view = new DataView(file.buffer);
  view.setUint16(8, FORMAT_VERSION, true);
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
    throw new Error('The .lpoli texture manifest is invalid.');
  }
  const texture = value as Partial<TextureManifest>;
  if (
    !Array.isArray(texture.assets) ||
    texture.assets.length < 1 ||
    texture.assets.length > MAX_TEXTURE_ASSETS
  ) {
    throw new Error('The .lpoli texture asset count is invalid.');
  }
  const assetIds = new Set<string>();
  const layerIds = new Set<string>();
  const assets: TextureAssetManifest[] = texture.assets.map((rawAsset) => {
    if (typeof rawAsset !== 'object' || rawAsset === null) {
      throw new Error('The .lpoli contains an invalid texture asset.');
    }
    const asset = rawAsset as Partial<TextureAssetManifest>;
    if (
      typeof asset.id !== 'string' ||
      asset.id.length === 0 ||
      assetIds.has(asset.id) ||
      typeof asset.name !== 'string' ||
      asset.name.length === 0 ||
      asset.name.length > MAX_NAME_LENGTH ||
      !Number.isInteger(asset.width) ||
      !Number.isInteger(asset.height) ||
      (asset.width as number) < 1 ||
      (asset.height as number) < 1 ||
      (asset.width as number) > MAX_TEXTURE_DIMENSION ||
      (asset.height as number) > MAX_TEXTURE_DIMENSION ||
      (asset.width as number) * (asset.height as number) > MAX_TEXTURE_PIXELS ||
      (asset.filter !== 'nearest' && asset.filter !== 'linear') ||
      !Array.isArray(asset.layers) ||
      asset.layers.length < 1 ||
      asset.layers.length > MAX_TEXTURE_LAYERS
    ) {
      throw new Error('The .lpoli texture asset metadata is invalid.');
    }
    assetIds.add(asset.id);
    const layers: TextureLayerManifest[] = asset.layers.map((raw) => {
      if (typeof raw !== 'object' || raw === null) {
        throw new Error('The .lpoli contains an invalid texture layer.');
      }
      const layer = raw as Partial<TextureLayerManifest>;
      if (
        typeof layer.id !== 'string' ||
        layer.id.length === 0 ||
        layerIds.has(layer.id) ||
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
        (layer.pattern !== 'checker' && layer.pattern !== 'solid' && layer.pattern !== 'transparent') ||
        (layer.kind !== undefined &&
          layer.kind !== 'fill' &&
          layer.kind !== 'raster' &&
          layer.kind !== 'effect') ||
        (layer.role !== undefined &&
          layer.role !== 'color' &&
          layer.role !== 'detail' &&
          layer.role !== 'lighting') ||
        (layer.blendMode !== undefined &&
          layer.blendMode !== 'normal' &&
          layer.blendMode !== 'multiply' &&
          layer.blendMode !== 'screen') ||
        (layer.kind === 'effect' && !normalizeTextureEffect(layer.effect)) ||
        !Number.isInteger(layer.pngLength) ||
        (layer.pngLength as number) < 1 ||
        (layer.pngLength as number) > MAX_TEXTURE_PNG_BYTES
      ) {
        throw new Error('The .lpoli texture layer metadata is invalid.');
      }
      layerIds.add(layer.id);
      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        color: layer.color,
        pattern: layer.pattern,
        blendMode: layer.blendMode ?? 'normal',
        kind:
          layer.kind === 'raster'
            ? 'raster'
            : layer.kind === 'effect'
              ? 'effect'
              : 'fill',
        role: layer.role === 'lighting' || layer.role === 'detail' ? layer.role : 'color',
        effect:
          layer.kind === 'effect'
            ? normalizeTextureEffect(layer.effect)
            : null,
        pngLength: layer.pngLength as number
      };
    });
    if (
      asset.activeId !== null &&
      (typeof asset.activeId !== 'string' ||
        !layers.some((layer) => layer.id === asset.activeId))
    ) {
      throw new Error('The .lpoli active texture layer is invalid.');
    }
    return {
      id: asset.id,
      name: asset.name,
      width: asset.width as number,
      height: asset.height as number,
      filter: asset.filter,
      alphaMode: asset.alphaMode === 'cutout' || asset.alphaMode === 'blend' ? asset.alphaMode : 'opaque',
      activeId: asset.activeId,
      layers
    };
  });
  return { assets };
}

/** Decode and fully validate a versioned `.lpoli` container. */
export function decodeLpoly(bytes: Uint8Array): DecodedProject {
  if (bytes.byteLength < HEADER_BYTES) {
    throw new Error('This file is too short to be a .lpoli project.');
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error('This .lpoli project exceeds the supported size limit.');
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (bytes[i] !== MAGIC[i]) {
      throw new Error('This is not a loupoli .lpoli project.');
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(8, true);
  if (version < MIN_SUPPORTED_VERSION || version > FORMAT_VERSION) {
    throw new Error(
      `Unsupported .lpoli version ${version}; expected ${MIN_SUPPORTED_VERSION}–${FORMAT_VERSION}.`
    );
  }
  const manifestLength = view.getUint32(12, true);
  const payloadLength = view.getUint32(16, true);
  const expectedCrc = view.getUint32(20, true);
  const payloadStart = align4(HEADER_BYTES + manifestLength);
  if (payloadStart + payloadLength !== bytes.byteLength) {
    throw new Error('The .lpoli file length does not match its header.');
  }
  if (crc32(bytes.subarray(HEADER_BYTES)) !== expectedCrc) {
    throw new Error('The .lpoli checksum failed; the file may be corrupted.');
  }

  const manifestText = new TextDecoder().decode(
    bytes.subarray(HEADER_BYTES, HEADER_BYTES + manifestLength)
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch {
    throw new Error('The .lpoli manifest is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('The .lpoli manifest is invalid.');
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
    throw new Error('The .lpoli manifest has an unsupported structure.');
  }
  const textureManifest =
    manifest.textures !== undefined
      ? validateTextureManifest(manifest.textures)
      : null;
  const textureAssetIds = new Set(
    textureManifest?.assets.map((asset) => asset.id) ?? []
  );
  const settings = manifest.settings as Partial<ProjectSettings>;
  if (
    !isShadingMode(settings.shading) ||
    typeof settings.ps1Snap !== 'boolean' ||
    typeof settings.ps1Affine !== 'boolean'
  ) {
    throw new Error('The .lpoli viewport settings are invalid.');
  }

  const document = new SceneDocument();
  let cursor = payloadStart;
  const seen = new Set<string>();
  const groupIds = new Set<string>();
  const groups: SceneGroup[] = [];

  for (const rawGroup of manifest.groups ?? []) {
    if (typeof rawGroup !== 'object' || rawGroup === null) {
      throw new Error('The .lpoli contains an invalid group.');
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
      throw new Error('The .lpoli contains invalid group metadata.');
    }
    groupIds.add(group.id);
    const restoredGroup = new SceneGroup(group.name, group.id);
    restoredGroup.visible = group.visible;
    restoredGroup.transform = validateTransform(group.transform);
    groups.push(restoredGroup);
  }

  for (const rawNode of manifest.nodes) {
    if (typeof rawNode !== 'object' || rawNode === null) {
      throw new Error('The .lpoli contains an invalid node.');
    }
    const node = rawNode as Partial<NodeManifest>;
    const counts = validateMeshCounts(node.mesh);
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
          !groupIds.has(node.parentId))) ||
      (node.textureId !== undefined &&
        node.textureId !== null &&
        (typeof node.textureId !== 'string' ||
          !textureAssetIds.has(node.textureId))) ||
      (node.materialPalette !== undefined &&
        (!Array.isArray(node.materialPalette) ||
          node.materialPalette.length > 64 ||
          node.materialPalette.some(
            (color) => typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)
          ))) ||
      (node.shapeKeys !== undefined &&
        (!Array.isArray(node.shapeKeys) ||
          node.shapeKeys.length > MAX_SHAPE_KEYS ||
          node.shapeKeys.some(
            (key) =>
              typeof key.id !== 'string' ||
              key.id.length === 0 ||
              typeof key.name !== 'string' ||
              key.name.length === 0 ||
              key.name.length > MAX_NAME_LENGTH ||
              typeof key.weight !== 'number' ||
              !Number.isFinite(key.weight) ||
              key.weight < 0 ||
              key.weight > 1 ||
              (key.visible !== undefined && typeof key.visible !== 'boolean') ||
              key.vertexCount !== counts.vertexCount
          )))
    ) {
      throw new Error('The .lpoli contains invalid node metadata.');
    }
    seen.add(node.id);
    const transform = validateTransform(node.transform);
    const meshBytes: Partial<Record<TypedColumnKey, unknown>> = {};

    for (const column of TYPED_COLUMNS) {
      const padding = (4 - (cursor % 4)) % 4;
      cursor += padding;
      const count = column.length(counts);
      const Type = column.Type;
      const byteLength = count * Type.BYTES_PER_ELEMENT;
      if (cursor + byteLength > bytes.byteLength) {
        throw new Error('The .lpoli payload ended inside a mesh column.');
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
    restored.textureId = node.textureId ?? null;
    restored.setMaterialPalette(node.materialPalette ?? []);
    if (node.shapeKeys && node.shapeKeys.length > 0) {
      const keys = [];
      for (const key of node.shapeKeys) {
        const padding = (4 - (cursor % 4)) % 4;
        cursor += padding;
        const byteLength = key.vertexCount * 3 * 4;
        if (
          cursor + byteLength > bytes.byteLength ||
          cursor + byteLength > payloadStart + payloadLength
        ) {
          throw new Error('The .lpoli payload ended inside shape-key data.');
        }
        const targetPositions = new Float32Array(key.vertexCount * 3);
        new Uint8Array(targetPositions.buffer).set(
          bytes.subarray(cursor, cursor + byteLength)
        );
        cursor += byteLength;
        keys.push({
          id: key.id,
          name: key.name,
          weight: key.weight,
          visible: key.visible ?? true,
          targetPositions
        });
      }
      restored.setShapeKeys(keys);
    }
    restored.setModifiers(validateModifiers(node.modifiers));
    document.insertNode(restored);
  }

  for (const group of groups) {
    document.insertGroup(group);
  }

  const cameras = validateCamerasManifest(manifest.cameras);
  if (cameras.length === 0) {
    document.insertCamera(SceneCamera.default());
  } else {
    for (const snapshot of cameras) {
      document.insertCamera(SceneCamera.fromSnapshot(snapshot));
    }
  }

  const animation = validateAnimationManifest(manifest.animation);
  if (animation) {
    document.animation.apply(animation);
  }

  const lighting = validateLightingManifest(manifest.lighting, version);
  if (lighting) {
    document.ambientColor = lighting.ambientColor;
    document.ambientIntensity = lighting.ambientIntensity;
    for (const snapshot of lighting.lights) {
      document.insertLight(
        SceneLight.fromSnapshot({
          ...snapshot,
          castShadows: snapshot.castShadows ?? true,
          shadowSoftness: snapshot.shadowSoftness ?? 0.35
        })
      );
    }
  } else {
    // v3 projects predate the light model; keep Lit readable with the default sun.
    document.insertLight(SceneLight.sun());
  }

  let textures: TextureAssetRecord[] | undefined;
  if (textureManifest) {
    const assets: TextureAssetRecord[] = [];
    for (const asset of textureManifest.assets) {
      const layers: TextureLayerRecord[] = [];
      for (const layer of asset.layers) {
        const padding = (4 - (cursor % 4)) % 4;
        cursor += padding;
        if (
          cursor + layer.pngLength > bytes.byteLength ||
          cursor + layer.pngLength > payloadStart + payloadLength
        ) {
          throw new Error('The .lpoli payload ended inside a texture PNG chunk.');
        }
        layers.push({
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          color: layer.color,
          pattern: layer.pattern,
          blendMode: layer.blendMode ?? 'normal',
          kind: layer.kind ?? 'fill',
          role: layer.role === 'lighting' || layer.role === 'detail' ? layer.role : 'color',
          effect:
            layer.kind === 'effect'
              ? normalizeTextureEffect(layer.effect)
              : null,
          png: bytes.slice(cursor, cursor + layer.pngLength)
        });
        cursor += layer.pngLength;
      }
      assets.push({
        id: asset.id,
        name: asset.name,
        width: asset.width,
        height: asset.height,
        filter: asset.filter,
        alphaMode: asset.alphaMode ?? 'opaque',
        activeId: asset.activeId,
        layers
      });
    }
    textures = assets;
  }

  const alignedEnd = align4(cursor);
  if (alignedEnd !== bytes.byteLength) {
    throw new Error('The .lpoli payload has trailing or missing bytes.');
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
