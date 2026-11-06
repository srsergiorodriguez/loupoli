import type { HalfEdgeMesh, Vec2 } from '../geometry/HalfEdgeMesh';
import { extractUvCharts, type UvChart } from '../geometry/uvCharts';

/** One unique source footprint placed into a bake atlas cell. */
export interface BakeAtlasChart {
  readonly index: number;
  readonly minU: number;
  readonly minV: number;
  readonly originU: number;
  readonly originV: number;
  readonly scale: number;
  readonly faces: readonly (readonly Vec2[])[];
}

/** A unique bake UV layout and the chart transforms used to resample texture. */
export interface BakeAtlasPlan {
  readonly targetSize: number;
  readonly scale: number;
  readonly uvs: Float32Array;
  readonly charts: readonly BakeAtlasChart[];
}

interface PackingUnit {
  readonly id: number;
  readonly faces: readonly (readonly Vec2[])[];
  readonly corners: readonly (readonly number[])[];
  readonly minU: number;
  readonly minV: number;
  readonly maxU: number;
  readonly maxV: number;
}

interface Placement {
  readonly id: number;
  readonly originU: number;
  readonly originV: number;
  readonly scale: number;
}

function faceCorners(mesh: HalfEdgeMesh, face: number): number[] {
  const corners: number[] = [];
  const start = mesh.faceHalfEdge[face];
  let halfEdge = start;
  do {
    corners.push(halfEdge);
    halfEdge = mesh.heNext[halfEdge];
  } while (halfEdge !== start && corners.length <= mesh.halfEdgeCount);
  return corners;
}

function trianglesOf(polygon: readonly Vec2[]): [Vec2, Vec2, Vec2][] {
  const triangles: [Vec2, Vec2, Vec2][] = [];
  for (let index = 1; index < polygon.length - 1; index += 1) {
    triangles.push([polygon[0], polygon[index], polygon[index + 1]]);
  }
  return triangles;
}

function faceData(
  mesh: HalfEdgeMesh,
  face: number
): { uvCorners: number[]; polygon: Vec2[] } | null {
  const uvCorners = faceCorners(mesh, face);
  if (uvCorners.length < 3) {
    return null;
  }
  const polygon = uvCorners.map((corner) => mesh.getCornerUv(corner));
  return { uvCorners, polygon };
}

function project(
  triangle: readonly [Vec2, Vec2, Vec2],
  axis: Vec2
): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const point of triangle) {
    const value = point[0] * axis[0] + point[1] * axis[1];
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [min, max];
}

function trianglesOverlap(
  a: readonly [Vec2, Vec2, Vec2],
  b: readonly [Vec2, Vec2, Vec2]
): boolean {
  const axes: Vec2[] = [];
  for (const triangle of [a, b]) {
    for (let index = 0; index < 3; index += 1) {
      const first = triangle[index];
      const second = triangle[(index + 1) % 3];
      const dx = second[0] - first[0];
      const dy = second[1] - first[1];
      const length = Math.hypot(dx, dy);
      if (length > 1e-12) {
        axes.push([-dy / length, dx / length]);
      }
    }
  }
  for (const axis of axes) {
    const [aMin, aMax] = project(a, axis);
    const [bMin, bMax] = project(b, axis);
    if (aMax <= bMin + 1e-9 || bMax <= aMin + 1e-9) {
      return false;
    }
  }
  return true;
}

function facesOverlap(
  first: readonly Vec2[],
  second: readonly Vec2[]
): boolean {
  const a = trianglesOf(first);
  const b = trianglesOf(second);
  for (const triangleA of a) {
    for (const triangleB of b) {
      if (trianglesOverlap(triangleA, triangleB)) {
        return true;
      }
    }
  }
  return false;
}

function unitFromFaces(
  id: number,
  faces: readonly (readonly Vec2[])[],
  corners: readonly (readonly number[])[]
): PackingUnit | null {
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (const face of faces) {
    for (const uv of face) {
      minU = Math.min(minU, uv[0]);
      minV = Math.min(minV, uv[1]);
      maxU = Math.max(maxU, uv[0]);
      maxV = Math.max(maxV, uv[1]);
    }
  }
  if (
    !Number.isFinite(minU) ||
    !Number.isFinite(minV) ||
    !Number.isFinite(maxU) ||
    !Number.isFinite(maxV) ||
    maxU - minU <= 1e-9 ||
    maxV - minV <= 1e-9
  ) {
    return null;
  }
  return { id, faces, corners, minU, minV, maxU, maxV };
}

