import { describe, expect, it } from 'vitest';
import {
  AUDIO_PEAK_COUNT,
  AudioAsset,
  audioPeaksFromChannels,
  normalizeAudioMime
} from './AudioAsset';

describe('audio assets', () => {
  it('normalizes MIME labels and computes bounded waveform peaks', () => {
    const peaks = audioPeaksFromChannels([
      new Float32Array([0, 0.5, -1, 0.25]),
      new Float32Array([0, -0.25, 0.5, 0])
    ]);
    expect(peaks).toHaveLength(AUDIO_PEAK_COUNT);
    expect(Math.max(...peaks)).toBe(1);
    expect(peaks.every((peak) => peak >= 0 && peak <= 1)).toBe(true);
    expect(normalizeAudioMime('', 'voice.mp3')).toBe('audio/mpeg');
    expect(normalizeAudioMime('audio/wav', 'clip.wav')).toBe('audio/wav');
  });

  it('round-trips through a detached snapshot and rejects invalid audio', () => {
    const asset = new AudioAsset(
      'Ambience',
      'audio/wav',
      3,
      new Uint8Array([1, 2, 3]),
      new Float32Array(AUDIO_PEAK_COUNT).fill(0.5)
    );
    const snapshot = asset.snapshot();
    const restored = AudioAsset.fromSnapshot(snapshot);
    expect(restored.id).toBe(asset.id);
    expect(Array.from(restored.bytes)).toEqual([1, 2, 3]);
    expect(() => new AudioAsset('Bad', 'audio/wav', 0, new Uint8Array([1]), new Float32Array(AUDIO_PEAK_COUNT))).toThrow(/metadata/);
    expect(() => new AudioAsset('Bad', 'audio/wav', 1, new Uint8Array(), new Float32Array(AUDIO_PEAK_COUNT))).toThrow(/bytes/);
  });
});
