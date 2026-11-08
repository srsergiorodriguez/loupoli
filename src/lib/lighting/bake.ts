import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { MeshNode } from '../scene/MeshNode';
import type { LightSummary } from '../scene/SceneLight';
import type { SceneGroup } from '../scene/SceneGroup';
import type { HalfEdgeMesh } from '../geometry/HalfEdgeMesh';
import { bleedImageData } from '../texture/bleed';
import type { AmbientOcclusionSettings } from './ao';

/** Direct-light bake inputs, including optional world-space shadow occluders. */
export interface BakeLightingInput {
  readonly mesh: HalfEdgeMesh;
  readonly node: MeshNode;
  readonly parent: SceneGroup | null;
  readonly lights: readonly LightSummary[];
  readonly ambientColor: string;
  readonly ambientIntensity: number;
  readonly width: number;
  readonly height: number;
  /** World-space triangle lists used for hard shadow rays. */
  readonly occluders?: readonly Float32Array[];
  /** Soft-shadow visibility rays per light. Defaults to 8. */
  readonly shadowSamples?: number;
  /** Optional ambient-occlusion pass multiplied into the direct bake. */
  readonly ambientOcclusion?: AmbientOcclusionSettings;
}

/** Cooperative progress/cancellation hooks for long CPU bakes. */
export interface BakeLightingOptions {
  readonly onProgress?: (completed: number, total: number) => void;
  readonly shouldCancel?: () => boolean;
}

/** Thrown when a caller cancels an in-flight bake. */
export class BakeCancelledError extends Error {
  constructor() {
    super('Bake cancelled');
    this.name = 'BakeCancelledError';
  }
}

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function srgbToLinear(value: number): number {
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function parseColor(value: string): Rgb {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value)?.[1] ?? 'ffffff';
  return {
    r: srgbToLinear(parseInt(hex.slice(0, 2), 16) / 255),
    g: srgbToLinear(parseInt(hex.slice(2, 4), 16) / 255),
    b: srgbToLinear(parseInt(hex.slice(4, 6), 16) / 255)
  };
}

function maxZero(value: number): number {
  return value > 0 ? value : 0;
}

function positionAt(
  mesh: HalfEdgeMesh,
  halfEdge: number,
  matrix: Matrix4
): Vector3 {
  const vertex = mesh.heOrigin[halfEdge];
  const x = mesh.positions[vertex * 3];
  const y = mesh.positions[vertex * 3 + 1];
  const z = mesh.positions[vertex * 3 + 2];
  return new Vector3(x, y, z).applyMatrix4(matrix);
}


/**
 * Decide whether a closed mesh's authored winding needs a global inversion.
 *
 * Per-face center tests are unsafe on concave meshes: an inner face can point
 * toward the average center while still being an outward surface. Signed
 * volume tests the whole closed shell instead, so concavities preserve their
 * authored normals. Open meshes keep authored winding because volume is not
 * meaningful for them.
 */
export function bakeNormalSign(mesh: HalfEdgeMesh, matrix: Matrix4): 1 | -1 {
  if (mesh.boundaryEdgeCount > 0) {
    return 1;
  }
  let volume = 0;
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const first = mesh.faceHalfEdge[face];
    const loop: number[] = [];
    let halfEdge = first;
    do {
      loop.push(halfEdge);
      halfEdge = mesh.heNext[halfEdge];
    } while (halfEdge !== first && loop.length < 64);
    if (loop.length < 3) {
      continue;
    }
    const a = positionAt(mesh, loop[0], matrix);
    for (let corner = 1; corner < loop.length - 1; corner += 1) {
      const b = positionAt(mesh, loop[corner], matrix);
      const c = positionAt(mesh, loop[corner + 1], matrix);
      volume += a.dot(new Vector3().crossVectors(b, c)) / 6;
    }
  }
  return volume < -1e-8 ? -1 : 1;
}

/**
 * Detect overlapping UV faces with a conservative coverage raster.
 *
 * Face interiors are sampled at 512²; shared UV edges are excluded by a small
 * barycentric epsilon. This catches local overlaps that total UV area alone
 * misses while avoiding false positives on adjacent islands.
 */
