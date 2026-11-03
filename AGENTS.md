# loupoli — Working Instructions

Read this before changing the project. It is the persisted version of the master instructions, including the later persistence, precision, modifier, and PS1 addenda.

**Brand:** the name is always written `loupoli`, lowercase.

---

## 1. Mission

`loupoli` is a bespoke, high-performance, pen-first low-poly 3D modeler for iPad and desktop. It favors instant, precise topological control and a deliberately retro visual language over modern sculpting bloat.

The product is being built in the phases in [docs/PLAN.md](docs/PLAN.md); architecture boundaries are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 2. Technology and dependency rules

- **Tauri v2** (Rust) for desktop and iOS, **Svelte 5** runes for UI, **Vite**, **strict TypeScript**, **Three.js** on WebGL2.
- No SvelteKit, Tailwind, Bootstrap, CSS framework, state-management library, icon package, geometry/CSG kernel, or LSCM library.
- Add a dependency only when the native/bespoke alternative is genuinely insufficient. Record the reason and iOS memory impact.
- No Svelte reactive proxies around Three.js objects, DCEL columns, typed arrays, or canvas contexts.
- Every exported class and interface gets a JSDoc block. Non-obvious topology math gets inline comments explaining the invariant.

---

## 3. Non-negotiable engine rules

- **Z-up, right-handed.** X right, Y forward, Z up. Set `THREE.Object3D.DEFAULT_UP.set(0, 0, 1)` once before scene construction. The grid lies on XY (`z = 0`).
- **DCEL is the source of truth.** `THREE.BufferGeometry` is derived render data only. The editable mesh is a custom half-edge structure; quads and continuous topology must remain first-class. Open surfaces are represented by explicit boundary half-edge loops, never by fake faces.
- **Scene ownership.** `SceneDocument` owns mesh nodes; active object, selection mode, selection set, camera, and UI state are session state. Node creation/deletion and vertex moves are scene commands. Element-selection changes are lightweight undo commands so Ctrl/Cmd+Z can restore them, but selection is never serialized or journaled into autosave.
- **Command pattern.** Every document mutation is a `Command` with `execute()`/`undo()`. Store geometric deltas or localized topology snapshots, never full-scene clones. Gestures commit once on pointer-up.
- **On-demand rendering.** No continuous `requestAnimationFrame` loop. Only camera changes, mesh/document updates, selection, viewport resize, and shading changes may schedule a frame. Animations are finite, scheduler-driven, and cancelable. Idle WebGL frame count must be zero.
- **Buffer mutation.** Reuse typed-array capacity and mutate GPU buffers. Do not reallocate geometry, materials, or arrays for position-only changes. The one allowed exception is derived-geometry rebuild when a quad crosses the planarity threshold and adaptive bilinear tessellation changes its render triangle count; the DCEL remains untouched.
- **Quad continuity.** A bent quad must not render as two visibly independent textured triangles with a long diagonal crease. Render non-planar quads as a bilinear patch while preserving the quad in the editable topology. Do not silently triangulate the DCEL to hide renderer artifacts.
- **Screen-space picking.** Vertices and edges use a **16 CSS px** screen-space distance threshold for touch and Apple Pencil reliability. Reject occluded candidates. Faces use a raycast mapped through render-triangle ranges to the source DCEL face. Selection overlays operate on DCEL elements, never on internal render tessellation.
- **Multi-selection.** Element selection is a session set per active node/mode. Shift/Cmd/Ctrl-click and the sticky Add toggle add or remove elements. Shift-drag on empty space orbits. A plain pick replaces the set; changing node or mode clears it. Selection is restorable through lightweight undo commands but is never serialized or journaled into project persistence.
- **Input routing.** One route based on `PointerEvent.pointerType`:
  - Pen bypasses camera controls entirely; it performs selection, topology edits, vertex drag, and later texture paint, with pressure and tilt forwarded.
  - Touch: 1-finger tap selects (sticky Add supplies additive selection), 1-finger drag orbits, 2-finger pinch/pan, 2-finger tap undo, 3-finger tap redo.
  - Mouse: LMB on a topology handle edits; LMB drag on empty canvas or a face away from a handle orbits as a trackpad-friendly fallback. Shift+click adds to/removes from the selection; right-drag pans, Alt/Option+LMB orbits, Alt/Option+Shift+LMB pans, MMB orbits, Shift+MMB pans, wheel zooms. The explicit Lasso tool routes mouse, pen, and one-finger touch drags to screen-space selection.
  - The iPad inspector is non-modal. It must not block camera or editing gestures in the viewport above it.
