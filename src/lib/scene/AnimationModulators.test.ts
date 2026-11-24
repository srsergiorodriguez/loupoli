import { describe, expect, it } from 'vitest';
import {
  applyCameraModulators,
  applyNodeModulators,
  createModulator,
  modulatorSignal,
  type AudioEnvelopeData
} from './AnimationModulators';
import type { NodeTransform } from './MeshNode';

const transform: NodeTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1]
};

describe('animation modulators', () => {
  it('evaluates an LFO sine at the frame time', () => {
    const lfo = createModulator('lfo', 'node', 'node-1', {
      waveform: 'sine',
      rate: 1,
      amplitude: 1
    });
    expect(modulatorSignal(lfo, { frame: 0, fps: 24, audio: new Map() })).toBeCloseTo(0);
    expect(modulatorSignal(lfo, { frame: 6, fps: 24, audio: new Map() })).toBeCloseTo(1);
  });

  it('uses BPM sync for a square pulse', () => {
    const pulse = createModulator('lfo', 'node', 'node-1', {
      waveform: 'square',
      sync: 'bpm',
      bpm: 120,
      rate: 1,
      amplitude: 2
    });
    const atZero = modulatorSignal(pulse, { frame: 0, fps: 24, audio: new Map() });
    const halfBeat = modulatorSignal(pulse, { frame: 6, fps: 24, audio: new Map() });
    expect(atZero).toBe(1);
    expect(halfBeat).toBe(-1);
  });

  it('makes deterministic noise for a seed and changes with another seed', () => {
    const noise = createModulator('noise', 'node', 'node-1', {
      seed: 3,
      frequency: 2
    });
    const other = createModulator('noise', 'node', 'node-1', {
      seed: 9,
      frequency: 2
    });
    const context = { frame: 8, fps: 24, audio: new Map() };
    expect(modulatorSignal(noise, context)).toBe(modulatorSignal(noise, context));
    expect(modulatorSignal(noise, context)).not.toBe(modulatorSignal(other, context));
  });

  it('adds a node position offset and respects replace', () => {
    const add = createModulator('lfo', 'node', 'node-1', {
      property: 'position',
      axis: 'z',
      amplitude: 1,
      waveform: 'sine',
      rate: 1
    });
    const replaced = { ...add, blend: 'replace' as const };
    const context = { frame: 6, fps: 24, audio: new Map() };
    expect(
      applyNodeModulators(transform, [add], 'node-1', context).position[2]
    ).toBeCloseTo(1);
    expect(
      applyNodeModulators(transform, [replaced], 'node-1', context).position[2]
    ).toBeCloseTo(1);
    expect(
      applyNodeModulators(transform, [add], 'other', context).position[2]
    ).toBe(0);
  });

  it('orbits a camera around a pivot', () => {
    const orbit = createModulator('orbit', 'camera', 'camera-1', {
      pivot: [1, 2, 0],
      radius: 5,
      height: 2,
      angularRate: 0.25
    });
    const pose = applyCameraModulators(
      { position: [0, 0, 5], target: [0, 0, 0], fov: 42 },
      [orbit],
      'camera-1',
      { frame: 0, fps: 24, audio: new Map() }
    );
    expect(pose.position).toEqual([6, 2, 2]);
    expect(pose.target).toEqual([1, 2, 0]);
  });

  it('follows audio peaks with gain', () => {
    const envelope = createModulator('audio-envelope', 'node', 'node-1', {
      audioAssetId: 'audio-1',
      gain: 0.5,
      attack: 0.01,
      release: 0.01
    });
    const audio = new Map<string, AudioEnvelopeData>([
      ['audio-1', { peaks: new Float32Array([1, 1, 1, 1]), duration: 1 }]
    ]);
    const value = modulatorSignal(envelope, {
      frame: 18,
      fps: 24,
      audio
    });
    expect(value).toBeGreaterThan(0.45);
    expect(value).toBeLessThanOrEqual(0.5);
  });
});
