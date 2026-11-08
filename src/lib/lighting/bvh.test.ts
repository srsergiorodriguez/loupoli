import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { importObjNodes } from '../io/obj';
import { buildFlatBvh, bvhRayOccluded } from './bvh';
import { rayOccluded } from './bake';

function gorillaTriangles(): Float32Array {
  const source = readFileSync('gorillaModel/gorilla.obj', 'utf8');
  const mesh = importObjNodes(source, '', { upAxis: 'y', scale: 1 })[0].mesh;
  const triangles: number[] = [];
  for (let face = 0; face < mesh.faceCount; face += 1) {
    const first = mesh.faceHalfEdge[face];
    const loop: number[] = [];
    let halfEdge = first;
    do {
      loop.push(mesh.heOrigin[halfEdge]);
      halfEdge = mesh.heNext[halfEdge];
    } while (halfEdge !== first && loop.length < 64);
    for (let corner = 1; corner < loop.length - 1; corner += 1) {
      for (const vertex of [loop[0], loop[corner], loop[corner + 1]]) {
        triangles.push(
          mesh.positions[vertex * 3],
          mesh.positions[vertex * 3 + 1],
          mesh.positions[vertex * 3 + 2]
        );
      }
    }
  }
  return new Float32Array(triangles);
}

describe('flat BVH parity', () => {
  it('matches linear occlusion over deterministic gorilla rays', () => {
    const triangles = gorillaTriangles();
    const occluders = [triangles];
    const bvh = buildFlatBvh(occluders);
    const origin = new Vector3();
    const direction = new Vector3();
    let hits = 0;
    for (let index = 0; index < 2000; index += 1) {
      origin.set(
        ((index * 73) % 100) / 11 - 4.5,
        ((index * 131) % 100) / 11 - 4.5,
        ((index * 197) % 100) / 11 - 4.5
      );
      direction
        .set(
          ((index * 29) % 97) / 48.5 - 1,
          ((index * 53) % 89) / 44.5 - 1,
          ((index * 83) % 79) / 39.5 - 1
        )
        .normalize();
      const maxDistance = 0.2 + ((index * 17) % 50) * 0.1;
      const linear = rayOccluded(origin, direction, maxDistance, occluders);
      const flat = bvhRayOccluded(bvh, origin, direction, maxDistance);
      if (linear) {
        hits += 1;
      }
      expect(flat).toBe(linear);
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('matches a direct triangle hit', () => {
    const triangle = new Float32Array([
      -1, -1, 0,
      1, -1, 0,
      0, 1, 0
    ]);
    const bvh = buildFlatBvh([triangle]);
    expect(
      bvhRayOccluded(
        bvh,
        new Vector3(0, 0, 1),
        new Vector3(0, 0, -1),
        10
      )
    ).toBe(true);
  });
});
