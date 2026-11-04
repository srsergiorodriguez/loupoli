# loupoli UI rules

These are implementation constraints, not style suggestions. A change that violates them is incomplete.

**Related:** [Docs index](./README.md) · [UI map](./UI_MAP.md) · [Design system](./DESIGN_SYSTEM.md) · [Root README](../README.md)

## Contents

1. [One action, one home](#1-one-action-one-home)
2. [Context is explicit](#2-context-is-explicit)
3. [Selection combination is one model](#3-selection-combination-is-one-model)
4. [One disclosure](#4-one-disclosure)
5. [One numeric control](#5-one-numeric-control)
6. [One tooltip and shortcut source](#6-one-tooltip-and-shortcut-source)
7. [Shortcut rules](#7-shortcut-rules)
8. [Icon and text matrix](#8-icon-and-text-matrix)
9. [Shared UI contracts](#9-shared-ui-contracts)
10. [Touch and pointer parity](#10-touch-and-pointer-parity)
11. [Command and shortcut registry](#11-command-and-shortcut-registry)
12. [New-control checklist](#12-new-control-checklist)
13. [Layout, camera, and resize](#13-layout-camera-and-resize)
14. [UV interaction](#14-uv-interaction)

## 1. One action, one home

Every command has exactly one visible home. Contextual behavior changes the target, not the location of the control.

- Selection modes and combination: Selection Bar.
- Pointer tools: Tool Rail. ActionDock is 3D-only and is hidden while the UV split is open.
- Paint uses a fixed two-row toolbar: icon tool strip, then brush preview/quick controls. Detailed brush options live in the Brush Inspector section; tool changes must not resize the canvas.
- Inspector sections are filtered and ordered by the shared workspace capability policy. Never hardcode workspace checks inside a section; require a capability and let the Inspector shell order the visible sections. Hidden sections keep their open state.
- Edge-loop selection is a sticky toggle shown only in 3D Edge mode; it expands an edge pick across the quad loop.
- UV-only operations: UV Toolbar.
- Document actions: Application Bar.
- Topology one-shots: Action Dock.

Do not add a duplicate button to a pane because it is convenient. Shared primitives (`InspectorSection`, `SegmentedControl`, `NumberField`, `Vector3Field`, `ToolButton`, `IconButton`) cover repeated structures.

## 2. Context is explicit

`activeEditor` is the pane last clicked. Shared commands target it. The active pane gets a lime dot and title accent; no full-pane border.

## 3. Selection combination is one model

Replace / Add / Sub are mutually exclusive, sticky modes in the Selection Bar (UI labels: Add and Sub). Neither Add nor Subtract active means Replace. They apply to clicks and lasso in both editors. Shift/Cmd remains a temporary Add modifier. UV must not own a second Add/Subtract pair.

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
- **Text only:** modes and stateful UV operations: V/E/F, Island, All, Add, Sub, Fit, Clamp, Sync 3D, Pin, Unpin, Unwrap, Stack.
- **Never icon-only for a destructive action.**
- Every icon-only control has an accessible label and a tooltip via `TooltipLayer`.
- Hover is supplemental. Touch users must be able to identify every control without hover.


## 9. Shared UI contracts

These are mandatory reuse rules. A new surface that duplicates one of these patterns is incomplete.

### Outliner rows

- Use `OutlinerRow` for scene objects, scene groups, and texture layers.
- Drag slot is always left. Visibility is always right.
- Keep a 2 px inner gutter inside the row border; the drag handle and eye must not sit flush against it.
- Active row: accent border plus selected background.
- Additional multi-selected row: accent border only.
- Never add a separate selected-dot marker. Selection state is the row treatment, not an extra glyph.
- Hidden rows dim; dragging/drop-target rows use the shared transient states.
- A non-draggable row renders the same drag spacer as a draggable row so names align.

### Naming

- Use `InlineNameField` for every editable name: scene objects, groups, texture assets, and texture layers.
- Naming lives in the selected-item header, not in a one-off dialog or a differently styled boxed field.
- Enter commits, Escape restores, blur commits, and the same 64-character bound applies everywhere.
- Rename commands are undoable and journaled.

### Actions

- Use `ActionButton` for icon+text actions, `IconButton` for icon-only actions, and `ThreeDotMenu`/`ActionMenu` for overflow.
- Do not create per-section button styles. `active` handles toggles; `variant="danger"` handles destructive actions.
- Create actions sit above the outliner.
- Contextual selection actions sit below the outliner.
- Destructive actions are last and right-aligned.

| Region | Create above list | Context actions below list | Destructive |
|---|---|---|---|
| Scene | primitive select + Add | Multi, Group, Join/Ungroup | Delete object, last/right |
| Texture assets | New, import/duplicate overflow | Assign/Unassign, filter, alpha | Delete texture in overflow |
| Texture layers | Add layer | selection properties | Delete layer, last/right |

- Labels name the noun: `Delete object`, `Delete layer`, `Delete texture`, `Delete elements`.
- Destructive controls are neutral at rest and use `--accent-danger` on hover/focus. Overflow destructive items follow the same neutral/red-hover rule.
- `--accent-warning` is reserved for warnings and recoverable errors; never use amber for deletion.

### Controls and rhythm

- Inputs, selects, action buttons, and outliner rows share `--control-h`: 32 px desktop, 44 px touch.
- Inspector row gaps are 2 px unless a section has a documented grouping reason.
- Inputs and selects must be the same height as adjacent controls; do not put a small input inside a tall row.
- Use the shared `SliderField`, `SelectField`, `ColorField`, `InlineNameField`, and `NumberField` shapes.

### Tooltips

- Render tooltips through the body-mounted `TooltipLayer`.
- Never add pseudo-element tooltips to buttons; they clip inside transformed/overflow panels and fall behind the Inspector.
- Tooltips use `--z-toast` and must remain above the Top Bar, Inspector, and panes.
- Tooltip text and shortcut formatting come from the command registry.

## 10. Touch and pointer parity

- Every interactive target is at least 44 CSS px on touch.
- No hover-only actions.
- Hover tooltips are desktop aids; visible labels or a Shortcuts/Help section cover iPad.
- Test mouse, pen, one-finger touch, and two-finger navigation for any new gesture.

## 11. Command and shortcut registry

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

## 12. New-control checklist

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
10. Does its tooltip come from command metadata and render through `TooltipLayer`?
11. Does it reuse `OutlinerRow`, `InlineNameField`, `ActionButton`, `IconButton`, or `ThreeDotMenu` where applicable?
12. Does it follow create-above / context-below / destructive-last placement?
13. Does destructive styling use `--accent-danger` rather than `--accent-warning`?

If any answer is missing, do not add the control.

## 13. Layout, camera, and resize

- Pane resize handles straddle the actual pane boundary, with a 44 px hit area centered on the visible divider.
- Resize math uses the pane boundary, not an unrelated viewport offset.
- Breakpoints are shared tokens or a small documented set; do not invent per-component breakpoints.
- A collapsed sidebar is controlled by the Application Bar toggle only. No duplicate X.
- The Viewport Stage owns HUD and lasso overlays; HUD anchors to the visible 3D rectangle, not the window.
- Transparent HUD wrappers are `pointer-events: none`; only visible controls opt back in. No invisible rectangle may block viewport picking.
- Pane dividers are constrained to the pane frame bounds and must never extend over the Application Bar or Workspace Tabs.
- The 3D seam overlay is visible only while the UV workspace is open; Model and Paint keep the model clean. The UV canvas always draws seam edges.
- UV transforms use the fitted projection cached at the start of the gesture; auto-fit is not allowed to move the view mid-transform.
- Camera pan/orbit/zoom never mutate selection. Only a no-move click/tap on empty viewport space clears it.
- A selection gesture applies its pick exactly once. Pointer-up resolves only the deferred empty-click case; it must never re-run additive selection or toggle the pick back off.
- Workspace panes use the shared PaneHost and PaneFrame; the divider hit area straddles the pane edge, and the canvas/overlay body has one positioning context.
- New Project is a command-owned document reset and defaults to a Cube.

## 14. UV interaction

- Preserve a multi-selection on pointer-down so a drag can begin.
- Resolve a click without movement to the exact hit entity. Vertex/edge clicks must be able to reduce an All/Island selection.
- Rotate/Scale use a minimum pivot radius and sensitivity falloff.
- Shift during an active UV drag is 0.1× precision.
- A 44 px Fine toggle provides touch precision.
- Move remains direct 1:1.