- **44 CSS px touch targets.** The canvas is full-viewport, `touch-action: none`, `user-select: none`. Use safe-area insets and `100dvh` where appropriate.
- **Design tokens.** Use vanilla CSS custom properties from `src/design/tokens.css`; no hard-coded palette values in components. `--bg-canvas: #121214`, translucent `--bg-panel` with 8px backdrop blur.

---

## 4. Persistence and iOS memory addendum

1. **Local-first.** WKWebView may suspend or kill the app. Never rely on volatile memory for long sessions.
2. **Autosave.** Implement an IndexedDB cache that records geometric state transitions every 30 seconds while dirty, plus a best-effort flush on background/visibility change. Keep a checkpoint plus deltas; never append full scene clones.
3. **Recovery.** On cold start, offer recovery of unsaved work explicitly. Never silently replace newer file data. Distinguish autosave, manual save, recovery, and failure states.
4. **Project format.** `.lpoly` is a single versioned file containing DCEL topology, the modifier stack, UV/seam data, shape keys, lights, and texture layers. Texture layers use **binary PNG chunks** in the container, not base64 (approved 2026-11-01).
5. **Native I/O.** Encode/decode in TypeScript; use Tauri Rust commands for byte-level file access. Validate magic/length/checksums, enforce size limits, and use temp-file + atomic rename. Rust does not parse document semantics.
6. **Memory safety.**
   - Do not put document data in Svelte runes.
   - Bound history by bytes and command count.
   - Cap DPR, texture dimensions, layer counts, autosave journal, and all caches.
   - Dispose every geometry, material, texture, and canvas owner.
   - No base64 strings retained in memory.
7. **iOS prerequisites.** iPadOS 16.4+ baseline. The local machine still needs CocoaPods, Rust iOS targets, simulator runtimes, and signing before a device build.

See [docs/PERSISTENCE.md](docs/PERSISTENCE.md) for the full protocol and format.

---

## 5. Precision and transform rules

- Translate, rotate, and scale must support **axis locking**. Desktop: X/Y/Z during a transform. Touch/pen: 44px on-screen axis chips. Locking must project the drag vector onto the selected axis mathematically, not just visually.
- **Incremental grid snapping** is a toggleable constraint. Round moved coordinates to the chosen step in the global grid (default set: 0.1, 0.25, 0.5, 1.0). Show when snapping is active. Snap only committed number values, never display-only values.
- Exact numeric transforms must be available in the inspector once transform tools exist.
- Escape cancels a transform; Enter commits.

---

## 6. Modifier-stack rules

- `MeshNode` evaluates `Modifier[]` over the base DCEL, then triangulates for the GPU. Base geometry stays editable.
- Every modifier is serializable, ordered, individually disableable, and undoable when added/removed/reordered/edited.
- Required Phase 3 modifiers:
  - **Mirror** across a local axis, correct winding, weld vertices on the center seam, stitch seam boundary.
  - **Grid Array** X/Y repetition.
  - **Radial Array** circular repetition around a local axis.
- Any reflection must reverse winding. Validate manifoldness after mirror clipping; report failures instead of rendering broken topology.
- Evaluate with provenance maps so picking mirrored/arrayed output can map back to base elements.

---

## 7. Authentic PS1 rules

- The Unlit/PS1 mode uses a custom GLSL `ShaderMaterial`, never `MeshBasicMaterial`.
- **Vertex snapping:** snap clip-space XY to a low-resolution virtual raster (default 320 × 240) by dividing, rounding, and re-multiplying by w. Do not snap Z. Handle clipping correctly.
- **Affine texture mapping:** GLSL ES has no `noperspective`; pass `uv * w` and `w` varyings and divide in the fragment shader. Do not settle for perspective-correct interpolation.
- PS1 effects are optional toggles; Solid and Lit must stay readable modeling modes.
- **Default Unlit is correct, unsnapped perspective mapping.** Vertex snapping and affine UV interpolation are opt-in. Do not silently turn either on as a default; PS1 is a deliberate aesthetic mode, not the baseline editing view.
- Test near-plane clipping, extreme zoom, multiple aspect ratios, nearest filtering, and color-space output.

---

## 8. UI behavior

