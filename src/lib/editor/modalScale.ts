/** Minimum pointer distance from the pivot before radial scaling is defined. */
const MIN_PIVOT_RADIUS = 8;

/**
 * Scale factor from the pointer distance to a pivot.
 *
 * Moving away from the pivot scales up, moving toward it scales down, and
 * moving around it at a constant radius leaves the scale unchanged.
 */
export function screenScaleFactor(
  pivotX: number,
  pivotY: number,
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): number | null {
  const startRadius = Math.hypot(startX - pivotX, startY - pivotY);
  if (startRadius < MIN_PIVOT_RADIUS) {
    return null;
  }
  const currentRadius = Math.hypot(currentX - pivotX, currentY - pivotY);
  return Math.max(0.001, currentRadius / startRadius);
}