function chartUnits(
  mesh: HalfEdgeMesh,
  chart: UvChart,
  startId: number
): PackingUnit[] | null {
  const faces: Vec2[][] = [];
  const corners: number[][] = [];
  for (const face of chart.faces) {
    const data = faceData(mesh, face);
    if (!data) {
      return null;
    }
    faces.push(data.polygon);
    corners.push(data.uvCorners);
  }
  if (faces.length === 0) {
    return null;
  }
  if (faces.length === 1) {
    const unit = unitFromFaces(startId, faces, corners);
    return unit ? [unit] : null;
  }
  let overlapping = false;
  for (let a = 0; a < faces.length && !overlapping; a += 1) {
    for (let b = a + 1; b < faces.length; b += 1) {
      if (facesOverlap(faces[a], faces[b])) {
        overlapping = true;
        break;
      }
    }
  }
  if (!overlapping) {
    const unit = unitFromFaces(startId, faces, corners);
    return unit ? [unit] : null;
  }
  // A chart with an intentional stack cannot be baked as one cell. Split it
  // into face units; the final overlap validation catches self-overlapping faces.
  const units: PackingUnit[] = [];
  for (let index = 0; index < faces.length; index += 1) {
    const unit = unitFromFaces(
      startId + index,
      [faces[index]],
      [corners[index]]
    );
    if (!unit) {
      return null;
    }
    units.push(unit);
  }
  return units;
}

function tryPack(
  units: readonly PackingUnit[],
  scale: number,
  margin: number
): Placement[] | null {
  const ordered = [...units].sort((a, b) => {
    const ah = (a.maxV - a.minV) * scale;
    const bh = (b.maxV - b.minV) * scale;
    if (bh !== ah) return bh - ah;
    const aw = (a.maxU - a.minU) * scale;
    const bw = (b.maxU - b.minU) * scale;
    if (bw !== aw) return bw - aw;
    return a.id - b.id;
  });
  const placements: Placement[] = [];
  let x = margin;
  let y = margin;
  let rowHeight = 0;
  for (const unit of ordered) {
    const width = (unit.maxU - unit.minU) * scale;
    const height = (unit.maxV - unit.minV) * scale;
    if (
      width <= 0 ||
      height <= 0 ||
      width > 1 - margin * 2 ||
      height > 1 - margin * 2
    ) {
      return null;
    }
    if (x + width > 1 - margin) {
      x = margin;
      y += rowHeight + margin;
      rowHeight = 0;
    }
    if (y + height > 1 - margin) {
      return null;
    }
    placements.push({
      id: unit.id,
      originU: x,
      originV: y,
      scale
    });
    x += width + margin;
    rowHeight = Math.max(rowHeight, height);
  }
  return placements;
}

/**
 * Pack every non-overlapping UV chart into a unique shelf cell.
 *
 * Charts that contain intentionally stacked faces are split at face
 * boundaries. This is deliberately conservative: it guarantees a bakeable
 * layout for symmetric/overlapping source charts, at the cost of more atlas
 * space. Each cell preserves its source orientation and relative texel size.
 */
export function buildBakeAtlasPlan(
  mesh: HalfEdgeMesh,
  targetSize: number
): BakeAtlasPlan | null {
  const size = Math.max(64, Math.min(2048, Math.round(targetSize)));
  const charts = extractUvCharts(mesh);
  if (charts.length === 0) {
    return null;
  }
  const units: PackingUnit[] = [];
  let nextId = 0;
  for (const chart of charts) {
    const created = chartUnits(mesh, chart, nextId);
    if (!created) {
      return null;
    }
    units.push(...created);
    nextId += created.length;
  }
  const margin = Math.max(1e-4, 2 / size);
  let placements = tryPack(units, 1, margin);
  let scale = 1;
  if (!placements) {
    let low = 1e-5;
    let high = 1;
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const middle = (low + high) * 0.5;
      if (tryPack(units, middle, margin)) {
        low = middle;
        scale = middle;
      } else {
        high = middle;
      }
    }
    placements = tryPack(units, scale, margin);
  }
  if (!placements) {
    return null;
  }
  const byId = new Map(placements.map((placement) => [placement.id, placement]));
  const uvs = mesh.heUv.slice();
  const resultCharts: BakeAtlasChart[] = [];
  for (const unit of units) {
    const placement = byId.get(unit.id);
    if (!placement) {
      return null;
    }
    for (const faceCornersList of unit.corners) {
      for (const corner of faceCornersList) {
        const uv = mesh.getCornerUv(corner);
        uvs[corner * 2] =
          placement.originU + (uv[0] - unit.minU) * placement.scale;
        uvs[corner * 2 + 1] =
          placement.originV + (uv[1] - unit.minV) * placement.scale;
      }
    }
    resultCharts.push({
      index: unit.id,
      minU: unit.minU,
      minV: unit.minV,
      originU: placement.originU,
      originV: placement.originV,
      scale: placement.scale,
      faces: unit.faces
    });
  }
  return {
    targetSize: size,
    scale,
    uvs,
    charts: resultCharts
  };
}
