import type { Vec3 } from '../geometry/HalfEdgeMesh';

/** Pivot source shared by the gizmo and keyboard transforms. */
export type TransformPivotMode = 'median' | 'origin';

/**
 * Resolve a local-space pivot from selected vertex positions.
 *
 * Median is the arithmetic mean of the unique selected vertices; origin keeps
 * the active object's local origin. Keeping this pure makes both transform
 * paths use exactly the same center.
 */
export function transformPivot(
  positions: readonly Vec3[],
  mode: TransformPivotMode
): Vec3 {
  if (mode === 'origin' || positions.length === 0) {
    return [0, 0, 0];
  }
  let x = 0;
  let y = 0;
  let z = 0;
  for (const position of positions) {
    x += position[0];
    y += position[1];
    z += position[2];
  }
  const count = positions.length;
  return [x / count, y / count, z / count];
}

/** Snap a rotation in radians to a degree step when snapping is enabled. */
export function snapRotationRadians(
  radians: number,
  stepDegrees: number,
  enabled: boolean
): number {
  if (!enabled || !Number.isFinite(radians) || !Number.isFinite(stepDegrees)) {
    return radians;
  }
  const step = (Math.max(0.01, stepDegrees) * Math.PI) / 180;
  return Math.round(radians / step) * step;
}

/** Minimum non-zero scale for editable object transforms. */
export const MIN_OBJECT_SCALE = 0.001;

/** Keep an object scale component away from a singular zero matrix. */
export function clampScaleComponent(value: number): number {
  return Math.max(MIN_OBJECT_SCALE, value);
}

/** Clamp every component of an object scale. */
export function clampScale(
  scale: readonly [number, number, number]
): [number, number, number] {
  return [
    clampScaleComponent(scale[0]),
    clampScaleComponent(scale[1]),
    clampScaleComponent(scale[2])
  ];
}
