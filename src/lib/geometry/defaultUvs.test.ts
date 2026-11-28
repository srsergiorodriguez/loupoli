import { describe, expect, it } from 'vitest';
import { applyDefaultSeams } from './defaultSeams';
import { unwrapDefaultPrimitive } from './defaultUvs';
import {
  createCubeMesh,
  createCylinderMesh,
  createGridMesh,
  createQuadSphereMesh,
  type PrimitiveKind
} from './primitives';
import type { HalfEdgeMesh } from './HalfEdgeMesh';
import { SceneDocument } from '../scene/SceneDocument';

const PRIMITIVES: readonly {
  readonly kind: PrimitiveKind;
  readonly create: () => HalfEdgeMesh;
}[] = [
  { kind: 'cube', create: () => createCubeMesh(2) },
  { kind: 'quadsphere', create: () => createQuadSphereMesh(1.25, 2) },
  { kind: 'cylinder', create: () => createCylinderMesh(1, 2, 12) },
  { kind: 'grid', create: () => createGridMesh(4, 4) }
];

describe('default primitive UVs', () => {
  it.each(PRIMITIVES)('starts $kind unwrapped', ({ kind, create }) => {
    const mesh = create();
    applyDefaultSeams(mesh, kind);
    expect(unwrapDefaultPrimitive(mesh)).toBe(true);
    expect(mesh.heUv.length).toBe(mesh.halfEdgeCount * 2);
    const unique = new Set<string>();
    for (let corner = 0; corner < mesh.halfEdgeCount; corner += 1) {
      const u = mesh.heUv[corner * 2];
      const v = mesh.heUv[corner * 2 + 1];
      expect(Number.isFinite(u)).toBe(true);
      expect(Number.isFinite(v)).toBe(true);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      unique.add(`${u.toFixed(5)}:${v.toFixed(5)}`);
    }
    expect(unique.size).toBeGreaterThan(2);
  });

  it('unwraps every primitive created by the scene document', () => {
    for (const { kind } of PRIMITIVES) {
      const document = SceneDocument.createDefault(kind);
      const node = document.nodes[0];
      const unique = new Set<string>();
      for (let corner = 0; corner < node.mesh.halfEdgeCount; corner += 1) {
        unique.add(
          `${node.mesh.heUv[corner * 2].toFixed(5)}:${node.mesh.heUv[corner * 2 + 1].toFixed(5)}`
        );
      }
      expect(unique.size).toBeGreaterThan(2);
    }
  });
});
