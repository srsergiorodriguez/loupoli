import type { MeshNode } from '../../scene/MeshNode';
import type { JournalPatch } from '../../project/journal';
import { snapshotNode } from '../../project/lpoly';
import type { SceneDocument } from '../../scene/SceneDocument';
import type { EditorCommand } from './EditorCommand';

/** Remove a scene node and keep enough localized state to restore it. */
export class DeleteMeshNodeCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;
  private readonly node: MeshNode;
  private readonly index: number;

  constructor(
    private readonly document: SceneDocument,
    node: MeshNode,
    index: number
  ) {
    this.node = node;
    this.index = index;
    this.label = `Delete ${node.name}`;
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
    this.document.removeNode(this.node.id);
  }

  undo(): void {
    this.document.insertNode(this.node, this.index);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch | null {
    return direction === 'forward'
      ? { type: 'remove-node', nodeId: this.node.id }
      : { type: 'insert-node', index: this.index, node: snapshotNode(this.node) };
  }
}
