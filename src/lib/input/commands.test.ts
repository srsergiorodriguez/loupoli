import { describe, expect, it } from 'vitest';
import { command, commandTooltipFor, type CommandId } from './commands';

describe('command registry', () => {
  it('assigns labels, scopes, and shortcuts', () => {
    expect(command('tool.move').label).toBe('Move');
    expect(command('tool.move').scope).toBe('active');
    expect(command('tool.move').shortcut).toBe('move');
    expect(command('selection.island').scope).toBe('uv');
    expect(command('edit.undo').scope).toBe('global');
    expect(command('tool.move').presentation).toBe('icon');
    expect(command('selection.add').presentation).toBe('text');
  });

  it('derives tooltips from the shared metadata', () => {
    expect(commandTooltipFor('tool.move')).toBe('Move — G');
    expect(commandTooltipFor('selection.vertex')).toBe('Vertex');
  });

  it('has a definition for every command id', () => {
    const ids: CommandId[] = [
      'edit.undo',
      'edit.redo',
      'file.open',
      'file.save',
      'view.sidebar',
      'selection.vertex',
      'selection.edge',
      'selection.face',
      'selection.island',
      'selection.all',
      'selection.add',
      'selection.subtract',
      'tool.select',
      'tool.lasso',
      'tool.move',
      'tool.rotate',
      'tool.scale',
      'view.frame',
      'view.home',
      'uv.fine',
      'uv.fit',
      'uv.clamp'
    ];
    for (const id of ids) {
      expect(command(id).id).toBe(id);
      expect(command(id).label.length).toBeGreaterThan(0);
    }
  });
});
