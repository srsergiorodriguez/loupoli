import type { MeshNode, NodeTransform, ShapeKey } from '../../scene/MeshNode';
import type { HalfEdgeMesh } from '../../geometry/HalfEdgeMesh';
import { snapshotMesh } from '../../project/lpoly';
import type { JournalPatch } from '../../project/journal';
import type { EditorCommand } from './EditorCommand';
import { meshBytes } from './ReplaceMeshCommand';

export interface ShapeKeySnapshot {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly visible: boolean;
  readonly targetPositions: Float32Array;
}

function snapshotKeys(keys: readonly ShapeKey[]): ShapeKeySnapshot[] {
  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    weight: key.weight,
    visible: key.visible,
    targetPositions: key.targetPositions.slice()
  }));
}

function cloneTransform(transform: NodeTransform): NodeTransform {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: [...transform.scale]
  };
}

/**
 * Bake a mesh node's local transform into its editable rest mesh, shape keys,
 * and reset the transform to identity in one undoable operation.
 */
export class ApplyNodeTransformsCommand implements EditorCommand {
  readonly label = 'Apply transforms';
  readonly estimatedBytes: number;
  private readonly beforeKeys: ShapeKeySnapshot[];
  private readonly afterKeys: ShapeKeySnapshot[];
  private readonly beforeTransform: NodeTransform;
  private readonly afterTransform: NodeTransform;

  constructor(
    private readonly node: MeshNode,
    private readonly beforeMesh: HalfEdgeMesh,
    private readonly afterMesh: HalfEdgeMesh,
    beforeTransform: NodeTransform,
    afterTransform: NodeTransform,
    afterKeys: readonly ShapeKey[]
  ) {
    this.beforeKeys = snapshotKeys(node.shapeKeys);
    this.afterKeys = snapshotKeys(afterKeys);
    this.beforeTransform = cloneTransform(beforeTransform);
    this.afterTransform = cloneTransform(afterTransform);
    this.estimatedBytes =
      meshBytes(beforeMesh) +
      meshBytes(afterMesh) +
      this.beforeKeys.reduce(
        (sum, key) => sum + key.targetPositions.byteLength,
        0
      ) +
      this.afterKeys.reduce(
        (sum, key) => sum + key.targetPositions.byteLength,
        0
      ) +
      128;
  }

  execute(): void {
    this.node.setShapeKeys([]);
    this.node.setMesh(this.afterMesh);
    this.node.setShapeKeys(this.afterKeys);
    this.node.setTransform(this.afterTransform);
  }

  undo(): void {
    this.node.setShapeKeys([]);
    this.node.setMesh(this.beforeMesh);
    this.node.setShapeKeys(this.beforeKeys);
    this.node.setTransform(this.beforeTransform);
  }

  journalPatch(direction: 'forward' | 'backward'): readonly JournalPatch[] {
    const mesh = direction === 'forward' ? this.afterMesh : this.beforeMesh;
    const keys = direction === 'forward' ? this.afterKeys : this.beforeKeys;
    const transform =
      direction === 'forward' ? this.afterTransform : this.beforeTransform;
    return [
      {
        type: 'replace-mesh',
        nodeId: this.node.id,
        mesh: snapshotMesh(mesh)
      },
      {
        type: 'set-shape-keys',
        nodeId: this.node.id,
        keys
      },
      {
        type: 'transform-node',
        nodeId: this.node.id,
        transform: cloneTransform(transform)
      }
    ];
  }
}
