import { describe, expect, it } from 'vitest';
import { ElementSelection } from './ElementSelection';

describe('ElementSelection', () => {
  it('replaces or toggles elements for additive selection', () => {
    const selection = new ElementSelection('vertex');
    selection.setContext('node-a', 'vertex');

    selection.pick(2, false);
    expect(selection.values()).toEqual([2]);

    selection.pick(5, true);
    selection.pick(1, true);
    expect(selection.values()).toEqual([1, 2, 5]);
    expect(selection.count).toBe(3);

    selection.pick(5, true);
    expect(selection.values()).toEqual([1, 2]);

    selection.pick(7, false);
    expect(selection.values()).toEqual([7]);
  });

  it('clears when the element mode or active node changes', () => {
    const selection = new ElementSelection('vertex');
    selection.setContext('node-a', 'vertex');
    selection.pick(1, false);
    selection.pick(2, true);

    selection.setMode('edge');
    expect(selection.values()).toEqual([]);
    selection.pick(4, false);
    expect(selection.values()).toEqual([4]);

    selection.setContext('node-b', 'edge');
    expect(selection.values()).toEqual([]);
    expect(selection.mode).toBe('edge');
    expect(selection.nodeId).toBe('node-b');
  });

  it('prunes indices that no longer exist and ignores duplicate picks', () => {
    const selection = new ElementSelection('face');
    selection.setContext('node-a', 'face');
    selection.pick(0, false);
    selection.pick(9, true);
    expect(selection.values()).toEqual([0, 9]);

    expect(selection.prune(4)).toBe(true);
    expect(selection.values()).toEqual([0]);
    expect(selection.prune(4)).toBe(false);
    expect(() => selection.pick(-1, true)).toThrow(/invalid/);
  });

  it('removes one element without toggling another', () => {
    const selection = new ElementSelection('face');
    selection.setValues([2, 5, 8]);
    selection.remove(5);
    expect(selection.values()).toEqual([2, 8]);
    selection.remove(99);
    expect(selection.values()).toEqual([2, 8]);
  });
});
