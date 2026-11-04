import type { Vec3 } from '../geometry/HalfEdgeMesh';

/** Supported document light types. */
export type LightKind = 'directional' | 'point';

/** Plain serializable light state used by commands and project saves. */
export interface LightSnapshot {
  readonly id: string;
  readonly name: string;
  readonly kind: LightKind;
  readonly color: string;
  readonly intensity: number;
  readonly enabled: boolean;
  readonly castShadows: boolean;
  readonly shadowSoftness: number;
  readonly position: Vec3;
  readonly direction: Vec3;
}

/** Rune-safe light projection for the Scene outliner and Light Inspector. */
export type LightSummary = LightSnapshot;

let nextLightNumber = 1;

export function createLightId(): string {
  const id = `light-${nextLightNumber}`;
  nextLightNumber += 1;
  return id;
}

function cloneVec3(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]];
}

/** Normalize a light direction, falling back to straight down. */
export function normalizeLightDirection(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length > 1e-8
    ? [value[0] / length, value[1] / length, value[2] / length]
    : [0, 0, -1];
}

/** One document light. Lights are scene data, not DCEL mesh nodes. */
export class SceneLight {
  readonly id: string;
  name: string;
  readonly kind: LightKind;
  color = '#ffffff';
  intensity = 1;
  enabled = true;
  castShadows = true;
  shadowSoftness = 0.35;
  position: Vec3 = [0, 0, 4];
  direction: Vec3 = [0, 0, -1];

  constructor(
    snapshot: Omit<LightSnapshot, 'direction' | 'castShadows'> & {
      direction?: Vec3;
      castShadows?: boolean;
      shadowSoftness?: number;
    }
  ) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.kind = snapshot.kind;
    this.color = snapshot.color;
    this.intensity = snapshot.intensity;
    this.enabled = snapshot.enabled;
    this.castShadows = snapshot.castShadows ?? true;
    this.shadowSoftness = snapshot.shadowSoftness ?? 0.35;
    this.position = cloneVec3(snapshot.position);
    this.direction = normalizeLightDirection(snapshot.direction ?? [0, 0, -1]);
  }

  /** Create the default sun used by new projects. */
  static sun(id = createLightId()): SceneLight {
    return new SceneLight({
      id,
      name: 'Sun',
      kind: 'directional',
      color: '#fff4e0',
      intensity: 2.4,
      enabled: true,
      castShadows: true,
      shadowSoftness: 0.35,
      position: [2, 2, 4],
      direction: [-0.35, 0.25, -1]
    });
  }

  /** Restore a light from a serialized snapshot. */
  static fromSnapshot(snapshot: LightSnapshot): SceneLight {
    return new SceneLight(snapshot);
  }

  /** Detached snapshot for commands, journal patches, and saves. */
  snapshot(): LightSnapshot {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      color: this.color,
      intensity: this.intensity,
      enabled: this.enabled,
      castShadows: this.castShadows,
      shadowSoftness: this.shadowSoftness,
      position: cloneVec3(this.position),
      direction: cloneVec3(this.direction)
    };
  }

  /** Apply a complete snapshot for undo/redo and journal replay. */
  apply(snapshot: LightSnapshot): void {
    this.name = snapshot.name;
    this.color = snapshot.color;
    this.intensity = snapshot.intensity;
    this.enabled = snapshot.enabled;
    this.castShadows = snapshot.castShadows ?? true;
    this.shadowSoftness = snapshot.shadowSoftness ?? 0.35;
    this.position = cloneVec3(snapshot.position);
    this.direction = normalizeLightDirection(snapshot.direction);
  }
}
