import { describe, expect, it } from 'vitest';
import { HalfEdgeMesh, type MeshFaceSpec } from './HalfEdgeMesh';
import {
  createCubeMesh,
  createCylinderMesh,
  createGridMesh,
  createQuadSphereMesh
} from './primitives';

describe('createCubeMesh', () => {
  it('creates a closed quad cube with shared topology', () => {
    const mesh = createCubeMesh(2);

    expect(mesh.vertexCount).toBe(8);
    expect(mesh.edgeCount).toBe(12);
    expect(mesh.faceCount).toBe(6);
    expect(mesh.halfEdgeCount).toBe(24);
    expect(mesh.triangleCount).toBe(12);
    expect(mesh.triangleVertexCount).toBe(36);
    expect(() => mesh.validate()).not.toThrow();
  });

  it('winds every face so its normal points away from the center', () => {
    const mesh = createCubeMesh(2);

    for (let face = 0; face < mesh.faceCount; face += 1) {
      const normal = mesh.computeFaceNormal(face);
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let current = mesh.faceHalfEdge[face];
      const start = current;
      let count = 0;

      do {
        const vertex = mesh.heOrigin[current] * 3;
        cx += mesh.positions[vertex];
        cy += mesh.positions[vertex + 1];
        cz += mesh.positions[vertex + 2];
        count += 1;
        current = mesh.heNext[current];
      } while (current !== start);

      cx /= count;
      cy /= count;
      cz /= count;
      expect(normal[0] * cx + normal[1] * cy + normal[2] * cz).toBeGreaterThan(0);
    }
  });

  it('writes reusable flat-shaded triangle and edge buffers', () => {
    const mesh = createCubeMesh(2);
    const positions = new Float32Array(mesh.triangleVertexCount * 3);
    const normals = new Float32Array(mesh.triangleVertexCount * 3);
    const uvs = new Float32Array(mesh.triangleVertexCount * 2);
    const edges = new Float32Array(mesh.edgeCount * 6);

    mesh.writeTriangleData(positions, normals, uvs);
    mesh.writeEdgePositions(edges);

    expect(positions.every(Number.isFinite)).toBe(true);
    expect(normals.every(Number.isFinite)).toBe(true);
    expect(uvs.every(Number.isFinite)).toBe(true);
    expect(edges.every(Number.isFinite)).toBe(true);
    expect(new Set(Array.from(normals))).toContain(1);
  });

  it('moves a vertex without invalidating topology', () => {
    const mesh = createCubeMesh(2);
    const beforeRevision = mesh.meshRevision;

    mesh.setVertexPosition(0, [-2.5, -1, -1]);
    expect(mesh.meshRevision).toBe(beforeRevision + 1);
    expect(mesh.getVertexPosition(0)).toEqual([-2.5, -1, -1]);
    expect(() => mesh.validate()).not.toThrow();

    const bounds = mesh.getBounds();
    expect(bounds.min[0]).toBe(-2.5);
  });

  it('bilinearly tessellates bent quads while preserving the DCEL quad', () => {
    const mesh = createCubeMesh(2);
    const planarTriangleCount = mesh.triangleCount;
    const original = mesh.getVertexPosition(0);

    mesh.setVertexPosition(0, [-1.6, -0.7, -1.1]);
    expect(mesh.faceCount).toBe(6);
    expect(mesh.edgeCount).toBe(12);
    expect(mesh.topologyTriangleCount).toBe(planarTriangleCount);
    expect(mesh.triangleCount).toBeGreaterThan(planarTriangleCount);
    expect(() => mesh.validate()).not.toThrow();

    const positions = new Float32Array(mesh.triangleVertexCount * 3);
    const normals = new Float32Array(mesh.triangleVertexCount * 3);
    const uvs = new Float32Array(mesh.triangleVertexCount * 2);
    mesh.writeTriangleData(positions, normals, uvs);
    expect(positions.every(Number.isFinite)).toBe(true);
    expect(normals.every(Number.isFinite)).toBe(true);
    expect(uvs.every(Number.isFinite)).toBe(true);

    mesh.setVertexPosition(0, original);
    expect(mesh.triangleCount).toBe(planarTriangleCount);
  });

  it('rejects zero or negative sizes', () => {
    expect(() => createCubeMesh(0)).toThrow(/positive/);
    expect(() => createCubeMesh(-1)).toThrow(/positive/);
  });

  it('creates explicit boundary loops for an open quad', () => {
    const openQuad: MeshFaceSpec = {
      corners: [
        { position: [-1, -1, 0], uv: [0, 0] },
        { position: [1, -1, 0], uv: [1, 0] },
        { position: [1, 1, 0], uv: [1, 1] },
        { position: [-1, 1, 0], uv: [0, 1] }
      ]
    };

    const mesh = HalfEdgeMesh.fromPolygons([openQuad]);
    expect(mesh.vertexCount).toBe(4);
    expect(mesh.edgeCount).toBe(4);
    expect(mesh.faceCount).toBe(1);
    expect(mesh.halfEdgeCount).toBe(8);
    expect(mesh.heFace.filter((face) => face === -1).length).toBe(4);
    expect(() => mesh.validate()).not.toThrow();
  });
});

