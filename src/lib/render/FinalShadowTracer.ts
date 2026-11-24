import {
  Matrix4,
  Vector3,
  type Camera
} from 'three';
import {
  bvhRayHit,
  bvhRayOccluded,
  buildFlatBvh,
  type FlatBvh
} from '../lighting/bvh';

/** One document light as consumed by the offline shadow tracer. */
export interface FinalShadowLight {
  readonly id: string;
  readonly kind: 'directional' | 'point';
  /** Direction from the light toward the scene. */
  readonly direction: Vector3;
  readonly position: Vector3;
  readonly softness: number;
  readonly castShadow: boolean;
}

/**
 * Camera-visible surface cache plus per-light direct-shadow masks.
 *
 * The tracer is built once per final frame. Camera rays find the nearest
 * visible surface; each light then traces visibility from the cached hit
 * points. It has no relationship to the interactive PCF path.
 */
export class FinalShadowTracer {
  private bvh: FlatBvh = buildFlatBvh([]);
  private hitPoints = new Float32Array(0);
  private hitNormals = new Float32Array(0);
  private hitValid = new Uint8Array(0);
  private width = 0;
  private height = 0;
  private readonly direction = new Vector3();
  private readonly inverseProjection = new Matrix4();
  private readonly world = new Matrix4();

  /** Replace the world-space caster/receiver triangle soup. */
  setTriangles(triangles: Float32Array): void {
    const copy = new Float32Array(triangles.length);
    copy.set(triangles);
    this.bvh = buildFlatBvh([copy]);
    this.width = 0;
    this.height = 0;
  }

  /** Cache camera-visible hit points and normals for the requested frame. */
  computeHits(camera: Camera, width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    // Typed arrays cannot be resized in place; re-create when the frame size
    // changes. Final frames are rendered sequentially, so this is bounded.
    const points = new Float32Array(this.width * this.height * 3);
    const normals = new Float32Array(this.width * this.height * 3);
    const valid = new Uint8Array(this.width * this.height);
    camera.updateMatrixWorld();
    this.inverseProjection.copy(camera.projectionMatrixInverse);
    this.world.copy(camera.matrixWorld);
    const cameraPosition = camera.position;
    const triangles = this.bvh.triangles;
    const point = new Vector3();
    const normal = new Vector3();
    const edge1 = new Vector3();
    const edge2 = new Vector3();
    for (let y = 0; y < this.height; y += 1) {
      const ndcY = ((y + 0.5) / this.height) * 2 - 1;
      for (let x = 0; x < this.width; x += 1) {
        const ndcX = ((x + 0.5) / this.width) * 2 - 1;
        this.direction
          .set(ndcX, ndcY, 1)
          .applyMatrix4(this.inverseProjection)
          .normalize()
          .applyMatrix4(this.world)
          .sub(cameraPosition)
          .normalize();
        const hit = bvhRayHit(
          this.bvh,
          cameraPosition,
          this.direction,
          Infinity
        );
        if (hit === null) {
          continue;
        }
        const index = y * this.width + x;
        const offset = index * 3;
        point
          .copy(cameraPosition)
          .addScaledVector(this.direction, hit.distance);
        points[offset] = point.x;
        points[offset + 1] = point.y;
        points[offset + 2] = point.z;
        const triangle = hit.triangleOffset;
        const ax = triangles[triangle];
        const ay = triangles[triangle + 1];
        const az = triangles[triangle + 2];
        const bx = triangles[triangle + 3];
        const by = triangles[triangle + 4];
        const bz = triangles[triangle + 5];
        const cx = triangles[triangle + 6];
        const cy = triangles[triangle + 7];
        const cz = triangles[triangle + 8];
        edge1.set(bx - ax, by - ay, bz - az);
        edge2.set(cx - ax, cy - ay, cz - az);
        normal.crossVectors(edge1, edge2).normalize();
        if (normal.dot(this.direction) > 0) {
          normal.multiplyScalar(-1);
        }
        normals[offset] = normal.x;
        normals[offset + 1] = normal.y;
        normals[offset + 2] = normal.z;
        valid[index] = 1;
      }
    }
    this.hitPoints = points;
    this.hitNormals = normals;
    this.hitValid = valid;
  }

