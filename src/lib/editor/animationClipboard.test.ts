import { describe, expect, it } from 'vitest';
import {
  animationPasteBase,
  animationPasteEndFrame,
  buildAnimationKeyClipboard
} from './animationClipboard';
import { AnimationClip } from '../scene/SceneAnimation';
import type { NodeTransform } from '../scene/MeshNode';

function transform(x: number): NodeTransform {
  return {
    position: [x, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
}

describe('animation clipboard', () => {
  it('copies transform and shape keys with shared relative offsets', () => {
    const clip = new AnimationClip('Test', 'clip-test');
    const track = clip.ensureTrack('node-1', 'node');
    track.setKey(4, transform(4), 'step');
    track.setKey(12, transform(12), 'linear');
    const weight = clip.ensureWeightTrack('node-1', 'shape-1');
    weight.setKey(8, 0.5, 'linear');

    const entries = buildAnimationKeyClipboard(clip, [
      { trackId: track.id, frame: 4 },
      { trackId: track.id, frame: 12 },
      { trackId: weight.id, frame: 8 }
    ]);

    expect(entries.map((entry) => entry.offsetFrame)).toEqual([0, 4, 8]);
    expect(entries[0].kind).toBe('transform');
    expect(entries[0].interpolation).toBe('step');
    expect(entries[1].kind).toBe('shape');
    expect(entries[1].weight).toBe(0.5);
  });

  it('deduplicates repeated references and ignores missing keys', () => {
    const clip = new AnimationClip('Test', 'clip-test');
    const track = clip.ensureTrack('node-1', 'node');
    track.setKey(2, transform(2));
    const entries = buildAnimationKeyClipboard(clip, [
      { trackId: track.id, frame: 2 },
      { trackId: track.id, frame: 2 },
      { trackId: 'missing', frame: 2 }
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].offsetFrame).toBe(0);
  });

  it('clamps the paste anchor and computes the extended end frame', () => {
    const clip = new AnimationClip('Test', 'clip-test', 10, 30);
    const track = clip.ensureTrack('node-1', 'node');
    track.setKey(10, transform(10));
    const entries = buildAnimationKeyClipboard(clip, [
      { trackId: track.id, frame: 10 }
    ]);
    expect(entries[0].offsetFrame).toBe(0);
    expect(animationPasteBase(clip, 4)).toBe(10);
    expect(animationPasteBase(clip, 20.4)).toBe(20);
    expect(animationPasteEndFrame(clip, [28])).toBe(30);
    expect(animationPasteEndFrame(clip, [28, 36])).toBe(36);
  });
});
