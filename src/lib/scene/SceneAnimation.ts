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

/** One keyed mesh-motion pose at an integer frame. */
export interface MeshMotionKeyframeSnapshot {
  readonly frame: number;
  /** Flat deltas in `vertexIndices` order, three values per vertex. */
  readonly values: readonly number[];
  readonly interpolation: AnimationInterpolation;
}

/** One node's animated vertex deltas. */
export interface MeshMotionTrackSnapshot {
  readonly id: string;
  readonly targetId: string;
  readonly vertexIndices: readonly number[];
  readonly keyframes: readonly MeshMotionKeyframeSnapshot[];
}

/** One independently named animation clip. */
export interface AnimationClipSnapshot {
  readonly id: string;
  readonly name: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly tracks: readonly AnimationTrackSnapshot[];
  readonly weightTracks?: readonly ShapeWeightTrackSnapshot[];
  readonly meshTracks?: readonly MeshMotionTrackSnapshot[];
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
let nextMeshTrackNumber = 1;

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

/** Create a stable mesh-motion track id. */
export function createMeshMotionTrackId(): string {
  const id = `mesh-track-${nextMeshTrackNumber}`;
  nextMeshTrackNumber += 1;
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

/** One node's sparse, interpolated vertex-position animation. */
export class MeshMotionTrack {
  readonly id: string;
  readonly targetId: string;
  private indices: number[] = [];
  private frames: {
    frame: number;
    values: Float32Array;
    interpolation: AnimationInterpolation;
  }[] = [];

  constructor(targetId: string, id = createMeshMotionTrackId()) {
    this.targetId = targetId;
    this.id = id;
  }

  /** Restore a track from serialized vertex indices and delta arrays. */
  static fromSnapshot(snapshot: MeshMotionTrackSnapshot): MeshMotionTrack {
    const track = new MeshMotionTrack(snapshot.targetId, snapshot.id);
    track.indices = [...snapshot.vertexIndices].sort((a, b) => a - b);
    const expected = track.indices.length * 3;
    track.frames = snapshot.keyframes
      .map((key) => {
        if (key.values.length !== expected) {
          throw new Error('Mesh-motion keyframe has the wrong value count.');
        }
        return {
          frame: key.frame,
          values: new Float32Array(key.values),
          interpolation: key.interpolation
        };
      })
      .sort((a, b) => a.frame - b.frame);
    return track;
  }

  /** Stable sorted vertex indices covered by every key. */
  get vertexIndices(): readonly number[] {
    return this.indices;
  }

  /** Ordered read-only keys. */
  get keyframes(): readonly {
    readonly frame: number;
    readonly values: Float32Array;
    readonly interpolation: AnimationInterpolation;
  }[] {
    return this.frames;
  }

  /** Expand every existing pose when a new vertex enters the track. */
  private expandTo(nextIndices: readonly number[]): void {
    const oldPositions = new Map<number, number>();
    this.indices.forEach((vertex, position) => oldPositions.set(vertex, position));
    for (const key of this.frames) {
      const next = new Float32Array(nextIndices.length * 3);
      nextIndices.forEach((vertex, position) => {
        const old = oldPositions.get(vertex);
        if (old === undefined) {
          return;
        }
        next[position * 3] = key.values[old * 3];
        next[position * 3 + 1] = key.values[old * 3 + 1];
        next[position * 3 + 2] = key.values[old * 3 + 2];
      });
      key.values = next;
    }
    this.indices = [...nextIndices];
  }

  /** Merge new vertices into the stable set. */
  private includeVertices(vertices: Iterable<number>): void {
    const union = new Set(this.indices);
    for (const vertex of vertices) {
      union.add(vertex);
    }
    if (union.size === this.indices.length) {
      return;
    }
    this.expandTo([...union].sort((a, b) => a - b));
  }

  /** Insert a full pose, capturing deltas from base to posed positions. */
  setPoseKey(
    frame: number,
    basePositions: Float32Array,
    posedPositions: Float32Array,
    interpolation: AnimationInterpolation = 'linear'
  ): boolean {
    if (basePositions.length !== posedPositions.length) {
      throw new Error('Mesh-motion pose sizes do not match.');
    }
    const values = new Float32Array(basePositions.length);
    const moved: number[] = [];
    for (let vertex = 0; vertex < basePositions.length / 3; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const offset = vertex * 3 + axis;
        const delta = posedPositions[offset] - basePositions[offset];
        values[offset] = delta;
      }
      if (
        Math.abs(values[vertex * 3]) > 1e-6 ||
        Math.abs(values[vertex * 3 + 1]) > 1e-6 ||
        Math.abs(values[vertex * 3 + 2]) > 1e-6
      ) {
        moved.push(vertex);
      }
    }
    if (this.frames.length === 0 && moved.length === 0) {
      return false;
    }
    this.includeVertices(moved);
    const packed = new Float32Array(this.indices.length * 3);
    this.indices.forEach((vertex, position) => {
      packed[position * 3] = values[vertex * 3];
      packed[position * 3 + 1] = values[vertex * 3 + 1];
      packed[position * 3 + 2] = values[vertex * 3 + 2];
    });
    const key = {
      frame: Math.round(frame),
      values: packed,
      interpolation
    };
    const existing = this.frames.findIndex((item) => item.frame === key.frame);
    if (existing >= 0) {
      this.frames[existing] = key;
    } else {
      this.frames.push(key);
      this.frames.sort((a, b) => a.frame - b.frame);
    }
    return true;
  }

  /** Insert a key from explicit sparse vertex deltas (used by paste). */
  setDeltasKey(
    frame: number,
    deltas: ReadonlyMap<number, readonly [number, number, number]>,
    interpolation: AnimationInterpolation = 'linear'
  ): boolean {
    if (this.frames.length === 0 && deltas.size === 0) {
      return false;
    }
    this.includeVertices(deltas.keys());
    const values = new Float32Array(this.indices.length * 3);
    this.indices.forEach((vertex, position) => {
      const delta = deltas.get(vertex);
      if (delta) {
        values[position * 3] = delta[0];
        values[position * 3 + 1] = delta[1];
        values[position * 3 + 2] = delta[2];
      }
    });
    const key = {
      frame: Math.round(frame),
      values,
      interpolation
    };
    const existing = this.frames.findIndex((item) => item.frame === key.frame);
    if (existing >= 0) {
      this.frames[existing] = key;
    } else {
      this.frames.push(key);
      this.frames.sort((a, b) => a.frame - b.frame);
    }
    return true;
  }

  /** Change the interpolation of one key. */
  setInterpolation(
    frame: number,
    interpolation: AnimationInterpolation
  ): boolean {
    const key = this.frames.find((item) => item.frame === frame);
    if (!key) {
      return false;
    }
    key.interpolation = interpolation;
    return true;
  }

  /** Remove one key, clearing the vertex set when the track becomes empty. */
  removeKey(frame: number): void {
    this.frames = this.frames.filter((key) => key.frame !== frame);
    if (this.frames.length === 0) {
      this.indices = [];
    }
  }

  /** Evaluate interpolated deltas, or null when the track has no keys. */
  evaluate(frame: number): Float32Array | null {
    if (this.frames.length === 0) {
      return null;
    }
    const make = (values: Float32Array): Float32Array => values.slice();
    if (frame <= this.frames[0].frame) {
      return make(this.frames[0].values);
    }
    const last = this.frames[this.frames.length - 1];
    if (frame >= last.frame) {
      return make(last.values);
    }
    for (let index = 0; index < this.frames.length - 1; index += 1) {
      const a = this.frames[index];
      const b = this.frames[index + 1];
      if (frame >= a.frame && frame <= b.frame) {
        if (a.interpolation === 'step' || b.frame === a.frame) {
          return make(a.values);
        }
        const t = (frame - a.frame) / (b.frame - a.frame);
        const values = new Float32Array(a.values.length);
        for (let value = 0; value < values.length; value += 1) {
          values[value] = a.values[value] + (b.values[value] - a.values[value]) * t;
        }
        return values;
      }
    }
    return make(last.values);
  }

  /** Detached snapshot for commands and saves. */
  snapshot(): MeshMotionTrackSnapshot {
    return {
      id: this.id,
      targetId: this.targetId,
      vertexIndices: [...this.indices],
      keyframes: this.frames.map((key) => ({
        frame: key.frame,
        values: Array.from(key.values),
        interpolation: key.interpolation
      }))
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
  readonly meshTracks: MeshMotionTrack[] = [];

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
    clip.meshTracks.push(
      ...(snapshot.meshTracks ?? []).map(MeshMotionTrack.fromSnapshot)
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

  /** Find one mesh-motion track for a node. */
  getMeshTrack(targetId: string): MeshMotionTrack | null {
    return (
      this.meshTracks.find((track) => track.targetId === targetId) ?? null
    );
  }

  /** Find or create one mesh-motion track for a node. */
  ensureMeshTrack(targetId: string): MeshMotionTrack {
    const existing = this.getMeshTrack(targetId);
    if (existing) {
      return existing;
    }
    const track = new MeshMotionTrack(targetId);
    this.meshTracks.push(track);
    return track;
  }

  /** Remove one mesh-motion track. */
  removeMeshTrack(targetId: string): void {
    const index = this.meshTracks.findIndex(
      (track) => track.targetId === targetId
    );
    if (index >= 0) {
      this.meshTracks.splice(index, 1);
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
      weightTracks: this.weightTracks.map((track) => track.snapshot()),
      meshTracks: this.meshTracks.map((track) => track.snapshot())
    };
  }
}

/** Approximate retained bytes for one animation snapshot. */
export function estimateAnimationSnapshotBytes(
  snapshot: AnimationSnapshot
): number {
  if (snapshot.clips) {
    return snapshot.clips.reduce(
      (bytes, clip) =>
        bytes +
        128 +
        clip.tracks.reduce(
          (sum, track) => sum + 96 + track.keyframes.length * 128,
          0
        ) +
        (clip.weightTracks ?? []).reduce(
          (sum, track) => sum + 96 + track.keyframes.length * 48,
          0
        ) +
        (clip.meshTracks ?? []).reduce(
          (sum, track) =>
            sum +
            96 +
            track.vertexIndices.length * 8 +
            track.keyframes.reduce(
              (keyBytes, key) => keyBytes + 64 + key.values.length * 8,
              0
            ),
          0
        ),
      64
    );
  }
  return 512;
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
    const meshTracks = copy.meshTracks.splice(0);
    copy.meshTracks.push(
      ...meshTracks.map((track) =>
        MeshMotionTrack.fromSnapshot({
          ...track.snapshot(),
          id: createMeshMotionTrackId()
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
        ) +
        clip.meshTracks.reduce(
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

  /** Proxy: active clip mesh-motion tracks. */
  get meshTracks(): readonly MeshMotionTrack[] {
    return this.activeClip.meshTracks;
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

  getMeshTrack(targetId: string): MeshMotionTrack | null {
    return this.activeClip.getMeshTrack(targetId);
  }

  ensureMeshTrack(targetId: string): MeshMotionTrack {
    return this.activeClip.ensureMeshTrack(targetId);
  }

  removeMeshTrack(targetId: string): void {
    this.activeClip.removeMeshTrack(targetId);
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
