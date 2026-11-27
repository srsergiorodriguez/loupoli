import { describe, expect, it } from 'vitest';
import { HalfEdgeMesh } from '../geometry/HalfEdgeMesh';
import { createCubeMesh, createGridMesh } from '../geometry/primitives';
import { extractUvCharts, type UvChart } from '../geometry/uvCharts';
import {
  PixelLayoutError,
  packUvChartsToPixelGrid,
  relaxUvCharts
} from './pixelArt';

function chartBounds(
  chart: UvChart,
  uvs: Float32Array,
  width: number,
  height: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const vertex of chart.uvVertices) {
    const corner = vertex.corners[0];
    const x = uvs[corner * 2] * width;
    const y = (1 - uvs[corner * 2 + 1]) * height;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function overlaps(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY
  );
}

describe('pixel art UV layout', () => {
  it('packs every chart onto the 1 px texel grid', () => {
    const mesh = createGridMesh(2, 2);
    const charts = extractUvCharts(mesh);
    const uvs = packUvChartsToPixelGrid(mesh, charts, mesh.heUv, {
      textureWidth: 64,
      textureHeight: 64
    });
    for (const value of uvs) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    for (let corner = 0; corner < mesh.halfEdgeCount; corner += 1) {
      const uPixels = uvs[corner * 2] * 64;
      const vPixels = uvs[corner * 2 + 1] * 64;
      expect(Math.abs(uPixels - Math.round(uPixels))).toBeLessThan(1e-6);
      expect(Math.abs(vPixels - Math.round(vPixels))).toBeLessThan(1e-6);
    }
    const bounds = charts.map((chart) => chartBounds(chart, uvs, 64, 64));
    for (let a = 0; a < bounds.length; a += 1) {
      expect(bounds[a].minX).toBeGreaterThanOrEqual(1);
      expect(bounds[a].minY).toBeGreaterThanOrEqual(1);
      expect(bounds[a].maxX).toBeLessThanOrEqual(63);
      expect(bounds[a].maxY).toBeLessThanOrEqual(63);
      for (let b = a + 1; b < bounds.length; b += 1) {
        expect(overlaps(bounds[a], bounds[b])).toBe(false);
      }
    }
  });

  it('preserves relative island scale when packing', () => {
    const mesh = HalfEdgeMesh.fromPolygons([
      {
        corners: [
          { position: [0, 0, 0], uv: [0, 0] },
          { position: [1, 0, 0], uv: [2, 0] },
          { position: [1, 1, 0], uv: [2, 1] },
          { position: [0, 1, 0], uv: [0, 1] }
        ]
      },
      {
        corners: [
          { position: [2, 0, 0], uv: [0, 0] },
          { position: [3, 0, 0], uv: [1, 0] },
          { position: [3, 1, 0], uv: [1, 1] },
          { position: [2, 1, 0], uv: [0, 1] }
        ]
      }
    ]);
    const charts = extractUvCharts(mesh);
    expect(charts).toHaveLength(2);
    const uvs = packUvChartsToPixelGrid(mesh, charts, mesh.heUv, {
      textureWidth: 128,
      textureHeight: 128
    });
    const bounds = charts.map((chart) => chartBounds(chart, uvs, 128, 128));
    const widthA = bounds[0].maxX - bounds[0].minX;
    const widthB = bounds[1].maxX - bounds[1].minX;
    expect(widthA / widthB).toBeCloseTo(2, 0);
  });

  it('relaxes interior vertices without changing finite UVs', () => {
    const mesh = createGridMesh(2, 2);
    const charts = extractUvCharts(mesh);
    const uvs = relaxUvCharts(mesh, charts, mesh.heUv, 4);
    for (const value of uvs) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('does not close a cut while packing', () => {
    const mesh = createGridMesh(2, 2);
    let cut = -1;
    for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
      const [a, b] = mesh.getEdgeVertices(edge);
      const pa = mesh.getVertexPosition(a);
      const pb = mesh.getVertexPosition(b);
      const same = (point: readonly number[], x: number, y: number): boolean =>
        point[0] === x && point[1] === y && point[2] === 0;
      if (
        (same(pa, 0, 1) && same(pb, 1, 1)) ||
        (same(pa, 1, 1) && same(pb, 0, 1))
      ) {
        cut = edge;
        break;
      }
    }
    expect(cut).toBeGreaterThanOrEqual(0);
    mesh.setEdgeSeam(cut, true);
    const charts = extractUvCharts(mesh);
    const uvs = packUvChartsToPixelGrid(mesh, charts, mesh.heUv, {
      textureWidth: 64,
      textureHeight: 64
    });
    const a = mesh.edgeHalfEdge[cut];
    const b = mesh.heTwin[a];
    const separation = Math.hypot(
      uvs[a * 2] - uvs[b * 2],
      uvs[a * 2 + 1] - uvs[b * 2 + 1]
    );
    expect(separation).toBeGreaterThan(1e-5);
  });

  it('rejects charts that cannot fit the texture', () => {
    const mesh = createCubeMesh();
    const charts = extractUvCharts(mesh);
    expect(() =>
      packUvChartsToPixelGrid(mesh, charts, mesh.heUv, {
        textureWidth: 2,
        textureHeight: 2
      })
    ).toThrow(PixelLayoutError);
  });
});
