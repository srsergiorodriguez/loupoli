import type { Vec2 } from '../geometry/HalfEdgeMesh';

/** Median UV position of the selected corners. */
export function uvMedian(values: readonly Vec2[]): Vec2 {
  if (values.length === 0) {
    return [0, 0];
  }
  const sum: Vec2 = [0, 0];
  for (const uv of values) {
    sum[0] += uv[0] / values.length;
    sum[1] += uv[1] / values.length;
  }
  return sum;
}

/** Rotate one UV around a pivot in UV space. */
export function rotateUv(uv: Vec2, pivot: Vec2, radians: number): Vec2 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = uv[0] - pivot[0];
  const y = uv[1] - pivot[1];
  return [
    pivot[0] + x * cosine - y * sine,
    pivot[1] + x * sine + y * cosine
  ];
}

/** Exponential scale factor from screen-space pointer radius change. */
export function uvScaleFactor(
  startRadius: number,
  currentRadius: number,
  precision = 1
): number {
  const reference = Math.max(80, startRadius);
  const factor = Math.exp(
    ((currentRadius - startRadius) / reference) * precision
  );
  return Math.min(100, Math.max(0.01, factor));
}

/** Scale one UV around a pivot, optionally only along U or V. */
export function scaleUv(
  uv: Vec2,
  pivot: Vec2,
  factor: number,
  axis: 'u' | 'v' | null = null
): Vec2 {
  return [
    axis === 'v' ? uv[0] : pivot[0] + (uv[0] - pivot[0]) * factor,
    axis === 'u' ? uv[1] : pivot[1] + (uv[1] - pivot[1]) * factor
  ];
}
