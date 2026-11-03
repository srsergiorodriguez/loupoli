import { describe, expect, it } from 'vitest';
import {
  SelectionCommand,
  selectionSnapshotsEqual,
  type SelectionSnapshot
} from './SelectionCommand';

describe('selection history', () => {
  it('compares snapshots and restores before/after state', () => {
    let current: SelectionSnapshot = {
      nodeId: 'node',
      mode: 'face',
      values: [],
      uvMode: 'vertex',
      uvValues: []
    };
    const before = current;
    const after: SelectionSnapshot = {
      nodeId: 'node',
      mode: 'face',
      values: [2, 5],
      uvMode: 'island',
      uvValues: [1, 2, 3, 4]
    };
    expect(selectionSnapshotsEqual(before, after)).toBe(false);
    const command = new SelectionCommand(
      (snapshot) => {
        current = snapshot;
      },
      before,
      after,
      'Select face'
    );
    command.execute();
    expect(current).toEqual(after);
    command.undo();
    expect(current).toEqual(before);
  });
});
