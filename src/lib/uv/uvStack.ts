import type { HalfEdgeMesh, Vec2 } from '../geometry/HalfEdgeMesh';
import type { UvTopology } from './uvElements';

/** Topology-only signature used before stacking two UV islands. */
export interface UvChartSignature {
  readonly faces: number;
  readonly vertices: number;
  readonly edges: number;
  readonly boundaryHalfEdges: number;
  readonly faceValences: readonly number[];
  readonly vertexDegrees: readonly number[];
}

/** A similarity alignment of one chart's corners onto another chart. */
export interface UvChartAlignment {
  readonly corners: readonly number[];
  readonly before: readonly Vec2[];
  readonly after: readonly Vec2[];
}

function sortNumbers(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** Derive a deterministic topology signature for one chart. */
export function uvChartSignature(
  topology: UvTopology,
  chartIndex: number
): UvChartSignature | null {
  const chart = topology.charts[chartIndex];
  if (!chart) {
    return null;
  }
  const edges = topology.edges.filter((edge) => edge.chart === chartIndex);
  const degrees = new Map<number, number>();
  for (const edge of edges) {
    degrees.set(edge.a, (degrees.get(edge.a) ?? 0) + 1);
    degrees.set(edge.b, (degrees.get(edge.b) ?? 0) + 1);
  }
  const faceValences = topology.faces
    .filter((face) => face.chart === chartIndex)
    .map((face) => face.corners.length);
  return {
    faces: chart.faces.length,
    vertices: chart.vertices.length,
    edges: edges.length,
    boundaryHalfEdges: chart.boundaryHalfEdges.length,
    faceValences: sortNumbers(faceValences),
    vertexDegrees: sortNumbers([...degrees.values()])
  };
}

/** Whether two charts have matching counts, valences, and boundary structure. */
export function sameUvTopology(
  topology: UvTopology,
  first: number,
  second: number
): boolean {
  const a = uvChartSignature(topology, first);
  const b = uvChartSignature(topology, second);
  return a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Similarity-align one UV chart onto another.
 *
 * The operation preserves the moving chart's internal UV layout: it translates,
 * rotates, and uniformly scales the whole chart so its centroid and radius
 * match the reference. Topology must match before this is called.
 */
export function alignUvChart(
  mesh: HalfEdgeMesh,
  topology: UvTopology,
  referenceChart: number,
  movingChart: number
): UvChartAlignment | null {
  const referenceCorners = topology.chartCorners[referenceChart];
  const movingCorners = topology.chartCorners[movingChart];
  if (
    !referenceCorners ||
    !movingCorners ||
    referenceCorners.length === 0 ||
    movingCorners.length === 0
  ) {
    return null;
  }
  const stats = (corners: readonly number[]) => {
    let x = 0;
    let y = 0;
    for (const corner of corners) {
      x += mesh.heUv[corner * 2];
      y += mesh.heUv[corner * 2 + 1];
    }
    x /= corners.length;
    y /= corners.length;
    let maxRadius = 1e-6;
    let maxAngle = 0;
    let radiusSq = 0;
    for (const corner of corners) {
      const dx = mesh.heUv[corner * 2] - x;
      const dy = mesh.heUv[corner * 2 + 1] - y;
      const distance = Math.hypot(dx, dy);
      radiusSq += distance * distance;
      if (distance > maxRadius) {
        maxRadius = distance;
        maxAngle = Math.atan2(dy, dx);
      }
    }
    return {
      x,
      y,
      radius: Math.sqrt(radiusSq / corners.length),
      angle: maxAngle
    };
  };
  const reference = stats(referenceCorners);
  const moving = stats(movingCorners);
  if (reference.radius <= 1e-6 || moving.radius <= 1e-6) {
    return null;
  }
  const scale = reference.radius / moving.radius;
  const angle = reference.angle - moving.angle;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const corners = [...movingCorners].sort((a, b) => a - b);
  const before = corners.map((corner) => mesh.getCornerUv(corner));
  const after = before.map(([u, v]) => {
    const dx = (u - moving.x) * scale;
    const dy = (v - moving.y) * scale;
    return [
      reference.x + dx * cosine - dy * sine,
      reference.y + dx * sine + dy * cosine
    ] as Vec2;
  });
  return { corners, before, after };
}


/**
 * Copy the reference chart's UV layout onto the moving chart.
 *
 * A similarity transform first predicts where each moving corner belongs. The
 * predicted position is matched one-to-one against reference corners; every
 * moving corner then receives the corresponding reference UV. Returning null
 * means the predicted mapping was not bijective, so a misleading overlay is not
 * applied.
 */
export function copyUvChart(
  mesh: HalfEdgeMesh,
  topology: UvTopology,
  referenceChart: number,
  movingChart: number
): UvChartAlignment | null {
  const alignment = alignUvChart(
    mesh,
    topology,
    referenceChart,
    movingChart
  );
  if (!alignment) {
    return null;
  }
  const referenceCorners = topology.chartCorners[referenceChart];
  const referenceUvs = referenceCorners.map((corner) =>
    mesh.getCornerUv(corner)
  );
  const used = new Set<number>();
  const mapped: Vec2[] = [];
  for (const predicted of alignment.after) {
    let best = -1;
    let bestDistance = Infinity;
    for (let index = 0; index < referenceUvs.length; index += 1) {
      if (used.has(index)) {
        continue;
      }
      const distance = Math.hypot(
        referenceUvs[index][0] - predicted[0],
        referenceUvs[index][1] - predicted[1]
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    if (best < 0) {
      return null;
    }
    used.add(best);
    mapped.push([...referenceUvs[best]] as Vec2);
  }
  if (used.size !== referenceUvs.length) {
    return null;
  }
  return {
    corners: alignment.corners,
    before: alignment.before,
    after: mapped
  };
}
