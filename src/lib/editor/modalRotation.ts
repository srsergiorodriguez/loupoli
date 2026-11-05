import { shortestAngleDelta } from '../render/gizmoMath';

/** Minimum pointer distance from the pivot before angular rotation is defined. */
const MIN_PIVOT_RADIUS = 4;

/**
 * Convert two pointer positions into a screen-space rotation around a pivot.
 * Returns degrees, positive counterclockwise, or null when the start point is
 * too close to the pivot to define an angle.
 */
export function screenRotationDegrees(
  pivotX: number,
  pivotY: number,
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): number | null {
  const startDx = startX - pivotX;
  const startDy = startY - pivotY;
  if (Math.hypot(startDx, startDy) < MIN_PIVOT_RADIUS) {
    return null;
  }
  const startAngle = Math.atan2(startDy, startDx);
  const currentAngle = Math.atan2(currentY - pivotY, currentX - pivotX);
  // Canvas Y grows downward, so a positive screen angle is clockwise.
  return -(shortestAngleDelta(startAngle, currentAngle) * 180) / Math.PI;
}