export function hasUvOverlap(mesh: HalfEdgeMesh, resolution = 512): boolean {
  const size = Math.max(32, Math.floor(resolution));
  const occupied = new Uint8Array(size * size);
  const stamp = new Uint32Array(size * size);
  const edgeEpsilon = 1e-4;

  for (let face = 0; face < mesh.faceCount; face += 1) {
    const first = mesh.faceHalfEdge[face];
    const loop: number[] = [];
    let h = first;
    do {
      loop.push(h);
      h = mesh.heNext[h];
    } while (h !== first && loop.length < 64);
    if (loop.length < 3) {
      continue;
    }
    const uv = loop.map((edge) => [
      mesh.heUv[edge * 2],
      mesh.heUv[edge * 2 + 1]
    ] as const);
    const faceStamp = face + 1;
    for (let triangle = 1; triangle < uv.length - 1; triangle += 1) {
      const [x0, y0] = uv[0];
      const [x1, y1] = uv[triangle];
      const [x2, y2] = uv[triangle + 1];
      const denominator = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(denominator) < 1e-10) {
        continue;
      }
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2) * size));
      const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2) * size));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2) * size));
      const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2) * size));
      for (let y = minY; y <= maxY; y += 1) {
        const sampleY = (y + 0.5) / size;
        for (let x = minX; x <= maxX; x += 1) {
          const sampleX = (x + 0.5) / size;
          const a =
            ((y1 - y2) * (sampleX - x2) + (x2 - x1) * (sampleY - y2)) /
            denominator;
          const b =
            ((y2 - y0) * (sampleX - x2) + (x0 - x2) * (sampleY - y2)) /
            denominator;
          const c = 1 - a - b;
          if (a <= edgeEpsilon || b <= edgeEpsilon || c <= edgeEpsilon) {
            continue;
          }
          const index = y * size + x;
          if (stamp[index] === faceStamp) {
            continue;
          }
          if (occupied[index] !== 0) {
            return true;
          }
          stamp[index] = faceStamp;
          occupied[index] = 1;
        }
      }
    }
  }
  return false;
}

/** Sum of absolute source-face UV areas; values above 1 imply overlap. */
export function uvCoverage(mesh: HalfEdgeMesh): number {
  let area = 0;
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const first = mesh.faceHalfEdge[face];
    const loop: number[] = [];
    let h = first;
    do {
      loop.push(h);
      h = mesh.heNext[h];
    } while (h !== first && loop.length < 64);
    if (loop.length < 3) {
      continue;
    }
    const x0 = mesh.heUv[loop[0] * 2];
    const y0 = mesh.heUv[loop[0] * 2 + 1];
    for (let i = 1; i < loop.length - 1; i += 1) {
      const x1 = mesh.heUv[loop[i] * 2];
      const y1 = mesh.heUv[loop[i] * 2 + 1];
      const x2 = mesh.heUv[loop[i + 1] * 2];
      const y2 = mesh.heUv[loop[i + 1] * 2 + 1];
      area += Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2;
    }
  }
  return area;
}

/** Scalar Möller-Trumbore ray/triangle test for hard shadow rays. */
function rayHitsTriangle(
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  maxDistance: number
): boolean {
  const edge1X = bx - ax;
  const edge1Y = by - ay;
  const edge1Z = bz - az;
  const edge2X = cx - ax;
  const edge2Y = cy - ay;
  const edge2Z = cz - az;
  const pX = directionY * edge2Z - directionZ * edge2Y;
  const pY = directionZ * edge2X - directionX * edge2Z;
  const pZ = directionX * edge2Y - directionY * edge2X;
  const determinant = edge1X * pX + edge1Y * pY + edge1Z * pZ;
  if (Math.abs(determinant) < 1e-9) {
    return false;
  }
  const inverse = 1 / determinant;
  const tX = originX - ax;
  const tY = originY - ay;
  const tZ = originZ - az;
  const u = (tX * pX + tY * pY + tZ * pZ) * inverse;
  if (u < 0 || u > 1) {
    return false;
  }
  const qX = tY * edge1Z - tZ * edge1Y;
  const qY = tZ * edge1X - tX * edge1Z;
  const qZ = tX * edge1Y - tY * edge1X;
  const v = (directionX * qX + directionY * qY + directionZ * qZ) * inverse;
  if (v < 0 || u + v > 1) {
    return false;
  }
  const distance = (edge2X * qX + edge2Y * qY + edge2Z * qZ) * inverse;
  return distance > 1e-4 && distance < maxDistance;
}

