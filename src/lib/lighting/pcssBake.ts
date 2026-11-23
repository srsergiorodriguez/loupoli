import { Matrix4, OrthographicCamera, Vector3 } from 'three';
import { shadowRadiusForSoftness } from './shadowSettings';

/** Shadow-map resolution used by the CPU PCSS evaluator. */
const BAKE_PCSS_RESOLUTION = 1024;
/** Blocker taps; must match the viewport PCSS shader. */
const BLOCKER_TAPS = 8;
/** Filter taps; must match the viewport PCSS shader. */
const FILTER_TAPS = 12;
const GOLDEN_ANGLE = 2.3999632297;

/**
 * CPU PCSS shadow map for baked directional lights.
 *
 * The bake uses the same contact-hardening model as the viewport: rasterize
 * occluders from the light, search for blocker depth, then scale the filter
 * radius with receiver/blocker separation. This replaces the old stochastic
 * cone samples so baked and realtime penumbrae share one softness model.
 */
export class BakePcssShadowMap {
  private readonly depth: Float32Array;
  private readonly viewProjection: Matrix4;
  private readonly softness: number;
  private readonly normalBias: number;
  private readonly bias: number;
  private valid = false;

  constructor(
    direction: Vector3,
    occluders: readonly Float32Array[],
    softness: number
  ) {
    this.softness = Math.max(0, Math.min(2, softness));
    this.normalBias = 0.003 + 0.001 * this.softness;
    this.bias = 0.0001 + 0.0001 * this.softness;
    this.depth = new Float32Array(BAKE_PCSS_RESOLUTION * BAKE_PCSS_RESOLUTION);
    this.depth.fill(1);
    this.viewProjection = new Matrix4();

    const boundsMin = new Vector3(Infinity, Infinity, Infinity);
    const boundsMax = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const triangle of occluders) {
      for (let i = 0; i + 2 < triangle.length; i += 3) {
        const x = triangle[i];
        const y = triangle[i + 1];
        const z = triangle[i + 2];
        boundsMin.x = Math.min(boundsMin.x, x);
        boundsMin.y = Math.min(boundsMin.y, y);
        boundsMin.z = Math.min(boundsMin.z, z);
        boundsMax.x = Math.max(boundsMax.x, x);
        boundsMax.y = Math.max(boundsMax.y, y);
        boundsMax.z = Math.max(boundsMax.z, z);
      }
    }
    if (!Number.isFinite(boundsMin.x)) {
      return;
    }
    this.valid = true;

