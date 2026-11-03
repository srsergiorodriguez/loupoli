import type { MeshNode } from '../../scene/MeshNode';
import type { SceneDocument } from '../../scene/SceneDocument';
import type { SceneGroup } from '../../scene/SceneGroup';
import type { JournalPatch } from '../../project/journal';
import type { EditorCommand } from './EditorCommand';

/** Move one mesh node to a new final scene index. */
export class ReorderNodeCommand implements EditorCommand {
  readonly label = 'Reorder scene object';
  readonly estimatedBytes = 64;

  constructor(
    private readonly document: SceneDocument,
    readonly node: MeshNode,
    private readonly from: number,
    private readonly to: number
  ) {}

  execute(): void {
    this.document.moveNodeToIndex(this.node.id, this.to);
  }

  undo(): void {
    this.document.moveNodeToIndex(this.node.id, this.from);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'reorder-node',
      nodeId: this.node.id,
      index: direction === 'forward' ? this.to : this.from
    };
  }
}

/** Toggle mesh-node visibility. */
export class SetNodeVisibilityCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes = 48;

  constructor(
    private readonly node: MeshNode,
    private readonly visible: boolean
  ) {
    this.label = visible ? 'Show object' : 'Hide object';
  }

  execute(): void {
    this.node.visible = this.visible;
  }

  undo(): void {
    this.node.visible = !this.visible;
  }

  journalPatch(): JournalPatch {
    return {
      type: 'set-node-visible',
      nodeId: this.node.id,
      visible: this.visible
    };
  }
}

/** Toggle group visibility. */
export class SetGroupVisibilityCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes = 48;

  constructor(
    private readonly group: SceneGroup,
    private readonly visible: boolean
  ) {
    this.label = visible ? 'Show group' : 'Hide group';
  }

  execute(): void {
    this.group.visible = this.visible;
  }

  undo(): void {
    this.group.visible = !this.visible;
  }

  journalPatch(): JournalPatch {
    return {
      type: 'set-group-visible',
      groupId: this.group.id,
      visible: this.visible
    };
  }
}
