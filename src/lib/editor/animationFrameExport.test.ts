import { describe, expect, it } from 'vitest';
import { animationExportFrames } from './animationFrameExport';
import { AnimationClip } from '../scene/SceneAnimation';
import type { NodeTransform } from '../scene/MeshNode';

const transform: NodeTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1]
};

describe('animation frame export', () => {
  it('resolves stepped ranges inclusively', () => {
    const clip = new AnimationClip('Walk', 'clip', 0, 48);
    expect(
      animationExportFrames(clip, {
        startFrame: 0,
        endFrame: 10,
        step: 4,
        keyedOnly: false
      })
    ).toEqual([0, 4, 8]);
    expect(
      animationExportFrames(clip, {
        startFrame: 2,
        endFrame: 6,
        step: 1,
        keyedOnly: false
      })
    ).toEqual([2, 3, 4, 5, 6]);
  });

  it('collects unique keyed frames across all track types', () => {
    const clip = new AnimationClip('Walk', 'clip', 0, 48);
    const track = clip.ensureTrack('node-1', 'node');
    track.setKey(4, transform);
    track.setKey(20, transform);
    const weight = clip.ensureWeightTrack('node-1', 'shape-1');
    weight.setKey(4, 0.5);
    weight.setKey(12, 1);
    const mesh = clip.ensureMeshTrack('node-1');
    const base = new Float32Array(9);
    const posed = new Float32Array(9);
    posed[0] = 1;
    mesh.setPoseKey(8, base, posed);
    expect(
      animationExportFrames(clip, {
        startFrame: 0,
        endFrame: 16,
        step: 4,
        keyedOnly: true
      })
    ).toEqual([4, 8, 12]);
  });

  it('clamps negative starts and reversed ranges', () => {
    const clip = new AnimationClip('Walk', 'clip', 0, 48);
    expect(
      animationExportFrames(clip, {
        startFrame: -4,
        endFrame: -1,
        step: 2,
        keyedOnly: false
      })
    ).toEqual([0]);
  });
});
