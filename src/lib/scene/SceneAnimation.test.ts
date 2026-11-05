import { describe, expect, it } from 'vitest';
import { SceneAnimation } from './SceneAnimation';
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
