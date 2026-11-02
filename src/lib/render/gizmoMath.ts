import {
  Plane,
  Quaternion,
  Vector3,
  type Ray
} from 'three';

/** The three local object axes used by transform handles. */
export type GizmoAxis = 'x' | 'y' | 'z';

export const GIZMO_AXIS_VECTORS: Readonly<Record<GizmoAxis, Vector3>> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1)
};

export const GIZMO_AXES: readonly GizmoAxis[] = ['x', 'y', 'z'];

/** World-space axis direction for a local object axis. */
export function worldAxis(
  axis: GizmoAxis,
  quaternion: Quaternion
): Vector3 {
  return GIZMO_AXIS_VECTORS[axis].clone().applyQuaternion(quaternion);
}

/**
 * Parameter along a line closest to a ray.
 *
 * Used for axis-constrained translation and scale handles. Returns null when
 * the ray is nearly parallel to the axis, where the solution is unstable.
 */
export function closestAxisParameter(
  ray: Ray,
  origin: Vector3,
  axisDirection: Vector3
): number | null {
  const b = axisDirection.dot(ray.direction);
  const denominator = 1 - b * b;
  if (Math.abs(denominator) < 1e-5) {
    return null;
  }
  const w = ray.origin.clone().sub(origin);
  const d = w.dot(axisDirection);
  const e = w.dot(ray.direction);
  return (d - b * e) / denominator;
}

/** Intersect a pointer ray with a world-space plane. */
export function intersectGizmoPlane(
  ray: Ray,
  plane: Plane
): Vector3 | null {
  return ray.intersectPlane(plane, new Vector3());
}

/** Stable orthonormal basis in the plane perpendicular to an axis. */
export function planeBasis(axisDirection: Vector3): {
  u: Vector3;
  v: Vector3;
} {
  const seed =
    Math.abs(axisDirection.x) < 0.9
      ? new Vector3(1, 0, 0)
      : new Vector3(0, 1, 0);
  const u = seed
    .clone()
    .sub(axisDirection.clone().multiplyScalar(seed.dot(axisDirection)))
    .normalize();
  const v = axisDirection.clone().cross(u).normalize();
  return { u, v };
}

/** Angle of a point around an axis relative to a stable plane basis. */
export function angleAroundAxis(
  point: Vector3,
  origin: Vector3,
  basis: { u: Vector3; v: Vector3 }
): number {
  const direction = point.clone().sub(origin);
  return Math.atan2(
    direction.dot(basis.v),
    direction.dot(basis.u)
  );
}

/** Shortest signed angular difference, in radians. */
export function shortestAngleDelta(start: number, current: number): number {
  let delta = current - start;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}

/** Snap one committed scalar to the nearest positive grid increment. */
export function snapScalar(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return value;
  }
  return Math.round(value / step) * step;
}