describe('Phase 2 primitives', () => {
  it('creates a closed all-quad QuadSphere', () => {
    const mesh = createQuadSphereMesh(1.25, 2);

    expect(mesh.faceCount).toBe(24);
    expect(mesh.vertexCount).toBe(26);
    expect(mesh.edgeCount).toBe(48);
    expect(mesh.topologyTriangleCount).toBe(48);
    expect(mesh.heFace.every((face) => face >= 0)).toBe(true);
    expect(() => mesh.validate()).not.toThrow();

    for (let face = 0; face < mesh.faceCount; face += 1) {
      const normal = mesh.computeFaceNormal(face);
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let current = mesh.faceHalfEdge[face];
      const start = current;
      do {
        const vertex = mesh.heOrigin[current] * 3;
        cx += mesh.positions[vertex];
        cy += mesh.positions[vertex + 1];
        cz += mesh.positions[vertex + 2];
        current = mesh.heNext[current];
      } while (current !== start);
      expect(normal[0] * cx + normal[1] * cy + normal[2] * cz).toBeGreaterThan(0);
    }
  });

  it('creates a closed cylinder with quad sides and n-gon caps', () => {
    const mesh = createCylinderMesh(1, 2, 8);

    expect(mesh.faceCount).toBe(10);
    expect(mesh.vertexCount).toBe(16);
    expect(mesh.edgeCount).toBe(24);
    expect(mesh.heFace.every((face) => face >= 0)).toBe(true);
    expect(() => mesh.validate()).not.toThrow();

    const faceSizes = new Set<number>();
    for (let face = 0; face < mesh.faceCount; face += 1) {
      faceSizes.add(mesh.faceVertexCount(face));
      const normal = mesh.computeFaceNormal(face);
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let current = mesh.faceHalfEdge[face];
      const start = current;
      let count = 0;
      do {
        const vertex = mesh.heOrigin[current] * 3;
        cx += mesh.positions[vertex];
        cy += mesh.positions[vertex + 1];
        cz += mesh.positions[vertex + 2];
        count += 1;
        current = mesh.heNext[current];
      } while (current !== start);
      expect(normal[0] * cx + normal[1] * cy + normal[2] * cz).toBeGreaterThan(0);
    }
    expect(faceSizes).toEqual(new Set([4, 8]));
  });

  it('creates an open grid with closed boundary loops', () => {
    const mesh = createGridMesh(4, 4);

    expect(mesh.faceCount).toBe(16);
    expect(mesh.vertexCount).toBe(25);
    expect(mesh.edgeCount).toBe(40);
    expect(mesh.halfEdgeCount).toBe(80);
    expect(mesh.heFace.filter((face) => face === -1).length).toBe(16);
    expect(() => mesh.validate()).not.toThrow();

    let boundaryStart = -1;
    for (let h = 0; h < mesh.halfEdgeCount; h += 1) {
      if (mesh.heFace[h] === -1) {
        boundaryStart = h;
        break;
      }
    }
    expect(boundaryStart).toBeGreaterThanOrEqual(0);

    let current = boundaryStart;
    let boundaryCount = 0;
    do {
      expect(mesh.heFace[current]).toBe(-1);
      current = mesh.heNext[current];
      boundaryCount += 1;
    } while (current !== boundaryStart);
    expect(boundaryCount).toBe(16);
  });
});