/** Test a shadow ray against all visible world-space scene triangles. */
function rayOccluded(
  origin: Vector3,
  direction: Vector3,
  maxDistance: number,
  occluders: readonly Float32Array[]
): boolean {
  for (const triangles of occluders) {
    for (let offset = 0; offset + 8 < triangles.length; offset += 9) {
      if (
        rayHitsTriangle(
          origin.x,
          origin.y,
          origin.z,
          direction.x,
          direction.y,
          direction.z,
          triangles[offset],
          triangles[offset + 1],
          triangles[offset + 2],
          triangles[offset + 3],
          triangles[offset + 4],
          triangles[offset + 5],
          triangles[offset + 6],
          triangles[offset + 7],
          triangles[offset + 8],
          maxDistance
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Lambert BRDF scale used by the viewport's MeshLambertMaterial. */
const LAMBERT_BRDF = 1 / Math.PI;

function tangentBasis(axis: Vector3): [Vector3, Vector3] {
  const helper =
    Math.abs(axis.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
  const u = new Vector3().crossVectors(axis, helper).normalize();
  const v = new Vector3().crossVectors(axis, u).normalize();
  return [u, v];
}

/** Deterministic cheap hash for stable AO sample directions. */
function hashNoise(x: number, y: number, seed: number): number {
  let value =
    Math.imul(x + 1, 374761393) ^
    Math.imul(y + 1, 668265263) ^
    Math.imul(seed + 1, 69069);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** Cosine-weighted hemisphere visibility at one surface texel. */
export function ambientVisibility(
  origin: Vector3,
  normal: Vector3,
  settings: AmbientOcclusionSettings,
  occluders: readonly Float32Array[],
  seed: number
): number {
  if (occluders.length === 0) {
    return 1;
  }
  const samples = Math.max(4, Math.min(32, Math.round(settings.samples)));
  const distance = Math.max(0.01, settings.distance);
  const bias = Math.max(0, settings.bias);
  const [u, v] = tangentBasis(normal);
  const biased = origin.clone().addScaledVector(normal, bias);
  let visible = 0;
  for (let index = 0; index < samples; index += 1) {
    const radial = Math.sqrt(hashNoise(seed, index, 17));
    const angle = hashNoise(seed, index, 41) * Math.PI * 2;
    const vertical = Math.sqrt(Math.max(0, 1 - radial * radial));
    const direction = normal
      .clone()
      .multiplyScalar(vertical)
      .addScaledVector(u, Math.cos(angle) * radial)
      .addScaledVector(v, Math.sin(angle) * radial)
      .normalize();
    if (!rayOccluded(biased, direction, distance, occluders)) {
      visible += 1;
    }
  }
  return visible / samples;
}

/**
 * Build one soft-shadow sample for a light.
 *
 * Directional lights sample a small cone around their direction; point lights
 * sample a small disk around their position. A zero softness uses the exact
 * hard-light ray.
 */
function shadowRayForSample(
  light: {
    readonly kind: 'directional' | 'point';
    readonly direction: Vector3;
    readonly position: Vector3;
    readonly shadowSoftness: number;
  },
  origin: Vector3,
  sampleIndex: number,
  sampleCount: number,
  angleOffset: number
): { direction: Vector3; maxDistance: number } | null {
  const softness = Math.max(0, Math.min(1, light.shadowSoftness));
  if (light.kind === 'directional') {
    const base = light.direction.clone().multiplyScalar(-1).normalize();
    if (softness <= 0 || sampleCount <= 1) {
      return { direction: base, maxDistance: Infinity };
    }
    const [u, v] = tangentBasis(base);
    const radius = Math.tan(softness * 0.35) * Math.sqrt((sampleIndex + 0.5) / sampleCount);
    const angle = sampleIndex * GOLDEN_ANGLE + angleOffset;
    return {
      direction: base
        .addScaledVector(u, Math.cos(angle) * radius)
        .addScaledVector(v, Math.sin(angle) * radius)
        .normalize(),
      maxDistance: Infinity
    };
  }

  const toLight = light.position.clone().sub(origin);
  const distance = toLight.length();
  if (distance < 1e-4) {
    return null;
  }
  if (softness <= 0 || sampleCount <= 1) {
    return {
      direction: toLight.multiplyScalar(1 / distance),
      maxDistance: distance
    };
  }
  const base = toLight.multiplyScalar(1 / distance);
  const [u, v] = tangentBasis(base);
  const sourceRadius = Math.min(distance * 0.8, softness * 1.5);
  const radius = sourceRadius * Math.sqrt((sampleIndex + 0.5) / sampleCount);
  const angle = sampleIndex * GOLDEN_ANGLE + angleOffset;
  const sampledLight = light.position
    .clone()
    .addScaledVector(u, Math.cos(angle) * radius)
    .addScaledVector(v, Math.sin(angle) * radius);
  const sampledDirection = sampledLight.sub(origin);
  const sampledDistance = sampledDirection.length();
  if (sampledDistance < 1e-4) {
    return null;
  }
  return {
    direction: sampledDirection.multiplyScalar(1 / sampledDistance),
    maxDistance: sampledDistance
  };
}

/** Average hard-ray visibility over a light's soft-shadow samples. */
function shadowVisibility(
  light: {
    readonly kind: 'directional' | 'point';
    readonly direction: Vector3;
    readonly position: Vector3;
    readonly shadowSoftness: number;
  },
  origin: Vector3,
  sampleCount: number,
  occluders: readonly Float32Array[],
  texelSeed: number
): number {
  const count =
    light.shadowSoftness > 0
      ? Math.max(1, Math.min(32, Math.floor(sampleCount)))
      : 1;
  const angleOffset = hashNoise(texelSeed, 13, 37) * Math.PI * 2;
  if (count <= 4) {
    let visible = 0;
    for (let i = 0; i < count; i += 1) {
      const ray = shadowRayForSample(light, origin, i, count, angleOffset);
      if (
        ray &&
        !rayOccluded(origin, ray.direction, ray.maxDistance, occluders)
      ) {
        visible += 1;
      }
    }
    return visible / count;
  }
  // Probe four indices from the full stratified distribution. This avoids
  // mixing a 4-sample pattern with the outer part of a 16-sample pattern.
  const coarse = [
    0,
    Math.floor(count * 0.25),
    Math.floor(count * 0.6),
    count - 1
  ] as const;
  let visible = 0;
  for (const index of coarse) {
    const ray = shadowRayForSample(
      light,
      origin,
      index,
      count,
      angleOffset
    );
    if (ray && !rayOccluded(origin, ray.direction, ray.maxDistance, occluders)) {
      visible += 1;
    }
  }
  if (visible === 0 || visible === 4) {
    return visible / 4;
  }
  for (let i = 0; i < count; i += 1) {
    if (coarse.includes(i as (typeof coarse)[number])) {
      continue;
    }
    const ray = shadowRayForSample(light, origin, i, count, angleOffset);
    if (ray && !rayOccluded(origin, ray.direction, ray.maxDistance, occluders)) {
      visible += 1;
    }
  }
  return visible / count;
}

/**
 * Remove one-texel bright cracks between dark baked faces.
 *
 * A bright texel with dark neighbors on opposite sides is a seam texel, not a
 * lit surface. Replacing it from those neighbors keeps continuous shadows
 * continuous without flattening real highlights.
 */
function fillBrightCracks(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  passes: number
): void {
  const rowBytes = width * 4;
  const luminance = (row: Uint8ClampedArray, offset: number): number =>
    (row[offset] + row[offset + 1] + row[offset + 2]) / 3;
  const dark = (row: Uint8ClampedArray, offset: number): boolean =>
    row[offset + 3] > 0 && luminance(row, offset) < 100;
  const copyRow = (row: Uint8ClampedArray, sourceRow: number): void => {
    row.set(
      data.subarray(sourceRow * rowBytes, sourceRow * rowBytes + rowBytes)
    );
  };
  for (let pass = 0; pass < passes; pass += 1) {
    if (width < 3 || height < 3) {
      return;
    }
    let previous = new Uint8ClampedArray(rowBytes);
    let current = new Uint8ClampedArray(rowBytes);
    let next = new Uint8ClampedArray(rowBytes);
    copyRow(previous, 0);
    copyRow(current, 1);
    copyRow(next, 2);
    let changed = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const offset = x * 4;
        if (current[offset + 3] < 255 || luminance(current, offset) < 240) {
          continue;
        }
        const horizontal =
          dark(current, offset - 4) && dark(current, offset + 4);
        const vertical = dark(previous, offset) && dark(next, offset);
        if (!horizontal && !vertical) {
          continue;
        }
        const donors = [
          ...(horizontal
            ? [
                { row: current, offset: offset - 4 },
                { row: current, offset: offset + 4 }
              ]
            : []),
          ...(vertical
            ? [
                { row: previous, offset },
                { row: next, offset }
              ]
            : [])
        ];
        const target = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          data[target + channel] = Math.round(
            donors.reduce((sum, donor) => sum + donor.row[donor.offset + channel], 0) /
              donors.length
          );
        }
        changed += 1;
      }
      if (y < height - 2) {
        const recycled = previous;
        previous = current;
        current = next;
        next = recycled;
        copyRow(next, y + 2);
      }
    }
    if (changed === 0) {
      break;
    }
  }
}

/** Dilate a mask by a small Chebyshev radius for texture-edge padding. */
function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 0) {
        continue;
      }
      const minY = Math.max(0, y - radius);
      const maxY = Math.min(height - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);
      for (let ny = minY; ny <= maxY; ny += 1) {
        for (let nx = minX; nx <= maxX; nx += 1) {
          result[ny * width + nx] = 1;
        }
      }
    }
  }
  return result;
}

