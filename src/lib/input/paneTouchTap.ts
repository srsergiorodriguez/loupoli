/** Maximum duration of a multi-finger tap outside the viewport. */
export const PANE_TAP_MAX_DURATION_MS = 300;
/** Maximum pointer travel for a multi-finger tap outside the viewport. */
export const PANE_TAP_MAX_TRAVEL_CSS = 10;

/** Resolve the undo/redo action for a completed multi-finger tap. */
export function paneTouchTapAction(
  maxPointers: number,
  durationMs: number,
  maxTravelCss: number,
  invalid: boolean
): 'undo' | 'redo' | null {
  if (
    invalid ||
    maxPointers < 2 ||
    maxPointers > 3 ||
    durationMs > PANE_TAP_MAX_DURATION_MS ||
    maxTravelCss > PANE_TAP_MAX_TRAVEL_CSS
  ) {
    return null;
  }
  return maxPointers === 2 ? 'undo' : 'redo';
}
