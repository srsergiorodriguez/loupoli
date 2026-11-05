import type { JournalPatch } from '../../project/journal';
import type { MeshNode, ShapeKey } from '../../scene/MeshNode';
import type { EditorCommand } from './EditorCommand';

/** One detached shape-key value for commands and journal patches. */
export interface ShapeKeySnapshot {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly visible: boolean;
  readonly targetPositions: Float32Array;
}

function snapshot(keys: readonly ShapeKey[]): ShapeKeySnapshot[] {
  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    weight: key.weight,
    visible: key.visible,
    targetPositions: key.targetPositions.slice()
  }));
}

/** Replace a node's complete shape-key collection. */
export class SetShapeKeysCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;
  private readonly before: ShapeKeySnapshot[];
  private readonly after: ShapeKeySnapshot[];

  constructor(
    private readonly node: MeshNode,
    before: readonly ShapeKey[],
    after: readonly ShapeKey[],
    label: string
  ) {
    this.before = snapshot(before);
    this.after = snapshot(after);
    this.label = label;
    this.estimatedBytes =
      this.before.reduce((sum, key) => sum + key.targetPositions.byteLength, 0) +
      this.after.reduce((sum, key) => sum + key.targetPositions.byteLength, 0) +
      128;
  }

  execute(): void {
    this.node.setShapeKeys(this.after);
  }

  undo(): void {
    this.node.setShapeKeys(this.before);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    return {
      type: 'set-shape-keys',
      nodeId: this.node.id,
      keys: direction === 'forward' ? this.after : this.before
    };
  }
}