/**
 * Apply a separable box blur to the baked lighting image.
 *
 * Ray-traced shadows alone produce a hard boundary per texel. The viewport uses
 * PCF-soft shadow maps, so a resolution-scaled penumbra makes the baked result
 * read like the Lit preview.
 */
function blurLighting(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  allowed?: Uint8Array
): void {
  if (radius <= 0 || width === 0 || height === 0) {
    return;
  }
  const horizontal = new Uint8ClampedArray(data.length);
  const valid = (pixel: number): boolean =>
    allowed === undefined || allowed[pixel] !== 0;
  for (let pass = 0; pass < 2; pass += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        if (!valid(pixel)) {
          continue;
        }
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sx = Math.min(width - 1, Math.max(0, x + offset));
          const sample = y * width + sx;
          if (!valid(sample)) {
            continue;
          }
          const index = sample * 4;
          r += data[index];
          g += data[index + 1];
          b += data[index + 2];
          count += 1;
        }
        if (count === 0) {
          continue;
        }
        const out = pixel * 4;
        horizontal[out] = r / count;
        horizontal[out + 1] = g / count;
        horizontal[out + 2] = b / count;
        horizontal[out + 3] = 255;
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        if (!valid(pixel)) {
          continue;
        }
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const sy = Math.min(height - 1, Math.max(0, y + offset));
          const sample = sy * width + x;
          if (!valid(sample)) {
            continue;
          }
          const index = sample * 4;
          r += horizontal[index];
          g += horizontal[index + 1];
          b += horizontal[index + 2];
          count += 1;
        }
        if (count === 0) {
          continue;
        }
        const out = pixel * 4;
        data[out] = r / count;
        data[out + 1] = g / count;
        data[out + 2] = b / count;
        data[out + 3] = 255;
      }
    }
  }
}

