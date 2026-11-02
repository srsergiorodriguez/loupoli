import type { MeshNode } from '../../scene/MeshNode';
import type { JournalPatch } from '../../project/journal';
import { snapshotNode } from '../../project/lpoly';
import type { SceneDocument } from '../../scene/SceneDocument';
import type { EditorCommand } from './EditorCommand';

/** Insert a newly authored primitive node at a localized scene index. */
export class CreateMeshNodeCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;

  constructor(
    private readonly document: SceneDocument,
    readonly node: MeshNode,
    private readonly index: number
  ) {
    this.label = `Add ${node.name}`;
    this.estimatedBytes =
      node.mesh.positions.byteLength +
      node.mesh.heOrigin.byteLength +
      node.mesh.heTwin.byteLength +
      node.mesh.heNext.byteLength +
      node.mesh.heFace.byteLength +
      node.mesh.heEdge.byteLength +
      node.mesh.heUv.byteLength;
  }

  execute(): void {
    this.document.insertNode(this.node, this.index);
  }

  undo(): void {
    this.document.removeNode(this.node.id);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch | null {
    return direction === 'forward'
      ? { type: 'insert-node', index: this.index, node: snapshotNode(this.node) }
      : { type: 'remove-node', nodeId: this.node.id };
  }
}
