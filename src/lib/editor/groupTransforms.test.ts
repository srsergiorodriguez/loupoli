import { describe, expect, it } from 'vitest';
import type { NodeTransform } from '../scene/MeshNode';
import {
  localPositionFromWorld,
  localRotationFromWorld,
  worldTransformForNode
} from './groupTransforms';

const parent: NodeTransform = {
  position: [1, 2, 0],
  rotation: [0, 0, Math.PI / 6],
  scale: [1, 1, 1]
};

const child: NodeTransform = {
  position: [-1.875, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1]
};

describe('global/local transform conversion', () => {
  it('round-trips a child pose through world space', () => {
    const world = worldTransformForNode(child, parent);
    expect(world.position[0]).toBeCloseTo(-0.6238, 4);
    expect(world.position[1]).toBeCloseTo(1.0625, 4);
    expect(world.rotation[2]).toBeCloseTo(Math.PI / 6);

    const position = localPositionFromWorld(world.position, parent);
    const rotation = localRotationFromWorld(world.rotation, parent);
    expect(position[0]).toBeCloseTo(child.position[0]);
    expect(position[1]).toBeCloseTo(child.position[1]);
    expect(position[2]).toBeCloseTo(child.position[2]);
    expect(rotation[0]).toBeCloseTo(child.rotation[0]);
    expect(rotation[1]).toBeCloseTo(child.rotation[1]);
    expect(rotation[2]).toBeCloseTo(child.rotation[2]);
  });

  it('leaves root transforms unchanged', () => {
    expect(worldTransformForNode(child, null)).toEqual(child);
    expect(localPositionFromWorld(child.position, null)).toEqual(child.position);
    expect(localRotationFromWorld(child.rotation, null)).toEqual(child.rotation);
  });
});
