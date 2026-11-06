import { describe, expect, it, vi } from 'vitest';
import type { EditorCommand } from './EditorCommand';
import { WithShadingCommand } from './WithShadingCommand';

function inner(): EditorCommand {
  return {
    label: 'Bake lighting',
    estimatedBytes: 12,
    execute: vi.fn(),
    undo: vi.fn()
  };
}

describe('WithShadingCommand', () => {
  it('restores the previous shading mode when a bake is undone', () => {
    const command = inner();
    const setShading = vi.fn();
    const wrapped = new WithShadingCommand(
      command,
      setShading,
      'lit',
      'unlit'
    );

    wrapped.execute();
    expect(setShading).toHaveBeenLastCalledWith('unlit');
    expect(command.execute).toHaveBeenCalledOnce();

    wrapped.undo();
    expect(setShading).toHaveBeenLastCalledWith('lit');
    expect(command.undo).toHaveBeenCalledOnce();
    expect(wrapped.label).toBe('Bake lighting');
  });
});
