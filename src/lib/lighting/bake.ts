import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { MeshNode } from '../scene/MeshNode';
import type { LightSummary } from '../scene/SceneLight';
import type { SceneGroup } from '../scene/SceneGroup';
import type { HalfEdgeMesh } from '../geometry/HalfEdgeMesh';

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
}

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function parseColor(value: string): Rgb {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value)?.[1] ?? 'ffffff';
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255
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

/** Moller-Trumbore ray/triangle test for hard shadow rays. */
function rayHitsTriangle(
  origin: Vector3,
  direction: Vector3,
  a: Vector3,
  b: Vector3,
  c: Vector3,
  maxDistance: number
): boolean {
  const edge1 = new Vector3().subVectors(b, a);
  const edge2 = new Vector3().subVectors(c, a);
  const p = new Vector3().crossVectors(direction, edge2);
  const determinant = edge1.dot(p);
  if (Math.abs(determinant) < 1e-9) {
    return false;
  }
  const inverse = 1 / determinant;
  const t = new Vector3().subVectors(origin, a);
  const u = t.dot(p) * inverse;
  if (u < 0 || u > 1) {
    return false;
  }
  const q = new Vector3().crossVectors(t, edge1);
  const v = direction.dot(q) * inverse;
  if (v < 0 || u + v > 1) {
    return false;
  }
  const distance = edge2.dot(q) * inverse;
  return distance > 1e-4 && distance < maxDistance;
}

/** Test a shadow ray against all visible world-space scene triangles. */
function rayOccluded(
  origin: Vector3,
  direction: Vector3,
  maxDistance: number,
  occluders: readonly Float32Array[]
): boolean {
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (const triangles of occluders) {
    for (let offset = 0; offset + 8 < triangles.length; offset += 9) {
      a.set(
        triangles[offset],
        triangles[offset + 1],
        triangles[offset + 2]
      );
      b.set(
        triangles[offset + 3],
        triangles[offset + 4],
        triangles[offset + 5]
      );
      c.set(
        triangles[offset + 6],
        triangles[offset + 7],
        triangles[offset + 8]
      );
      if (rayHitsTriangle(origin, direction, a, b, c, maxDistance)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Bake direct ambient/directional/point light into an RGBA lighting image.
 *
 * The result is a black-transparent image outside the UV-covered surface. The
 * caller stores it in a lighting-role layer and composites it with multiply.
 * Flat face normals match the low-poly Lit path. Hard shadows use the supplied
 * world-space occluders; ambient is never shadowed.
 */
export function bakeLighting(input: BakeLightingInput): ImageData | null {
  const { mesh, width, height } = input;
  const data = new Uint8ClampedArray(width * height * 4);
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
  const lights = input.lights
    .filter((light) => light.enabled && light.intensity > 0)
    .map((light) => ({
      ...light,
      rgb: parseColor(light.color),
      direction: new Vector3(...light.direction).normalize(),
      position: new Vector3(...light.position)
    }));
  let covered = false;
  const meshCenter = new Vector3();
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    meshCenter.add(
      new Vector3(
        mesh.positions[vertex * 3],
        mesh.positions[vertex * 3 + 1],
        mesh.positions[vertex * 3 + 2]
      ).applyMatrix4(matrix)
    );
  }
  if (mesh.vertexCount > 0) {
    meshCenter.multiplyScalar(1 / mesh.vertexCount);
  }

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
    const world = loop.map((edge) => positionAt(mesh, edge, matrix));
    const normal = new Vector3()
      .subVectors(world[1], world[0])
      .cross(new Vector3().subVectors(world[2], world[0]))
      .normalize();
    if (normal.lengthSq() < 1e-8) {
      continue;
    }
    const faceCenter = new Vector3();
    for (const position of world) {
      faceCenter.add(position);
    }
    faceCenter.multiplyScalar(1 / world.length);
    // Most low-poly meshes are closed; make outward normals deterministic even
    // when the source face winding is inward. Open surfaces have a near-zero
    // center offset and retain their authored winding.
    if (normal.dot(faceCenter.sub(meshCenter)) < 0) {
      normal.negate();
    }
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
          const worldPosition = new Vector3()
            .addScaledVector(world[ia], a)
            .addScaledVector(world[ib], b)
            .addScaledVector(world[ic], c);
          let r = ambient.r * input.ambientIntensity;
          let g = ambient.g * input.ambientIntensity;
          let bl = ambient.b * input.ambientIntensity;
          for (const light of lights) {
            let ndotl: number;
            let attenuation = 1;
            let shadowDirection: Vector3 | null = null;
            let shadowDistance = Infinity;
            if (light.kind === 'directional') {
              shadowDirection = light.direction.clone().multiplyScalar(-1);
              ndotl = normal.dot(shadowDirection);
            } else {
              const toLight = light.position.clone().sub(worldPosition);
              const distance = toLight.length();
              if (distance < 1e-4) {
                continue;
              }
              shadowDirection = toLight.multiplyScalar(1 / distance);
              shadowDistance = distance;
              ndotl = normal.dot(shadowDirection);
              attenuation = 1 / (1 + distance * distance);
            }
            if (ndotl <= 0) {
              continue;
            }
            if (
              light.castShadows &&
              shadowDirection &&
              rayOccluded(
                worldPosition.clone().addScaledVector(normal, 0.003),
                shadowDirection,
                shadowDistance,
                occluders
              )
            ) {
              continue;
            }
            const energy = maxZero(ndotl) * light.intensity * attenuation;
            r += light.rgb.r * energy;
            g += light.rgb.g * energy;
            bl += light.rgb.b * energy;
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
  return covered ? new ImageData(data, width, height) : null;
}
