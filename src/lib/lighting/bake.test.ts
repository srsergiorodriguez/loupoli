import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { importObjNodes } from '../io/obj';
import { createCubeMesh } from '../geometry/primitives';
import { extractUvCharts } from '../geometry/uvCharts';
import { unwrapUvCharts } from '../geometry/lscm';
import {
  bakeLighting,
  BakeCancelledError,
  bakeNormalSign,
  hasUvOverlap,
  uvCoverage
} from './bake';
import { MeshNode } from '../scene/MeshNode';

describe('UV bake coverage guard', () => {
  it('rejects the default folded cube UVs', () => {
    const mesh = createCubeMesh();
    expect(uvCoverage(mesh)).toBeGreaterThan(1);
    expect(hasUvOverlap(mesh)).toBe(true);
  });

  it('accepts a shelf-packed unwrap without UV overlap', () => {
    const mesh = createCubeMesh();
    mesh.edgeFlags.fill(1);
    const uvs = unwrapUvCharts(mesh, extractUvCharts(mesh));
    mesh.setAllCornerUvs(uvs);
    expect(hasUvOverlap(mesh)).toBe(false);
    expect(uvCoverage(mesh)).toBeLessThanOrEqual(1.001);
  });

  it('rejects a small local overlap even when total coverage is below 1', () => {
    const mesh = createCubeMesh();
    const uvs = mesh.heUv.slice();
    const tiny = [
      [0.1, 0.1],
      [0.2, 0.1],
      [0.2, 0.2],
      [0.1, 0.2]
    ] as const;
    for (let face = 0; face < mesh.faceCount; face += 1) {
      const first = mesh.faceHalfEdge[face];
      let halfEdge = first;
      let corner = 0;
      do {
        uvs[halfEdge * 2] = tiny[corner % tiny.length][0];
        uvs[halfEdge * 2 + 1] = tiny[corner % tiny.length][1];
        halfEdge = mesh.heNext[halfEdge];
        corner += 1;
      } while (halfEdge !== first && corner < 4);
    }
    mesh.setAllCornerUvs(uvs);
    expect(uvCoverage(mesh)).toBeLessThan(1);
    expect(hasUvOverlap(mesh)).toBe(true);
  });
});


describe('bake normal orientation', () => {
  it('keeps authored outward normals on a closed cube', () => {
    const mesh = createCubeMesh();
    expect(mesh.boundaryEdgeCount).toBe(0);
    expect(bakeNormalSign(mesh, new Matrix4())).toBe(1);
  });

  it('does not invert concave surfaces on the gorilla', () => {
    const source = readFileSync('gorillaModel/gorilla.obj', 'utf8');
    const nodes = importObjNodes(source, '', { upAxis: 'y', scale: 1 });
    const mesh = nodes[0].mesh;
    expect(mesh.boundaryEdgeCount).toBe(0);
    expect(bakeNormalSign(mesh, new Matrix4())).toBe(1);
  });
});


describe('bake cancellation', () => {
  it('honours a cancellation request before rasterization', async () => {
    const mesh = createCubeMesh();
    const node = new MeshNode(mesh, 'cube', 'Cube');
    await expect(
      bakeLighting(
        {
          mesh,
          node,
          parent: null,
          lights: [],
          ambientColor: '#ffffff',
          ambientIntensity: 1,
          width: 64,
          height: 64
        },
        { shouldCancel: () => true }
      )
    ).rejects.toBeInstanceOf(BakeCancelledError);
  });
});
