/** Hard limits for project audio assets. */
export const MAX_AUDIO_ASSETS = 8;
export const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 600;
export const AUDIO_PEAK_COUNT = 512;

/** Immutable project-level audio asset stored as compressed source bytes. */
export interface AudioAssetSnapshot {
  readonly id: string;
  readonly name: string;
  readonly mime: string;
  readonly duration: number;
  readonly bytes: Uint8Array;
  readonly peaks: Float32Array;
}

let nextAudioAssetNumber = 1;

function createAudioAssetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `audio-${crypto.randomUUID()}`;
  }
  const id = `audio-${nextAudioAssetNumber}-${Date.now().toString(36)}`;
  nextAudioAssetNumber += 1;
  return id;
}

/** Validate one finite duration in seconds. */
export function isValidAudioDuration(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_AUDIO_DURATION_SECONDS
  );
}

/** Normalize an audio MIME label or derive one from the file extension. */
export function normalizeAudioMime(mime: string, name: string): string {
  const normalized = mime.trim().toLowerCase();
  if (normalized.startsWith('audio/') && normalized.length <= 64) {
    return normalized;
  }
  const extension = name.toLowerCase().split('.').pop() ?? '';
  const fallback: Record<string, string> = {
    wav: 'audio/wav',
    wave: 'audio/wav',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    flac: 'audio/flac',
    webm: 'audio/webm'
  };
  return fallback[extension] ?? 'audio/wav';
}

/** Compute normalized waveform peaks from decoded channel samples. */
export function audioPeaksFromChannels(
  channels: readonly Float32Array[],
  count = AUDIO_PEAK_COUNT
): Float32Array {
  const peakCount = Math.max(16, Math.min(AUDIO_PEAK_COUNT, Math.round(count)));
  const peaks = new Float32Array(peakCount);
  if (channels.length === 0 || channels[0].length === 0) {
    return peaks;
  }
  const samples = Math.max(...channels.map((channel) => channel.length));
  const bucket = Math.max(1, Math.ceil(samples / peakCount));
  let maximum = 0;
  for (let index = 0; index < peakCount; index += 1) {
    const start = index * bucket;
    const end = Math.min(samples, start + bucket);
    let peak = 0;
    for (let sample = start; sample < end; sample += 1) {
      for (const channel of channels) {
        peak = Math.max(peak, Math.abs(channel[sample] ?? 0));
      }
    }
    peaks[index] = peak;
    maximum = Math.max(maximum, peak);
  }
  if (maximum > 1e-8) {
    for (let index = 0; index < peaks.length; index += 1) {
      peaks[index] /= maximum;
    }
  }
  return peaks;
}

/**
 * One project-level audio asset.
 *
 * The compressed source bytes are authoritative for persistence and playback;
 * decoded AudioBuffers live only in the runtime cache and never in the document.
 */
export class AudioAsset {
  readonly id: string;
  name: string;
  readonly mime: string;
  readonly duration: number;
  readonly bytes: Uint8Array;
  readonly peaks: Float32Array;

  constructor(
    name: string,
    mime: string,
    duration: number,
    bytes: Uint8Array,
    peaks: Float32Array,
    id = createAudioAssetId()
  ) {
    const trimmed = name.trim().slice(0, 128);
    if (!trimmed || !isValidAudioDuration(duration)) {
      throw new Error('Audio asset metadata is invalid.');
    }
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.byteLength === 0 ||
      bytes.byteLength > MAX_AUDIO_BYTES
    ) {
      throw new Error('Audio asset bytes are outside the supported size.');
    }
    this.id = id;
    this.name = trimmed;
    this.mime = normalizeAudioMime(mime, trimmed);
    this.duration = duration;
    this.bytes = bytes.slice();
    this.peaks =
      peaks.length === AUDIO_PEAK_COUNT
        ? peaks.slice()
        : new Float32Array(AUDIO_PEAK_COUNT);
  }

  /** Detached snapshot safe for commands, checkpoints, and saves. */
  snapshot(): AudioAssetSnapshot {
    return {
      id: this.id,
      name: this.name,
      mime: this.mime,
      duration: this.duration,
      bytes: this.bytes.slice(),
      peaks: this.peaks.slice()
    };
  }

  /** Restore from a validated snapshot. */
  static fromSnapshot(snapshot: AudioAssetSnapshot): AudioAsset {
    return new AudioAsset(
      snapshot.name,
      snapshot.mime,
      snapshot.duration,
      snapshot.bytes,
      snapshot.peaks,
      snapshot.id
    );
  }
}
