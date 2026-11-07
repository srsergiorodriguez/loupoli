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

  it('copies sparse Mesh Motion keys with their stable vertex sets', () => {
    const clip = new AnimationClip('Test', 'clip-test');
    const track = clip.ensureMeshTrack('node-1');
    const base = new Float32Array(9);
    const posed = new Float32Array(9);
    posed[0] = 1;
    posed[4] = 2;
    track.setPoseKey(6, base, posed, 'linear');
    const entries = buildAnimationKeyClipboard(clip, [
      { trackId: track.id, frame: 6 }
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('mesh');
    expect(entries[0].vertexIndices).toEqual([0, 1]);
    expect(entries[0].values).toEqual([1, 0, 0, 0, 2, 0]);
  });

  it('copies camera and light keys with their poses', () => {
    const clip = new AnimationClip('Test', 'clip-test');
    const camera = clip.ensureCameraTrack('camera-1');
    camera.setKey(2, { position: [1, 2, 3], target: [0, 0, 0], fov: 45 });
    const light = clip.ensureLightTrack('light-1');
    light.setKey(4, {
      position: [1, 1, 1],
      direction: [0, 0, -1],
      intensity: 2
    });
    const entries = buildAnimationKeyClipboard(clip, [
      { trackId: camera.id, frame: 2 },
      { trackId: light.id, frame: 4 }
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual(['camera', 'light']);
    expect(entries[0].cameraFov).toBe(45);
    expect(entries[1].lightIntensity).toBe(2);
  });

  it('copies texture keys including an explicit unassigned texture', () => {
    const clip = new AnimationClip('Test', 'clip-test');
    const track = clip.ensureTextureTrack('node-1');
    track.setKey(2, 'texture-a');
    track.setKey(6, null);
    const entries = buildAnimationKeyClipboard(clip, [
      { trackId: track.id, frame: 2 },
      { trackId: track.id, frame: 6 }
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual(['texture', 'texture']);
    expect(entries[0].textureId).toBe('texture-a');
    expect(entries[1].textureId).toBeNull();
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
