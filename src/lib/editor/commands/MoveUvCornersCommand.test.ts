import { describe, expect, it } from 'vitest';
import { SceneDocument } from '../../scene/SceneDocument';
import { applyJournalPatch } from '../../project/journal';
import { MoveUvCornersCommand } from './MoveUvCornersCommand';

describe('MoveUvCornersCommand', () => {
  it('moves selected corner UVs and restores them on undo', () => {
    const document = SceneDocument.createDefault();
    const node = document.nodes[0];
    const before = [node.mesh.getCornerUv(0), node.mesh.getCornerUv(1)];
    const after = [
      [before[0][0] + 0.1, before[0][1] - 0.05],
      [before[1][0] + 0.1, before[1][1] - 0.05]
    ] as [number, number][];
    const command = new MoveUvCornersCommand(
      node.mesh,
      node.id,
      [0, 1],
      before,
      after
    );
    command.execute();
    expect(node.mesh.getCornerUv(0)[0]).toBeCloseTo(after[0][0]);
    command.undo();
    expect(node.mesh.getCornerUv(1)[1]).toBeCloseTo(before[1][1]);
  });

  it('emits one autosave patch per corner', () => {
    const document = SceneDocument.createDefault();
    const node = document.nodes[0];
    const command = new MoveUvCornersCommand(
      node.mesh,
      node.id,
      [2],
      [node.mesh.getCornerUv(2)],
      [[0.25, 0.75]]
    );
    const patches = command.journalPatch('forward');
    expect(Array.isArray(patches)).toBe(true);
    const target = SceneDocument.createDefault();
    if (patches) {
      for (const patch of Array.isArray(patches) ? patches : [patches]) {
        applyJournalPatch(target, { ...patch, nodeId: target.nodes[0].id });
      }
    }
    expect(target.nodes[0].mesh.getCornerUv(2)).toEqual([0.25, 0.75]);
  });
});
