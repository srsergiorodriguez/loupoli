import { describe, expect, it } from 'vitest';
import { HalfEdgeMesh, type MeshFaceSpec } from './HalfEdgeMesh';
import { createCubeMesh, createGridMesh, createQuadSphereMesh } from './primitives';
import { extractUvCharts } from './uvCharts';
import { LscmError, packUvChartRects, unwrapUvCharts } from './lscm';

describe('LSCM unwrap', () => {
  it('unwraps a single quad into finite, non-degenerate UVs', () => {
    const grid = createGridMesh(1, 1);
    const charts = extractUvCharts(grid);
    const uvs = unwrapUvCharts(grid, charts);
    const corners = new Set<string>();
    for (let face = 0; face < grid.faceCount; face += 1) {
      const start = grid.faceHalfEdge[face];
      let corner = start;
      do {
        const u = uvs[corner * 2];
        const v = uvs[corner * 2 + 1];
        expect(Number.isFinite(u)).toBe(true);
        expect(Number.isFinite(v)).toBe(true);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        corners.add(`${u.toFixed(5)}|${v.toFixed(5)}`);
        corner = grid.heNext[corner];
      } while (corner !== start);
    }
    expect(corners.size).toBe(4);
    const face = grid.faceHalfEdge[0];
    const points: [number, number][] = [];
    let corner = face;
    do {
      points.push([uvs[corner * 2], uvs[corner * 2 + 1]]);
      corner = grid.heNext[corner];
    } while (corner !== face);
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const next = points[(index + 1) % points.length];
      area += points[index][0] * next[1] - next[0] * points[index][1];
    }
    expect(Math.abs(area)).toBeGreaterThan(1e-4);
  });

  it('unwraps seam-separated cube charts', () => {
    const cube = createCubeMesh(1);
    const start = cube.faceHalfEdge[0];
    let halfEdge = start;
    do {
      cube.setEdgeSeam(cube.heEdge[halfEdge], true);
      halfEdge = cube.heNext[halfEdge];
    } while (halfEdge !== start);
    const charts = extractUvCharts(cube);
    expect(charts).toHaveLength(2);
    const uvs = unwrapUvCharts(cube, charts);
    for (let corner = 0; corner < cube.halfEdgeCount; corner += 1) {
      expect(Number.isFinite(uvs[corner * 2])).toBe(true);
      expect(Number.isFinite(uvs[corner * 2 + 1])).toBe(true);
    }
    // The isolated quad must not collapse to one point.
    const isolated = charts.find((chart) => chart.faces.length === 1);
    expect(isolated).toBeDefined();
    const points = new Set<string>();
    for (const face of isolated?.faces ?? []) {
      for (const h of [cube.faceHalfEdge[face]]) {
        let corner = h;
        do {
          points.add(`${uvs[corner * 2].toFixed(5)}|${uvs[corner * 2 + 1].toFixed(5)}`);
          corner = cube.heNext[corner];
        } while (corner !== h);
      }
    }
    expect(points.size).toBe(4);
  });

  it('unwraps a chart with a hole without requiring a cut', () => {
    const corners = [
      [0, 0], [1, 0], [2, 0],
      [0, 1], [1, 1], [2, 1],
      [0, 2], [1, 2], [2, 2]
    ] as const;
    const faces = [];
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        if (row === 0 && column === 0) {
          continue;
        }
        const a = row * 3 + column;
        const b = a + 1;
        const c = a + 4;
        const d = a + 3;
        faces.push({
          corners: [a, b, c, d].map((index) => ({
            position: [corners[index][0], corners[index][1], 0] as [
              number,
              number,
              number
            ],
            uv: [corners[index][0] / 2, corners[index][1] / 2] as [
              number,
              number
            ]
          }))
        });
      }
    }
    const ring = HalfEdgeMesh.fromPolygons(faces);
    const charts = extractUvCharts(ring);
    expect(charts).toHaveLength(1);
    expect(charts[0].boundaryHalfEdges.length).toBeGreaterThan(4);
    const uvs = unwrapUvCharts(ring, charts);
    expect(Array.from(uvs).every((value) => Number.isFinite(value))).toBe(true);
  });

  it('keeps a cut open in the UV layout', () => {
    const corners = [
      [0, 0], [1, 0], [2, 0],
      [0, 1], [1, 1], [2, 1],
      [0, 2], [1, 2], [2, 2]
    ] as const;
    const faces = [];
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        if (row === 0 && column === 0) {
          continue;
        }
        const a = row * 3 + column;
        const b = a + 1;
        const c = a + 4;
        const d = a + 3;
        faces.push({
          corners: [a, b, c, d].map((index) => ({
            position: [corners[index][0], corners[index][1], 0] as [
              number,
              number,
              number
            ],
            uv: [corners[index][0] / 2, corners[index][1] / 2] as [
              number,
              number
            ]
          }))
        });
      }
    }
    const ring = HalfEdgeMesh.fromPolygons(faces);
    // Cut from the inner hole to the outer boundary.
    let cut = -1;
    for (let edge = 0; edge < ring.edgeCount; edge += 1) {
      const [a, b] = ring.getEdgeVertices(edge);
      const pa = ring.getVertexPosition(a);
      const pb = ring.getVertexPosition(b);
      if (
        (pa[0] === 1 && pa[1] === 1 && pb[0] === 1 && pb[1] === 2) ||
        (pb[0] === 1 && pb[1] === 1 && pa[0] === 1 && pa[1] === 2)
      ) {
        cut = edge;
        break;
      }
    }
    expect(cut).toBeGreaterThanOrEqual(0);
    ring.setEdgeSeam(cut, true);
    const charts = extractUvCharts(ring);
    const uvs = unwrapUvCharts(ring, charts);
    const a = ring.edgeHalfEdge[cut];
    const b = ring.heTwin[a];
    const separation = Math.hypot(
      uvs[a * 2] - uvs[b * 2],
      uvs[a * 2 + 1] - uvs[b * 2 + 1]
    );
    expect(separation).toBeGreaterThan(1e-4);
  });

  it('unwraps a synthetic branch hole without inventing a cut', () => {
    const mesh = createVoxelBranchMesh();
    const branchBase = [
      [[1, 0, 2], [1, 1, 2]],
      [[1, 1, 2], [1, 1, 3]],
      [[1, 1, 3], [1, 0, 3]],
      [[1, 0, 3], [1, 0, 2]]
    ] as const;
    for (const [from, to] of branchBase) {
      const edge = findPositionEdge(mesh, from, to);
      expect(edge).toBeGreaterThanOrEqual(0);
      mesh.setEdgeSeam(edge, true);
    }
    const charts = extractUvCharts(mesh);
    expect(charts.length).toBeGreaterThanOrEqual(2);
    const uvs = unwrapUvCharts(mesh, charts);
    expect(Array.from(uvs).every((value) => Number.isFinite(value))).toBe(true);
  });

  it('unwraps a synthetic trunk with a branch hole and an open cut', () => {
    const mesh = createVoxelBranchMesh();
    const branchBase = [
      [[1, 0, 2], [1, 1, 2]],
      [[1, 1, 2], [1, 1, 3]],
      [[1, 1, 3], [1, 0, 3]],
      [[1, 0, 3], [1, 0, 2]]
    ] as const;
    for (const [from, to] of branchBase) {
      const edge = findPositionEdge(mesh, from, to);
      expect(edge).toBeGreaterThanOrEqual(0);
      mesh.setEdgeSeam(edge, true);
    }
    const cutSegments = [
      findPositionEdge(mesh, [1, 0, 2], [1, 0, 1]),
      findPositionEdge(mesh, [1, 0, 1], [1, 0, 0])
    ];
    expect(cutSegments.every((edge) => edge >= 0)).toBe(true);
    for (const edge of cutSegments) {
      mesh.setEdgeSeam(edge, true);
    }
    const cut = cutSegments[0];

    const charts = extractUvCharts(mesh);
    expect(charts.length).toBeGreaterThanOrEqual(2);
    const uvs = unwrapUvCharts(mesh, charts);
    expect(Array.from(uvs).every((value) => Number.isFinite(value))).toBe(true);

    const a = mesh.edgeHalfEdge[cut];
    const b = mesh.heTwin[a];
    const separation = Math.hypot(
      uvs[a * 2] - uvs[b * 2],
      uvs[a * 2 + 1] - uvs[b * 2 + 1]
    );
    expect(separation).toBeGreaterThan(1e-4);
  });

  it('opens a dead-end slit instead of collapsing its two sides', () => {
    const grid = createGridMesh(2, 2);
    const cut = findPositionEdge(grid, [0, 1, 0], [1, 1, 0]);
    expect(cut).toBeGreaterThanOrEqual(0);
    grid.setEdgeSeam(cut, true);
    const charts = extractUvCharts(grid);
    expect(charts).toHaveLength(1);
    const uvs = unwrapUvCharts(grid, charts);
    const a = grid.edgeHalfEdge[cut];
    const b = grid.heTwin[a];
    const separation = Math.hypot(
      uvs[a * 2] - uvs[b * 2],
      uvs[a * 2 + 1] - uvs[b * 2 + 1]
    );
    expect(separation).toBeGreaterThan(1e-4);
  });

  it('accepts explicit chart pins', () => {
    const grid = createGridMesh(2, 2);
    const charts = extractUvCharts(grid);
    const uvs = unwrapUvCharts(grid, charts, [
      grid.faceHalfEdge[0],
      grid.faceHalfEdge[grid.faceCount - 1]
    ]);
    for (let corner = 0; corner < grid.halfEdgeCount; corner += 1) {
      expect(Number.isFinite(uvs[corner * 2])).toBe(true);
      expect(Number.isFinite(uvs[corner * 2 + 1])).toBe(true);
    }
  });

  it('unwraps one cube net with split corner fans', () => {
    const cube = createCubeMesh(1);
    for (let edge = 0; edge < cube.edgeCount; edge += 1) {
      cube.setEdgeSeam(edge, true);
    }
    const connect = (firstFace: number, secondFace: number): void => {
      for (let edge = 0; edge < cube.edgeCount; edge += 1) {
        const halfEdge = cube.edgeHalfEdge[edge];
        const twin = cube.heTwin[halfEdge];
        if (twin < 0) {
          continue;
        }
        const a = cube.heFace[halfEdge];
        const b = cube.heFace[twin];
        if (
          (a === firstFace && b === secondFace) ||
          (a === secondFace && b === firstFace)
        ) {
          cube.setEdgeSeam(edge, false);
        }
      }
    };
    for (const [a, b] of [
      [0, 2],
      [1, 2],
      [2, 3],
      [2, 5],
      [4, 5]
    ]) {
      connect(a, b);
    }
    const charts = extractUvCharts(cube);
    expect(charts).toHaveLength(1);
    const meshVertices = new Set(charts[0].uvVertices.map((vertex) => vertex.vertex));
    expect(charts[0].uvVertices.length).toBeGreaterThan(meshVertices.size);
    const uvs = unwrapUvCharts(cube, charts);
    expect(uvs).toHaveLength(cube.halfEdgeCount * 2);
    expect(Array.from(uvs).every((value) => Number.isFinite(value))).toBe(true);
  });

  it('rejects a closed chart with its face range instead of applying collapsed UVs', () => {
    const sphere = createQuadSphereMesh(1.5, 2);
    const charts = extractUvCharts(sphere);
    expect(charts[0].boundaryHalfEdges).toHaveLength(0);
    try {
      unwrapUvCharts(sphere, charts);
      throw new Error('Expected the closed chart to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(LscmError);
      const lscmError = error as LscmError;
      expect(lscmError.message).toMatch(/Mark seams that cut it open/);
      expect(lscmError.message).toMatch(/Chart 1\/1/);
      expect(lscmError.message).toMatch(/faces 0/);
      expect(lscmError.context).toEqual({
        chartIndex: 1,
        chartCount: 1,
        faces: charts[0].faces
      });
    }
    expect(() => unwrapUvCharts(sphere, [])).toThrow(LscmError);
  });
});
  it('packs variable-size chart rectangles without overlap', () => {
    const placements = packUvChartRects([
      { index: 0, spanU: 1.2, spanV: 0.4 },
      { index: 1, spanU: 0.3, spanV: 1.1 },
      { index: 2, spanU: 0.6, spanV: 0.5 },
      { index: 3, spanU: 0.2, spanV: 0.2 }
    ]);
    expect(placements).not.toBeNull();
    const boxes = placements!.map((placement, index) => {
      const rect = [
        { spanU: 1.2, spanV: 0.4 },
        { spanU: 0.3, spanV: 1.1 },
        { spanU: 0.6, spanV: 0.5 },
        { spanU: 0.2, spanV: 0.2 }
      ][index];
      return {
        minU: placement.originU,
        minV: placement.originV,
        maxU: placement.originU + rect.spanU * placement.scale,
        maxV: placement.originV + rect.spanV * placement.scale
      };
    });
    for (const box of boxes) {
      expect(box.minU).toBeGreaterThanOrEqual(0);
      expect(box.minV).toBeGreaterThanOrEqual(0);
      expect(box.maxU).toBeLessThanOrEqual(1);
      expect(box.maxV).toBeLessThanOrEqual(1);
    }
    for (let first = 0; first < boxes.length; first += 1) {
      for (let second = first + 1; second < boxes.length; second += 1) {
        const a = boxes[first];
        const b = boxes[second];
        const separated =
          a.maxU <= b.minU ||
          b.maxU <= a.minU ||
          a.maxV <= b.minV ||
          b.maxV <= a.minV;
        expect(separated).toBe(true);
      }
    }
  });


