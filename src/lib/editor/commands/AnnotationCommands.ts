import type { JournalPatch } from '../../project/journal';
import type {
  AnnotationStrokeSnapshot,
  SceneAnnotations
} from '../../scene/SceneAnnotations';
import type { EditorCommand } from './EditorCommand';

/** Replace the complete annotation layer as one undoable edit. */
export class SetAnnotationsCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;

  constructor(
    private readonly annotations: SceneAnnotations,
    private readonly before: readonly AnnotationStrokeSnapshot[],
    private readonly after: readonly AnnotationStrokeSnapshot[],
    label = 'Edit annotations'
  ) {
    this.label = label;
    this.estimatedBytes =
      after.reduce((sum, stroke) => sum + 32 + stroke.points.length * 28, 64);
  }

  execute(): void {
    this.annotations.apply(this.after);
  }

  undo(): void {
    this.annotations.apply(this.before);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'set-annotations',
      annotations: direction === 'forward' ? this.after : this.before
    };
  }
}