See [UI map](docs/UI_MAP.md) and [UI rules](docs/UI_RULES.md). Those two documents are the source of truth for shell regions, active-editor behavior, command homes, disclosures, shortcut routing, icon/text policy, and the new-control checklist.

- Page/app canvas is `100vw` × `100vh` with `100dvh` enhancement; no page scroll.
- Use floating dark glass panels, hairlines, warm text, a single lime signal color, and conventional X/Y/Z axis colors.
- No hover-only actions on touch. Icon-only actions need accessible labels and tooltips where appropriate. Focus states are always visible.
- Do not leave dead controls or disabled future features in the UI. Build components when their feature arrives.
- The interface should feel like a compact professional DCC editor, not a dashboard.
- Future timeline, modifier panels, texture layers, and save states must use the same token/component system.

---

## 9. Current implementation state

Phase 2 and the Phase 3 foundations are implemented for browser and native desktop builds. Phase 4 began with UV seam authoring:

- TopBar Model/UV/Paint workspace switcher: UV opens a side-by-side editor; Model closes it. The 3D Viewport Stage owns the HUD, icon-only Shading Bar, bottom-right View Gizmo, Action Dock, and lasso overlay. A reusable 44 px `PaneHost` handles side-pane resizing. Paint separation is still in progress.
- Svelte/Vite shell with responsive editor chrome, design tokens, non-modal iPad bottom-sheet inspector, a collapsible persistent desktop sidebar, and a live autosave indicator. The desktop 3D canvas ends at the sidebar, so its aspect and center match the visible modeling area.
- Z-up WebGL2 viewport with multiple scene nodes, custom XY grid, on-demand scheduler, camera rig, and orientation gizmo.
- Signed orientation gizmo: positive and negative axis endpoints, center framing, and Blender-Front reset via the toolbar Home control or Home key.
- Five viewport modes: Wireframe, Solid, Texture (the custom PS1 Unlit path), Texture + Wire (front-face-culled topological overlay), and Lit. Correct unsnapped perspective mapping is the default; the mode control sits left of the orientation gizmo.
- Generalized half-edge DCEL with open boundary loops, validated column reconstruction, per-corner UVs, seam flags, face materials, and adaptive bilinear rendering for non-planar quads.
- UV seam authoring: Edge-mode Seam toggles bit 0 of the DCEL edge flags, renders an amber overlay, uses localized undo and per-edge autosave patches, and round-trips through `.lpoly`.
- UV editing: resizable side pane with two-way linked 3D selection, seam/selected overlays, 16 px picking, V/E/F/Island modes, and Move/Rotate/Scale around the UV median with U/V locks, grid snap, and exact numeric entry. Transform and selection modes are contextual with the active editor. UV-only controls are grouped into Operations and View; wheel zooms around the pointer, right/middle/empty drag pans, Fit resets, and Clamp keeps direct transforms inside 0–1. Whole islands move through the same corner command. Two complete islands can be topology-checked and stacked onto the active island; the signature compares counts, face valences, vertex degrees, and boundary half-edges, then a one-to-one correspondence copies the active UV layout so both islands share exact coordinates. All selects the current mode in the active editor. Replace/Add/Subtract lives in the Selection Bar and applies to 3D and UV clicks and lasso; Shift/Cmd is a temporary Add. G/R/S start UV modal transforms with U/V locks and typed exact values; Enter commits and Esc cancels. Fine/Shift gives 0.1× UV precision, with pivot-sensitive rotate/scale. The side divider straddles the pane edge with a 44 px hit strip and is owned by `PaneHost`. Two selected corners can pin an unwrap; pins are session-only.
- Seam-chart LSCM unwrap: chart extraction across seams/boundaries, automatic farthest-boundary pins or two explicit pins, longest-edge alignment, shelf packing, and explicit rejection of closed, non-finite, zero-area, flipped, or overlapping charts. `ReplaceUvCommand` stores the full UV column with a `replace-uv` patch.
- Texture layer stack: up to eight 1024² `OffscreenCanvas` layers with visibility, opacity, solid fills, active-layer selection, reorder, delete, and undoable metadata commands. One composite `CanvasTexture` feeds Unlit/Lit. Manual save writes `.lpoly` v2 with layer metadata and aligned binary PNG chunks; v1 still decodes. Texture edits mark autosave dirty and force a fresh v2 checkpoint with PNGs, so recovery restores layers. Rename and Normal/Multiply/Screen blend modes are implemented and serialized. A UV raster brush paints the active layer with pen pressure, live composite feedback, localized pixel-patch undo, and v2 autosave. 3D projection painting remains.
- QuadSphere, Cube, Cylinder (n-gon caps), and Grid primitives; the first-run scene is an editable QuadSphere. New primitives are created at the origin and selected.
- The active editor is the last clicked pane; shared Selection Bar and Tool Rail commands target it, with a subtle title dot. Command metadata/scopes/key bindings live in one registry; keyboard dispatch goes through one ShortcutBus. Workspace Tabs use the shared SegmentedControl primitive.
- Every Inspector section uses the shared `InspectorSection`; Scene is open by default, others closed. The sidebar X is removed. Workspace Tabs use `SegmentedControl`; the Selection Bar uses command metadata.
- Element selection changes are undoable through lightweight selection snapshots; object selection and active-node view state remain session UI. Selection commands are not journaled and do not dirty autosave.
- Multi-object scene outliner with pointer/touch drag reorder, 44 px visibility toggles, undoable reorder/visibility journal patches, primitive creation, active-object selection, undoable add/delete, and vertex/edge/face selection with 16 px picking and viewport overlays. Multi-select is compact beside Group/Join/Delete.
- Selected-edge overlays use constant-width instanced tubes independent of edge length; Wireframe and Texture + Wire add instanced tube overlays for readable weight.
- Additive multi-element selection: Shift/Cmd/Ctrl-click, a sticky 44 px Add mode for pen/mouse, and one-finger touch taps; selected sets render multi-vertex points, instanced edge tubes, and merged face fills. The Lasso tool selects vertices inside a screen polygon, edges inside/crossing it, and faces with a corner/centroid inside. It is view-through only in Wireframe; shaded modes apply occlusion rejection to vertices, edge samples, and face centroids.
- The single selected vertex uses the same `Vector3Field` as object transforms. UV topology is built from UV points (not mesh vertices), so split UVs select independently and selected UV edges render visibly. UV click-vs-drag resolves no-move clicks to the exact hit while preserving multi-selections for drags.
- Camera pan/orbit/zoom preserve selection; only a no-move click/tap on empty viewport space clears it. Lasso overlay is clipped to the Viewport Stage.
- Numeric fields share a drag-scrub control: the whole XYZ cell, including the axis badge, is draggable; half a step per pointer pixel, Shift fine mode, one command on release, click-to-type, Enter/Escape. UV numeric fields and modifier count/spacing fields use the same component.
- The UV Paint workspace previews the brush as a screen circle sized to the texture-pixel brush diameter and hides the native cursor.
- Every Inspector section shares the native `<details>/<summary>` disclosure. Scene is open on first run and all others are closed; section and sidebar state persist in `localStorage`. No UI state enters the project file.
- Numeric object transforms (position, rotation, scale) through undoable commands; selection overlays follow the node transform. The orientation gizmo supports drag-to-orbit while retaining axis-click snap and center-frame.
- Local/Global orientation for node transforms, with world-space position/rotation fields and world-oriented translate/rotate gizmos. Scale stays local to avoid unsupported shear; conversions use the one-level parent group transform.
- Context-sensitive desktop G/R/S: if elements are selected, transform their unique vertices around the median pivot; otherwise transform the active object/group. Uses mouse previews, X/Y/Z constraints, numeric entry, a target-aware HUD, Enter/left-click commit, Escape/right-click cancel, and localized vertex-transform commands with autosave patches. Element transforms with an active modifier stack operate in base space and are labelled `(base)`; all evaluated copies re-evaluate.
- Move/Rotate/Scale gizmos are context-sensitive: with selected elements they sit at the selection median and edit only those vertices; with no element selection they transform the object/group. Axis-constrained pen/mouse drags update the gizmo from the live selection median and commit localized vertex or transform commands. Center handles provide free-plane movement and uniform scaling for element selections. Enlarged gizmo hit volumes improve Pencil reliability. Finger touch remains camera navigation.
- ActionDock at bottom-left on touch and desktop: tap/click or E/I/L/Shift+L to arm one-shot Extrude, Inset, Loop Cut, or Loop Slide. Drag sets a live amount or type an exact amount (units for extrude, percent for inset/loop) and press Enter. Release/Enter commits one validated mesh replacement; Esc cancels and restores mesh/selection. Loop Slide is separate and operates on the most recent loop cut; undo/redo of loop operations restores its context, while unrelated edits clear it. 44 px targets.
- Destructive deletion of selected faces or all faces incident to selected edges/vertices, with DCEL rebuild, boundary regeneration, undo, and autosave mesh-replacement patches. The PS1 look is a collapsed render-effect module at the Inspector bottom.
- Vertex merge-to-centroid, collapsed-face cleanup, and bridging of two ordered boundary chains/loops with equal segment counts into a quad strip. Both use validated mesh replacement and autosave patches.
- Face extrusion (single or multi-face regions, average-normal offset, boundary side walls), single-face inset toward the centroid, and single-segment quad loop cut. All preserve UVs/materials and use validated mesh replacement. Loop cuts accept a 0–1 position and retain the last loop source for Loop Slide.
- Session-only object multi-selection (modifier-click or sticky touch/pen toggle) and join into the active target, with relative-transform baking, source removal, undo, and ordered multi-patch autosave transitions.
- Grid snap (0.1/0.25/0.5/1.0) for object translation and vertex drags, plus world X/Y/Z vertex axis locks through keyboard keys and 44 px touch/pen chips. Snap state is session-only; typed numeric transforms stay exact.
- One-level scene groups with an average-position pivot, outliner tree, group numeric/gizmo transforms, ungroup with transform baking, undo, ordered group autosave patches, and optional `.lpoly` group manifests/node parentage.
- Ordered non-destructive Mirror / Grid Array / Radial Array stacks with base-DCEL preservation, evaluated rendering/counts, Inspector add/toggle/reorder/edit/remove controls, undo, autosave patches, `.lpoly` serialization, and evaluated-to-base vertex/edge/face provenance. Picking selects base elements and overlays highlight every evaluated copy. Destructive topology actions and direct vertex dragging edit the base mesh while the stack re-evaluates. Per-vertex linear provenance maps the dragged evaluated copy back to its base vertex; axis locks and snapping are not yet applied to mapped drags.
- Loop-cut slide orientation is propagated across the quad ring, so non-midpoint cuts stay coherent on low-valence meshes such as the cube. The cube's generated bounds and face/edge topology are tested.
- Localized vertex moves and scene-node commands; redo truncation, a 100-command cap, and a 32 MB history budget.
- IndexedDB autosave checkpoint plus localized deltas every 30 seconds and on visibility loss, with explicit Recover/Discard. Texture edits force a fresh v2 checkpoint with PNG chunks.
- `.lpoly` v1/v2 binary codec with a CRC-checked manifest, aligned typed-array columns, optional binary PNG texture chunks, file-size limits, v1 migration, and multi-node/PNG round-trip tests.
- Tauri native open/save dialogs and Rust atomic byte-level file I/O; browser download/file-picker fallbacks.
- Tauri debug build and Rust tests pass. The native WKWebView window, physical iPad, and iOS packaging are not yet verified.
- Camera state and active-object selection are not serialized; node transforms and viewport settings are.

