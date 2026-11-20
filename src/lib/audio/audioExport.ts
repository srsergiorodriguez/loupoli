import type { AudioClipSnapshot } from '../scene/SceneAnimation';

/** Timing plan for mixing one clip audio placement into a rendered range. */
export interface AudioExportPlan {
  /** Seconds to wait from the first captured video frame. */
  readonly delay: number;
  /** Seconds to skip into the audio asset. */
  readonly offset: number;
  /** Seconds of audio to play. */
  readonly duration: number;
  readonly gain: number;
}

/**
 * Map a clip audio placement onto a rendered frame range.
 *
 * The returned times are in seconds relative to the first rendered frame. A
 * placement that starts before the range is trimmed into; one that starts after
 * it is delayed. Muted, missing, or out-of-range placements return null.
 */
export function planAudioExport(
  placement: AudioClipSnapshot,
  renderStartFrame: number,
  renderEndFrame: number,
  fps: number
): AudioExportPlan | null {
  if (
    placement.muted ||
    !Number.isFinite(fps) ||
    fps <= 0 ||
    renderEndFrame < renderStartFrame
  ) {
    return null;
  }
  const start = Math.max(0, placement.trimStart);
  const end = Math.max(start, placement.trimEnd);
  const audioEndFrame = placement.startFrame + (end - start) * fps;
  if (audioEndFrame < renderStartFrame || placement.startFrame > renderEndFrame) {
    return null;
  }
  const delay = Math.max(0, (placement.startFrame - renderStartFrame) / fps);
  const skip = Math.max(0, (renderStartFrame - placement.startFrame) / fps);
  const offset = start + skip;
  const renderSeconds = (renderEndFrame - renderStartFrame + 1) / fps;
  const duration = Math.min(end - offset, renderSeconds - delay);
  if (duration <= 0.001) {
    return null;
  }
  return {
    delay,
    offset,
    duration,
    gain: Math.max(0, Math.min(2, placement.gain))
  };
}
