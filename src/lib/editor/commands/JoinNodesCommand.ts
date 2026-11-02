import type { HalfEdgeMesh } from '../../geometry/HalfEdgeMesh';
import type { MeshSnapshot } from '../../project/lpoly';
import { snapshotMesh, snapshotNode } from '../../project/lpoly';
import type { JournalPatch } from '../../project/journal';
import type { MeshNode } from '../../scene/MeshNode';
import type { SceneDocument } from '../../scene/SceneDocument';
import type { EditorCommand } from './EditorCommand';

/** A source object removed by a join, with its original scene index. */
export interface JoinedSource {
  readonly node: MeshNode;
  readonly index: number;
}

function meshBytes(mesh: HalfEdgeMesh): number {
  return (
    mesh.positions.byteLength +
    mesh.vertexOut.byteLength +
    mesh.heOrigin.byteLength +
    mesh.heTwin.byteLength +
    mesh.heNext.byteLength +
    mesh.heEdge.byteLength +
    mesh.heUv.byteLength +
    mesh.edgeHalfEdge.byteLength +
    mesh.edgeFlags.byteLength +
    mesh.faceHalfEdge.byteLength +
    mesh.faceMaterial.byteLength
  );
}

/**
 * Join several mesh nodes into one target mesh while keeping exact scene
 * restoration data for undo and autosave.
 */
export class JoinNodesCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;
  private readonly before: HalfEdgeMesh;
  private readonly after: HalfEdgeMesh;

  constructor(
    private readonly document: SceneDocument,
    private readonly target: MeshNode,
    before: HalfEdgeMesh,
    after: HalfEdgeMesh,
    private readonly sources: readonly JoinedSource[]
  ) {
    this.before = before;
    this.after = after;
    this.label = `Join ${sources.length + 1} objects`;
    this.estimatedBytes =
      meshBytes(before) +
      meshBytes(after) +
      sources.reduce((bytes, source) => bytes + meshBytes(source.node.mesh), 0);
  }

  execute(): void {
    this.target.setMesh(this.after);
    for (const source of this.sources) {
      this.document.removeNode(source.node.id);
    }
  }

  undo(): void {
    this.target.setMesh(this.before);
    for (const source of [...this.sources].sort((a, b) => a.index - b.index)) {
      this.document.insertNode(source.node, source.index);
    }
  }

  journalPatch(
    direction: 'forward' | 'backward'
  ): readonly JournalPatch[] {
    const targetMesh: MeshSnapshot = snapshotMesh(
      direction === 'forward' ? this.after : this.before
    );
    const patches: JournalPatch[] = [
      { type: 'replace-mesh', nodeId: this.target.id, mesh: targetMesh }
    ];
    if (direction === 'forward') {
      for (const source of this.sources) {
        patches.push({ type: 'remove-node', nodeId: source.node.id });
      }
    } else {
      for (const source of [...this.sources].sort((a, b) => a.index - b.index)) {
        patches.push({
          type: 'insert-node',
          index: source.index,
          node: snapshotNode(source.node)
        });
      }
    }
    return patches;
  }
}
