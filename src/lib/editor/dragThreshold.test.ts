import { describe, expect, it } from 'vitest';
import {
  VERTEX_DRAG_THRESHOLD_CSS,
  exceedsVertexDragThreshold
} from './dragThreshold';

describe('vertex drag threshold', () => {
  it('treats tap jitter as a selection-only gesture', () => {
    expect(exceedsVertexDragThreshold(3, 4, 0, 0)).toBe(false);
    expect(
      exceedsVertexDragThreshold(
        VERTEX_DRAG_THRESHOLD_CSS,
        0,
        0,
        0
      )
    ).toBe(false);
  });

  it('starts dragging once travel exceeds the threshold', () => {
    expect(
      exceedsVertexDragThreshold(
        VERTEX_DRAG_THRESHOLD_CSS + 0.01,
        0,
        0,
        0
      )
    ).toBe(true);
    expect(exceedsVertexDragThreshold(10, 12, 0, 0)).toBe(true);
  });
});
