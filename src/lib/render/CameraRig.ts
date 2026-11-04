import {
  Box3,
  MathUtils,
  PerspectiveCamera,
  Quaternion,
  Sphere,
  Vector3
} from 'three';

/** The three world axes represented by the orientation gizmo. */
export type AxisName = 'x' | 'y' | 'z';

/**
 * A world axis projected into camera space for the SVG orientation gizmo.
 * `x` and `y` are screen-oriented unit components; `depth` is used for draw
 * ordering only.
 */
export interface AxisProjection {
  readonly axis: AxisName;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

/** An in-flight interpolation between two camera orientations. */
interface ViewTransition {
  readonly fromAzimuth: number;
  readonly toAzimuth: number;
  readonly fromElevation: number;
  readonly toElevation: number;
  readonly startedAt: number;
  readonly durationMs: number;
}

const MIN_ELEVATION = -1.553;
const MAX_ELEVATION = 1.553;
const MIN_DISTANCE = 0.8;
const MAX_DISTANCE = 200;
const VIEW_TRANSITION_MS = 260;
const INITIAL_AZIMUTH = -Math.PI / 4;
const INITIAL_ELEVATION = 0.42;
const INITIAL_DISTANCE = 7;

/**
 * Z-up orbit camera controller.
 *
 * It deliberately avoids Three's OrbitControls: damping would require a
 * continuous render loop, and its touch handling would compete with the app's
 * gesture router. All camera changes are explicit and scheduler-driven.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;

  private readonly target = new Vector3();
  private azimuth = INITIAL_AZIMUTH;
  private elevation = INITIAL_ELEVATION;
  private distance = INITIAL_DISTANCE;
  private viewportHeight = 800;
  private transition: ViewTransition | null = null;

  private readonly scratchPosition = new Vector3();
  private readonly scratchRight = new Vector3();
  private readonly scratchUp = new Vector3();
  private readonly scratchQuaternion = new Quaternion();

  constructor() {
    this.camera = new PerspectiveCamera(42, 1, 0.01, 500);
    this.camera.up.set(0, 0, 1);
    this.applyTransform();
  }

  /** Snap the orbit rig to an explicit render camera. */
  setView(position: Vector3, target: Vector3, fov: number): void {
    this.cancelTransition();
    this.target.copy(target);
    const offset = new Vector3().subVectors(position, target);
    const distance = offset.length();
    if (distance > 1e-5) {
      this.distance = MathUtils.clamp(distance, MIN_DISTANCE, MAX_DISTANCE);
      this.azimuth = Math.atan2(offset.y, offset.x);
      this.elevation = MathUtils.clamp(
        Math.asin(offset.z / distance),
        MIN_ELEVATION,
        MAX_ELEVATION
      );
    }
    this.camera.fov = MathUtils.clamp(fov, 5, 160);
    this.camera.updateProjectionMatrix();
    this.applyTransform();
  }

  /** Current camera position in world space. */
  getPosition(out = new Vector3()): Vector3 {
    return out.copy(this.camera.position);
  }

  /** Current orbit target in world space. */
  getTarget(out = new Vector3()): Vector3 {
    return out.copy(this.target);
  }

  /** Current vertical field of view in degrees. */
  getFov(): number {
    return this.camera.fov;
  }

  /** Keep pan speed proportional to the current viewport height. */
  setViewportHeight(height: number): void {
    this.viewportHeight = Math.max(1, height);
  }

  /** Orbit from a pointer delta in CSS pixels. */
  orbit(dx: number, dy: number): void {
    this.cancelTransition();
    this.azimuth -= dx * 0.0065;
    this.elevation = MathUtils.clamp(
      this.elevation + dy * 0.006,
      MIN_ELEVATION,
      MAX_ELEVATION
    );
    this.applyTransform();
  }

  /** Pan the orbit target in the camera's screen plane. */
  pan(dx: number, dy: number): void {
    this.cancelTransition();
    this.scratchRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.scratchUp.setFromMatrixColumn(this.camera.matrixWorld, 1);

    const worldPerPixel =
      (2 * Math.tan(MathUtils.degToRad(this.camera.fov) / 2) * this.distance) /
      this.viewportHeight;

    this.target.addScaledVector(this.scratchRight, -dx * worldPerPixel);
    this.target.addScaledVector(this.scratchUp, dy * worldPerPixel);
    this.applyTransform();
  }

  /** Zoom by a multiplicative factor. Values > 1 move away from the target. */
  zoom(factor: number): void {
    this.cancelTransition();
    this.distance = MathUtils.clamp(
      this.distance * factor,
      MIN_DISTANCE,
      MAX_DISTANCE
    );
    this.applyTransform();
  }