/**
 * Bake direct ambient/directional/point light into an RGBA lighting image.
 *
 * The result is opaque white outside the UV-covered surface. White is the
 * neutral color for the multiply composite, so filtered atlas edges cannot
 * pick up transparent black. The caller stores it in a lighting-role layer.
 * Flat face normals match the low-poly Lit path. Soft shadows average visibility rays through the supplied
 * world-space occluders; ambient is never shadowed.
 */
export async function bakeLighting(
  input: BakeLightingInput,
  options: BakeLightingOptions = {}
): Promise<ImageData | null> {
  const { mesh, width, height } = input;
  if (options.shouldCancel?.()) {
    throw new BakeCancelledError();
  }
  const totalFaces = mesh.faceCount;
  let lastYield = performance.now();
  options.onProgress?.(0, totalFaces);
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  for (let offset = 3; offset < data.length; offset += 4) {
    data[offset] = 0;
  }
  const nodeMatrix = new Matrix4().compose(
    new Vector3(...input.node.transform.position),
    new Quaternion().setFromEuler(
      new Euler(...input.node.transform.rotation, 'XYZ')
    ),
    new Vector3(...input.node.transform.scale)
  );
  const matrix = input.parent
    ? new Matrix4().compose(
        new Vector3(...input.parent.transform.position),
        new Quaternion().setFromEuler(
          new Euler(...input.parent.transform.rotation, 'XYZ')
        ),
        new Vector3(...input.parent.transform.scale)
      ).multiply(nodeMatrix)
    : nodeMatrix;
  const ambient = parseColor(input.ambientColor);
  const occluders = input.occluders ?? [];
  const shadowSamples = Math.max(1, Math.min(32, Math.floor(input.shadowSamples ?? 8)));
  const ao =
    input.ambientOcclusion?.enabled === true &&
    input.ambientOcclusion.strength > 0 &&
    occluders.length > 0
      ? input.ambientOcclusion
      : null;
  const lights = input.lights
    .filter((light) => light.enabled && light.intensity > 0)
    .map((light) => ({
      ...light,
      rgb: parseColor(light.color),
      direction: new Vector3(...light.direction).normalize(),
      position: new Vector3(...light.position)
    }));
  let covered = false;
  // Derive the coverage mask from the same barycentric rasterization as the
  // lighting pass. This avoids a full-resolution OffscreenCanvas and its
  // getImageData copy.
  const coverageMask = new Uint8Array(width * height);
  const normalSign = bakeNormalSign(mesh, matrix);
  for (let face = 0; face < mesh.faceCount; face += 1) {
    if (face > 0 && performance.now() - lastYield > 16) {
      options.onProgress?.(face, totalFaces);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      lastYield = performance.now();
      if (options.shouldCancel?.()) {
        throw new BakeCancelledError();
      }
    }
    const first = mesh.faceHalfEdge[face];
    const loop: number[] = [];
    let h = first;
    do {
      loop.push(h);
      h = mesh.heNext[h];
    } while (h !== first && loop.length < 64);
    if (loop.length < 3) {
      continue;
    }
    const world = loop.map((edge) => positionAt(mesh, edge, matrix));
    const normal = new Vector3()
      .subVectors(world[1], world[0])
      .cross(new Vector3().subVectors(world[2], world[0]))
      .normalize();
    if (normal.lengthSq() < 1e-8) {
      continue;
    }
    normal.multiplyScalar(normalSign);
    const uv = loop.map((edge) => [
      mesh.heUv[edge * 2] * width,
      (1 - mesh.heUv[edge * 2 + 1]) * height
    ] as const);
    for (let triangle = 1; triangle < loop.length - 1; triangle += 1) {
      const ia = 0;
      const ib = triangle;
      const ic = triangle + 1;
      const x0 = uv[ia][0];
      const y0 = uv[ia][1];
      const x1 = uv[ib][0];
      const y1 = uv[ib][1];
      const x2 = uv[ic][0];
      const y2 = uv[ic][1];
      const denominator = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(denominator) < 1e-8) {
        continue;
      }
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)) - 1);
      const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)) + 1);
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)) - 1);
      const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)) + 1);
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const px = x + 0.5;
          const py = y + 0.5;
          const a = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denominator;
          const b = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denominator;
          const c = 1 - a - b;
          if (a < -0.03 || b < -0.03 || c < -0.03) {
            continue;
          }
          if (a >= -1e-4 && b >= -1e-4 && c >= -1e-4) {
            coverageMask[y * width + x] = 1;
          }
          const texelSeed =
            (face + 1) * 73856093 ^
            (x + 1) * 19349663 ^
            (y + 1) * 83492791;
          const worldPosition = new Vector3()
            .addScaledVector(world[ia], a)
            .addScaledVector(world[ib], b)
            .addScaledVector(world[ic], c);
          let r = ambient.r * input.ambientIntensity * LAMBERT_BRDF;
          let g = ambient.g * input.ambientIntensity * LAMBERT_BRDF;
          let bl = ambient.b * input.ambientIntensity * LAMBERT_BRDF;
          for (const light of lights) {
            let ndotl: number;
            let attenuation = 1;
            if (light.kind === 'directional') {
              ndotl = normal.dot(light.direction.clone().multiplyScalar(-1));
            } else {
              const toLight = light.position.clone().sub(worldPosition);
              const distance = toLight.length();
              if (distance < 1e-4) {
                continue;
              }
              toLight.multiplyScalar(1 / distance);
              ndotl = normal.dot(toLight);
              attenuation = 1 / Math.max(0.01, distance * distance);
            }
            if (ndotl <= 0) {
              continue;
            }
            let visibility = 1;
            if (light.castShadows) {
              visibility = shadowVisibility(
                light,
                worldPosition.clone().addScaledVector(normal, 0.005),
                shadowSamples,
                occluders,
                texelSeed
              );
              if (visibility <= 0) {
                continue;
              }
            }
            const energy =
              maxZero(ndotl) *
              light.intensity *
              attenuation *
              visibility *
              LAMBERT_BRDF;
            r += light.rgb.r * energy;
            g += light.rgb.g * energy;
            bl += light.rgb.b * energy;
          }
          if (ao) {
            const visibility = ambientVisibility(
              worldPosition,
              normal,
              ao,
              occluders,
              texelSeed
            );
            const factor = 1 - (1 - visibility) * ao.strength;
            r *= factor;
            g *= factor;
            bl *= factor;
          }
          const offset = (y * width + x) * 4;
          data[offset] = Math.round(Math.min(1, Math.max(0, r)) * 255);
          data[offset + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
          data[offset + 2] = Math.round(Math.min(1, Math.max(0, bl)) * 255);
          data[offset + 3] = 255;
          covered = true;
        }
      }
    }
  }
  options.onProgress?.(totalFaces, totalFaces);
  if (!covered) {
    return null;
  }
  // Fill only interior raster gaps, then blur inside UV coverage. Padding the
  // gutter before blur would let the blur pull the lit gutter back into the
  // island edge and create bright seams under soft shadows.
  bleedImageData(data, width, height, 2, coverageMask);
  fillBrightCracks(data, width, height, 2);
  const softness = Math.max(
    0,
    ...lights
      .filter((light) => light.castShadows)
      .map((light) => light.shadowSoftness)
  );
  const blurRadius = Math.round(1 + softness * 5);
  blurLighting(data, width, height, blurRadius, coverageMask);
  // Pad from the already-blurred island edge. The gutter scales with the
  // penumbra radius so the blur never reaches the neutral white exterior.
  const gutter = Math.max(4, blurRadius + 2);
  bleedImageData(
    data,
    width,
    height,
    gutter,
    dilateMask(coverageMask, width, height, gutter)
  );
  for (let offset = 3; offset < data.length; offset += 4) {
    data[offset] = 255;
  }
  return new ImageData(data, width, height);
}
