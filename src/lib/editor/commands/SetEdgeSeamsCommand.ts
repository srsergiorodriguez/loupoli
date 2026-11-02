import type { HalfEdgeMesh } from '../../geometry/HalfEdgeMesh';
import type { JournalPatch } from '../../project/journal';
import type { EditorCommand } from './EditorCommand';

/**
 * Mark or clear UV seams on a localized set of DCEL edges.
 *
 * Seam bits live in the DCEL edge flags, so the command stores only the
 * previous and next boolean per affected edge. Topology, UVs, and materials
 * are untouched, and autosave receives one set-edge-seam patch per edge.
 */
export class SetEdgeSeamsCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;
  private readonly edges: readonly number[];
  private readonly before: readonly boolean[];
  private readonly after: readonly boolean[];

  constructor(
    private readonly mesh: HalfEdgeMesh,
    private readonly nodeId: string,
    edges: readonly number[],
    seam: boolean
  ) {
    if (edges.length === 0) {
      throw new Error('A seam command needs at least one edge.');
    }
    this.edges = [...new Set(edges)].sort((a, b) => a - b);
    this.before = this.edges.map((edge) => mesh.isEdgeSeam(edge));
    this.after = this.edges.map(() => seam);
    this.label = seam
      ? `Mark ${this.edges.length} seam${this.edges.length === 1 ? '' : 's'}`
      : `Clear ${this.edges.length} seam${this.edges.length === 1 ? '' : 's'}`;
    this.estimatedBytes = this.edges.length * 16 + 64;
  }

  /** Whether every affected edge already has the requested state. */
  get noop(): boolean {
    return this.before.every((value) => value === this.after[0]);
  }

  execute(): void {
    for (let index = 0; index < this.edges.length; index += 1) {
      this.mesh.setEdgeSeam(this.edges[index], this.after[index]);
    }
  }

  undo(): void {
    for (let index = 0; index < this.edges.length; index += 1) {
      this.mesh.setEdgeSeam(this.edges[index], this.before[index]);
    }
  }

  journalPatch(
    direction: 'forward' | 'backward'
  ): JournalPatch | readonly JournalPatch[] | null {
    return this.edges.map((edge, index) => ({
      type: 'set-edge-seam' as const,
      nodeId: this.nodeId,
      edge,
      seam: direction === 'forward' ? this.after[index] : this.before[index]
    }));
  }
}
