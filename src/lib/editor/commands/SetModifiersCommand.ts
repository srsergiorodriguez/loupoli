import {
  cloneModifiers,
  type Modifier
} from '../../geometry/modifiers';
import type { JournalPatch } from '../../project/journal';
import type { MeshNode } from '../../scene/MeshNode';
import type { EditorCommand } from './EditorCommand';

/** Replace a node's ordered modifier stack as one undoable edit. */
export class SetModifiersCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;
  private readonly before: Modifier[];
  private readonly after: Modifier[];

  constructor(
    private readonly node: MeshNode,
    before: readonly Modifier[],
    after: readonly Modifier[],
    label: string
  ) {
    this.before = cloneModifiers(before);
    this.after = cloneModifiers(after);
    this.label = label;
    this.estimatedBytes = (this.before.length + this.after.length) * 128;
  }

  execute(): void {
    this.node.setModifiers(this.after);
  }

  undo(): void {
    this.node.setModifiers(this.before);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'set-modifiers',
      nodeId: this.node.id,
      modifiers: cloneModifiers(
        direction === 'forward' ? this.after : this.before
      )
    };
  }
}
