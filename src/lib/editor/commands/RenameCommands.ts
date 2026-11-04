import type { JournalPatch } from '../../project/journal';
import type { MeshNode } from '../../scene/MeshNode';
import type { SceneGroup } from '../../scene/SceneGroup';
import type { EditorCommand } from './EditorCommand';

/** Rename one scene object while preserving undo and autosave replay. */
export class RenameNodeCommand implements EditorCommand {
  readonly label = 'Rename object';
  readonly estimatedBytes = 96;

  constructor(
    private readonly node: MeshNode,
    private readonly before: string,
    private readonly after: string
  ) {}

  execute(): void {
    this.node.name = this.after;
  }

  undo(): void {
    this.node.name = this.before;
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'set-node-name',
      nodeId: this.node.id,
      name: direction === 'forward' ? this.after : this.before
    };
  }
}

/** Rename one scene group while preserving undo and autosave replay. */
export class RenameGroupCommand implements EditorCommand {
  readonly label = 'Rename group';
  readonly estimatedBytes = 96;

  constructor(
    private readonly group: SceneGroup,
    private readonly before: string,
    private readonly after: string
  ) {}

  execute(): void {
    this.group.name = this.after;
  }

  undo(): void {
    this.group.name = this.before;
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'set-group-name',
      groupId: this.group.id,
      name: direction === 'forward' ? this.after : this.before
    };
  }
}
