import { describe, expect, it } from 'vitest';
import { AnimationClip, SceneAnimation } from './SceneAnimation';
import type { NodeTransform } from './MeshNode';

function transform(x: number): NodeTransform {
  return {
    position: [x, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };
}

describe('SceneAnimation', () => {
  it('evaluates linear and step transform keys', () => {
    const animation = new SceneAnimation();
    const track = animation.ensureTrack('node-1', 'node');
    track.setKey(0, transform(0), 'linear');
    track.setKey(10, transform(10), 'linear');
    expect(track.evaluate(5)?.position[0]).toBeCloseTo(5);
    expect(track.evaluate(-2)?.position[0]).toBe(0);
    expect(track.evaluate(20)?.position[0]).toBe(10);
    track.setKey(4, transform(4), 'step');
    expect(track.evaluate(8)?.position[0]).toBe(4);
  });

  it('snapshots and restores tracks without sharing transform arrays', () => {
    const animation = new SceneAnimation();
    const track = animation.ensureTrack('group-1', 'group');
    track.setKey(2, transform(2));
    const snapshot = animation.snapshot();
    const restored = SceneAnimation.fromSnapshot(snapshot);
    const key = restored.getTrack('group-1')?.keyframes[0];
    expect(key?.frame).toBe(2);
    if (key) {
      key.transform.position[0] = 9;
      expect(track.keyframes[0].transform.position[0]).toBe(2);
    }
  });

  it('evaluates and snapshots shape-weight tracks with linear and step keys', () => {
    const animation = new SceneAnimation();
    const track = animation.ensureWeightTrack('node-1', 'shape-1');
    track.setKey(0, 0, 'linear');
    track.setKey(10, 1, 'linear');
    expect(track.evaluate(5)).toBeCloseTo(0.5);
    expect(track.evaluate(10)).toBe(1);
    track.setKey(4, 0.25, 'step');
    expect(track.evaluate(8)).toBe(0.25);
    const snapshot = animation.snapshot();
    const restored = SceneAnimation.fromSnapshot(snapshot);
    expect(restored.getWeightTrack('node-1', 'shape-1')?.keyframes).toHaveLength(3);
    expect(restored.weightTracks).toHaveLength(1);
  });
});

  it('manages independent clips with active state and fresh duplicate ids', () => {
    const animation = new SceneAnimation();
    const first = animation.activeClip;
    const firstTrack = animation.ensureTrack('node-1', 'node');
    firstTrack.setKey(0, transform(1));

    const second = animation.createClip('Walk');
    animation.ensureTrack('node-1', 'node').setKey(12, transform(8));
    expect(animation.activeClipId).toBe(second.id);
    expect(animation.tracks).toHaveLength(1);

    const duplicate = animation.duplicateClip();
    expect(duplicate?.name).toBe('Walk Copy');
    expect(duplicate?.tracks[0].id).not.toBe(second.tracks[0].id);
    expect(duplicate?.tracks[0].keyframes[0].transform.position[0]).toBe(8);

    animation.setActiveClip(first.id);
    expect(animation.startFrame).toBe(first.startFrame);
    const snapshot = animation.snapshot();
    const restored = SceneAnimation.fromSnapshot(snapshot);
    expect(restored.clips.map((clip) => clip.name)).toEqual([
      'Animation 1',
      'Walk',
      'Walk Copy'
    ]);
    expect(restored.activeClipId).toBe(first.id);
    expect(restored.getTrack('node-1')?.keyframes[0].transform.position[0]).toBe(1);

    expect(restored.removeClip(second.id)).toBe(true);
    expect(restored.clips).toHaveLength(2);
  });

  it('migrates a legacy flat animation into a single clip', () => {
    const legacy = SceneAnimation.fromSnapshot({
      fps: 30,
      startFrame: 4,
      endFrame: 20,
      tracks: [
        {
          id: 'track-1',
          targetId: 'group-1',
          targetKind: 'group',
          keyframes: [
            {
              frame: 4,
              transform: transform(3),
              interpolation: 'linear'
            }
          ]
        }
      ],
      weightTracks: []
    });
    expect(legacy.clips).toHaveLength(1);
    expect(legacy.clips[0].id).toBe('clip-1');
    expect(legacy.clips[0].name).toBe('Animation 1');
    expect(legacy.startFrame).toBe(4);
    expect(legacy.endFrame).toBe(20);
    expect(legacy.fps).toBe(30);
    expect(legacy.getTrack('group-1')?.keyframes).toHaveLength(1);
    expect(SceneAnimation.fromSnapshot(legacy.snapshot()).clips).toHaveLength(1);
  });

  it('evaluates and snapshots camera and light animation tracks', () => {
    const clip = new AnimationClip('Shot', 'clip-shot');
    const camera = clip.ensureCameraTrack('camera-1');
    camera.setKey(0, { position: [0, 0, 4], target: [0, 0, 0], fov: 40 });
    camera.setKey(10, { position: [10, 0, 4], target: [10, 0, 0], fov: 60 });
    expect(camera.evaluate(5)?.position).toEqual([5, 0, 4]);
    expect(camera.evaluate(5)?.fov).toBe(50);
    camera.setInterpolation(0, 'step');
    expect(camera.evaluate(5)?.position).toEqual([0, 0, 4]);

    const light = clip.ensureLightTrack('light-1');
    light.setKey(0, {
      position: [0, 0, 4],
      direction: [0, 0, -1],
      intensity: 1
    });
    light.setKey(10, {
      position: [10, 0, 4],
      direction: [0, 0, -1],
      intensity: 5
    });
    expect(light.evaluate(5)?.position).toEqual([5, 0, 4]);
    expect(light.evaluate(5)?.intensity).toBe(3);

    const restored = AnimationClip.fromSnapshot(clip.snapshot());
    expect(restored.cameraTracks).toHaveLength(1);
    expect(restored.lightTracks).toHaveLength(1);
    expect(restored.getCameraTrack('camera-1')?.evaluate(5)?.fov).toBe(40);
    expect(restored.getLightTrack('light-1')?.evaluate(5)?.intensity).toBe(3);
  });
