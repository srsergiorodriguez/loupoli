import { describe, expect, it } from 'vitest';
import { MeshNode } from '../../scene/MeshNode';
import { createCubeMesh } from '../../geometry/primitives';
import { AssignTextureCommand } from './AssignTextureCommand';

describe('AssignTextureCommand', () => {
  it('assigns and restores a shared texture binding', () => {
    const first = new MeshNode(createCubeMesh(1), 'cube', 'Cube');
    const second = new MeshNode(createCubeMesh(1), 'cube', 'Cube 2');
    const command = new AssignTextureCommand([first, second], 'atlas-a');
    command.execute();
    expect(first.textureId).toBe('atlas-a');
    expect(second.textureId).toBe('atlas-a');
    expect(command.journalPatch('forward')).toEqual([
      { type: 'set-node-texture', nodeId: first.id, textureId: 'atlas-a' },
      { type: 'set-node-texture', nodeId: second.id, textureId: 'atlas-a' }
    ]);
    command.undo();
    expect(first.textureId).toBeNull();
    expect(second.textureId).toBeNull();
  });
});
