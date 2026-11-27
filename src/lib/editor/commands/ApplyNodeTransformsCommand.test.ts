import { describe, expect, it } from 'vitest';
import { createCubeMesh } from '../../geometry/primitives';
import { MeshNode } from '../../scene/MeshNode';
import { bakeNodeTransform, identityTransform } from '../applyTransforms';
import { ApplyNodeTransformsCommand } from './ApplyNodeTransformsCommand';

describe('ApplyNodeTransformsCommand', () => {
  it('bakes the node transform and shape keys as one undoable edit', () => {
    const node = new MeshNode(createCubeMesh(2), 'cube', 'Cube');
    node.setTransform({
      position: [2, 0, 0],
      rotation: [0, 0, Math.PI / 2],
      scale: [2, 2, 2]
    });
    node.addShapeKey('Lift');
    const beforeMesh = node.mesh;
    const beforeTransform = {
      position: [...node.transform.position] as [number, number, number],
      rotation: [...node.transform.rotation] as [number, number, number],
      scale: [...node.transform.scale] as [number, number, number]
    };
    const baked = bakeNodeTransform(
      beforeMesh,
      beforeTransform,
      node.shapeKeys
    );
    const command = new ApplyNodeTransformsCommand(
      node,
      beforeMesh,
      baked.mesh,
      beforeTransform,
      identityTransform(),
      baked.shapeKeys
    );

    command.execute();
    expect(node.transform).toEqual(identityTransform());
    expect(node.mesh).toBe(baked.mesh);
    expect(node.shapeKeys[0].targetPositions).toEqual(
      baked.shapeKeys[0].targetPositions
    );

    command.undo();
    expect(node.transform).toEqual(beforeTransform);
    expect(node.mesh).toBe(beforeMesh);
    expect(node.shapeKeys[0].targetPositions).toEqual(
      beforeMesh.positions.slice()
    );
  });
});
