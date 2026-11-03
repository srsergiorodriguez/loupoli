import type { HalfEdgeMesh, Vec2 } from '../geometry/HalfEdgeMesh';
import { extractUvCharts, type UvChart } from '../geometry/uvCharts';
import { uvToCanvas, type UvProjection } from './uvView';

/** UV selection granularity. */
export type UvSelectionMode = 'vertex' | 'edge' | 'face' | 'island';

/** One selectable UV entity and the corners it owns. */
export interface UvElementHit {
  readonly kind: UvSelectionMode;
  readonly chart: number;
  readonly corners: readonly number[];
}

/** One UV vertex within a chart. */
export interface UvVertexGroup {
  readonly chart: number;
  readonly vertex: number;
  readonly corners: readonly number[];
  readonly uv: Vec2;
}

/** One undirected UV edge within a chart. */
export interface UvEdgeGroup {
  readonly chart: number;
  readonly a: number;
  readonly b: number;
  readonly corners: readonly number[];
  readonly uvA: Vec2;
  readonly uvB: Vec2;
}

/** One UV face with its chart membership. */
export interface UvFaceGroup {
  readonly face: number;
  readonly chart: number;
  readonly corners: readonly number[];
}

/** Derived UV topology used by element picking. */
export interface UvTopology {
  readonly charts: readonly UvChart[];
  readonly vertices: readonly UvVertexGroup[];
  readonly edges: readonly UvEdgeGroup[];
  readonly faces: readonly UvFaceGroup[];
  readonly chartCorners: readonly (readonly number[])[];
}

/** Build chart, vertex, edge, and face groups for the current UV layout. */
export function buildUvTopology(mesh: HalfEdgeMesh): UvTopology {
  const charts = extractUvCharts(mesh);
  const faceChart = new Int32Array(mesh.faceCount).fill(-1);
  const chartCorners: number[][] = charts.map(() => []);
  for (let chart = 0; chart < charts.length; chart += 1) {
    for (const face of charts[chart].faces) {
      faceChart[face] = chart;
      const start = mesh.faceHalfEdge[face];
      let halfEdge = start;
      do {
        chartCorners[chart].push(halfEdge);
        halfEdge = mesh.heNext[halfEdge];
      } while (halfEdge !== start);
    }
    chartCorners[chart].sort((a, b) => a - b);
  }

  interface VertexBuilder {
    chart: number;
    vertex: number;
    corners: number[];
  }
  const vertexMap = new Map<string, VertexBuilder>();
  const faceGroups: UvFaceGroup[] = [];
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const chart = faceChart[face];
    if (chart < 0) {
      continue;
    }
    const corners: number[] = [];
    const start = mesh.faceHalfEdge[face];
    let halfEdge = start;
    do {
      corners.push(halfEdge);
      const key = `${chart}:${mesh.heOrigin[halfEdge]}`;
      const existing = vertexMap.get(key);
      if (existing) {
        existing.corners.push(halfEdge);
      } else {
        vertexMap.set(key, {
          chart,
          vertex: mesh.heOrigin[halfEdge],
          corners: [halfEdge]
        });
      }
      halfEdge = mesh.heNext[halfEdge];
    } while (halfEdge !== start);
    faceGroups.push({ face, chart, corners });
  }

  const vertexGroups: UvVertexGroup[] = [...vertexMap.values()].map(
    (builder) => {
      const corner = builder.corners[0];
      return {
        chart: builder.chart,
        vertex: builder.vertex,
        corners: builder.corners.sort((a, b) => a - b),
        uv: mesh.getCornerUv(corner)
      };
    }
  );
  const vertexKey = new Map<string, UvVertexGroup>();
  for (const group of vertexGroups) {
    vertexKey.set(`${group.chart}:${group.vertex}`, group);
  }

  interface EdgeBuilder {
    chart: number;
    a: number;
    b: number;
    corners: Set<number>;
  }
  const edgeMap = new Map<string, EdgeBuilder>();
  for (let halfEdge = 0; halfEdge < mesh.halfEdgeCount; halfEdge += 1) {
    const chart = faceChart[mesh.heFace[halfEdge]];
    if (chart < 0) {
      continue;
    }
    const next = mesh.heNext[halfEdge];
    const a = mesh.heOrigin[halfEdge];
    const b = mesh.heOrigin[next];
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    const key = `${chart}:${low}:${high}`;
    let builder = edgeMap.get(key);
    if (!builder) {
      builder = { chart, a: low, b: high, corners: new Set() };
      edgeMap.set(key, builder);
    }
    builder.corners.add(halfEdge);
    builder.corners.add(next);
  }

  const edgeGroups: UvEdgeGroup[] = [];
  for (const builder of edgeMap.values()) {
    const groupA = vertexKey.get(`${builder.chart}:${builder.a}`);
    const groupB = vertexKey.get(`${builder.chart}:${builder.b}`);
    if (!groupA || !groupB) {
      continue;
    }
    const corners = new Set(builder.corners);
    for (const corner of groupA.corners) corners.add(corner);
    for (const corner of groupB.corners) corners.add(corner);
    edgeGroups.push({
      chart: builder.chart,
      a: builder.a,
      b: builder.b,
      corners: [...corners].sort((a, b) => a - b),
      uvA: groupA.uv,
      uvB: groupB.uv
    });
  }

  return {
    charts,
    vertices: vertexGroups,
    edges: edgeGroups,
    faces: faceGroups,
    chartCorners
  };
}

