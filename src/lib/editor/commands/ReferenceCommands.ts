import type { JournalPatch } from '../../project/journal';
import type { MeshNode, ReferenceSettings } from '../../scene/MeshNode';
import type { EditorCommand } from './EditorCommand';

/** Change editor-only opacity/front settings on a reference image plane. */
export class SetReferenceSettingsCommand implements EditorCommand {
  readonly label = 'Change reference settings';
  readonly estimatedBytes = 96;

  constructor(
    private readonly node: MeshNode,
    private readonly before: ReferenceSettings | null,
    private readonly after: ReferenceSettings | null
  ) {}

  execute(): void {
    this.node.setReference(this.after);
  }

  undo(): void {
    this.node.setReference(this.before);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'set-node-reference',
      nodeId: this.node.id,
      reference:
        direction === 'forward'
          ? this.after
          : this.before
    };
  }
}
