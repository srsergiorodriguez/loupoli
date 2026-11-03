import type { Vec2 } from './HalfEdgeMesh';

type Point = readonly [number, number];

function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function project(points: readonly Point[], axis: Point): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point[0] * axis[0] + point[1] * axis[1];
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [min, max];
}

/** Test two UV triangles for positive-area overlap using SAT. */
export function uvTrianglesOverlap(
  a: readonly [Vec2, Vec2, Vec2],
  b: readonly [Vec2, Vec2, Vec2]
): boolean {
  const axes: Point[] = [];
  for (const triangle of [a, b]) {
    for (let index = 0; index < 3; index += 1) {
      const p = triangle[index];
      const q = triangle[(index + 1) % 3];
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const length = Math.hypot(dx, dy);
      if (length > 1e-12) {
        axes.push([-dy / length, dx / length]);
      }
    }
  }
  for (const axis of axes) {
    const [aMin, aMax] = project(a, axis);
    const [bMin, bMax] = project(b, axis);
    if (aMax <= bMin + 1e-10 || bMax <= aMin + 1e-10) {
      return false;
    }
  }
  // A positive-area overlap exists when no separating axis was found. Collinear
  // edge contact has zero area and should not be treated as a fold.
  for (const triangle of a) {
    if (cross(b[0], b[1], triangle) === 0 && cross(b[1], b[2], triangle) === 0) {
      return false;
    }
  }
  return true;
}

/** Check a chart's UV triangles do not overlap excluding shared topology. */
export function chartHasUvOverlap(
  uvs: readonly Vec2[],
  triangles: readonly { readonly a: number; readonly b: number; readonly c: number }[]
): boolean {
  for (let i = 0; i < triangles.length; i += 1) {
    const first = triangles[i];
    const ta: readonly [Vec2, Vec2, Vec2] = [
      uvs[first.a],
      uvs[first.b],
      uvs[first.c]
    ];
    for (let j = i + 1; j < triangles.length; j += 1) {
      const second = triangles[j];
      if (
        first.a === second.a ||
        first.a === second.b ||
        first.a === second.c ||
        first.b === second.a ||
        first.b === second.b ||
        first.b === second.c ||
        first.c === second.a ||
        first.c === second.b ||
        first.c === second.c
      ) {
        continue;
      }
      const tb: readonly [Vec2, Vec2, Vec2] = [
        uvs[second.a],
        uvs[second.b],
        uvs[second.c]
      ];
      if (uvTrianglesOverlap(ta, tb)) {
        return true;
      }
    }
  }
  return false;
}
