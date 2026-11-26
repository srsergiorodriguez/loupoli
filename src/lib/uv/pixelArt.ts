import type { HalfEdgeMesh, Vec2 } from '../geometry/HalfEdgeMesh';
import type { UvChart } from '../geometry/uvCharts';
import { chartHasUvOverlap } from '../geometry/uvValidation';

/** Options for packing seam charts into uniform texel cells. */
export interface PixelLayoutOptions {
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly cellSize: number;
  readonly padding: number;
  readonly snapAllVertices: boolean;
}

/** One chart-local triangle used by the UV validators. */
interface PixelTriangle {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

/** A pixel-layout failure that should be shown in the UV pane. */
export class PixelLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PixelLayoutError';
  }
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

function localUvs(chart: UvChart, uvs: Float32Array): Vec2[] {
  return chart.uvVertices.map((vertex) => {
    const corner = vertex.corners[0];
    return [uvs[corner * 2], uvs[corner * 2 + 1]];
  });
}

function localTriangles(mesh: HalfEdgeMesh, chart: UvChart): PixelTriangle[] {
  const triangles: PixelTriangle[] = [];
  for (const face of chart.faces) {
    const corners = faceCorners(mesh, face)
      .map((corner) => chart.cornerUvVertex.get(corner))
      .filter((value): value is number => value !== undefined);
    for (let index = 1; index < corners.length - 1; index += 1) {
      triangles.push({ a: corners[0], b: corners[index], c: corners[index + 1] });
    }
  }
  return triangles;
}

function writeChartUvs(
  target: Float32Array,
  chart: UvChart,
  local: readonly Vec2[]
): void {
  for (const [corner, uvVertex] of chart.cornerUvVertex) {
    const uv = local[uvVertex];
    if (uv) {
      target[corner * 2] = uv[0];
      target[corner * 2 + 1] = uv[1];
    }
  }
}

function validateChart(
  chartIndex: number,
  chartCount: number,
  chart: UvChart,
  local: readonly Vec2[],
  triangles: readonly PixelTriangle[]
): void {
  for (const uv of local) {
    if (!Number.isFinite(uv[0]) || !Number.isFinite(uv[1])) {
      throw new PixelLayoutError(
        `Chart ${chartIndex + 1}/${chartCount} — faces ${chart.faces.slice(0, 8).join(', ')} has a non-finite UV.`
      );
    }
  }
  for (const triangle of triangles) {
    const a = local[triangle.a];
    const b = local[triangle.b];
    const c = local[triangle.c];
    const area =
      (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) <= 1e-12) {
      throw new PixelLayoutError(
        `Chart ${chartIndex + 1}/${chartCount} — faces ${chart.faces.slice(0, 8).join(', ')} collapsed during pixel layout.`
      );
    }
  }
  if (chartHasUvOverlap(local, triangles)) {
    throw new PixelLayoutError(
      `Chart ${chartIndex + 1}/${chartCount} — faces ${chart.faces.slice(0, 8).join(', ')} overlaps after pixel layout.`
    );
  }
}

function boundaryVertices(mesh: HalfEdgeMesh, chart: UvChart): Set<number> {
  const result = new Set<number>();
  for (const halfEdge of chart.boundaryHalfEdges) {
    const from = chart.cornerUvVertex.get(halfEdge);
    const to = chart.cornerUvVertex.get(mesh.heNext[halfEdge]);
    if (from !== undefined) {
      result.add(from);
    }
    if (to !== undefined) {
      result.add(to);
    }
  }
  return result;
}

/**
 * True when both sides of a seam are boundary edges of the same chart.
 *
 * Snapping such a chart can close the slit, so those islands keep their
 * aligned (but unsnapped) coordinates while ordinary islands get quantized.
 */
function hasOpenCut(mesh: HalfEdgeMesh, chart: UvChart): boolean {
  const seen = new Set<number>();
  for (const halfEdge of chart.boundaryHalfEdges) {
    const edge = mesh.heEdge[halfEdge];
    if (seen.has(edge)) {
      return true;
    }
    seen.add(edge);
  }
  return false;
}

function rotatedBounds(
  points: readonly Vec2[],
  angle: number
): { readonly points: Vec2[]; readonly width: number; readonly height: number } {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const rotated = points.map(([x, y]) => {
    const next: Vec2 = [x * cos - y * sin, x * sin + y * cos];
    minX = Math.min(minX, next[0]);
    maxX = Math.max(maxX, next[0]);
    minY = Math.min(minY, next[1]);
    maxY = Math.max(maxY, next[1]);
    return next;
  });
  return {
    points: rotated,
    width: Math.max(maxX - minX, 1e-9),
    height: Math.max(maxY - minY, 1e-9)
  };
}

/**
 * Relax interior UV vertices toward their neighbors while keeping seams,
 * holes, and island boundaries fixed.
 */
