import { describe, expect, it } from 'vitest';
import { HalfEdgeMesh } from '../geometry/HalfEdgeMesh';
import { createCubeMesh, createGridMesh } from '../geometry/primitives';
import { extractUvCharts } from '../geometry/uvCharts';
import {
  PixelLayoutError,
  packUvChartsToPixelGrid,
  relaxUvCharts
} from './pixelArt';

describe('pixel art UV layout', () => {
  it('packs an island onto integer texel boundaries', () => {
    const mesh = createGridMesh(2, 2);
    const charts = extractUvCharts(mesh);
    const uvs = packUvChartsToPixelGrid(mesh, charts, mesh.heUv, {
      textureWidth: 64,
      textureHeight: 64,
      cellSize: 32,
      padding: 2,
      snapAllVertices: true
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
  });

  it('places multiple islands in separate uniform cells', () => {
    const mesh = HalfEdgeMesh.fromPolygons([
      {
        corners: [
          { position: [0, 0, 0], uv: [0, 0] },
          { position: [1, 0, 0], uv: [1, 0] },
          { position: [1, 1, 0], uv: [1, 1] },
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
      textureHeight: 128,
      cellSize: 32,
      padding: 1,
      snapAllVertices: true
    });
    const cellKeys = new Set<string>();
    for (const chart of charts) {
      const corner = chart.uvVertices[0].corners[0];
      const u = Math.floor((uvs[corner * 2] * 128) / 32);
      const v = Math.floor((uvs[corner * 2 + 1] * 128) / 32);
      cellKeys.add(`${u}:${v}`);
    }
    expect(cellKeys.size).toBe(charts.length);
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
      textureHeight: 64,
      cellSize: 32,
      padding: 2,
      snapAllVertices: true
    });
    const a = mesh.edgeHalfEdge[cut];
    const b = mesh.heTwin[a];
    const separation = Math.hypot(
      uvs[a * 2] - uvs[b * 2],
      uvs[a * 2 + 1] - uvs[b * 2 + 1]
    );
    expect(separation).toBeGreaterThan(1e-5);
  });

  it('rejects a cell layout that has too few cells', () => {
    const mesh = createCubeMesh();
    const charts = extractUvCharts(mesh);
    expect(() =>
      packUvChartsToPixelGrid(mesh, charts, mesh.heUv, {
        textureWidth: 64,
        textureHeight: 64,
        cellSize: 64,
        padding: 2,
        snapAllVertices: true
      })
    ).toThrow(PixelLayoutError);
  });
});
