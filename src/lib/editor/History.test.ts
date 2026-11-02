import { describe, expect, it } from 'vitest';
import { createCubeMesh } from '../geometry/primitives';
import { History } from './History';
import { MoveVertexCommand } from './commands/MoveVertexCommand';

describe('History', () => {
  it('executes, undoes, and redoes a localized vertex move', () => {
    const mesh = createCubeMesh(2);
    const original = mesh.getVertexPosition(1);
    const moved: [number, number, number] = [2.5, -1, -1];
    const history = new History();
    const command = new MoveVertexCommand(mesh, 1, original, moved);

    history.execute(command);
    expect(mesh.getVertexPosition(1)).toEqual(moved);
    expect(history.getState()).toMatchObject({
      canUndo: true,
      canRedo: false,
      undoLabel: 'Move vertex 2'
    });

    expect(history.undo()).toBe(true);
    expect(mesh.getVertexPosition(1)).toEqual(original);
    expect(history.getState()).toMatchObject({ canUndo: false, canRedo: true });

    expect(history.redo()).toBe(true);
    expect(mesh.getVertexPosition(1)).toEqual(moved);
  });

  it('truncates redo when a new command is committed', () => {
    const mesh = createCubeMesh(2);
    const history = new History();
    const original = mesh.getVertexPosition(0);

    history.execute(new MoveVertexCommand(mesh, 0, original, [-2, -1, -1]));
    history.undo();
    expect(history.getState().canRedo).toBe(true);

    const afterUndo = mesh.getVertexPosition(0);
    history.execute(new MoveVertexCommand(mesh, 0, afterUndo, [-2, -2, -1]));
    expect(history.getState().canRedo).toBe(false);
  });

  it('ignores empty undo and redo operations', () => {
    const history = new History();
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
    expect(history.getState().canUndo).toBe(false);
    expect(history.getState().canRedo).toBe(false);
  });
});
