import { describe, expect, it } from 'vitest';
import { createCubeMesh } from '../geometry/primitives';
import { bakeNodeTransform, identityTransform } from './applyTransforms';
import type { ShapeKey } from '../scene/MeshNode';

describe('apply transforms', () => {
  it('bakes translation, rotation, and scale into rest positions', () => {
    const mesh = createCubeMesh(2);
    const result = bakeNodeTransform(
      mesh,
      {
        position: [2, 0, 0],
        rotation: [0, 0, Math.PI / 2],
        scale: [2, 2, 2]
      },
      []
    );
    // (-1, -1, -1) -> scaled (-2,-2,-2), rotated (2,-2,-2), translated (4,-2,-2)
    expect(result.mesh.positions[0]).toBeCloseTo(4, 5);
    expect(result.mesh.positions[1]).toBeCloseTo(-2, 5);
    expect(result.mesh.positions[2]).toBeCloseTo(-2, 5);
    expect(result.mesh.heUv).toEqual(mesh.heUv);
  });

  it('bakes shape-key targets with the same matrix', () => {
    const mesh = createCubeMesh(2);
    const key: ShapeKey = {
      id: 'shape-test',
      name: 'Shape',
      weight: 1,
      visible: true,
      targetPositions: mesh.positions.slice()
    };
    const result = bakeNodeTransform(
      mesh,
      {
        position: [1, 2, 3],
        rotation: [0, 0, 0],
        scale: [2, 3, 4]
      },
      [key]
    );
    expect(result.shapeKeys[0].targetPositions[0]).toBeCloseTo(
      mesh.positions[0] * 2 + 1,
      5
    );
    expect(result.shapeKeys[0].targetPositions[1]).toBeCloseTo(
      mesh.positions[1] * 3 + 2,
      5
    );
    expect(result.shapeKeys[0].targetPositions[2]).toBeCloseTo(
      mesh.positions[2] * 4 + 3,
      5
    );
  });

  it('returns an identity transform', () => {
    expect(identityTransform()).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
  });
});
