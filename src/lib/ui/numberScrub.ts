/**
 * Convert a horizontal drag into a numeric value.
 *
 * One pointer pixel is half a step; holding Shift reduces sensitivity by 10×.
 * Values are rounded to six decimals to avoid binary floating-point noise.
 */
export function scrubNumber(
  start: number,
  dx: number,
  step: number,
  fine = false,
  min?: number,
  max?: number
): number {
  const sensitivity = fine ? 0.1 : 1;
  const next = start + (dx / 2) * step * sensitivity;
  const rounded = Number(next.toFixed(6));
  return Math.min(
    max ?? Number.POSITIVE_INFINITY,
    Math.max(min ?? Number.NEGATIVE_INFINITY, rounded)
  );
}
