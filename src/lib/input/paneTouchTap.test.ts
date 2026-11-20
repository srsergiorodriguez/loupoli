import { describe, expect, it } from 'vitest';
import { paneTouchTapAction } from './paneTouchTap';

describe('pane multi-finger tap', () => {
  it('maps two and three fingers to undo and redo', () => {
    expect(paneTouchTapAction(2, 200, 4, false)).toBe('undo');
    expect(paneTouchTapAction(3, 200, 4, false)).toBe('redo');
  });

  it('ignores single, long, moved, or invalid gestures', () => {
    expect(paneTouchTapAction(1, 200, 4, false)).toBeNull();
    expect(paneTouchTapAction(2, 400, 4, false)).toBeNull();
    expect(paneTouchTapAction(2, 200, 20, false)).toBeNull();
    expect(paneTouchTapAction(2, 200, 4, true)).toBeNull();
  });
});
