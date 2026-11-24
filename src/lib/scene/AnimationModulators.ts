import type { Vec3 } from '../geometry/HalfEdgeMesh';
import type { NodeTransform } from './MeshNode';
import type { CameraPose, LightPose } from './SceneAnimation';

/** Procedural animation source kinds. */
export type AnimationModulatorKind =
  | 'lfo'
  | 'noise'
  | 'audio-envelope'
  | 'orbit';

/** Document target types that can receive a modulator. */
export type ModulatorTargetKind = 'node' | 'camera' | 'light';

/** Scalar/vector properties that modulators can drive. */
export type ModulatorProperty =
  | 'position'
  | 'rotation'
  | 'scale'
  | 'fov'
  | 'intensity';

/** Axis used for scalar modulation of a vector property. */
export type ModulatorAxis = 'x' | 'y' | 'z';

/** LFO waveform. */
export type ModulatorWaveform = 'sine' | 'triangle' | 'square' | 'saw';

/** Rate domains for an LFO. */
export type ModulatorRateSync = 'hz' | 'bpm';

/** Additive or replacement application to the keyed/rest value. */
export type ModulatorBlend = 'add' | 'replace';

/** Serializable procedural modulator attached to an animation clip. */
export interface AnimationModulatorSnapshot {
  readonly id: string;
  readonly kind: AnimationModulatorKind;
  readonly targetKind: ModulatorTargetKind;
  readonly targetId: string;
  readonly property: ModulatorProperty;
  readonly axis: ModulatorAxis;
  readonly blend: ModulatorBlend;
  readonly enabled: boolean;
  readonly amplitude: number;
  readonly offset: number;
  readonly rate: number;
  readonly sync: ModulatorRateSync;
  readonly bpm: number;
  readonly phase: number;
  readonly waveform: ModulatorWaveform;
  readonly seed: number;
  readonly frequency: number;
  readonly audioAssetId: string;
  readonly attack: number;
  readonly release: number;
  readonly gain: number;
  readonly pivot: Vec3;
  readonly radius: number;
  readonly height: number;
  readonly angularRate: number;
}

/** Minimal audio data needed by an envelope follower. */
export interface AudioEnvelopeData {
  readonly peaks: Float32Array;
  readonly duration: number;
}

/** Runtime context for one frame of modulator evaluation. */
export interface ModulatorContext {
  readonly frame: number;
  readonly fps: number;
  readonly audio: ReadonlyMap<string, AudioEnvelopeData>;
}

let nextModulatorNumber = 1;

