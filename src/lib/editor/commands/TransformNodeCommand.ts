import type { MeshNode, NodeTransform } from '../../scene/MeshNode';
import type { JournalPatch } from '../../project/journal';
import type { EditorCommand } from './EditorCommand';

function cloneTransform(transform: NodeTransform): NodeTransform {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: [...transform.scale]
  };
}

/** A localized object transform change for position, rotation, and scale. */
export class TransformNodeCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes = 96;
  private readonly before: NodeTransform;
  private readonly after: NodeTransform;

  constructor(
    private readonly node: MeshNode,
    before: NodeTransform,
    after: NodeTransform
  ) {
    this.before = cloneTransform(before);
    this.after = cloneTransform(after);
    this.label = `Transform ${node.name}`;
  }

  execute(): void {
    this.node.setTransform(this.after);
  }

  undo(): void {
    this.node.setTransform(this.before);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'transform-node',
      nodeId: this.node.id,
      transform: cloneTransform(direction === 'forward' ? this.after : this.before)
    };
  }
}
