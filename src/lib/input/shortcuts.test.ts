import { describe, expect, it } from 'vitest';
import { commandTooltip, shortcut } from './shortcuts';

describe('shortcut metadata', () => {
  it('exposes stable labels and formatted tooltips', () => {
    expect(shortcut('move').label).toBe('Move');
    expect(shortcut('move').display).toBe('G');
    expect(shortcut('loopSlide').display).toBe('⇧L');
    expect(commandTooltip('Move', 'move')).toBe('Move — G');
    expect(commandTooltip('Lasso')).toBe('Lasso');
  });
});
