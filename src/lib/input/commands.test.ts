import { describe, expect, it } from 'vitest';
import {
  command,
  commandForKeyboardEvent,
  commandShortcutReference,
  commandTooltipFor,
  type CommandId
} from './commands';

describe('command registry', () => {
  it('assigns labels, scopes, and shortcuts', () => {
    expect(command('tool.move').label).toBe('Move');
    expect(command('tool.move').scope).toBe('active');
    expect(command('tool.move').shortcut).toBe('move');
    expect(command('selection.island').scope).toBe('uv');
    expect(command('edit.undo').scope).toBe('global');
    expect(command('tool.move').presentation).toBe('icon');
    expect(command('selection.toggle').presentation).toBe('text');
  });

  it('derives tooltips from the shared metadata', () => {
    expect(commandTooltipFor('tool.move')).toBe('Move — G');
    expect(commandTooltipFor('selection.vertex')).toBe('Vertex — 1');
  });

  it('resolves keyboard events through command bindings', () => {
    const key = (
      value: string,
      options: Partial<KeyboardEvent> = {}
    ): KeyboardEvent =>
      ({
        key: value,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        ...options
      }) as KeyboardEvent;
    expect(commandForKeyboardEvent(key('g'))).toBe('tool.move');
    expect(commandForKeyboardEvent(key('R'))).toBe('tool.rotate');
    expect(commandForKeyboardEvent(key('s'))).toBe('tool.scale');
    expect(commandForKeyboardEvent(key('l'))).toBe('mesh.loopCut');
    expect(commandForKeyboardEvent(key('L', { shiftKey: true }))).toBe(
      'mesh.loopSlide'
    );
    expect(commandForKeyboardEvent(key('u'))).toBe('uv.axisU');
    expect(commandForKeyboardEvent(key('v'))).toBe('uv.axisV');
    expect(commandForKeyboardEvent(key('x'))).toBe('transform.axisX');
    expect(commandForKeyboardEvent(key('z', { metaKey: true }))).toBe(
      'edit.undo'
    );
    expect(
      commandForKeyboardEvent(key('z', { metaKey: true, shiftKey: true }))
    ).toBe('edit.redo');
    expect(commandForKeyboardEvent(key('s', { ctrlKey: true }))).toBe(
      'file.save'
    );
    expect(commandForKeyboardEvent(key('a', { metaKey: true }))).toBe(
      'selection.all'
    );
    expect(commandForKeyboardEvent(key('1'))).toBe('selection.vertex');
    expect(commandForKeyboardEvent(key('2'))).toBe('selection.edge');
    expect(commandForKeyboardEvent(key('3'))).toBe('selection.face');
    expect(commandForKeyboardEvent(key('Tab', { shiftKey: true }))).toBe(
      'snap.toggle'
    );
    expect(commandForKeyboardEvent(key('d', { metaKey: true }))).toBe(
      'edit.duplicate'
    );
  });

  it('derives the shortcut reference from command metadata', () => {
    const reference = commandShortcutReference();
    expect(reference.find((entry) => entry.id === 'selection.vertex')?.display).toBe('1');
    expect(reference.find((entry) => entry.id === 'selection.edge')?.display).toBe('2');
    expect(reference.find((entry) => entry.id === 'selection.face')?.display).toBe('3');
    expect(reference.find((entry) => entry.id === 'snap.toggle')?.display).toBe('⇧Tab');
    expect(reference.every((entry) => entry.display.length > 0)).toBe(true);
  });

  it('has a definition for every command id', () => {
    const ids: CommandId[] = [
      'edit.undo',
      'edit.redo',
      'edit.delete',
      'edit.duplicate',
      'file.new',
      'file.open',
      'file.save',
      'view.sidebar',
      'selection.vertex',
      'selection.edge',
      'selection.face',
      'selection.island',
      'selection.all',
      'selection.toggle',
      'tool.select',
      'tool.lasso',
      'tool.move',
      'tool.rotate',
      'tool.scale',
      'view.frame',
      'view.home',
      'transform.axisX',
      'transform.axisY',
      'transform.axisZ',
      'snap.toggle',
      'mesh.extrude',
      'mesh.inset',
      'mesh.loopCut',
      'mesh.loopSlide',
      'uv.axisU',
      'uv.axisV',
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
