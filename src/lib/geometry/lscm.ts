import type { HalfEdgeMesh, Vec2, Vec3 } from './HalfEdgeMesh';
import type { UvChart } from './uvCharts';

/** A failure that the unwrap UI should surface instead of applying bad UVs. */
export class LscmError extends Error {}

interface LocalTriangle {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

interface SparseRow {
  readonly indices: number[];
  readonly values: number[];
  readonly rhs: number;
}

function faceCorners(mesh: HalfEdgeMesh, face: number): number[] {
  const corners: number[] = [];
  const start = mesh.faceHalfEdge[face];
  let halfEdge = start;
  do {
    corners.push(halfEdge);
    halfEdge = mesh.heNext[halfEdge];
  } while (halfEdge !== start);
  return corners;
}

function triangleArea2(a: Vec3, b: Vec3, c: Vec3): number {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  );
}

/**
 * Least-squares conformal parameterization of one chart.
 *
 * The solver linearizes the Cauchy-Riemann equations on each triangle, pins
 * the farthest boundary (or surface) vertex pair, and solves the normal
 * equations with conjugate gradients. Charts are low-poly by design, and the
 * implementation remains dependency-free as required.
 */
function unwrapChart(mesh: HalfEdgeMesh, chart: UvChart): Map<number, Vec2> {
  const local = new Map<number, number>();
  chart.vertices.forEach((vertex, index) => local.set(vertex, index));
  const count = chart.vertices.length;
  if (count < 3) {
    throw new LscmError('A UV chart needs at least three vertices.');
  }
  if (chart.boundaryHalfEdges.length === 0) {
    throw new LscmError(
      'A closed UV chart has no boundary. Mark a closed seam loop before unwrapping.'
    );
  }

  const triangles: LocalTriangle[] = [];
  for (const face of chart.faces) {
    const corners = faceCorners(mesh, face);
    if (corners.length < 3) {
      continue;
    }
    const first = local.get(mesh.heOrigin[corners[0]]);
    if (first === undefined) {
      continue;
    }
    for (let corner = 1; corner < corners.length - 1; corner += 1) {
      const b = local.get(mesh.heOrigin[corners[corner]]);
      const c = local.get(mesh.heOrigin[corners[corner + 1]]);
      if (b === undefined || c === undefined) {
        continue;
      }
      triangles.push({ a: first, b, c });
    }
  }
  if (triangles.length === 0) {
    throw new LscmError('A UV chart has no non-degenerate triangles.');
  }

  const positions = chart.vertices.map((vertex) => mesh.getVertexPosition(vertex));
  const boundaryVertices = new Set<number>();
  for (const halfEdge of chart.boundaryHalfEdges) {
    boundaryVertices.add(mesh.heOrigin[halfEdge]);
  }
  const pinCandidates =
    boundaryVertices.size >= 2
      ? [...boundaryVertices].map((vertex) => local.get(vertex) as number)
      : Array.from({ length: count }, (_, index) => index);

  let pinA = 0;
  let pinB = Math.min(1, count - 1);
  let farthest = -1;
  for (let i = 0; i < pinCandidates.length; i += 1) {
    for (let j = i + 1; j < pinCandidates.length; j += 1) {
      const a = pinCandidates[i];
      const b = pinCandidates[j];
      const distance = Math.hypot(
        positions[a][0] - positions[b][0],
        positions[a][1] - positions[b][1],
        positions[a][2] - positions[b][2]
      );
      if (distance > farthest) {
        farthest = distance;
        pinA = a;
        pinB = b;
      }
    }
  }
  if (farthest <= 1e-9) {
    throw new LscmError('A UV chart has no usable pin distance.');
  }

  const fixed = new Map<number, number>([
    [pinA * 2, 0],
    [pinA * 2 + 1, 0],
    [pinB * 2, farthest],
    [pinB * 2 + 1, 0]
  ]);
  const fixedVariables = new Set(fixed.keys());
  const freeVariables: number[] = [];
  for (let variable = 0; variable < count * 2; variable += 1) {
    if (!fixedVariables.has(variable)) {
      freeVariables.push(variable);
    }
  }
  const freeIndex = new Map<number, number>();
  freeVariables.forEach((variable, index) => freeIndex.set(variable, index));

  const rows: SparseRow[] = [];
  const addRow = (coefficients: Map<number, number>): void => {
    let rhs = 0;
    const indices: number[] = [];
    const values: number[] = [];
    for (const [variable, coefficient] of coefficients) {
      const pinned = fixed.get(variable);
      if (pinned !== undefined) {
        rhs -= coefficient * pinned;
      } else {
        const index = freeIndex.get(variable);
        if (index !== undefined) {
          indices.push(index);
          values.push(coefficient);
        }
      }
    }
    if (indices.length > 0) {
      rows.push({ indices, values, rhs });
    }
  };

  for (const triangle of triangles) {
    const va = chart.vertices[triangle.a];
    const vb = chart.vertices[triangle.b];
    const vc = chart.vertices[triangle.c];
    const p0 = mesh.getVertexPosition(va);
    const p1 = mesh.getVertexPosition(vb);
    const p2 = mesh.getVertexPosition(vc);
    const area2 = triangleArea2(p0, p1, p2);
    if (area2 <= 1e-12) {
      continue;
    }
    const e1: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const length = Math.hypot(e1[0], e1[1], e1[2]);
    if (length <= 1e-9) {
      continue;
    }
    const ex: Vec3 = [e1[0] / length, e1[1] / length, e1[2] / length];
    const e2: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const x2 = e2[0] * ex[0] + e2[1] * ex[1] + e2[2] * ex[2];
    const y2 = Math.hypot(
      e2[0] - ex[0] * x2,
      e2[1] - ex[1] * x2,
      e2[2] - ex[2] * x2
    );
    if (y2 <= 1e-9) {
      continue;
    }
    // For local triangle (0,0), (L,0), (x,y), the barycentric gradients are
    // constant and the Cauchy-Riemann residuals become two linear rows:
    //   u_x - v_y = 0
    //   u_y + v_x = 0
    const g0: Vec2 = [-1 / length, (x2 - length) / (length * y2)];
    const g1: Vec2 = [1 / length, -x2 / (length * y2)];
    const g2: Vec2 = [0, 1 / y2];
    const weight = Math.sqrt(area2 / 2);
    const gradients = [g0, g1, g2];
    const vertices = [triangle.a, triangle.b, triangle.c];
    for (const equation of [0, 1] as const) {
      const coefficients = new Map<number, number>();
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = vertices[corner];
        const gradient = gradients[corner];
        if (equation === 0) {
          coefficients.set(vertex * 2, gradient[0] * weight);
          coefficients.set(vertex * 2 + 1, -gradient[1] * weight);
        } else {
          coefficients.set(vertex * 2, gradient[1] * weight);
          coefficients.set(vertex * 2 + 1, gradient[0] * weight);
        }
      }
      addRow(coefficients);
    }
  }

  if (rows.length === 0 || freeVariables.length === 0) {
    throw new LscmError('A UV chart produced no solvable conformal equations.');
  }

  // Normal equations: A^T A x = A^T b. The rows are sparse and applied on the
  // fly, so no dense matrix proportional to chartSize^2 is allocated.
  const b = new Float64Array(freeVariables.length);
  for (const row of rows) {
    for (let index = 0; index < row.indices.length; index += 1) {
      b[row.indices[index]] += row.values[index] * row.rhs;
    }
  }
  const applyNormal = (input: Float64Array): Float64Array => {
    const output = new Float64Array(input.length);
    for (const row of rows) {
      let dot = 0;
      for (let index = 0; index < row.indices.length; index += 1) {
        dot += row.values[index] * input[row.indices[index]];
      }
      for (let index = 0; index < row.indices.length; index += 1) {
        output[row.indices[index]] += row.values[index] * dot;
      }
    }
    return output;
  };

  const x = new Float64Array(freeVariables.length);
  const residual = b.slice();
  const direction = residual.slice();
  let residualSq = 0;
  for (const value of residual) {
    residualSq += value * value;
  }
  const tolerance = Math.max(1e-12, residualSq * 1e-18);
  const maxIterations = Math.max(64, freeVariables.length * 6);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const normalDirection = applyNormal(direction);
    let denominator = 0;
    for (let index = 0; index < direction.length; index += 1) {
      denominator += direction[index] * normalDirection[index];
    }
    if (Math.abs(denominator) <= 1e-18) {
      break;
    }
    const alpha = residualSq / denominator;
    for (let index = 0; index < x.length; index += 1) {
      x[index] += alpha * direction[index];
      residual[index] -= alpha * normalDirection[index];
    }
    let nextResidualSq = 0;
    for (const value of residual) {
      nextResidualSq += value * value;
    }
    if (nextResidualSq <= tolerance) {
      break;
    }
    const beta = nextResidualSq / residualSq;
    for (let index = 0; index < direction.length; index += 1) {
      direction[index] = residual[index] + beta * direction[index];
    }
    residualSq = nextResidualSq;
  }

  const uvs: Vec2[] = Array.from({ length: count }, () => [0, 0]);
  for (const [variable, value] of fixed) {
    uvs[Math.floor(variable / 2)][variable % 2] = value;
  }
  for (let index = 0; index < freeVariables.length; index += 1) {
    const variable = freeVariables[index];
    uvs[Math.floor(variable / 2)][variable % 2] = x[index];
  }
  for (const uv of uvs) {
    if (!Number.isFinite(uv[0]) || !Number.isFinite(uv[1])) {
      throw new LscmError('LSCM produced a non-finite UV coordinate.');
    }
  }

  // Reject collapsed or folded charts before the UI can apply them. A global
  // negative orientation is valid; mixed signs mean at least one triangle
  // flipped relative to its neighbors.
  let positive = 0;
  let negative = 0;
  for (const triangle of triangles) {
    const a = uvs[triangle.a];
    const b = uvs[triangle.b];
    const c = uvs[triangle.c];
    const area =
      (b[0] - a[0]) * (c[1] - a[1]) -
      (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) <= 1e-12) {
      throw new LscmError('LSCM collapsed a chart to zero-area triangles.');
    }
    if (area > 0) {
      positive += 1;
    } else {
      negative += 1;
    }
  }
  if (positive > 0 && negative > 0) {
    throw new LscmError('LSCM produced flipped UV triangles; adjust seams and retry.');
  }

  // Align the longest chart boundary edge horizontally. Pins fix scale and
  // rotation mathematically, but a diagonal pin pair would otherwise leave a
  // square chart displayed as a diamond; this small post-rotation keeps the
  // common grid/quad case immediately readable without changing distortion.
  let longest = 0;
  let angle = 0;
  for (const halfEdge of chart.boundaryHalfEdges) {
    const a = local.get(mesh.heOrigin[halfEdge]);
    const b = local.get(mesh.halfEdgeDestination(halfEdge));
    if (a === undefined || b === undefined) {
      continue;
    }
    const du = uvs[b][0] - uvs[a][0];
    const dv = uvs[b][1] - uvs[a][1];
    const length = Math.hypot(du, dv);
    if (length > longest) {
      longest = length;
      angle = Math.atan2(dv, du);
    }
  }
  if (longest > 1e-9) {
    const center: Vec2 = [
      uvs.reduce((sum, uv) => sum + uv[0], 0) / count,
      uvs.reduce((sum, uv) => sum + uv[1], 0) / count
    ];
    const cosine = Math.cos(-angle);
    const sine = Math.sin(-angle);
    for (const uv of uvs) {
      const x = uv[0] - center[0];
      const y = uv[1] - center[1];
      uv[0] = center[0] + x * cosine - y * sine;
      uv[1] = center[1] + x * sine + y * cosine;
    }
  }

  const result = new Map<number, Vec2>();
  chart.vertices.forEach((vertex, index) => {
    result.set(vertex, uvs[index]);
  });
  return result;
}

