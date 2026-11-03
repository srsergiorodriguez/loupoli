# loupoli UI rules

These are implementation constraints, not style suggestions. A change that violates them is incomplete.

## 1. One action, one home

Every command has exactly one visible home. Contextual behavior changes the target, not the location of the control.

- Selection modes and combination: Selection Bar.
- Pointer tools: Tool Rail.
- UV-only operations: UV Toolbar.
- Document actions: Application Bar.
- Topology one-shots: Action Dock.

Do not add a duplicate button to a pane because it is convenient. Shared primitives (`InspectorSection`, `SegmentedControl`, `NumberField`, `Vector3Field`, `ToolButton`, `IconButton`) cover repeated structures.

## 2. Context is explicit

`activeEditor` is the pane last clicked. Shared commands target it. The active pane gets a lime dot and title accent; no full-pane border.

## 3. Selection combination is one model

Replace / Add / Subtract are mutually exclusive, sticky modes in the Selection Bar. Neither Add nor Subtract active means Replace. They apply to clicks and lasso in both editors. Shift/Cmd remains a temporary Add modifier. UV must not own a second Add/Subtract pair.

## 4. One disclosure

Every Inspector Section uses `InspectorSection` (`<details>/<summary>`). No custom collapsible headers. First-run defaults: Scene open; every other section closed. Persist one section-state object.

## 5. One numeric control

All editable numbers use `NumberField`; all editable vectors use `Vector3Field`. Read-only numeric text is not a field and must not look like one. Single-vertex Selection uses `Vector3Field` and commits through an undoable vertex move.

## 6. One tooltip and shortcut source

All tooltips come from the command registry. Format: `Label — Shortcut` when a shortcut exists; otherwise `Label`. Components must not hard-code tooltip text for commands.

## 7. Shortcut rules

- One registry and one keyboard dispatcher own global, 3D, and UV shortcuts.
- Components do not install their own window key listeners for commands.
- Inputs, textareas, selects, and contenteditable suppress shortcuts centrally.
- G/R/S resolve against `activeEditor`.
- U/V are UV axis locks; X/Y/Z are 3D axis locks.
- Enter/Escape resolve against the active modal command.
- Space remains reserved for future playback.

## 8. Icon and text matrix

- **Icon only:** universally understood document/UI actions: undo, redo, open, save, sidebar, close, visibility.
- **Icon + short text:** domain actions: Group, Join, Ungroup, Delete, Add Layer, Extrude, Inset, Loop Cut, Loop Slide.
- **Text only:** modes and stateful UV operations: V/E/F, Island, All, Add, Subtract, Fit, Clamp, Sync 3D, Pin, Unpin, Unwrap, Stack.
- **Never icon-only for a destructive action.**
- Every icon-only control has an accessible label and a tooltip.
- Hover is supplemental. Touch users must be able to identify every control without hover.

## 9. Touch and pointer parity

- Every interactive target is at least 44 CSS px on touch.
- No hover-only actions.
- Hover tooltips are desktop aids; visible labels or a Shortcuts/Help section cover iPad.
- Test mouse, pen, one-finger touch, and two-finger navigation for any new gesture.

## 10. Command and shortcut registry

Every command entry defines:

- stable id;
- label;
- icon or text mode;
- scope: `global`, `3d`, `uv`, or future pane;
- primary/alternate shortcut;
- enabled predicate;
- undo behavior;
- touch-visible control location.

The command registry is the source for labels, scopes, tooltips, shortcut help, and presentation mode. The ShortcutBus is the single keyboard dispatch entry point.

## 11. New-control checklist

Before adding a control, answer all of these:

1. Which named region owns it?
2. Which command id does it invoke?
3. Does the same action already exist elsewhere?
4. Is it global, active-editor, or pane-specific?
5. Is it icon, icon + text, or text?
6. What is its shortcut, if any?
7. Is it undoable, persisted, or session-only?
8. Does it work with mouse, pen, and touch?
9. Is its target at least 44 px on touch?
10. Does its tooltip come from command metadata?

If any answer is missing, do not add the control.

## 12. Layout and resize

- Pane resize handles straddle the actual pane boundary, with a 44 px hit area centered on the visible divider.
- Resize math uses the pane boundary, not an unrelated viewport offset.
- Breakpoints are shared tokens or a small documented set; do not invent per-component breakpoints.
- A collapsed sidebar is controlled by the Application Bar toggle only. No duplicate X.

## 13. UV interaction

- Preserve a multi-selection on pointer-down so a drag can begin.
- Resolve a click without movement to the exact hit entity. Vertex/edge clicks must be able to reduce an All/Island selection.
- Rotate/Scale use a minimum pivot radius and sensitivity falloff.
- Shift during an active UV drag is 0.1× precision.
- A 44 px Fine toggle provides touch precision.
- Move remains direct 1:1.