  /**
   * Build one light's visibility mask. 255 is fully lit, 0 fully shadowed.
   * The pattern is stable across the frame to avoid baked-style grain.
   */
  maskFor(light: FinalShadowLight, softnessSamples = 8): Uint8Array {
    const size = this.width * this.height;
    const mask = new Uint8Array(size);
    mask.fill(255);
    if (!light.castShadow || size === 0) {
      return mask;
    }
    const samples = Math.max(1, Math.round(softnessSamples));
    const softness = Math.max(0, Math.min(1, light.softness));
    const directional = light.kind === 'directional';
    const baseDirection = new Vector3();
    if (directional) {
      baseDirection.copy(light.direction).multiplyScalar(-1).normalize();
    }
    const origin = new Vector3();
    const tangent = new Vector3();
    const bitangent = new Vector3();
    const up = new Vector3();
    const sampleDirection = new Vector3();
    for (let index = 0; index < size; index += 1) {
      if (this.hitValid[index] === 0) {
        continue;
      }
      const offset = index * 3;
      origin.set(
        this.hitPoints[offset] + this.hitNormals[offset] * 0.005,
        this.hitPoints[offset + 1] + this.hitNormals[offset + 1] * 0.005,
        this.hitPoints[offset + 2] + this.hitNormals[offset + 2] * 0.005
      );
      let maxDistance = Infinity;
      if (!directional) {
        baseDirection.copy(light.position).sub(origin);
        maxDistance = baseDirection.length();
        if (maxDistance < 1e-4) {
          mask[index] = 0;
          continue;
        }
        baseDirection.multiplyScalar(1 / maxDistance);
      }
      const count = softness > 0 ? samples : 1;
      const sourceRadius = directional
        ? Math.tan(softness * 0.04)
        : Math.min(maxDistance * 0.8, softness * 0.12);
      up.set(
        Math.abs(baseDirection.z) < 0.9 ? 0 : 1,
        0,
        Math.abs(baseDirection.z) < 0.9 ? 1 : 0
      );
      tangent.crossVectors(baseDirection, up).normalize();
      bitangent.crossVectors(baseDirection, tangent).normalize();
      let visible = 0;
      for (let sample = 0; sample < count; sample += 1) {
        sampleDirection.copy(baseDirection);
        if (count > 1) {
          const angle = sample * 2.399963;
          const radius = sourceRadius * Math.sqrt((sample + 0.5) / count);
          sampleDirection
            .addScaledVector(tangent, Math.cos(angle) * radius)
            .addScaledVector(bitangent, Math.sin(angle) * radius)
            .normalize();
        }
        if (
          !bvhRayOccluded(
            this.bvh,
            origin,
            sampleDirection,
            maxDistance
          )
        ) {
          visible += 1;
        }
      }
      mask[index] = Math.round((visible / count) * 255);
    }
    if (softness > 0) {
      return blurMask(
        mask,
        this.width,
        this.height,
        Math.round(1 + softness * 2)
      );
    }
    return mask;
  }
}


/** Separable box blur for a visibility mask. */
function blurMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Uint8Array {
  if (radius <= 0 || width < 3 || height < 3) {
    return mask;
  }
  const horizontal = new Float32Array(mask.length);
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const sampleX = x + dx;
        if (sampleX < 0 || sampleX >= width) {
          continue;
        }
        sum += mask[y * width + sampleX];
        count += 1;
      }
      horizontal[y * width + x] = sum / count;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const sampleY = y + dy;
        if (sampleY < 0 || sampleY >= height) {
          continue;
        }
        sum += horizontal[sampleY * width + x];
        count += 1;
      }
      output[y * width + x] = Math.round(sum / count);
    }
  }
  return output;
}