/** Allocate a stable modulator id. */
export function createModulatorId(): string {
  const id = `modulator-${nextModulatorNumber}`;
  nextModulatorNumber += 1;
  return id;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hash(value: number): number {
  const x = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function smoothNoise(value: number, seed: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  const s = fraction * fraction * (3 - 2 * fraction);
  return (
    hash(floor + seed * 101.73) * (1 - s) +
    hash(floor + 1 + seed * 101.73) * s
  ) * 2 - 1;
}

/** Create a modulator with sensible per-kind defaults. */
export function createModulator(
  kind: AnimationModulatorKind,
  targetKind: ModulatorTargetKind,
  targetId: string,
  patch: Partial<AnimationModulatorSnapshot> = {}
): AnimationModulatorSnapshot {
  return normalizeModulator({
    id: createModulatorId(),
    kind,
    targetKind,
    targetId,
    property: kind === 'orbit' ? 'position' : 'position',
    axis: 'z',
    blend: kind === 'orbit' ? 'replace' : 'add',
    enabled: true,
    amplitude: kind === 'audio-envelope' ? 1 : 0.25,
    offset: 0,
    rate: 1,
    sync: 'hz',
    bpm: 120,
    phase: 0,
    waveform: kind === 'lfo' ? 'sine' : 'square',
    seed: 1,
    frequency: 1,
    audioAssetId: '',
    attack: 0.05,
    release: 0.2,
    gain: 1,
    pivot: [0, 0, 0],
    radius: 5,
    height: 0,
    angularRate: 0.1,
    ...patch
  });
}

/** Validate and normalize one serialized modulator. */
export function normalizeModulator(
  value: AnimationModulatorSnapshot
): AnimationModulatorSnapshot {
  const kind: AnimationModulatorKind =
    value.kind === 'noise' ||
    value.kind === 'audio-envelope' ||
    value.kind === 'orbit'
      ? value.kind
      : 'lfo';
  const targetKind: ModulatorTargetKind =
    value.targetKind === 'camera' || value.targetKind === 'light'
      ? value.targetKind
      : 'node';
  const property: ModulatorProperty =
    value.property === 'rotation' ||
    value.property === 'scale' ||
    value.property === 'fov' ||
    value.property === 'intensity'
      ? value.property
      : 'position';
  const axis: ModulatorAxis =
    value.axis === 'x' || value.axis === 'y' ? value.axis : 'z';
  const waveform: ModulatorWaveform =
    value.waveform === 'triangle' ||
    value.waveform === 'square' ||
    value.waveform === 'saw'
      ? value.waveform
      : 'sine';
  const sync: ModulatorRateSync = value.sync === 'bpm' ? 'bpm' : 'hz';
  const pivot = Array.isArray(value.pivot) && value.pivot.length === 3
    ? value.pivot.map((component) => finite(component, 0)) as Vec3
    : [0, 0, 0] as Vec3;
  return {
    id: typeof value.id === 'string' && value.id ? value.id : createModulatorId(),
    kind,
    targetKind,
    targetId: typeof value.targetId === 'string' ? value.targetId : '',
    property,
    axis,
    blend: value.blend === 'replace' ? 'replace' : 'add',
    enabled: value.enabled !== false,
    amplitude: finite(value.amplitude, 0.25),
    offset: finite(value.offset, 0),
    rate: Math.max(0.0001, finite(value.rate, 1)),
    sync,
    bpm: clamp(finite(value.bpm, 120), 1, 400),
    phase: finite(value.phase, 0),
    waveform,
    seed: finite(value.seed, 1),
    frequency: Math.max(0.0001, finite(value.frequency, 1)),
    audioAssetId:
      typeof value.audioAssetId === 'string' ? value.audioAssetId : '',
    attack: Math.max(0.001, finite(value.attack, 0.05)),
    release: Math.max(0.001, finite(value.release, 0.2)),
    gain: Math.max(0, finite(value.gain, 1)),
    pivot,
    radius: Math.max(0, finite(value.radius, 5)),
    height: finite(value.height, 0),
    angularRate: finite(value.angularRate, 0.1)
  };
}

function waveformValue(
  waveform: ModulatorWaveform,
  phase: number
): number {
  const t = phase - Math.floor(phase);
  if (waveform === 'square') {
    return t < 0.5 ? 1 : -1;
  }
  if (waveform === 'triangle') {
    return 1 - 4 * Math.abs(t - 0.5);
  }
  if (waveform === 'saw') {
    return t * 2 - 1;
  }
  return Math.sin(t * Math.PI * 2);
}

/** Evaluate one modulator's scalar signal at a frame. */
export function modulatorSignal(
  modulator: AnimationModulatorSnapshot,
  context: ModulatorContext
): number {
  const seconds = context.frame / Math.max(1, context.fps);
  if (modulator.kind === 'audio-envelope') {
    const audio = context.audio.get(modulator.audioAssetId);
    if (!audio || audio.peaks.length === 0 || audio.duration <= 0) {
      return 0;
    }
    const currentPeak = Math.max(
      0,
      Math.min(
        audio.peaks.length - 1,
        Math.floor((seconds / audio.duration) * audio.peaks.length)
      )
    );
    let envelope = 0;
    const step = audio.duration / audio.peaks.length;
    for (let index = 0; index <= currentPeak; index += 1) {
      const raw = clamp(audio.peaks[index] * modulator.gain, 0, 1);
      const time = raw > envelope ? modulator.attack : modulator.release;
      const coefficient = 1 - Math.exp(-step / Math.max(0.001, time));
      envelope += (raw - envelope) * coefficient;
    }
    return envelope;
  }
  if (modulator.kind === 'noise') {
    return smoothNoise(seconds * modulator.frequency, modulator.seed);
  }
  const frequency =
    modulator.sync === 'bpm'
      ? (modulator.bpm / 60) * modulator.rate
      : modulator.rate;
  return waveformValue(
    modulator.waveform,
    seconds * frequency + modulator.phase
  );
}

function axisIndex(axis: ModulatorAxis): 0 | 1 | 2 {
  return axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
}

/** Apply all modulators targeting one node to a local transform. */
export function applyNodeModulators(
  base: NodeTransform,
  modulators: readonly AnimationModulatorSnapshot[],
  targetId: string,
  context: ModulatorContext
): NodeTransform {
  const transform: NodeTransform = {
    position: [...base.position] as Vec3,
    rotation: [...base.rotation] as Vec3,
    scale: [...base.scale] as Vec3
  };
  for (const modulator of modulators) {
    if (
      !modulator.enabled ||
      modulator.targetKind !== 'node' ||
      modulator.targetId !== targetId
    ) {
      continue;
    }
    if (modulator.kind === 'orbit') {
      const angle = context.frame / Math.max(1, context.fps) *
        modulator.angularRate * Math.PI * 2 +
        modulator.phase * Math.PI * 2;
      transform.position = [
        modulator.pivot[0] + Math.cos(angle) * modulator.radius,
        modulator.pivot[1] + Math.sin(angle) * modulator.radius,
        modulator.pivot[2] + modulator.height
      ];
      continue;
    }
    const signal = modulatorSignal(modulator, context);
    const value = modulator.offset + signal * modulator.amplitude;
    if (
      modulator.property === 'position' ||
      modulator.property === 'rotation' ||
      modulator.property === 'scale'
    ) {
      const vector = transform[modulator.property];
      const index = axisIndex(modulator.axis);
      vector[index] = modulator.blend === 'replace' ? value : vector[index] + value;
    }
  }
  return transform;
}

/** Apply all modulators targeting one camera. */
export function applyCameraModulators(
  base: CameraPose,
  modulators: readonly AnimationModulatorSnapshot[],
  targetId: string,
  context: ModulatorContext
): CameraPose {
  let position: Vec3 = [...base.position] as Vec3;
  let target: Vec3 = [...base.target] as Vec3;
  let fov = base.fov;
  for (const modulator of modulators) {
    if (
      !modulator.enabled ||
      modulator.targetKind !== 'camera' ||
      modulator.targetId !== targetId
    ) {
      continue;
    }
    if (modulator.kind === 'orbit') {
      const angle =
        (context.frame / Math.max(1, context.fps)) *
          modulator.angularRate *
          Math.PI *
          2 +
        modulator.phase * Math.PI * 2;
      target = [...modulator.pivot] as Vec3;
      position = [
        modulator.pivot[0] + Math.cos(angle) * modulator.radius,
        modulator.pivot[1] + Math.sin(angle) * modulator.radius,
        modulator.pivot[2] + modulator.height
      ];
      continue;
    }
    const signal = modulatorSignal(modulator, context);
    const value = modulator.offset + signal * modulator.amplitude;
    if (modulator.property === 'position') {
      const index = axisIndex(modulator.axis);
      position[index] = modulator.blend === 'replace' ? value : position[index] + value;
    } else if (modulator.property === 'fov') {
      fov = modulator.blend === 'replace' ? value : fov + value;
    }
  }
  return { position, target, fov };
}

/** Apply all modulators targeting one light. */
export function applyLightModulators(
  base: LightPose,
  modulators: readonly AnimationModulatorSnapshot[],
  targetId: string,
  context: ModulatorContext
): LightPose {
  let position: Vec3 = [...base.position] as Vec3;
  let direction: Vec3 = [...base.direction] as Vec3;
  let intensity = base.intensity;
  for (const modulator of modulators) {
    if (
      !modulator.enabled ||
      modulator.targetKind !== 'light' ||
      modulator.targetId !== targetId
    ) {
      continue;
    }
    const signal = modulatorSignal(modulator, context);
    const value = modulator.offset + signal * modulator.amplitude;
    if (modulator.property === 'position') {
      const index = axisIndex(modulator.axis);
      position[index] = modulator.blend === 'replace' ? value : position[index] + value;
    } else if (modulator.property === 'intensity') {
      intensity = Math.max(
        0,
        modulator.blend === 'replace' ? value : intensity + value
      );
    }
  }
  return { position, direction, intensity };
}
