import { describe, expect, it } from 'vitest';
import { commandTooltip, shortcut } from './shortcuts';

describe('shortcut metadata', () => {
  it('exposes stable labels and formatted tooltips', () => {
    expect(shortcut('move').label).toBe('Move');
    expect(shortcut('move').display).toBe('G');
    expect(shortcut('loopSlide').display).toBe('⇧L');
    expect(commandTooltip('Move', 'move')).toBe('Move — G');
    expect(shortcut('vertexMode').display).toBe('1');
    expect(shortcut('snap').display).toBe('⇧Tab');
    expect(commandTooltip('Lasso')).toBe('Lasso');
  });
});
