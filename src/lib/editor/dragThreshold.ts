/** CSS-pixel travel required before a topology drag starts moving geometry. */
export const VERTEX_DRAG_THRESHOLD_CSS = 5;

/** Whether pointer travel has crossed the tap-versus-drag threshold. */
export function exceedsVertexDragThreshold(
  clientX: number,
  clientY: number,
  startX: number,
  startY: number
): boolean {
  return Math.hypot(clientX - startX, clientY - startY) > VERTEX_DRAG_THRESHOLD_CSS;
}
