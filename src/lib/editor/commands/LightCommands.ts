import type { JournalPatch } from '../../project/journal';
import type { SceneDocument } from '../../scene/SceneDocument';
import type { LightSnapshot, SceneLight } from '../../scene/SceneLight';
import type { EditorCommand } from './EditorCommand';

/** Document ambient-light state. */
export interface AmbientLightSnapshot {
  readonly color: string;
  readonly intensity: number;
}

/** Insert one document light. */
export class CreateLightCommand implements EditorCommand {
  readonly label = 'Add light';
  readonly estimatedBytes = 160;

  constructor(
    private readonly document: SceneDocument,
    readonly light: SceneLight,
    private readonly index: number
  ) {}

  execute(): void {
    this.document.insertLight(this.light, this.index);
  }

  undo(): void {
    this.document.removeLight(this.light.id);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: direction === 'forward' ? 'insert-light' : 'remove-light',
      index: this.index,
      light: this.light.snapshot()
    } as JournalPatch;
  }
}

/** Remove one document light. */
export class DeleteLightCommand implements EditorCommand {
  readonly label = 'Delete light';
  readonly estimatedBytes = 160;

  constructor(
    private readonly document: SceneDocument,
    private readonly light: SceneLight,
    private readonly index: number
  ) {}

  execute(): void {
    this.document.removeLight(this.light.id);
  }

  undo(): void {
    this.document.insertLight(this.light, this.index);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: direction === 'forward' ? 'remove-light' : 'insert-light',
      index: this.index,
      light: this.light.snapshot()
    } as JournalPatch;
  }
}

/** Replace all editable fields of one light. */
export class UpdateLightCommand implements EditorCommand {
  readonly label = 'Edit light';
  readonly estimatedBytes = 160;

  constructor(
    private readonly light: SceneLight,
    private readonly before: LightSnapshot,
    private readonly after: LightSnapshot
  ) {}

  execute(): void {
    this.light.apply(this.after);
  }

  undo(): void {
    this.light.apply(this.before);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'update-light',
      light: direction === 'forward' ? this.after : this.before
    };
  }
}

/** Replace document ambient color/intensity. */
export class SetAmbientLightCommand implements EditorCommand {
  readonly label = 'Change ambient light';
  readonly estimatedBytes = 64;

  constructor(
    private readonly document: SceneDocument,
    private readonly before: AmbientLightSnapshot,
    private readonly after: AmbientLightSnapshot
  ) {}

  execute(): void {
    this.document.ambientColor = this.after.color;
    this.document.ambientIntensity = this.after.intensity;
  }

  undo(): void {
    this.document.ambientColor = this.before.color;
    this.document.ambientIntensity = this.before.intensity;
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'set-ambient-light',
      ambient: direction === 'forward' ? this.after : this.before
    };
  }
}

/** Replace document ambient-occlusion bake settings. */
export class SetAmbientOcclusionCommand implements EditorCommand {
  readonly label = 'Change ambient occlusion';
  readonly estimatedBytes = 64;

  constructor(
    private readonly document: SceneDocument,
    private readonly before: import('../../lighting/ao').AmbientOcclusionSettings,
    private readonly after: import('../../lighting/ao').AmbientOcclusionSettings
  ) {}

  execute(): void {
    this.document.ambientOcclusion = { ...this.after };
  }

  undo(): void {
    this.document.ambientOcclusion = { ...this.before };
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'set-ambient-occlusion',
      ambientOcclusion:
        direction === 'forward' ? this.after : this.before
    };
  }
}