/**
 * Unwrap all charts, normalize them into a simple deterministic shelf, and
 * return per-half-edge UVs. Faces belonging to each chart share one UV per
 * topological vertex; corners across seams remain independent.
 */
export function unwrapUvCharts(
  mesh: HalfEdgeMesh,
  charts: readonly UvChart[]
): Float32Array {
  if (charts.length === 0) {
    throw new LscmError('The mesh has no faces to unwrap.');
  }
  const result = new Float32Array(mesh.heUv);
  const columns = Math.ceil(Math.sqrt(charts.length));
  const rows = Math.ceil(charts.length / columns);
  const cellWidth = 1 / columns;
  const cellHeight = 1 / rows;
  const margin = Math.min(cellWidth, cellHeight) * 0.08;
  const usableWidth = Math.max(1e-6, cellWidth - margin * 2);
  const usableHeight = Math.max(1e-6, cellHeight - margin * 2);

  charts.forEach((chart, chartIndex) => {
    const uvs = unwrapChart(mesh, chart);
    let minU = Infinity;
    let minV = Infinity;
    let maxU = -Infinity;
    let maxV = -Infinity;
    for (const uv of uvs.values()) {
      minU = Math.min(minU, uv[0]);
      minV = Math.min(minV, uv[1]);
      maxU = Math.max(maxU, uv[0]);
      maxV = Math.max(maxV, uv[1]);
    }
    const spanU = Math.max(maxU - minU, 1e-9);
    const spanV = Math.max(maxV - minV, 1e-9);
    const scale = Math.min(usableWidth / spanU, usableHeight / spanV);
    const column = chartIndex % columns;
    const row = Math.floor(chartIndex / columns);
    const originU = column * cellWidth + margin;
    const originV = 1 - (row + 1) * cellHeight + margin;
    for (const face of chart.faces) {
      for (const halfEdge of faceCorners(mesh, face)) {
        const vertex = mesh.heOrigin[halfEdge];
        const uv = uvs.get(vertex);
        if (!uv) {
          continue;
        }
        result[halfEdge * 2] = originU + (uv[0] - minU) * scale;
        result[halfEdge * 2 + 1] = originV + (uv[1] - minV) * scale;
      }
    }
  });
  return result;
}