export function relaxUvCharts(
  mesh: HalfEdgeMesh,
  charts: readonly UvChart[],
  uvs: Float32Array,
  iterations = 8
): Float32Array {
  const result = uvs.slice();
  for (let chartIndex = 0; chartIndex < charts.length; chartIndex += 1) {
    const chart = charts[chartIndex];
    const local = localUvs(chart, result);
    const boundary = boundaryVertices(mesh, chart);
    const neighbors = Array.from({ length: local.length }, () => new Set<number>());
    for (const face of chart.faces) {
      const corners = faceCorners(mesh, face)
        .map((corner) => chart.cornerUvVertex.get(corner))
        .filter((value): value is number => value !== undefined);
      for (let index = 0; index < corners.length; index += 1) {
        const a = corners[index];
        const b = corners[(index + 1) % corners.length];
        neighbors[a].add(b);
        neighbors[b].add(a);
      }
    }
    const interior = local
      .map((_, index) => index)
      .filter((index) => !boundary.has(index));
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      let moved = 0;
      for (const vertex of interior) {
        let u = 0;
        let v = 0;
        let count = 0;
        for (const neighbor of neighbors[vertex]) {
          u += local[neighbor][0];
          v += local[neighbor][1];
          count += 1;
        }
        if (count === 0) {
          continue;
        }
        const next: Vec2 = [u / count, v / count];
        moved = Math.max(
          moved,
          Math.abs(next[0] - local[vertex][0]),
          Math.abs(next[1] - local[vertex][1])
        );
        local[vertex] = next;
      }
      if (moved < 1e-10) {
        break;
      }
    }
    validateChart(chartIndex, charts.length, chart, local, localTriangles(mesh, chart));
    writeChartUvs(result, chart, local);
  }
  return result;
}

/**
 * Pack every chart into a uniform cell on the texture's texel grid.
 *
 * Each island is rotated in 90-degree steps, scaled uniformly into its cell,
 * translated to a whole-texel cell origin, and snapped to texel boundaries.
 * This is intentionally a separate, opt-in layout from normal UV unwrapping.
 */
export function packUvChartsToPixelGrid(
  mesh: HalfEdgeMesh,
  charts: readonly UvChart[],
  uvs: Float32Array,
  options: PixelLayoutOptions
): Float32Array {
  const { textureWidth, textureHeight, cellSize, padding, snapAllVertices } = options;
  if (
    !Number.isFinite(textureWidth) ||
    !Number.isFinite(textureHeight) ||
    textureWidth <= 0 ||
    textureHeight <= 0
  ) {
    throw new PixelLayoutError('Assign a texture before using pixel-art UV layout.');
  }
  if (
    !Number.isInteger(cellSize) ||
    !Number.isInteger(padding) ||
    cellSize <= 0 ||
    padding < 0 ||
    padding * 2 >= cellSize
  ) {
    throw new PixelLayoutError('Pixel cell size and padding are invalid.');
  }
  const columns = Math.floor(textureWidth / cellSize);
  const rows = Math.floor(textureHeight / cellSize);
  if (columns < 1 || rows < 1) {
    throw new PixelLayoutError(
      `A ${cellSize}px cell does not fit a ${textureWidth} × ${textureHeight} texture.`
    );
  }
  if (charts.length > columns * rows) {
    throw new PixelLayoutError(
      `${charts.length} islands do not fit in ${columns} × ${rows} cells at ${cellSize}px. Use a larger texture or a smaller cell.`
    );
  }
  const result = uvs.slice();
  const innerSize = cellSize - padding * 2;
  charts.forEach((chart, chartIndex) => {
    const source = localUvs(chart, result);
    const pixelPoints = source.map(
      ([u, v]) => [u * textureWidth, (1 - v) * textureHeight] as Vec2
    );
    let best: { angle: number; points: Vec2[]; width: number; height: number; scale: number } | null =
      null;
    for (const angle of [0, 90, 180, 270]) {
      const bounded = rotatedBounds(pixelPoints, angle);
      const scale = Math.min(innerSize / bounded.width, innerSize / bounded.height);
      if (
        best === null ||
        scale > best.scale + 1e-9 ||
        (Math.abs(scale - best.scale) <= 1e-9 && angle === 0)
      ) {
        best = { angle, ...bounded, scale };
      }
    }
    if (!best) {
      throw new PixelLayoutError('A pixel-art island has no usable orientation.');
    }
    let minX = Infinity;
    let minY = Infinity;
    for (const [x, y] of best.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
    }
    const column = chartIndex % columns;
    const row = Math.floor(chartIndex / columns);
    const cellX = column * cellSize;
    const cellY = row * cellSize;
    const boundary = boundaryVertices(mesh, chart);
    const aligned = best.points.map(([x, y]) => {
      const px = cellX + padding + (x - minX) * best!.scale;
      const py = cellY + padding + (y - minY) * best!.scale;
      return [px / textureWidth, 1 - py / textureHeight] as Vec2;
    });
    const snapped = best.points.map(([x, y], index) => {
      let px = cellX + padding + (x - minX) * best!.scale;
      let py = cellY + padding + (y - minY) * best!.scale;
      if (snapAllVertices || boundary.has(index)) {
        px = Math.min(
          cellX + cellSize - padding,
          Math.max(cellX + padding, Math.round(px))
        );
        py = Math.min(
          cellY + cellSize - padding,
          Math.max(cellY + padding, Math.round(py))
        );
      }
      return [px / textureWidth, 1 - py / textureHeight] as Vec2;
    });
    const triangles = localTriangles(mesh, chart);
    const cut = hasOpenCut(mesh, chart);
    let local = cut ? aligned : snapped;
    try {
      validateChart(chartIndex, charts.length, chart, local, triangles);
    } catch (error) {
      // Quantizing a very thin cut/slit can collapse a triangle. Keep the
      // aligned island (still inside its integer cell) rather than failing the
      // whole layout or producing a broken UV.
      if (!(error instanceof PixelLayoutError)) {
        throw error;
      }
      validateChart(chartIndex, charts.length, chart, aligned, triangles);
      local = aligned;
    }
    writeChartUvs(result, chart, local);
  });
  return result;
}
