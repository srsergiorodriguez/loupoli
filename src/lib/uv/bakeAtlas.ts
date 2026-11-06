import type { HalfEdgeMesh, Vec2 } from '../geometry/HalfEdgeMesh';
import { TEXTURE_BLEED_PIXELS } from '../texture/bleed';
import { MAX_TEXTURE_DIMENSION, MAX_TEXTURE_PIXELS } from '../texture/size';

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
  readonly width: number;
  readonly height: number;
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

/**
 * Split faces into true UV islands using shared UV coordinates.
 *
 * Seam flags alone are not enough for imported meshes: two faces can meet on a
 * non-seam mesh edge but carry different UVs. Unioning only across edges whose
 * endpoint UVs match keeps each painted island intact.
 */
function uvIslandFaces(mesh: HalfEdgeMesh): number[][] {
  const parent = new Int32Array(mesh.faceCount);
  for (let face = 0; face < mesh.faceCount; face += 1) {
    parent[face] = face;
  }
  const find = (value: number): number => {
    let current = value;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[rootB] = rootA;
    }
  };
  for (let halfEdge = 0; halfEdge < mesh.halfEdgeCount; halfEdge += 1) {
    const twin = mesh.heTwin[halfEdge];
    if (twin <= halfEdge || mesh.heFace[twin] < 0) {
      continue;
    }
    if (mesh.isEdgeSeam(mesh.heEdge[halfEdge])) {
      continue;
    }
    const next = mesh.heNext[halfEdge];
    const twinNext = mesh.heNext[twin];
    const a0 = mesh.heUv[halfEdge * 2];
    const a1 = mesh.heUv[halfEdge * 2 + 1];
    const b0 = mesh.heUv[next * 2];
    const b1 = mesh.heUv[next * 2 + 1];
    const twinA0 = mesh.heUv[twinNext * 2];
    const twinA1 = mesh.heUv[twinNext * 2 + 1];
    const twinB0 = mesh.heUv[twin * 2];
    const twinB1 = mesh.heUv[twin * 2 + 1];
    const epsilon = 1e-6;
    if (
      Math.abs(a0 - twinA0) <= epsilon &&
      Math.abs(a1 - twinA1) <= epsilon &&
      Math.abs(b0 - twinB0) <= epsilon &&
      Math.abs(b1 - twinB1) <= epsilon
    ) {
      union(mesh.heFace[halfEdge], mesh.heFace[twin]);
    }
  }
  const groups = new Map<number, number[]>();
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const root = find(face);
    const list = groups.get(root) ?? [];
    list.push(face);
    groups.set(root, list);
  }
  return [...groups.values()].sort((a, b) => a[0] - b[0]);
}

function islandUnits(
  mesh: HalfEdgeMesh,
  islandFaces: readonly number[],
  startId: number
): PackingUnit[] | null {
  const faces: Vec2[][] = [];
  const corners: number[][] = [];
  for (const face of islandFaces) {
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
  const layers: number[][] = [];
  for (let face = 0; face < faces.length; face += 1) {
    let placed = false;
    for (const layer of layers) {
      let overlaps = false;
      for (const other of layer) {
        if (facesOverlap(faces[face], faces[other])) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        layer.push(face);
        placed = true;
        break;
      }
    }
    if (!placed) {
      layers.push([face]);
    }
  }
  if (layers.length === 1) {
    const unit = unitFromFaces(startId, faces, corners);
    return unit ? [unit] : null;
  }
  // A genuinely self-overlapping island still needs independent layers. This
  // split never crosses a true UV island boundary.
  const units: PackingUnit[] = [];
  for (let index = 0; index < layers.length; index += 1) {
    const faceIndices = layers[index];
    const unit = unitFromFaces(
      startId + index,
      faceIndices.map((face) => faces[face]),
      faceIndices.map((face) => corners[face])
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
  marginU: number,
  marginV: number
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
  let x = marginU;
  let y = marginV;
  let rowHeight = 0;
  for (const unit of ordered) {
    const width = (unit.maxU - unit.minU) * scale;
    const height = (unit.maxV - unit.minV) * scale;
    if (
      width <= 0 ||
      height <= 0 ||
      width > 1 - marginU * 2 ||
      height > 1 - marginV * 2
    ) {
      return null;
    }
    if (x + width > 1 - marginU) {
      x = marginU;
      y += rowHeight + marginV;
      rowHeight = 0;
    }
    if (y + height > 1 - marginV) {
      return null;
    }
    placements.push({
      id: unit.id,
      originU: x,
      originV: y,
      scale
    });
    x += width + marginU;
    rowHeight = Math.max(rowHeight, height);
  }
  return placements;
}

/**
 * Pack every true UV island into a unique shelf cell.
 *
 * Islands are detected by UV continuity, not seam flags alone. Each island
 * keeps its internal color arrangement; only a self-overlapping island is split
 * into separate layers.
 */
export function buildBakeAtlasPlan(
  mesh: HalfEdgeMesh,
  targetWidth: number,
  targetHeight: number
): BakeAtlasPlan | null {
  const width = Math.max(1, Math.min(MAX_TEXTURE_DIMENSION, Math.round(targetWidth)));
  const height = Math.max(1, Math.min(MAX_TEXTURE_DIMENSION, Math.round(targetHeight)));
  if (
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_TEXTURE_PIXELS
  ) {
    return null;
  }
  const islands = uvIslandFaces(mesh);
  if (islands.length === 0) {
    return null;
  }
  const units: PackingUnit[] = [];
  let nextId = 0;
  for (const island of islands) {
    const created = islandUnits(mesh, island, nextId);
    if (!created) {
      return null;
    }
    units.push(...created);
    nextId += created.length;
  }
  // Leave room for the post-resample bleed on both sides of every cell.
  const gapPixels = TEXTURE_BLEED_PIXELS * 2 + 2;
  const marginU = gapPixels / width;
  const marginV = gapPixels / height;
  let placements = tryPack(units, 1, marginU, marginV);
  let scale = 1;
  if (!placements) {
    let low = 1e-5;
    let high = 1;
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const middle = (low + high) * 0.5;
      if (tryPack(units, middle, marginU, marginV)) {
        low = middle;
        scale = middle;
      } else {
        high = middle;
      }
    }
    placements = tryPack(units, scale, marginU, marginV);
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
    width,
    height,
    scale,
    uvs,
    charts: resultCharts
  };
}
