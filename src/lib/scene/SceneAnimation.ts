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

/** One keyed shape-key weight at an integer frame. */
export interface ShapeWeightKeyframe {
  readonly frame: number;
  readonly weight: number;
  readonly interpolation: AnimationInterpolation;
}

/** One shape-key weight track. */
export interface ShapeWeightTrackSnapshot {
  readonly id: string;
  readonly targetId: string;
  readonly shapeKeyId: string;
  readonly keyframes: readonly ShapeWeightKeyframe[];
}

/** One independently named animation clip. */
export interface AnimationClipSnapshot {
  readonly id: string;
  readonly name: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly tracks: readonly AnimationTrackSnapshot[];
  readonly weightTracks?: readonly ShapeWeightTrackSnapshot[];
}

/**
 * Complete serializable animation state.
 *
 * Legacy v4 files store a flat start/end/tracks set; v5 stores clips. Decode
 * normalizes both forms, and the encoder always writes clips.
 */
export interface AnimationSnapshot {
  readonly fps: number;
  readonly clips?: readonly AnimationClipSnapshot[];
  readonly activeClipId?: string;
  readonly startFrame?: number;
  readonly endFrame?: number;
  readonly tracks?: readonly AnimationTrackSnapshot[];
  readonly weightTracks?: readonly ShapeWeightTrackSnapshot[];
}

let nextTrackNumber = 1;
let nextWeightTrackNumber = 1;
let nextClipNumber = 1;

/** Create a stable animation track id. */
export function createAnimationTrackId(): string {
  const id = `track-${nextTrackNumber}`;
  nextTrackNumber += 1;
  return id;
}

/** Create a stable shape-weight track id. */
export function createShapeWeightTrackId(): string {
  const id = `weight-track-${nextWeightTrackNumber}`;
  nextWeightTrackNumber += 1;
  return id;
}

