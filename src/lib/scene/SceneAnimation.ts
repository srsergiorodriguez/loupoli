import type { NodeTransform } from './MeshNode';

/** Documents that can carry transform animation. */
export type AnimationTargetKind = 'node' | 'group';

/** Interpolation applied after a keyframe. */
export type AnimationInterpolation = 'step' | 'linear';

/** One keyed transform at an integer frame. */
export interface AnimationKeyframe {
  readonly frame: number;
  readonly transform: NodeTransform;
  readonly interpolation: AnimationInterpolation;
}

/** One animated target and its ordered keyframes. */
export interface AnimationTrackSnapshot {
  readonly id: string;
  readonly targetId: string;
  readonly targetKind: AnimationTargetKind;
  readonly keyframes: readonly AnimationKeyframe[];
}

/** Complete serializable animation state. */
export interface AnimationSnapshot {
  readonly fps: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly tracks: readonly AnimationTrackSnapshot[];
}

let nextTrackNumber = 1;

/** Create a stable animation track id. */
export function createAnimationTrackId(): string {
  const id = `track-${nextTrackNumber}`;
  nextTrackNumber += 1;
  return id;
}

function cloneVec3(value: readonly [number, number, number]): [number, number, number] {
  return [value[0], value[1], value[2]];
}

/** Copy a transform so keyframes never share mutable arrays. */
export function cloneAnimationTransform(transform: NodeTransform): NodeTransform {
  return {
    position: cloneVec3(transform.position),
    rotation: cloneVec3(transform.rotation),
    scale: cloneVec3(transform.scale)
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateTransform(
  a: NodeTransform,
  b: NodeTransform,
  t: number
): NodeTransform {
  return {
    position: [
      lerp(a.position[0], b.position[0], t),
      lerp(a.position[1], b.position[1], t),
      lerp(a.position[2], b.position[2], t)
    ],
    rotation: [
      lerp(a.rotation[0], b.rotation[0], t),
      lerp(a.rotation[1], b.rotation[1], t),
      lerp(a.rotation[2], b.rotation[2], t)
    ],
    scale: [
      lerp(a.scale[0], b.scale[0], t),
      lerp(a.scale[1], b.scale[1], t),
      lerp(a.scale[2], b.scale[2], t)
    ]
  };
}

/** One target's ordered transform keys. */
export class AnimationTrack {
  readonly id: string;
  readonly targetId: string;
  readonly targetKind: AnimationTargetKind;
  private frames: AnimationKeyframe[] = [];

  constructor(
    targetId: string,
    targetKind: AnimationTargetKind,
    id = createAnimationTrackId()
  ) {
    this.id = id;
    this.targetId = targetId;
    this.targetKind = targetKind;
  }

  /** Restore one track from serialized data. */
  static fromSnapshot(snapshot: AnimationTrackSnapshot): AnimationTrack {
    const track = new AnimationTrack(
      snapshot.targetId,
      snapshot.targetKind,
      snapshot.id
    );
    track.frames = snapshot.keyframes
      .map((key) => ({
        frame: key.frame,
        transform: cloneAnimationTransform(key.transform),
        interpolation: key.interpolation
      }))
      .sort((a, b) => a.frame - b.frame);
    return track;
  }

  /** Ordered read-only keys. */
  get keyframes(): readonly AnimationKeyframe[] {
    return this.frames;
  }

  /** Add or replace the key at one frame. */
  setKey(
    frame: number,
    transform: NodeTransform,
    interpolation: AnimationInterpolation = 'linear'
  ): void {
    const key: AnimationKeyframe = {
      frame,
      transform: cloneAnimationTransform(transform),
      interpolation
    };
    const existing = this.frames.findIndex((item) => item.frame === frame);
    if (existing >= 0) {
      this.frames[existing] = key;
    } else {
      this.frames.push(key);
      this.frames.sort((a, b) => a.frame - b.frame);
    }
  }

  /** Remove one frame key. */
  removeKey(frame: number): void {
    this.frames = this.frames.filter((key) => key.frame !== frame);
  }

  /** Evaluate the pose at a frame with clamping at either end. */
  evaluate(frame: number): NodeTransform | null {
    if (this.frames.length === 0) {
      return null;
    }
    if (frame <= this.frames[0].frame) {
      return cloneAnimationTransform(this.frames[0].transform);
    }
    const last = this.frames[this.frames.length - 1];
    if (frame >= last.frame) {
      return cloneAnimationTransform(last.transform);
    }
    for (let i = 0; i < this.frames.length - 1; i += 1) {
      const a = this.frames[i];
      const b = this.frames[i + 1];
      if (frame >= a.frame && frame <= b.frame) {
        if (a.interpolation === 'step' || b.frame === a.frame) {
          return cloneAnimationTransform(a.transform);
        }
        const t = (frame - a.frame) / (b.frame - a.frame);
        return interpolateTransform(a.transform, b.transform, t);
      }
    }
    return cloneAnimationTransform(last.transform);
  }

  /** Detached snapshot for commands, journal patches, and saves. */
  snapshot(): AnimationTrackSnapshot {
    return {
      id: this.id,
      targetId: this.targetId,
      targetKind: this.targetKind,
      keyframes: this.frames.map((key) => ({
        frame: key.frame,
        transform: cloneAnimationTransform(key.transform),
        interpolation: key.interpolation
      }))
    };
  }
}

/** Document-level animation settings and transform tracks. */
export class SceneAnimation {
  fps = 24;
  startFrame = 0;
  endFrame = 48;
  readonly tracks: AnimationTrack[] = [];

  /** Restore the complete animation from serialized data. */
  static fromSnapshot(snapshot: AnimationSnapshot): SceneAnimation {
    const animation = new SceneAnimation();
    animation.fps = snapshot.fps;
    animation.startFrame = snapshot.startFrame;
    animation.endFrame = snapshot.endFrame;
    animation.replaceTracks(snapshot.tracks.map(AnimationTrack.fromSnapshot));
    return animation;
  }

  /** Find one track by target. */
  getTrack(targetId: string): AnimationTrack | null {
    return this.tracks.find((track) => track.targetId === targetId) ?? null;
  }

  /** Find or create one track for a target. */
  ensureTrack(
    targetId: string,
    targetKind: AnimationTargetKind
  ): AnimationTrack {
    const existing = this.getTrack(targetId);
    if (existing) {
      if (existing.targetKind !== targetKind) {
        throw new Error('Animation target kind does not match its track.');
      }
      return existing;
    }
    const track = new AnimationTrack(targetId, targetKind);
    this.tracks.push(track);
    return track;
  }

  /** Remove a track by target id. */
  removeTrack(targetId: string): void {
    const index = this.tracks.findIndex((track) => track.targetId === targetId);
    if (index >= 0) {
      this.tracks.splice(index, 1);
    }
  }

  /** Replace the full track collection. */
  replaceTracks(tracks: readonly AnimationTrack[]): void {
    this.tracks.length = 0;
    this.tracks.push(...tracks);
  }

  /** Detached snapshot for commands and persistence. */
  snapshot(): AnimationSnapshot {
    return {
      fps: this.fps,
      startFrame: this.startFrame,
      endFrame: this.endFrame,
      tracks: this.tracks.map((track) => track.snapshot())
    };
  }

  /** Apply a complete animation snapshot. */
  apply(snapshot: AnimationSnapshot): void {
    this.fps = snapshot.fps;
    this.startFrame = snapshot.startFrame;
    this.endFrame = snapshot.endFrame;
    this.replaceTracks(snapshot.tracks.map(AnimationTrack.fromSnapshot));
  }
}