  /** Frame a world-space bounding box with a comfortable margin. */
  frame(box: Box3): void {
    if (box.isEmpty()) {
      return;
    }
    this.cancelTransition();
    box.getCenter(this.target);
    const sphere = box.getBoundingSphere(new Sphere());
    const vFov = MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(this.camera.aspect, 0.1));
    const limitingFov = Math.min(vFov, hFov);
    this.distance = MathUtils.clamp(
      (sphere.radius / Math.sin(limitingFov / 2)) * 1.5,
      MIN_DISTANCE,
      MAX_DISTANCE
    );
    this.applyTransform();
  }

  /** Reset the framing to the known Phase 1 cube bounds. */
  frameCube(size = 2): void {
    const half = size / 2;
    const box = new Box3().set(
      new Vector3(-half, -half, -half),
      new Vector3(half, half, half)
    );
    this.frame(box);
  }

  /**
   * Animate toward an axis-aligned view.
   *
   * `sign` selects the side of the axis the camera sits on. A tiny elevation
   * offset avoids the degenerate look-at when the camera is exactly above or
   * below the target.
   */
  viewAxis(axis: AxisName, sign: 1 | -1): void {
    let azimuth = this.azimuth;
    let elevation = 0;

    if (axis === 'x') {
      azimuth = sign === 1 ? 0 : Math.PI;
    } else if (axis === 'y') {
      azimuth = sign === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      azimuth = -Math.PI / 2;
      elevation = sign === 1 ? 1.553 : -1.553;
    }

    this.beginTransition(azimuth, elevation);
  }

  /** Reset to Blender's Front view (camera on −Y), preserving target/zoom. */
  resetOrientation(): void {
    this.beginTransition(-Math.PI / 2, 0);
  }

  /** Advance an axis-view transition. Returns true while more frames are needed. */
  tick(timestamp: number): boolean {
    const transition = this.transition;
    if (!transition) {
      return false;
    }

    const t = MathUtils.clamp(
      (timestamp - transition.startedAt) / transition.durationMs,
      0,
      1
    );
    const eased = easeInOutCubic(t);
    this.azimuth = MathUtils.lerp(
      transition.fromAzimuth,
      transition.toAzimuth,
      eased
    );
    this.elevation = MathUtils.lerp(
      transition.fromElevation,
      transition.toElevation,
      eased
    );
    this.applyTransform();

    if (t >= 1) {
      this.transition = null;
      this.azimuth = normalizeAngle(this.azimuth);
      return false;
    }
    return true;
  }

  /** Project world axes into camera space for the orientation gizmo. */
  computeOrientation(): AxisProjection[] {
    this.scratchQuaternion.copy(this.camera.quaternion).invert();
    const axes: Array<{ axis: AxisName; vector: Vector3 }> = [
      { axis: 'x', vector: new Vector3(1, 0, 0) },
      { axis: 'y', vector: new Vector3(0, 1, 0) },
      { axis: 'z', vector: new Vector3(0, 0, 1) }
    ];

    return axes.map(({ axis, vector }) => {
      const view = vector.applyQuaternion(this.scratchQuaternion);
      return {
        axis,
        x: view.x,
        y: -view.y,
        depth: view.z
      };
    });
  }

  /** Cancel any in-flight axis transition. */
  cancelTransition(): void {
    this.transition = null;
  }

  /** True while the camera is interpolating toward a requested axis view. */
  get isTransitioning(): boolean {
    return this.transition !== null;
  }

  private beginTransition(azimuth: number, elevation: number): void {
    const delta = shortestAngleDelta(this.azimuth, azimuth);
    this.transition = {
      fromAzimuth: this.azimuth,
      toAzimuth: this.azimuth + delta,
      fromElevation: this.elevation,
      toElevation: MathUtils.clamp(elevation, MIN_ELEVATION, MAX_ELEVATION),
      startedAt: performance.now(),
      durationMs: VIEW_TRANSITION_MS
    };
  }

  private applyTransform(): void {
    const cosElevation = Math.cos(this.elevation);
    this.scratchPosition.set(
      this.target.x + this.distance * cosElevation * Math.cos(this.azimuth),
      this.target.y + this.distance * cosElevation * Math.sin(this.azimuth),
      this.target.z + this.distance * Math.sin(this.elevation)
    );
    this.camera.position.copy(this.scratchPosition);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
}

function shortestAngleDelta(from: number, to: number): number {
  // Wrap into (-π, π] so a gizmo snap always rotates through the shorter arc.
  return MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
}

function normalizeAngle(angle: number): number {
  return MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
