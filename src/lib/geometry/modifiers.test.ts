import { describe, expect, it } from 'vitest';
import {
  createCubeMesh,
  createGridMesh,
  createQuadSphereMesh
} from './primitives';
import {
  createModifier,
  evaluateModifiers,
  evaluateModifiersWithProvenance,
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