Next planned work: 3D projection painting, tilt shaping, and dedicated texture deltas. Evaluated-copy pivots remain deliberately base-space; physical iPad/WKWebView validation is deferred until an iPad is available.

Approved decisions:

1. Phase 1 includes a minimal DCEL cube and a real vertex-move command.
2. Minimum iPadOS is 16.4.
3. `.lpoly` textures are binary PNG chunks.
4. Bundle identifier is `com.loupoli.studio` (no `.app` suffix).
5. Correct perspective mapping with no vertex snapping is the Unlit default. PS1 vertex snapping and affine UVs are opt-in.
6. Non-planar quads use render-only bilinear tessellation. The editable DCEL remains quads, and topological counts do not change.
7. `.lpoly` v1/v2 use a binary CRC-checked container; v2 adds binary PNG texture chunks. Autosave uses an IndexedDB checkpoint plus localized command deltas, never a full-scene clone per edit.

---

## 10. Quality gates for changes

Before claiming work done:

- `npm run check`, `npm test`, and `npm run build` pass.
- Idle render count stays flat; no loop leaked.
- No new console warnings or TODO/stub features.
- Touch target and pointer-type behavior verified where relevant.
- Every document mutation can be undone and, where it belongs in the document, serialized.
- Tests cover topology invariants, format round-trip, and math that can fail silently.
- Documentation is updated to match behavior, including limitations.
- No feature is added outside the requested scope.
