import type { HalfEdgeMesh, Vec2 } from '../geometry/HalfEdgeMesh';
import type { UvChart } from '../geometry/uvCharts';
import { chartHasUvOverlap } from '../geometry/uvValidation';

/** Options for packing seam charts into uniform texel cells. */
export interface PixelLayoutOptions {
  readonly textureWidth: number;
  readonly textureHeight: number;
}

/** Fixed texel margin and inter-island gap for the pixel-art layout. */
const PIXEL_MARGIN = 1;
const PIXEL_GAP = 1;

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

interface PackedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function chartPixelBounds(
  chart: UvChart,
  uvs: Float32Array,
  textureWidth: number,
  textureHeight: number
): { minX: number; minY: number; width: number; height: number } {
  const points = localUvs(chart, uvs);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [u, v] of points) {
    const x = u * textureWidth;
    const y = (1 - v) * textureHeight;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    minX,
    minY,
    width: Math.max(maxX - minX, 1e-9),
    height: Math.max(maxY - minY, 1e-9)
  };
}

function tryPack(
  bounds: readonly { width: number; height: number }[],
  scale: number,
  width: number,
  height: number
): PackedRect[] | null {
  const order = bounds
    .map((rect, index) => ({
      index,
      width: Math.max(1, Math.ceil(rect.width * scale)),
      height: Math.max(1, Math.ceil(rect.height * scale))
    }))
    .sort((a, b) =>
      b.height - a.height || b.width - a.width || a.index - b.index
    );
  const placements = new Array<PackedRect>(bounds.length);
  let x = PIXEL_MARGIN;
  let y = PIXEL_MARGIN;
  let rowHeight = 0;
  for (const rect of order) {
    if (rect.width > width - PIXEL_MARGIN * 2) {
      return null;
    }
    if (x + rect.width > width - PIXEL_MARGIN) {
      x = PIXEL_MARGIN;
      y += rowHeight + PIXEL_GAP;
      rowHeight = 0;
    }
    if (y + rect.height > height - PIXEL_MARGIN) {
      return null;
    }
    placements[rect.index] = {
      x,
      y,
      width: rect.width,
      height: rect.height
    };
    x += rect.width + PIXEL_GAP;
    rowHeight = Math.max(rowHeight, rect.height);
  }
  return placements;
}

/**
 * Pack every chart into the texture's integer texel grid.
 *
 * Islands keep their relative size. A single scale is chosen for all charts so
 * texel density is preserved; each island is shelf-packed at whole-pixel
 * dimensions with one pixel between islands and one pixel around the border.
 * No island is rotated or stretched independently.
 */
export function packUvChartsToPixelGrid(
  mesh: HalfEdgeMesh,
  charts: readonly UvChart[],
  uvs: Float32Array,
  options: PixelLayoutOptions
): Float32Array {
  const { textureWidth, textureHeight } = options;
  if (
    !Number.isFinite(textureWidth) ||
    !Number.isFinite(textureHeight) ||
    textureWidth < 3 ||
    textureHeight < 3
  ) {
    throw new PixelLayoutError('Assign a texture before using pixel-art UV layout.');
  }
  if (charts.length === 0) {
    return uvs.slice();
  }
  const bounds = charts.map((chart) =>
    chartPixelBounds(chart, uvs, textureWidth, textureHeight)
  );
  let upperBound = Infinity;
  for (const rect of bounds) {
    upperBound = Math.min(
      upperBound,
      (textureWidth - PIXEL_MARGIN * 2) / rect.width,
      (textureHeight - PIXEL_MARGIN * 2) / rect.height
    );
  }
  if (!Number.isFinite(upperBound) || upperBound <= 0) {
    throw new PixelLayoutError('The texture is too small for the UV islands.');
  }
  let scale = Math.min(1, upperBound);
  let placements = tryPack(bounds, scale, textureWidth, textureHeight);
  if (!placements) {
    let low = 0;
    let high = upperBound;
    placements = null;
    for (let iteration = 0; iteration < 40; iteration += 1) {
      const middle = (low + high) * 0.5;
      const candidate = tryPack(bounds, middle, textureWidth, textureHeight);
      if (candidate) {
        placements = candidate;
        scale = middle;
        low = middle;
      } else {
        high = middle;
      }
    }
  }
  if (!placements) {
    throw new PixelLayoutError(
      `${charts.length} islands do not fit in ${textureWidth} × ${textureHeight} pixels with 1 px padding.`
    );
  }
  const result = uvs.slice();
  charts.forEach((chart, chartIndex) => {
    const rect = bounds[chartIndex];
    const placement = placements![chartIndex];
    const scaleX = placement.width / rect.width;
    const scaleY = placement.height / rect.height;
    const local = localUvs(chart, result);
    const snap = (points: readonly Vec2[], rounded: boolean): Vec2[] =>
      points.map(([u, v]) => {
        const x = u * textureWidth;
        const y = (1 - v) * textureHeight;
        let px = placement.x + (x - rect.minX) * scaleX;
        let py = placement.y + (y - rect.minY) * scaleY;
        if (rounded) {
          px = Math.round(px);
          py = Math.round(py);
        }
        px = Math.min(placement.x + placement.width, Math.max(placement.x, px));
        py = Math.min(placement.y + placement.height, Math.max(placement.y, py));
        return [px / textureWidth, 1 - py / textureHeight] as Vec2;
      });
    const triangles = localTriangles(mesh, chart);
    let next = snap(local, true);
    try {
      validateChart(chartIndex, charts.length, chart, next, triangles);
    } catch (error) {
      if (!(error instanceof PixelLayoutError)) {
        throw error;
      }
      next = snap(local, false);
      try {
        validateChart(chartIndex, charts.length, chart, next, triangles);
      } catch (fallbackError) {
        if (!(fallbackError instanceof PixelLayoutError)) {
          throw fallbackError;
        }
        throw new PixelLayoutError(
          `${fallbackError.message} Unwrap the mesh before packing pixel UVs.`
        );
      }
    }
    writeChartUvs(result, chart, next);
  });
  return result;
}
