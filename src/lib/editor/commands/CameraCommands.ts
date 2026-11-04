import type { JournalPatch } from '../../project/journal';
import type { CameraSnapshot, SceneCamera } from '../../scene/SceneCamera';
import type { SceneDocument } from '../../scene/SceneDocument';
import type { EditorCommand } from './EditorCommand';

/** Insert one document camera. */
export class CreateCameraCommand implements EditorCommand {
  readonly label = 'Add camera';
  readonly estimatedBytes = 160;

  constructor(
    private readonly document: SceneDocument,
    readonly camera: SceneCamera,
    private readonly index: number
  ) {}

  execute(): void {
    this.document.insertCamera(this.camera, this.index);
  }

  undo(): void {
    this.document.removeCamera(this.camera.id);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: direction === 'forward' ? 'insert-camera' : 'remove-camera',
      index: this.index,
      camera: this.camera.snapshot()
    } as JournalPatch;
  }
}

/** Remove one document camera. */
export class DeleteCameraCommand implements EditorCommand {
  readonly label = 'Delete camera';
  readonly estimatedBytes = 160;

  constructor(
    private readonly document: SceneDocument,
    private readonly camera: SceneCamera,
    private readonly index: number
  ) {}

  execute(): void {
    this.document.removeCamera(this.camera.id);
  }

  undo(): void {
    this.document.insertCamera(this.camera, this.index);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: direction === 'forward' ? 'remove-camera' : 'insert-camera',
      index: this.index,
      camera: this.camera.snapshot()
    } as JournalPatch;
  }
}

/** Replace all editable fields of one camera. */
export class UpdateCameraCommand implements EditorCommand {
  readonly label = 'Edit camera';
  readonly estimatedBytes = 160;

  constructor(
    private readonly camera: SceneCamera,
    private readonly before: CameraSnapshot,
    private readonly after: CameraSnapshot
  ) {}

  execute(): void {
    this.camera.apply(this.after);
  }

  undo(): void {
    this.camera.apply(this.before);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'update-camera',
      camera: direction === 'forward' ? this.after : this.before
    };
  }
}
