import type { HalfEdgeMesh } from '../../geometry/HalfEdgeMesh';
import type { JournalPatch } from '../../project/journal';
import { snapshotMesh } from '../../project/lpoly';
import type { MeshNode, ShapeKey } from '../../scene/MeshNode';
import type { EditorCommand } from './EditorCommand';
import type { ShapeKeySnapshot } from './ShapeKeyCommands';

function snapshots(keys: readonly ShapeKey[]): ShapeKeySnapshot[] {
  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    weight: key.weight,
    visible: key.visible,
    targetPositions: key.targetPositions.slice()
  }));
}

/** Capture the current mesh into a shape key while restoring its source base. */
export class CaptureShapeKeyCommand implements EditorCommand {
  readonly label = 'Capture shape key';
  readonly estimatedBytes: number;
  private readonly beforeKeys: ShapeKeySnapshot[];
  private readonly afterKeys: ShapeKeySnapshot[];

  constructor(
    private readonly node: MeshNode,
    private readonly beforeMesh: HalfEdgeMesh,
    private readonly afterMesh: HalfEdgeMesh,
    beforeKeys: readonly ShapeKey[],
    afterKeys: readonly ShapeKey[]
  ) {
    this.beforeKeys = snapshots(beforeKeys);
    this.afterKeys = snapshots(afterKeys);
    this.estimatedBytes =
      beforeMesh.positions.byteLength +
      afterMesh.positions.byteLength +
      this.beforeKeys.reduce((sum, key) => sum + key.targetPositions.byteLength, 0) +
      this.afterKeys.reduce((sum, key) => sum + key.targetPositions.byteLength, 0) +
      128;
  }

  execute(): void {
    this.node.replaceBaseMesh(this.afterMesh);
    this.node.setShapeKeys(this.afterKeys);
  }

  undo(): void {
    this.node.replaceBaseMesh(this.beforeMesh);
    this.node.setShapeKeys(this.beforeKeys);
  }

  journalPatch(direction: 'forward' | 'backward'): readonly JournalPatch[] {
    const mesh = direction === 'forward' ? this.afterMesh : this.beforeMesh;
    return [
      {
        type: 'replace-mesh',
        nodeId: this.node.id,
        mesh: snapshotMesh(mesh)
      },
      {
        type: 'set-shape-keys',
        nodeId: this.node.id,
        keys: direction === 'forward' ? this.afterKeys : this.beforeKeys
      }
    ];
  }
}
