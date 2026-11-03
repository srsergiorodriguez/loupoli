import { describe, expect, it } from 'vitest';
import { SceneDocument } from '../../scene/SceneDocument';
import { applyJournalPatch } from '../../project/journal';
import { ReplaceUvCommand } from './ReplaceUvCommand';

describe('ReplaceUvCommand', () => {
  it('replaces and restores the full UV column', () => {
    const document = SceneDocument.createDefault();
    const node = document.nodes[0];
    const before = node.mesh.heUv.slice();
    const after = before.slice();
    after[0] = 0.25;
    after[1] = 0.75;
    const command = new ReplaceUvCommand(node.mesh, node.id, before, after);
    command.execute();
    expect(node.mesh.getCornerUv(0)).toEqual([0.25, 0.75]);
    command.undo();
    expect(node.mesh.getCornerUv(0)).toEqual([before[0], before[1]]);
  });

  it('round-trips a replacement through an autosave patch', () => {
    const document = SceneDocument.createDefault();
    const node = document.nodes[0];
    const before = node.mesh.heUv.slice();
    const after = before.slice();
    const command = new ReplaceUvCommand(node.mesh, node.id, before, after);
    const patch = command.journalPatch('forward');
    const target = SceneDocument.createDefault();
    if (patch.type === 'replace-uv') {
      applyJournalPatch(target, {
        ...patch,
        nodeId: target.nodes[0].id
      });
    }
    expect(target.nodes[0].mesh.heUv).toEqual(after);
  });
});
