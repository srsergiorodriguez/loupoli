import type { HalfEdgeMesh, Vec3 } from '../../geometry/HalfEdgeMesh';
import type { JournalPatch } from '../../project/journal';
import type { MeshNode } from '../../scene/MeshNode';
import type { EditorCommand } from './EditorCommand';

/**
 * A localized vertex move.
 *
 * Topology is untouched, so the command stores two positions rather than a mesh
 * snapshot. This is the geometric-delta path that later transform tools reuse.
 */
export class MoveVertexCommand implements EditorCommand {
  readonly label: string;
  private readonly before: Vec3;
  private readonly after: Vec3;
  private readonly renameFrom: string | null;
  private readonly renameTo: string | null;

  readonly estimatedBytes = 32;

  constructor(
    private readonly mesh: HalfEdgeMesh,
    private readonly vertex: number,
    before: Vec3,
    after: Vec3,
    readonly nodeId: string | null = null,
    private readonly node: MeshNode | null = null
  ) {
    this.before = [before[0], before[1], before[2]];
    this.after = [after[0], after[1], after[2]];
    this.renameFrom = node?.hasPrimitiveName() ? node.name : null;
    this.renameTo = this.renameFrom === null ? null : node?.customName() ?? null;
    this.label = `Move vertex ${vertex + 1}`;
  }

  execute(): void {
    if (this.renameFrom !== null && this.renameTo !== null && this.node) {
      this.node.name = this.renameTo;
    }
    this.mesh.setVertexPosition(this.vertex, this.after);
  }

  undo(): void {
    this.mesh.setVertexPosition(this.vertex, this.before);
    if (this.renameFrom !== null && this.node) {
      this.node.name = this.renameFrom;
    }
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch | readonly JournalPatch[] | null {
    if (this.nodeId === null) {
      return null;
    }
    const patches: JournalPatch[] = [];
    if (this.renameFrom !== null && this.renameTo !== null) {
      patches.push({
        type: 'set-node-name',
        nodeId: this.nodeId,
        name: direction === 'forward' ? this.renameTo : this.renameFrom
      });
    }
    patches.push({
      type: 'move-vertex',
      nodeId: this.nodeId,
      vertex: this.vertex,
      position: direction === 'forward' ? [...this.after] : [...this.before]
    });
    return patches;
  }
}