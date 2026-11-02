import { describe, expect, it } from 'vitest';
import {
  createCubeMesh,
  createGridMesh,
  createQuadSphereMesh
} from './primitives';
import {
  applyLinearTransform,
  createModifier,
  evaluateModifiers,
  evaluateModifiersWithProvenance,
  invertLinearTransform,
  type GridArrayModifier,
  type MirrorModifier,
  type RadialArrayModifier
} from './modifiers';

describe('modifier evaluation', () => {
  it('mirrors an offset closed mesh into a valid two-component result', () => {
    const sphere = createQuadSphereMesh(1.25, 2);
    for (let vertex = 0; vertex < sphere.vertexCount; vertex += 1) {
      const position = sphere.getVertexPosition(vertex);
      sphere.setVertexPosition(vertex, [position[0] + 3, position[1], position[2]]);
    }
    const mirror: MirrorModifier = {
      ...(createModifier('mirror') as MirrorModifier),
      axis: 'x'
    };
    const result = evaluateModifiers(sphere, [mirror]);
    expect(result.faceCount).toBe(sphere.faceCount * 2);
    expect(result.boundaryEdgeCount).toBe(0);
    expect(() => result.validate()).not.toThrow();
  });

  it('clips a mesh crossing the mirror plane and keeps the result closed', () => {
    const sphere = createQuadSphereMesh(1.25, 2);
    const mirror: MirrorModifier = {
      ...(createModifier('mirror') as MirrorModifier),
      axis: 'x'
    };
    const result = evaluateModifiers(sphere, [mirror]);
    expect(result.faceCount).toBeGreaterThanOrEqual(sphere.faceCount);
    expect(result.boundaryEdgeCount).toBe(0);
    expect(() => result.validate()).not.toThrow();
  });

  it('repeats geometry with a grid array', () => {
    const cube = createCubeMesh(1);
    const grid: GridArrayModifier = {
      ...(createModifier('grid-array') as GridArrayModifier),
      countX: 2,
      countY: 2,
      spacingX: 2,
      spacingY: 2
    };
    const result = evaluateModifiers(cube, [grid]);
    expect(result.faceCount).toBe(cube.faceCount * 4);
    expect(() => result.validate()).not.toThrow();
  });


  it('carries base seam flags onto every evaluated array copy', () => {
    const cube = createCubeMesh(1);
    cube.setEdgeSeam(0, true);
    const grid: GridArrayModifier = {
      ...(createModifier('grid-array') as GridArrayModifier),
      countX: 2,
      countY: 1,
      spacingX: 3,
      spacingY: 2
    };
    const result = evaluateModifiersWithProvenance(cube, [grid]);
    const copied: number[] = [];
    for (let edge = 0; edge < result.mesh.edgeCount; edge += 1) {
      if (result.provenance.edgeBase[edge] === 0) {
        copied.push(edge);
      }
    }
    expect(copied.length).toBe(2);
    expect(copied.every((edge) => result.mesh.isEdgeSeam(edge))).toBe(true);
  });

  it('maps evaluated array copies back to the same base elements', () => {
    const cube = createCubeMesh(1);
    const grid: GridArrayModifier = {
      ...(createModifier('grid-array') as GridArrayModifier),
      countX: 2,
      countY: 2,
      spacingX: 2,
      spacingY: 2
    };
    const result = evaluateModifiersWithProvenance(cube, [grid]);
    expect(result.provenance.faceBase).toHaveLength(result.mesh.faceCount);
    expect(result.provenance.vertexBase).toHaveLength(result.mesh.vertexCount);
    expect(result.provenance.edgeBase).toHaveLength(result.mesh.edgeCount);

    const facesPerBase = new Map<number, number>();
    for (const base of result.provenance.faceBase) {
      facesPerBase.set(base, (facesPerBase.get(base) ?? 0) + 1);
    }
    expect(facesPerBase.size).toBe(cube.faceCount);
    expect([...facesPerBase.values()]).toEqual(
      Array.from({ length: cube.faceCount }, () => 4)
    );
    for (const base of result.provenance.vertexBase) {
      expect(base).toBeGreaterThanOrEqual(0);
      expect(base).toBeLessThan(cube.vertexCount);
    }
  });

  it('maps clipped mirror faces back to base faces and leaves cut edges unmapped', () => {
    const sphere = createQuadSphereMesh(1.25, 2);
    const mirror: MirrorModifier = {
      ...(createModifier('mirror') as MirrorModifier),
      axis: 'x'
    };
    const result = evaluateModifiersWithProvenance(sphere, [mirror]);
    expect(result.provenance.faceBase).toHaveLength(result.mesh.faceCount);
    expect([...result.provenance.faceBase].every((face) => face >= 0 && face < sphere.faceCount)).toBe(true);
    expect(result.provenance.edgeBase.some((edge) => edge >= 0)).toBe(true);
    expect(
      [...result.provenance.edgeBase].every(
        (edge) => edge >= -1 && edge < sphere.edgeCount
      )
    ).toBe(true);
  });


  it('tracks invertible per-copy linear maps for mapped editing', () => {
    const grid = createGridMesh(2, 2);
    for (let vertex = 0; vertex < grid.vertexCount; vertex += 1) {
      const position = grid.getVertexPosition(vertex);
      grid.setVertexPosition(vertex, [position[0] + 2, position[1], position[2]]);
    }
    const modifiers: RadialArrayModifier[] = [
      {
        ...(createModifier('radial-array') as RadialArrayModifier),
        axis: 'z',
        count: 4
      }
    ];
    const result = evaluateModifiersWithProvenance(grid, modifiers);
    expect(result.provenance.vertexLinear).toHaveLength(
      result.mesh.vertexCount * 9
    );
    const delta: [number, number, number] = [0.25, -0.1, 0.3];
    let checked = 0;
    for (let vertex = 0; vertex < result.mesh.vertexCount; vertex += 1) {
      if (result.provenance.vertexBase[vertex] < 0) continue;
      const linear = Array.from(
        result.provenance.vertexLinear.subarray(vertex * 9, vertex * 9 + 9)
      );
      const inverse = invertLinearTransform(linear);
      expect(inverse).not.toBeNull();
      const mapped = applyLinearTransform(linear, delta);
      const roundTrip = applyLinearTransform(inverse!, mapped);
      expect(roundTrip[0]).toBeCloseTo(delta[0]);
      expect(roundTrip[1]).toBeCloseTo(delta[1]);
      expect(roundTrip[2]).toBeCloseTo(delta[2]);
      checked += 1;
    }
    expect(checked).toBe(result.mesh.vertexCount);
  });

  it('radially repeats an offset mesh and validates the result', () => {
    const grid = createGridMesh(2, 2);
    // Move the open unit grid away from the radial Z axis.
    for (let vertex = 0; vertex < grid.vertexCount; vertex += 1) {
      const position = grid.getVertexPosition(vertex);
      grid.setVertexPosition(vertex, [position[0] + 2, position[1], position[2]]);
    }
    const radial: RadialArrayModifier = {
      ...(createModifier('radial-array') as RadialArrayModifier),
      axis: 'z',
      count: 4
    };
    const result = evaluateModifiers(grid, [radial]);
    expect(result.faceCount).toBe(grid.faceCount * 4);
    expect(() => result.validate()).not.toThrow();
  });
});