/** Create a stable animation clip id. */
export function createAnimationClipId(): string {
  const id = `clip-${nextClipNumber}`;
  nextClipNumber += 1;
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

/** One shape key's animated weight track. */
export class ShapeWeightTrack {
  readonly id: string;
  readonly targetId: string;
  readonly shapeKeyId: string;
  private frames: ShapeWeightKeyframe[] = [];

  constructor(
    targetId: string,
    shapeKeyId: string,
    id = createShapeWeightTrackId()
  ) {
    this.targetId = targetId;
    this.shapeKeyId = shapeKeyId;
    this.id = id;
  }

  /** Restore one track from serialized data. */
  static fromSnapshot(snapshot: ShapeWeightTrackSnapshot): ShapeWeightTrack {
    const track = new ShapeWeightTrack(
      snapshot.targetId,
      snapshot.shapeKeyId,
      snapshot.id
    );
    track.frames = snapshot.keyframes
      .map((key) => ({
        frame: key.frame,
        weight: Math.max(0, Math.min(1, key.weight)),
        interpolation: key.interpolation
      }))
      .sort((a, b) => a.frame - b.frame);
    return track;
  }

  /** Ordered read-only keys. */
  get keyframes(): readonly ShapeWeightKeyframe[] {
    return this.frames;
  }

  /** Add or replace the key at one frame. */
  setKey(
    frame: number,
    weight: number,
    interpolation: AnimationInterpolation = 'linear'
  ): void {
    const key: ShapeWeightKeyframe = {
      frame,
      weight: Math.max(0, Math.min(1, weight)),
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

  /** Evaluate the weight at a frame with clamping at either end. */
  evaluate(frame: number): number | null {
    if (this.frames.length === 0) {
      return null;
    }
    if (frame <= this.frames[0].frame) {
      return this.frames[0].weight;
    }
    const last = this.frames[this.frames.length - 1];
    if (frame >= last.frame) {
      return last.weight;
    }
    for (let i = 0; i < this.frames.length - 1; i += 1) {
      const a = this.frames[i];
      const b = this.frames[i + 1];
      if (frame >= a.frame && frame <= b.frame) {
        if (a.interpolation === 'step' || b.frame === a.frame) {
          return a.weight;
        }
        const t = (frame - a.frame) / (b.frame - a.frame);
        return a.weight + (b.weight - a.weight) * t;
      }
    }
    return last.weight;
  }

  /** Detached snapshot for commands, journal patches, and saves. */
  snapshot(): ShapeWeightTrackSnapshot {
    return {
      id: this.id,
      targetId: this.targetId,
      shapeKeyId: this.shapeKeyId,
      keyframes: this.frames.map((key) => ({ ...key }))
    };
  }
}

/** One named animation clip containing transform and shape-weight tracks. */
export class AnimationClip {
  readonly id: string;
  name: string;
  startFrame = 0;
  endFrame = 48;
  readonly tracks: AnimationTrack[] = [];
  readonly weightTracks: ShapeWeightTrack[] = [];

  constructor(
    name = 'Animation 1',
    id = createAnimationClipId(),
    startFrame = 0,
    endFrame = 48
  ) {
    this.name = name;
    this.id = id;
    this.startFrame = Math.max(0, Math.round(startFrame));
    this.endFrame = Math.max(this.startFrame + 1, Math.round(endFrame));
  }

  /** Restore one clip from serialized data. */
  static fromSnapshot(snapshot: AnimationClipSnapshot): AnimationClip {
    const clip = new AnimationClip(
      snapshot.name,
      snapshot.id,
      snapshot.startFrame,
      snapshot.endFrame
    );
    clip.tracks.push(...snapshot.tracks.map(AnimationTrack.fromSnapshot));
    clip.weightTracks.push(
      ...(snapshot.weightTracks ?? []).map(ShapeWeightTrack.fromSnapshot)
    );
    return clip;
  }

  /** Find one transform track by target. */
  getTrack(targetId: string): AnimationTrack | null {
    return this.tracks.find((track) => track.targetId === targetId) ?? null;
  }

  /** Find or create one transform track for a target. */
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

  /** Find the weight track for one node/shape-key pair. */
  getWeightTrack(targetId: string, shapeKeyId: string): ShapeWeightTrack | null {
    return (
      this.weightTracks.find(
        (track) =>
          track.targetId === targetId && track.shapeKeyId === shapeKeyId
      ) ?? null
    );
  }

  /** Find or create one shape-weight track. */
  ensureWeightTrack(targetId: string, shapeKeyId: string): ShapeWeightTrack {
    const existing = this.getWeightTrack(targetId, shapeKeyId);
    if (existing) {
      return existing;
    }
    const track = new ShapeWeightTrack(targetId, shapeKeyId);
    this.weightTracks.push(track);
    return track;
  }

  /** Remove one shape-weight track. */
  removeWeightTrack(targetId: string, shapeKeyId: string): void {
    const index = this.weightTracks.findIndex(
      (track) =>
        track.targetId === targetId && track.shapeKeyId === shapeKeyId
    );
    if (index >= 0) {
      this.weightTracks.splice(index, 1);
    }
  }

  /** Remove a transform track by target id. */
  removeTrack(targetId: string): void {
    const index = this.tracks.findIndex((track) => track.targetId === targetId);
    if (index >= 0) {
      this.tracks.splice(index, 1);
    }
  }

  /** Detached snapshot for commands and persistence. */
  snapshot(): AnimationClipSnapshot {
    return {
      id: this.id,
      name: this.name,
      startFrame: this.startFrame,
      endFrame: this.endFrame,
      tracks: this.tracks.map((track) => track.snapshot()),
      weightTracks: this.weightTracks.map((track) => track.snapshot())
    };
  }
}

/** Document-level animation clips and shared frame rate. */
export class SceneAnimation {
  fps = 24;
  readonly clips: AnimationClip[] = [];
  activeClipId: string;

  constructor(createDefault = true) {
    if (createDefault) {
      const clip = new AnimationClip();
      this.clips.push(clip);
      this.activeClipId = clip.id;
    } else {
      this.activeClipId = '';
    }
  }

  /** Restore v5 clips or migrate a flat v4 animation. */
  static fromSnapshot(snapshot: AnimationSnapshot): SceneAnimation {
    const animation = new SceneAnimation(false);
    animation.clips.length = 0;
    animation.fps =
      Number.isFinite(snapshot.fps) && snapshot.fps >= 1
        ? snapshot.fps
        : 24;
    if (Array.isArray(snapshot.clips) && snapshot.clips.length > 0) {
      animation.clips.push(
        ...snapshot.clips.map(AnimationClip.fromSnapshot)
      );
    } else {
      const legacy = new AnimationClip(
        'Animation 1',
        'clip-1',
        snapshot.startFrame ?? 0,
        snapshot.endFrame ?? 48
      );
      legacy.tracks.push(
        ...(snapshot.tracks ?? []).map(AnimationTrack.fromSnapshot)
      );
      legacy.weightTracks.push(
        ...(snapshot.weightTracks ?? []).map(ShapeWeightTrack.fromSnapshot)
      );
      animation.clips.push(legacy);
    }
    animation.activeClipId =
      animation.clips.find((clip) => clip.id === snapshot.activeClipId)?.id ??
      animation.clips[0].id;
    return animation;
  }

  /** The currently edited clip. */
  get activeClip(): AnimationClip {
    return (
      this.clips.find((clip) => clip.id === this.activeClipId) ??
      this.clips[0]
    );
  }

  /** Switch the active clip. Callers must publish and re-evaluate the pose. */
  setActiveClip(id: string): boolean {
    if (!this.clips.some((clip) => clip.id === id) || id === this.activeClipId) {
      return false;
    }
    this.activeClipId = id;
    return true;
  }

  /** Add an empty clip and make it active. */
  createClip(name = `Animation ${this.clips.length + 1}`): AnimationClip {
    const clip = new AnimationClip(name);
    this.clips.push(clip);
    this.activeClipId = clip.id;
    return clip;
  }

  /** Duplicate a clip with fresh track ids and make it active. */
  duplicateClip(id = this.activeClipId): AnimationClip | null {
    const source = this.clips.find((clip) => clip.id === id);
    if (!source) {
      return null;
    }
    const copy = AnimationClip.fromSnapshot({
      ...source.snapshot(),
      id: createAnimationClipId(),
      name: `${source.name} Copy`.slice(0, 64)
    });
    const tracks = copy.tracks.splice(0);
    copy.tracks.push(
      ...tracks.map((track) =>
        AnimationTrack.fromSnapshot({
          ...track.snapshot(),
          id: createAnimationTrackId()
        })
      )
    );
    const weightTracks = copy.weightTracks.splice(0);
    copy.weightTracks.push(
      ...weightTracks.map((track) =>
        ShapeWeightTrack.fromSnapshot({
          ...track.snapshot(),
          id: createShapeWeightTrackId()
        })
      )
    );
    this.clips.push(copy);
    this.activeClipId = copy.id;
    return copy;
  }

  /** Rename a clip. */
  renameClip(id: string, name: string): boolean {
    const clip = this.clips.find((item) => item.id === id);
    const trimmed = name.trim();
    if (!clip || trimmed.length === 0 || trimmed.length > 64) {
      return false;
    }
    clip.name = trimmed;
    return true;
  }

  /** Delete a clip, keeping at least one. */
  removeClip(id: string): boolean {
    if (this.clips.length <= 1) {
      return false;
    }
    const index = this.clips.findIndex((clip) => clip.id === id);
    if (index < 0) {
      return false;
    }
    this.clips.splice(index, 1);
    if (this.activeClipId === id) {
      this.activeClipId =
        this.clips[Math.min(index, this.clips.length - 1)].id;
    }
    return true;
  }

  /** Total number of keyframes across all clips. */
  totalKeyframes(): number {
    return this.clips.reduce(
      (total, clip) =>
        total +
        clip.tracks.reduce(
          (count, track) => count + track.keyframes.length,
          0
        ) +
        clip.weightTracks.reduce(
          (count, track) => count + track.keyframes.length,
          0
        ),
      0
    );
  }

  /** Proxy: active clip start. */
  get startFrame(): number {
    return this.activeClip.startFrame;
  }

  /** Proxy: active clip end. */
  get endFrame(): number {
    return this.activeClip.endFrame;
  }

  /** Proxy: active clip transform tracks. */
  get tracks(): readonly AnimationTrack[] {
    return this.activeClip.tracks;
  }

  /** Proxy: active clip shape-weight tracks. */
  get weightTracks(): readonly ShapeWeightTrack[] {
    return this.activeClip.weightTracks;
  }

  getTrack(targetId: string): AnimationTrack | null {
    return this.activeClip.getTrack(targetId);
  }

  ensureTrack(
    targetId: string,
    targetKind: AnimationTargetKind
  ): AnimationTrack {
    return this.activeClip.ensureTrack(targetId, targetKind);
  }

  getWeightTrack(targetId: string, shapeKeyId: string): ShapeWeightTrack | null {
    return this.activeClip.getWeightTrack(targetId, shapeKeyId);
  }

  ensureWeightTrack(targetId: string, shapeKeyId: string): ShapeWeightTrack {
    return this.activeClip.ensureWeightTrack(targetId, shapeKeyId);
  }

  removeWeightTrack(targetId: string, shapeKeyId: string): void {
    this.activeClip.removeWeightTrack(targetId, shapeKeyId);
  }

  removeTrack(targetId: string): void {
    this.activeClip.removeTrack(targetId);
  }

  replaceTracks(tracks: readonly AnimationTrack[]): void {
    this.activeClip.tracks.length = 0;
    this.activeClip.tracks.push(...tracks);
  }

  replaceWeightTracks(tracks: readonly ShapeWeightTrack[]): void {
    this.activeClip.weightTracks.length = 0;
    this.activeClip.weightTracks.push(...tracks);
  }

  /** Detached snapshot for commands and persistence. */
  snapshot(): AnimationSnapshot {
    return {
      fps: this.fps,
      activeClipId: this.activeClipId,
      clips: this.clips.map((clip) => clip.snapshot())
    };
  }

  /** Apply a complete animation snapshot, including clips. */
  apply(snapshot: AnimationSnapshot): void {
    const next = SceneAnimation.fromSnapshot(snapshot);
    this.fps = next.fps;
    this.clips.length = 0;
    this.clips.push(...next.clips);
    this.activeClipId = next.activeClipId;
  }
}
