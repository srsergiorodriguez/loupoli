import type { HalfEdgeMesh } from '../../geometry/HalfEdgeMesh';
import type { MeshSnapshot } from '../../project/lpoly';
import { snapshotMesh } from '../../project/lpoly';
import type { JournalPatch } from '../../project/journal';
import type { MeshNode } from '../../scene/MeshNode';
import type { EditorCommand } from './EditorCommand';

/** Loop-slide provenance attached to a mesh replacement. */
export interface ReplaceMeshLoopContext {
  readonly nodeId: string;
  readonly edge: number;
  readonly baseMesh: HalfEdgeMesh;
  readonly t: number;
}

/** Loop-slide context before and after a replacement command. */
export interface ReplaceMeshLoopTransition {
  readonly before: ReplaceMeshLoopContext | null;
  readonly after: ReplaceMeshLoopContext | null;
}

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
  readonly loopContextBefore: ReplaceMeshLoopContext | null;
  readonly loopContextAfter: ReplaceMeshLoopContext | null;

  constructor(
    private readonly node: MeshNode,
    before: HalfEdgeMesh,
    after: HalfEdgeMesh,
    label: string,
    loopTransition: ReplaceMeshLoopTransition | null = null
  ) {
    this.before = before;
    this.after = after;
    this.label = label;
    this.loopContextBefore = loopTransition?.before ?? null;
    this.loopContextAfter = loopTransition?.after ?? null;
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
