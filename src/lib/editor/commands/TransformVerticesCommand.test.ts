import { describe, expect, it } from 'vitest';
import { createCubeMesh } from '../../geometry/primitives';
import { TransformVerticesCommand } from './TransformVerticesCommand';

describe('TransformVerticesCommand', () => {
  it('moves only the affected vertices and emits localized patches', () => {
    const mesh = createCubeMesh();
    const vertices = [0, 1];
    const before = vertices.map((vertex) => mesh.getVertexPosition(vertex));
    const after = before.map(
      (position) =>
        [position[0] + 0.5, position[1], position[2]] as [
          number,
          number,
          number
        ]
    );
    const command = new TransformVerticesCommand(
      mesh,
      vertices,
      before,
      after,
      'node-1',
      'Move 2 vertices'
    );

    command.execute();
    for (let index = 0; index < vertices.length; index += 1) {
      expect(mesh.getVertexPosition(vertices[index])).toEqual(after[index]);
    }
    const patches = command.journalPatch('forward');
    expect(Array.isArray(patches)).toBe(true);
    expect(patches).toHaveLength(2);
    if (Array.isArray(patches)) {
      expect(patches[0]).toMatchObject({ type: 'move-vertex', nodeId: 'node-1' });
    }

    command.undo();
    for (let index = 0; index < vertices.length; index += 1) {
      expect(mesh.getVertexPosition(vertices[index])).toEqual(before[index]);
    }
  });
});
