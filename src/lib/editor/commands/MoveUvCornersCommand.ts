import type { HalfEdgeMesh, Vec2 } from '../../geometry/HalfEdgeMesh';
import type { JournalPatch } from '../../project/journal';
import type { EditorCommand } from './EditorCommand';

/** A localized move of per-corner UV coordinates. */
export class MoveUvCornersCommand implements EditorCommand {
  readonly label: string;
  readonly estimatedBytes: number;
  private readonly corners: readonly number[];
  private readonly before: readonly Vec2[];
  private readonly after: readonly Vec2[];

  constructor(
    private readonly mesh: HalfEdgeMesh,
    private readonly nodeId: string,
    corners: readonly number[],
    before: readonly Vec2[],
    after: readonly Vec2[]
  ) {
    if (before.length !== corners.length || after.length !== corners.length) {
      throw new Error('UV corner transform count does not match.');
    }
    this.corners = [...corners];
    this.before = before.map((uv) => [...uv] as Vec2);
    this.after = after.map((uv) => [...uv] as Vec2);
    this.label = `Move ${corners.length} UV corner${corners.length === 1 ? '' : 's'}`;
    this.estimatedBytes = corners.length * 32 + 64;
  }

  execute(): void {
    for (let index = 0; index < this.corners.length; index += 1) {
      this.mesh.setCornerUv(this.corners[index], this.after[index]);
    }
  }

  undo(): void {
    for (let index = 0; index < this.corners.length; index += 1) {
      this.mesh.setCornerUv(this.corners[index], this.before[index]);
    }
  }

  journalPatch(
    direction: 'forward' | 'backward'
  ): JournalPatch | readonly JournalPatch[] | null {
    return this.corners.map((corner, index) => ({
      type: 'move-uv' as const,
      nodeId: this.nodeId,
      corner,
      uv: [
        ...(direction === 'forward' ? this.after[index] : this.before[index])
      ] as Vec2
    }));
  }
}
