import type { Vec3 } from '../geometry/HalfEdgeMesh';

/** One serializable render camera. */
export interface CameraSnapshot {
  readonly id: string;
  readonly name: string;
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fov: number;
}

/** Rune-safe camera projection for the Render workspace and scene lists. */
export type CameraSummary = CameraSnapshot;

let nextCameraNumber = 1;

/** Generate a stable camera id within the session. */
export function createCameraId(): string {
  const id = `camera-${nextCameraNumber}`;
  nextCameraNumber += 1;
  return id;
}

function cloneVec3(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]];
}

/** A named perspective camera stored in the project document. */
export class SceneCamera {
  readonly id: string;
  name: string;
  position: Vec3 = [4, -6, 4];
  target: Vec3 = [0, 0, 0];
  fov = 42;

  constructor(snapshot: Omit<CameraSnapshot, 'id'> & { id?: string }) {
    this.id = snapshot.id ?? createCameraId();
    this.name = snapshot.name;
    this.position = cloneVec3(snapshot.position);
    this.target = cloneVec3(snapshot.target);
    this.fov = snapshot.fov;
  }

  /** Default three-quarter render camera for a fresh scene. */
  static default(id = createCameraId()): SceneCamera {
    return new SceneCamera({
      id,
      name: 'Camera',
      position: [4, -6, 4],
      target: [0, 0, 0],
      fov: 42
    });
  }

  /** Restore a camera from serialized data. */
  static fromSnapshot(snapshot: CameraSnapshot): SceneCamera {
    return new SceneCamera(snapshot);
  }

  /** Detached snapshot for commands, journal patches, and saves. */
  snapshot(): CameraSnapshot {
    return {
      id: this.id,
      name: this.name,
      position: cloneVec3(this.position),
      target: cloneVec3(this.target),
      fov: this.fov
    };
  }

  /** Apply a complete snapshot for undo/redo and journal replay. */
  apply(snapshot: CameraSnapshot): void {
    this.name = snapshot.name;
    this.position = cloneVec3(snapshot.position);
    this.target = cloneVec3(snapshot.target);
    this.fov = snapshot.fov;
  }
}
