import type { SelectionMode } from '../scene/MeshNode';

/**
 * Session-only multi-element selection for the active scene node.
 *
 * The set is keyed by DCEL element indices and is cleared whenever the active
 * node or element mode changes. It is intentionally not part of the document or
 * the undo stack.
 */
export class ElementSelection {
  private selectedMode: SelectionMode;
  private activeNodeId: string | null = null;
  private readonly selected = new Set<number>();

  constructor(mode: SelectionMode = 'vertex') {
    this.selectedMode = mode;
  }

  /** Current element mode. */
  get mode(): SelectionMode {
    return this.selectedMode;
  }

  /** Node that owns the selected element indices. */
  get nodeId(): string | null {
    return this.activeNodeId;
  }

  /** Number of selected elements. */
  get count(): number {
    return this.selected.size;
  }

  /** Sorted selection indices for deterministic rendering and snapshots. */
  values(): readonly number[] {
    return Array.from(this.selected).sort((a, b) => a - b);
  }

  /** Bind the selection to an active node and mode, clearing on context change. */
  setContext(nodeId: string | null, mode: SelectionMode): void {
    if (nodeId === this.activeNodeId && mode === this.selectedMode) {
      return;
    }
    this.activeNodeId = nodeId;
    this.selectedMode = mode;
    this.selected.clear();
  }

  /** Switch element mode, clearing the previous selection. */
  setMode(mode: SelectionMode): void {
    if (mode === this.selectedMode) {
      return;
    }
    this.selectedMode = mode;
    this.selected.clear();
  }

  /**
   * Apply one picked element.
   *
   * Non-additive picks replace the set. Additive picks toggle the item so a
   * selected element can be removed without clearing everything else.
   */
  pick(index: number, additive: boolean): void {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError(`Selection index ${index} is invalid.`);
    }
    if (!additive) {
      this.selected.clear();
      this.selected.add(index);
      return;
    }
    if (this.selected.has(index)) {
      this.selected.delete(index);
    } else {
      this.selected.add(index);
    }
  }

  /** Remove indices that no longer exist after a topology or node change. */
  prune(limit: number): boolean {
    let changed = false;
    for (const index of this.selected) {
      if (index < 0 || index >= limit) {
        this.selected.delete(index);
        changed = true;
      }
    }
    return changed;
  }

  /** Clear all selected elements without changing the context. */
  clear(): void {
    this.selected.clear();
  }

  /** Replace the set with valid indices, used to restore a cancelled preview. */
  setValues(values: readonly number[]): void {
    this.selected.clear();
    for (const value of values) {
      if (Number.isInteger(value) && value >= 0) {
        this.selected.add(value);
      }
    }
  }
}
