import type { JournalPatch } from '../../project/journal';
import { snapshotGroup } from '../../project/lpoly';
import type { MeshNode, NodeTransform } from '../../scene/MeshNode';
import type { SceneDocument } from '../../scene/SceneDocument';
import type { SceneGroup } from '../../scene/SceneGroup';
import type { EditorCommand } from './EditorCommand';

/** One child's before/after placement in a group operation. */
export interface GroupChildChange {
  readonly node: MeshNode;
  readonly beforeParentId: string | null;
  readonly beforeTransform: NodeTransform;
  readonly afterParentId: string | null;
  readonly afterTransform: NodeTransform;
}

function cloneTransform(transform: NodeTransform): NodeTransform {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: [...transform.scale]
  };
}

/**
 * Create a group and attach selected ungrouped objects.
 *
 * The group pivot starts at the average object position; each child's local
 * position is shifted by that pivot so world-space geometry does not move.
 */
export class CreateGroupCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;

  constructor(
    private readonly document: SceneDocument,
    private readonly group: SceneGroup,
    private readonly index: number,
    private readonly children: readonly GroupChildChange[]
  ) {
    this.label = `Create ${group.name}`;
    this.estimatedBytes = children.length * 160 + 192;
  }

  execute(): void {
    this.document.insertGroup(this.group, this.index);
    for (const child of this.children) {
      child.node.setParentId(child.afterParentId);
      child.node.setTransform(child.afterTransform);
    }
  }

  undo(): void {
    for (const child of this.children) {
      child.node.setParentId(child.beforeParentId);
      child.node.setTransform(child.beforeTransform);
    }
    this.document.removeGroup(this.group.id);
  }

  journalPatch(direction: 'forward' | 'backward'): readonly JournalPatch[] {
    if (direction === 'forward') {
      const patches: JournalPatch[] = [
        {
          type: 'insert-group',
          index: this.index,
          group: snapshotGroup(this.group)
        }
      ];
      for (const child of this.children) {
        patches.push(
          {
            type: 'transform-node',
            nodeId: child.node.id,
            transform: cloneTransform(child.afterTransform)
          },
          {
            type: 'parent-node',
            nodeId: child.node.id,
            parentId: child.afterParentId
          }
        );
      }
      return patches;
    }

    const patches: JournalPatch[] = [];
    for (const child of this.children) {
      patches.push(
        {
          type: 'parent-node',
          nodeId: child.node.id,
          parentId: child.beforeParentId
        },
        {
          type: 'transform-node',
          nodeId: child.node.id,
          transform: cloneTransform(child.beforeTransform)
        }
      );
    }
    patches.push({ type: 'remove-group', groupId: this.group.id });
    return patches;
  }
}

/** Apply a position/rotation/scale transform to a group. */
export class TransformGroupCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes = 256;
  private readonly before: NodeTransform;
  private readonly after: NodeTransform;

  constructor(
    private readonly group: SceneGroup,
    before: NodeTransform,
    after: NodeTransform
  ) {
    this.before = cloneTransform(before);
    this.after = cloneTransform(after);
    this.label = `Transform ${group.name}`;
  }

  execute(): void {
    this.group.setTransform(this.after);
  }

  undo(): void {
    this.group.setTransform(this.before);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'transform-group',
      groupId: this.group.id,
      transform: cloneTransform(direction === 'forward' ? this.after : this.before)
    };
  }
}

/** Dissolve a group while baking its transform into every child. */
export class UngroupGroupCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;

  constructor(
    private readonly document: SceneDocument,
    private readonly group: SceneGroup,
    private readonly index: number,
    private readonly children: readonly GroupChildChange[]
  ) {
    this.label = `Ungroup ${group.name}`;
    this.estimatedBytes = children.length * 160 + 192;
  }

  execute(): void {
    for (const child of this.children) {
      child.node.setParentId(null);
      child.node.setTransform(child.afterTransform);
    }
    this.document.removeGroup(this.group.id);
  }

  undo(): void {
    this.document.insertGroup(this.group, this.index);
    for (const child of this.children) {
      child.node.setParentId(child.beforeParentId);
      child.node.setTransform(child.beforeTransform);
    }
  }

  journalPatch(direction: 'forward' | 'backward'): readonly JournalPatch[] {
    if (direction === 'forward') {
      const patches: JournalPatch[] = [];
      for (const child of this.children) {
        patches.push(
          {
            type: 'transform-node',
            nodeId: child.node.id,
            transform: cloneTransform(child.afterTransform)
          },
          { type: 'parent-node', nodeId: child.node.id, parentId: null }
        );
      }
      patches.push({ type: 'remove-group', groupId: this.group.id });
      return patches;
    }

    const patches: JournalPatch[] = [
      {
        type: 'insert-group',
        index: this.index,
        group: snapshotGroup(this.group)
      }
    ];
    for (const child of this.children) {
      patches.push(
        {
          type: 'parent-node',
          nodeId: child.node.id,
          parentId: child.beforeParentId
        },
        {
          type: 'transform-node',
          nodeId: child.node.id,
          transform: cloneTransform(child.beforeTransform)
        }
      );
    }
    return patches;
  }
}