function pointInPolygon(
  x: number,
  y: number,
  points: readonly { x: number; y: number }[]
): boolean {
  let inside = false;
  for (
    let index = 0, previous = points.length - 1;
    index < points.length;
    previous = index++
  ) {
    const a = points[index];
    const b = points[previous];
    if (
      (a.y > y) !== (b.y > y) &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(
  x: number,
  y: number,
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0
    ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSq))
    : 0;
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}

/**
 * Select UV corners inside a screen-space lasso for the active entity mode.
 *
 * Vertices use point containment, edges use endpoint containment or segment
 * crossing, faces use corner/centroid containment, and islands expand any hit
 * face to the complete chart.
 */
export function selectUvCornersInPolygon(
  mesh: HalfEdgeMesh,
  topology: UvTopology,
  mode: UvSelectionMode,
  polygon: readonly { x: number; y: number }[],
  projection: UvProjection
): number[] {
  if (polygon.length < 3) {
    return [];
  }
  const selected = new Set<number>();
  if (mode === 'vertex') {
    for (const group of topology.vertices) {
      const point = uvToCanvas(group.uv, projection);
      if (pointInPolygon(point.x, point.y, polygon)) {
        for (const corner of group.corners) selected.add(corner);
      }
    }
    return [...selected].sort((a, b) => a - b);
  }
  if (mode === 'edge') {
    for (const group of topology.edges) {
      const a = uvToCanvas(group.uvA, projection);
      const b = uvToCanvas(group.uvB, projection);
      let crosses = false;
      for (let index = 0; index < polygon.length && !crosses; index += 1) {
        const next = polygon[(index + 1) % polygon.length];
        crosses = segmentsIntersect(a, b, polygon[index], next);
      }
      if (
        crosses ||
        pointInPolygon(a.x, a.y, polygon) ||
        pointInPolygon(b.x, b.y, polygon)
      ) {
        for (const corner of group.corners) selected.add(corner);
      }
    }
    return [...selected].sort((a, b) => a - b);
  }
  const hitCharts = new Set<number>();
  for (const face of topology.faces) {
    const points = face.corners.map((corner) =>
      uvToCanvas(mesh.getCornerUv(corner), projection)
    );
    let inside = false;
    for (const point of points) {
      if (pointInPolygon(point.x, point.y, polygon)) {
        inside = true;
        break;
      }
    }
    if (!inside) {
      let cx = 0;
      let cy = 0;
      for (const point of points) {
        cx += point.x;
        cy += point.y;
      }
      inside = pointInPolygon(
        cx / points.length,
        cy / points.length,
        polygon
      );
    }
    if (!inside) {
      continue;
    }
    if (mode === 'face') {
      for (const corner of face.corners) selected.add(corner);
    } else {
      hitCharts.add(face.chart);
    }
  }
  if (mode === 'island') {
    for (const chart of hitCharts) {
      for (const corner of topology.chartCorners[chart]) {
        selected.add(corner);
      }
    }
  }
  return [...selected].sort((a, b) => a - b);
}

function segmentsIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number }
): boolean {
  const orientation = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number
  ): number => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const o1 = orientation(a.x, a.y, b.x, b.y, c.x, c.y);
  const o2 = orientation(a.x, a.y, b.x, b.y, d.x, d.y);
  const o3 = orientation(c.x, c.y, d.x, d.y, a.x, a.y);
  const o4 = orientation(c.x, c.y, d.x, d.y, b.x, b.y);
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

/**
 * Pick a UV vertex, edge, face, or island in panel-local CSS pixels.

 *
 * Vertices and edges use a 16 px screen tolerance; faces require the point to
 * be inside the UV polygon. Islands resolve through the picked face or vertex.
 */
export function pickUvElement(
  mesh: HalfEdgeMesh,
  topology: UvTopology,
  mode: UvSelectionMode,
  x: number,
  y: number,
  projection: UvProjection,
  radius = 16
): UvElementHit | null {
  if (mode === 'vertex') {
    let best: UvVertexGroup | null = null;
    let bestDistance = radius;
    for (const group of topology.vertices) {
      const point = uvToCanvas(group.uv, projection);
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = group;
      }
    }
    return best
      ? { kind: mode, chart: best.chart, corners: best.corners }
      : null;
  }

  if (mode === 'edge') {
    let best: UvEdgeGroup | null = null;
    let bestDistance = radius;
    for (const group of topology.edges) {
      const a = uvToCanvas(group.uvA, projection);
      const b = uvToCanvas(group.uvB, projection);
      const distance = distanceToSegment(x, y, a, b);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = group;
      }
    }
    return best
      ? { kind: mode, chart: best.chart, corners: best.corners }
      : null;
  }

  // Faces and islands both need a face under the pointer. Prefer the smallest
  // containing polygon so stacked/overlapping islands remain deterministic.
  let bestFace: UvFaceGroup | null = null;
  let bestArea = Infinity;
  for (const faceGroup of topology.faces) {
    const points = faceGroup.corners.map((corner) =>
      uvToCanvas(mesh.getCornerUv(corner), projection)
    );
    if (!pointInPolygon(x, y, points)) {
      continue;
    }
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    area = Math.abs(area) / 2;
    if (area < bestArea) {
      bestArea = area;
      bestFace = faceGroup;
    }
  }
  if (!bestFace) {
    return null;
  }
  if (mode === 'face') {
    return {
      kind: mode,
      chart: bestFace.chart,
      corners: bestFace.corners
    };
  }
  return {
    kind: mode,
    chart: bestFace.chart,
    corners: topology.chartCorners[bestFace.chart]
  };
}
