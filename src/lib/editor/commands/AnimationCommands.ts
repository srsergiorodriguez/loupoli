import type { JournalPatch } from '../../project/journal';
import {
  estimateAnimationSnapshotBytes,
  type AnimationSnapshot,
  type SceneAnimation
} from '../../scene/SceneAnimation';
import type { EditorCommand } from './EditorCommand';

/** Replace the document's complete animation state. */
export class SetAnimationCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;

  constructor(
    private readonly animation: SceneAnimation,
    private readonly before: AnimationSnapshot,
    private readonly after: AnimationSnapshot,
    label = 'Edit animation'
  ) {
    this.label = label;
    this.estimatedBytes = estimateAnimationSnapshotBytes(after);
  }

  execute(): void {
    this.animation.apply(this.after);
  }

  undo(): void {
    this.animation.apply(this.before);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'set-animation',
      animation: direction === 'forward' ? this.after : this.before
    };
  }
}
