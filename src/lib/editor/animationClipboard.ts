import type {
  AnimationClip,
  AnimationInterpolation,
  AnimationTargetKind
} from '../scene/SceneAnimation';
import type { NodeTransform } from '../scene/MeshNode';

/** One detached keyframe held by the animation clipboard. */
export interface AnimationKeyClipboardEntry {
  readonly kind: 'transform' | 'shape' | 'mesh';
  readonly targetId: string;
  readonly targetKind: AnimationTargetKind;
  readonly shapeKeyId: string | null;
  readonly offsetFrame: number;
  readonly interpolation: AnimationInterpolation;
  readonly transform?: NodeTransform;
  readonly weight?: number;
  readonly vertexIndices?: readonly number[];
  readonly values?: readonly number[];
}

/** Minimal key reference accepted by the clipboard builder. */
export interface AnimationKeyClipboardReference {
  readonly trackId: string;
  readonly frame: number;
}

/**
 * Copy selected transform and shape-weight keys from one clip.
 *
 * Offsets are relative to the earliest selected key, so pasting at a playhead
 * preserves the spacing between keys even when the selection spans tracks.
 */
export function buildAnimationKeyClipboard(
  clip: AnimationClip,
  references: readonly AnimationKeyClipboardReference[]
): AnimationKeyClipboardEntry[] {
  const selected = new Map<
    string,
    Omit<AnimationKeyClipboardEntry, 'offsetFrame'> & { frame: number }
  >();
  for (const reference of references) {
    const track = clip.tracks.find((item) => item.id === reference.trackId);
    if (track) {
      const key = track.keyframes.find((item) => item.frame === reference.frame);
      if (!key) {
        continue;
      }
      selected.set(`${track.id}:${key.frame}`, {
        kind: 'transform',
        targetId: track.targetId,
        targetKind: track.targetKind,
        shapeKeyId: null,
        frame: key.frame,
        interpolation: key.interpolation,
        transform: key.transform
      });
      continue;
    }
    const meshTrack = clip.meshTracks.find(
      (item) => item.id === reference.trackId
    );
    if (meshTrack) {
      const key = meshTrack.keyframes.find(
        (item) => item.frame === reference.frame
      );
      if (key) {
        selected.set(`${meshTrack.id}:${key.frame}`, {
          kind: 'mesh',
          targetId: meshTrack.targetId,
          targetKind: 'node',
          shapeKeyId: null,
          frame: key.frame,
          interpolation: key.interpolation,
          vertexIndices: [...meshTrack.vertexIndices],
          values: Array.from(key.values)
        });
      }
      continue;
    }
    const weightTrack = clip.weightTracks.find(
      (item) => item.id === reference.trackId
    );
    const weightKey = weightTrack?.keyframes.find(
      (item) => item.frame === reference.frame
    );
    if (weightTrack && weightKey) {
      selected.set(`${weightTrack.id}:${weightKey.frame}`, {
        kind: 'shape',
        targetId: weightTrack.targetId,
        targetKind: 'node',
        shapeKeyId: weightTrack.shapeKeyId,
        frame: weightKey.frame,
        interpolation: weightKey.interpolation,
        weight: weightKey.weight
      });
    }
  }
  const entries = [...selected.values()];
  if (entries.length === 0) {
    return [];
  }
  const firstFrame = Math.min(...entries.map((entry) => entry.frame));
  return entries
    .map(({ frame, ...entry }) => ({
      ...entry,
      offsetFrame: frame - firstFrame
    }))
    .sort((a, b) => a.offsetFrame - b.offsetFrame);
}

/** Clamp the paste anchor so the first key lands inside the destination clip. */
export function animationPasteBase(
  clip: AnimationClip,
  requestedFrame: number
): number {
  return Math.max(clip.startFrame, Math.round(requestedFrame));
}

/** Destination end frame required to show every pasted key. */
export function animationPasteEndFrame(
  clip: AnimationClip,
  targetFrames: readonly number[]
): number {
  return Math.max(clip.endFrame, ...targetFrames);
}