/** A closed voxel trunk with one side branch and a naturally connected base. */
function createVoxelBranchMesh(): HalfEdgeMesh {
  const occupied = new Set<string>();
  const add = (x: number, y: number, z: number): void => {
    occupied.add(`${x}|${y}|${z}`);
  };
  for (let z = 0; z < 5; z += 1) {
    add(0, 0, z);
  }
  add(1, 0, 2);
  add(2, 0, 2);
  add(3, 0, 2);

  const directions: ReadonlyArray<{
    readonly offset: readonly [number, number, number];
    readonly corners: ReadonlyArray<readonly [number, number, number]>;
  }> = [
    { offset: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { offset: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { offset: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
    { offset: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { offset: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { offset: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
  ];
  const faces: MeshFaceSpec[] = [];
  for (const key of occupied) {
    const [x, y, z] = key.split('|').map(Number);
    for (const { offset, corners } of directions) {
      if (occupied.has(`${x + offset[0]}|${y + offset[1]}|${z + offset[2]}`)) {
        continue;
      }
      faces.push({
        corners: corners.map(([dx, dy, dz]) => ({
          position: [x + dx, y + dy, z + dz] as [number, number, number],
          uv: [(x + dx) / 4, (z + dz) / 5] as [number, number]
        }))
      });
    }
  }
  return HalfEdgeMesh.fromPolygons(faces);
}

function findPositionEdge(
  mesh: HalfEdgeMesh,
  from: readonly [number, number, number],
  to: readonly [number, number, number]
): number {
  for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
    const [a, b] = mesh.getEdgeVertices(edge);
    const pa = mesh.getVertexPosition(a);
    const pb = mesh.getVertexPosition(b);
    const matches = (point: readonly number[]): boolean =>
      point[0] === from[0] &&
      point[1] === from[1] &&
      point[2] === from[2];
    const matchesOther = (point: readonly number[]): boolean =>
      point[0] === to[0] &&
      point[1] === to[1] &&
      point[2] === to[2];
    if (
      (matches(pa) && matchesOther(pb)) ||
      (matchesOther(pa) && matches(pb))
    ) {
      return edge;
    }
  }
  return -1;
}
