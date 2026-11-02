import type { HalfEdgeMesh } from '../../geometry/HalfEdgeMesh';
import type { MeshSnapshot } from '../../project/lpoly';
import { snapshotMesh } from '../../project/lpoly';
import type { JournalPatch } from '../../project/journal';
import type { MeshNode } from '../../scene/MeshNode';
import type { EditorCommand } from './EditorCommand';

function meshBytes(mesh: HalfEdgeMesh): number {
  return (
    mesh.positions.byteLength +
    mesh.vertexOut.byteLength +
    mesh.heOrigin.byteLength +
    mesh.heTwin.byteLength +
    mesh.heNext.byteLength +
    mesh.heFace.byteLength +
    mesh.heEdge.byteLength +
    mesh.heUv.byteLength +
    mesh.edgeHalfEdge.byteLength +
    mesh.edgeFlags.byteLength +
    mesh.faceHalfEdge.byteLength +
    mesh.faceMaterial.byteLength
  );
}

/**
 * A destructive topology edit stored as localized before/after mesh snapshots.
 *
 * The operation is rebuilt outside the command; this object supplies exact
 * undo/redo and autosave mesh patches for one affected node.
 */
export class ReplaceMeshCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;
  private readonly before: HalfEdgeMesh;
  private readonly after: HalfEdgeMesh;

  constructor(
    private readonly node: MeshNode,
    before: HalfEdgeMesh,
    after: HalfEdgeMesh,
    label: string
  ) {
    this.before = before;
    this.after = after;
    this.label = label;
    this.estimatedBytes = meshBytes(before) + meshBytes(after);
  }

  execute(): void {
    this.node.setMesh(this.after);
  }

  undo(): void {
    this.node.setMesh(this.before);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch {
    const mesh: MeshSnapshot = snapshotMesh(
      direction === 'forward' ? this.after : this.before
    );
    return { type: 'replace-mesh', nodeId: this.node.id, mesh };
  }
}
