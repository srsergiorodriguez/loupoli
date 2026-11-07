import type { AnimationClip } from '../scene/SceneAnimation';

/** Maximum number of OBJ files emitted by one frame export. */
export const MAX_OBJ_FRAME_EXPORT = 600;

/** One frame-range selection for animated OBJ export. */
export interface AnimationFrameExportRange {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly step: number;
  readonly keyedOnly: boolean;
}

/**
 * Resolve a frame range to ordered, unique integer frames.
 *
 * Keyed mode includes every transform, shape-weight, and mesh-motion key
 * inside the range, regardless of the step.
 */
export function animationExportFrames(
  clip: AnimationClip,
  range: AnimationFrameExportRange
): number[] {
  const start = Math.max(0, Math.round(range.startFrame));
  const end = Math.max(start, Math.round(range.endFrame));
  if (range.keyedOnly) {
    const frames = new Set<number>();
    const add = (frame: number): void => {
      if (frame >= start && frame <= end) {
        frames.add(frame);
      }
    };
    for (const track of clip.tracks) {
      for (const key of track.keyframes) {
        add(key.frame);
      }
    }
    for (const track of clip.weightTracks) {
      for (const key of track.keyframes) {
        add(key.frame);
      }
    }
    for (const track of clip.meshTracks) {
      for (const key of track.keyframes) {
        add(key.frame);
      }
    }
    return [...frames].sort((a, b) => a - b);
  }
  const step = Math.max(1, Math.round(range.step));
  const frames: number[] = [];
  for (let frame = start; frame <= end; frame += step) {
    frames.push(frame);
  }
  return frames;
}