    const center = boundsMin.clone().add(boundsMax).multiplyScalar(0.5);
    const size = boundsMax.clone().sub(boundsMin);
    const radius = Math.max(2, size.length() * 0.55);
    const dir = direction.clone();
    if (dir.lengthSq() < 1e-8) {
      dir.set(0, 0, -1);
    } else {
      dir.normalize();
    }
    const up =
      Math.abs(dir.z) < 0.9
        ? new Vector3(0, 0, 1)
        : new Vector3(1, 0, 0);
    const camera = new OrthographicCamera(
      -radius,
      radius,
      radius,
      -radius,
      0.1,
      radius * 4
    );
    camera.up.copy(up);
    camera.position.copy(center).addScaledVector(dir, -radius * 2);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    this.viewProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );

    const res = BAKE_PCSS_RESOLUTION;
    const projected = new Vector3();
    for (const triangle of occluders) {
      for (let i = 0; i + 8 < triangle.length; i += 9) {
        const points: { x: number; y: number; z: number }[] = [];
        let valid = true;
        for (let corner = 0; corner < 3; corner += 1) {
          projected
            .set(
              triangle[i + corner * 3],
              triangle[i + corner * 3 + 1],
              triangle[i + corner * 3 + 2]
            )
            .applyMatrix4(this.viewProjection);
          if (projected.z < -1 || projected.z > 1) {
            valid = false;
            break;
          }
          points.push({
            x: (projected.x * 0.5 + 0.5) * res,
            y: (projected.y * 0.5 + 0.5) * res,
            z: projected.z * 0.5 + 0.5
          });
        }
        if (!valid) {
          continue;
        }
        this.rasterize(points[0], points[1], points[2]);
      }
    }
  }

  /** PCSS visibility at a world-space point; 1 is fully lit. */
  visibility(position: Vector3, normal: Vector3): number {
    if (!this.valid) {
      return 1;
    }
    const biased = position
      .clone()
      .addScaledVector(normal, this.normalBias)
      .applyMatrix4(this.viewProjection);
    if (biased.z < -1 || biased.z > 1) {
      return 1;
    }
    const u = (biased.x * 0.5 + 0.5) * BAKE_PCSS_RESOLUTION;
    const v = (biased.y * 0.5 + 0.5) * BAKE_PCSS_RESOLUTION;
    if (u < 0 || u >= BAKE_PCSS_RESOLUTION || v < 0 || v >= BAKE_PCSS_RESOLUTION) {
      return 1;
    }
    const receiver = biased.z * 0.5 + 0.5;
    const radius = shadowRadiusForSoftness(this.softness);
    const searchRadius = Math.max(2, radius * 3);
    let blockerSum = 0;
    let blockers = 0;
    for (let i = 0; i < BLOCKER_TAPS; i += 1) {
      const sampleRadius =
        Math.sqrt((i + 0.5) / BLOCKER_TAPS) * searchRadius;
      const angle = i * GOLDEN_ANGLE;
      const x = Math.round(u + Math.cos(angle) * sampleRadius);
      const y = Math.round(v + Math.sin(angle) * sampleRadius);
      if (x < 0 || x >= BAKE_PCSS_RESOLUTION || y < 0 || y >= BAKE_PCSS_RESOLUTION) {
        continue;
      }
      const depth = this.depth[y * BAKE_PCSS_RESOLUTION + x];
      if (depth < receiver - this.bias) {
        blockerSum += depth;
        blockers += 1;
      }
    }
    if (blockers === 0) {
      return 1;
    }
    const blocker = blockerSum / blockers;
    const penumbra = Math.max(
      0,
      Math.min(1, (receiver - blocker) / Math.max(blocker, 0.01))
    );
    const contactClamp =
      penumbra <= 0.02
        ? 0
        : penumbra >= 0.2
          ? 1
          : (penumbra - 0.02) / 0.18;
    const filterRadius = Math.min(1, Math.sqrt(penumbra)) * searchRadius * contactClamp;
    let visible = 0;
    for (let i = 0; i < FILTER_TAPS; i += 1) {
      const sampleRadius =
        Math.sqrt((i + 0.5) / FILTER_TAPS) * filterRadius;
      const angle = i * GOLDEN_ANGLE;
      const x = Math.round(u + Math.cos(angle) * sampleRadius);
      const y = Math.round(v + Math.sin(angle) * sampleRadius);
      if (x < 0 || x >= BAKE_PCSS_RESOLUTION || y < 0 || y >= BAKE_PCSS_RESOLUTION) {
        visible += 1;
        continue;
      }
      visible += this.depth[y * BAKE_PCSS_RESOLUTION + x] >= receiver ? 1 : 0;
    }
    return visible / FILTER_TAPS;
  }

  private rasterize(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    c: { x: number; y: number; z: number }
  ): void {
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
    const maxX = Math.min(
      BAKE_PCSS_RESOLUTION - 1,
      Math.ceil(Math.max(a.x, b.x, c.x))
    );
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
    const maxY = Math.min(
      BAKE_PCSS_RESOLUTION - 1,
      Math.ceil(Math.max(a.y, b.y, c.y))
    );
    const denominator =
      (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(denominator) < 1e-8) {
      return;
    }
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const wa =
          ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) /
          denominator;
        const wb =
          ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) /
          denominator;
        const wc = 1 - wa - wb;
        if (wa < 0 || wb < 0 || wc < 0) {
          continue;
        }
        const depth = wa * a.z + wb * b.z + wc * c.z;
        const index = y * BAKE_PCSS_RESOLUTION + x;
        if (depth < this.depth[index]) {
          this.depth[index] = depth;
        }
      }
    }
  }
}
