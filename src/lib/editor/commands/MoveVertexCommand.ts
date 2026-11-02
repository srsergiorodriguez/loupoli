import type { HalfEdgeMesh, Vec3 } from '../../geometry/HalfEdgeMesh';
import type { JournalPatch } from '../../project/journal';
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

  readonly estimatedBytes = 32;

  constructor(
    private readonly mesh: HalfEdgeMesh,
    private readonly vertex: number,
    before: Vec3,
    after: Vec3,
    readonly nodeId: string | null = null
  ) {
    this.before = [before[0], before[1], before[2]];
    this.after = [after[0], after[1], after[2]];
    this.label = `Move vertex ${vertex + 1}`;
  }

  execute(): void {
    this.mesh.setVertexPosition(this.vertex, this.after);
  }

  undo(): void {
    this.mesh.setVertexPosition(this.vertex, this.before);
  }

  journalPatch(direction: 'forward' | 'backward'): JournalPatch | null {
    if (this.nodeId === null) {
      return null;
    }
    return {
      type: 'move-vertex',
      nodeId: this.nodeId,
      vertex: this.vertex,
      position: direction === 'forward' ? [...this.after] : [...this.before]
    };
  }
}
