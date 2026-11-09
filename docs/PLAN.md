# loupoli — Master Delivery Plan

**Status:** Phase 2, Phase 3, and Phase 4 are implemented for browser and native desktop builds; Phase 4 has a [conditional exit audit](./PHASE4_AUDIT.md). Phase 5A lighting, per-light hard/soft shadows, and direct-light texture baking are implemented in the dedicated Light workspace; see [Phase 5 lighting](./PHASE5_LIGHTING.md). OBJ/GLB interchange, soft shadows, and minimal shape keys are implemented; GLB morph import/export and shape-weight animation tracks are implemented; GLB animation clips also round-trip transform and Mesh Motion data. Reference-image planes, world-space annotations, and baked AO are implemented. Physical-iPad/WKWebView validation remains. Animation foundation, camera/light tracks, texture-swap tracks, and render still/frames/video capability are implemented.
**Brand rule:** the name is always written `loupoli`, lowercase.
**Primary targets:** iPadOS (sideloaded build first), macOS desktop, and browser during development.
**Companion docs:** [Docs index](./README.md) ·  [Architecture](./ARCHITECTURE.md) · [Phase 4 Texturing](./PHASE4_TEXTURING.md) · [Persistence](./PERSISTENCE.md) · [Design System](./DESIGN_SYSTEM.md) · [README](../README.md)

## Contents

1. [Product definition](#1-product-definition)
2. [Non-negotiable guardrails](#2-non-negotiable-guardrails)
3. [System at a glance](#3-system-at-a-glance)
4. [Delivery phases](#4-delivery-phases)
5. [Persistence is cross-cutting, not a final phase](#5-persistence-is-cross-cutting-not-a-final-phase)
6. [Verification strategy](#6-verification-strategy)
7. [Toolchain baseline](#7-toolchain-baseline)
8. [Dependency policy](#8-dependency-policy)
9. [Risk register](#9-risk-register)
10. [Approved decisions](#10-approved-decisions)
11. [Definition of done for every phase](#11-definition-of-done-for-every-phase)
12. [Planning references](#12-planning-references)


## 1. Product definition

`loupoli` is a precise, pen-first, low-poly 3D modeler built for quick topological decisions. It is not a general-purpose DCC suite and it is not a realtime renderer with modeling bolted on. The defining qualities are:

1. **Direct manipulation.** A pen selects and edits the closest topology without fighting a camera or a tiny hit target.
2. **Readable geometry.** Quads, edge loops, seams, and flat facets remain the primary visual language in the viewport.
3. **Instant feedback.** Editing is local, buffers are reused, and frames are drawn only when something actually changes.
4. **Work survives the device.** Autosave and a self-contained project file are treated as engine features, not export utilities.
5. **Deliberately small surface area.** One strong tool per job, no hidden mode stack, no dependency-heavy UI framework.

The retro look is a rendering mode and a design language, not an excuse for imprecise interaction.

---

## 2. Non-negotiable guardrails

These constraints apply to every phase and every pull request:

| Area | Rule |
|---|---|
| Brand | Product name, window title, wordmark, and file branding are lowercase `loupoli`; `.lpoli` is the project extension. |
| Coordinates | Right-handed, Z-up world. X is right, Y is forward, Z is up. The grid lies on XY (`z = 0`). `THREE.Object3D.DEFAULT_UP` is set to `(0, 0, 1)` before any scene object is created. Three.js helpers with an XZ assumption must not be used unmodified. |
| Topology | The editable source of truth is a custom half-edge DCEL. `BufferGeometry` is a derived GPU artifact and is never used as document state. |
| Undo | Every document mutation is a command with `execute()` and `undo()`. Continuous gestures commit once. Scene-wide snapshots are not used for ordinary history. |
| Rendering | No perpetual `requestAnimationFrame` loop. The render scheduler is invalidated by camera, document, selection, resize, or shading changes. Idle WebGL frames must be zero. |
| Picking | Vertices and edges use a **16 CSS px** screen-space distance threshold, independent of mesh density and camera distance. |
| Input | One router based on pointer events and `event.pointerType`. Pen never reaches the camera controller. Touch and mouse have intentionally different mappings. |
| UI | Vanilla CSS custom properties. No Tailwind, Bootstrap, component framework, icon package, or state-management library. Minimum 44 CSS px tap targets on touch. Canvas is `100vw / 100vh` with the iOS-safe `100dvh` enhancement, `touch-action: none`, `user-select: none`. |
| Performance | Reuse typed-array capacity and mutate GPU attribute buffers where possible. No per-frame allocations in the steady-state render or input paths. |
| Memory | No Svelte reactive proxy around Three.js, DCEL columns, typed arrays, or canvases. Bound history, caches, textures, and autosave memory explicitly. |
| Aesthetic | The Unlit/PS1 mode is a custom GLSL `ShaderMaterial` with clip-space vertex snapping and affine texture mapping. It is not a `MeshBasicMaterial` approximation. |
| Dependencies | Add a runtime dependency only when the platform native API cannot reasonably do the job. New dependencies require an explicit reason recorded in the architecture doc. |

---

## 3. System at a glance

```text
┌───────────────────────────────────────────────────────────────┐
│ Svelte 5 UI — chrome, inspector, panels, status               │
│ reads reactive summaries, dispatches intents                   │
└──────────────────────────────┬────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────┐
│ Editor services                                               │
│ InputRouter · Tools · History · Selection · Autosave           │
└───────────────┬───────────────────────────────┬───────────────┘
                │ commands                      │ render events
┌───────────────▼───────────────┐   ┌───────────▼───────────────┐
│ Document model (plain TS)      │   │ Render layer              │
│ MeshNode · DCEL · Modifiers    │   │ evaluator → buffers       │
│ shape keys · UVs · materials   │   │ Three.js · materials      │
└───────────────┬───────────────┘   │ scheduler · camera         │
                │                    └───────────┬───────────────┘
                │ persistence                    │
┌───────────────▼────────────────┐   ┌───────────▼───────────────┐
│ IndexedDB autosave journal     │   │ WebGL2 canvas             │
│ `.lpoli` encoder               │   │ + SVG/DOM viewport HUD    │
└───────────────┬────────────────┘   └───────────────────────────┘
                │ bytes
┌───────────────▼────────────────┐
│ Tauri v2 / Rust                │
│ native dialogs · atomic fs     │
└────────────────────────────────┘
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module boundaries, DCEL details, shader math, and input state machines.

---

## 4. Delivery phases

Each phase is shippable and testable on its own. A later phase may refine a prior surface, but should not leave fake buttons or placeholder architecture behind.

### Phase 1 — Foundation, viewport, design system, and the topology seed

**Goal:** a polished, responsive, genuinely on-demand 3D editor shell with production-grade input routing and shading infrastructure, plus the smallest real topology slice needed to exercise it.

**Deliverables**

- Vite + Svelte 5 + strict TypeScript application, with Tauri v2 desktop scaffolding and an iOS-init pathway.
- Design foundation: tokens, reset, typography, icon set, focus states, density rules, safe-area handling.
- App shell: floating top bar, left tool rail, right inspector shell, status strip, responsive iPad layouts.
- WebGL2 viewport with Z-up camera, custom XY grid, DPR cap, resize handling, clean disposal.
- `RenderScheduler` with explicit invalidation and instrumentation proving idle frames are zero.
- Camera rig: orbit, pan, zoom; no damping loop; animated orientation transitions remain scheduler-driven.
- Interactive top-right orientation gizmo (camera-synced, axis-click views, no second WebGL context).
- Viewport modes wired: Wireframe, Solid (flat normals), Texture (Unlit/PS1), Texture + Wire (front-face-culled topological overlay), Lit.
- Custom PS1 unlit material with quantized clip-space vertices and manual affine UV interpolation.
- **Approved topology seed:** a single real half-edge cube with six quads, per-corner UVs, triangulation, GPU buffers, 16 CSS px vertex picking, pen/mouse vertex dragging, and one localized move-vertex command integrated with history.
- `InputRouter` with pointer-type routing, pen event payloads (`pressure`, `tiltX/Y`), touch gesture state machine, mouse DCC mapping, 2-finger tap undo, 3-finger tap redo.
- Tauri window configuration, app identity, safe capabilities, browser fallback for development.
- Basic platform smoke tests on macOS and iPad simulator. Hardware test is a gate as soon as an iPad build is available.

**Acceptance gates**

1. `npm run check` and `npm run build` pass with zero TypeScript errors.
2. In an idle viewport, the WebGL render count stays flat for at least 10 seconds; orbiting produces one render per changed frame.
3. The grid is on XY, the camera cannot orbit into a Z-down orientation, and numeric/gizmo orientation agree.
4. Pen input never moves the camera. One-finger orbit, two-finger pinch/pan, two-finger tap undo, and three-finger tap redo are independently observable and functional against a real vertex edit.
5. A vertex within 16 CSS px of the pen/mouse is selected predictably; dragging changes the real DCEL position, updates the mesh, and undo/redo restores it exactly.
6. Every touch control has at least a 44 CSS px hit region. No hover-only route to a feature.
7. All five viewport modes change visibly without reloading the scene; Texture + Wire shows the topological overlay, and PS1 mode visibly snaps vertices and warps textures when the camera moves. Transform orientation switches between parent-local and world-space display without changing the stored local transform. Desktop G/R/S modal transforms preview with the mouse, accept X/Y/Z axis constraints and typed values, commit once with Enter/left click, and cancel with Escape/right click. The ActionDock provides one-shot Extrude, Inset, Loop Cut, and Loop Slide on touch and desktop, with drag or exact typed amounts and E/I/L/Shift+L shortcuts; Loop Cut and Loop Slide are separate, and loop-slide context survives undo/redo of loop operations. Element G/R/S and the Move/Rotate/Scale selection gizmo transform selected vertices, with edge/face selections expanded to their unique vertices, a median pivot, and localized autosave vertex patches. The gizmo appears at the median on iPad and desktop with axis handles, a free-plane Move center, and a uniform Scale center, and falls back to object/group transforms when the element selection is empty. With modifiers active it edits base-space vertices and re-evaluates every copy.
8. No WebGL warnings in the console; repeated mount/unmount releases renderer resources.
9. The shell remains usable in iPad landscape and portrait layouts with safe-area insets.

**Boundary note:** this slice intentionally includes only one primitive, one selection type, and one topology-preserving edit. The general DCEL kernel, all primitives, full picking, autosave, and project I/O remain Phase 2. The seed proves the architecture without treating a throwaway render fixture as a product feature.

---

### Phase 2 — Topology kernel, commands, selection, and project persistence

**Status:** Implemented in this revision for browser and native desktop builds. Mesh-destructive topology editing is deliberately postponed to Phase 3, so the randomized destructive-edit gate is exercised here through primitive add/delete and vertex-move command sequences rather than extrude/weld fuzz tests. Physical iPad, WKWebView, and camera-state persistence remain open.

**Goal:** the real editable mesh and the durability layer that makes long iPad sessions safe.

**Deliverables**

- Columnar half-edge DCEL with explicit invariants, compact element references, boundary loops, per-corner UVs, per-edge seams, and per-face materials.
- Primitive builders: QuadSphere, Cylinder, Grid. All preserve intended quad topology.
- Triangulation and derived render-buffer builder. Flat normals, correct winding, arbitrary n-gon handling for simple faces.
- Localized topology patches and command transactions. Transform-style commands store numeric deltas; topology commands store affected-element snapshots, never full scene clones.
- `HistoryService` with undo/redo, gesture coalescing, redo truncation, byte-bounded retention, and two/three-finger tap integration.
- GPU buffer growth/mutation strategy; no geometry recreation during pure position edits.
- Screen-space picker for vertices and edges with 16 CSS px tolerance, candidate prioritization, and occlusion handling.
- Vertex/edge/face selection state and viewport overlays. Selection is session state, not undoable scene state.
- Default first-run scene built from the real primitive path.
- IndexedDB autosave journal and restore flow. Autosave begins as soon as there is document data.
- `.lpoli` v1 encode/decode for scene metadata, base mesh, transforms, and selection-independent camera/settings where appropriate.
- Tauri Rust file I/O commands with atomic writes and native open/save dialogs.

**Acceptance gates**

1. Every primitive passes invariant validation: valid twins, cycles, winding, no orphaned active elements, and boundary loops forming closed chains.
2. Randomized topology mutations in tests never leave an invalid mesh after execute/undo/redo.
3. A 100-edit session remains within the agreed history byte budget and restores to the exact document state.
4. Picking selects the intended vertex/edge at multiple zoom levels and near-silhouette geometry, consistently within 16 CSS px.
5. `.lpoli` round-trips a project with quads, n-gons, UVs, seams, and multiple mesh nodes byte-for-byte at the document level.
6. A simulated reload with an unsaved edit recovers the edit from IndexedDB and labels it as recovered work.
7. Pure vertex moves update existing GPU buffers without allocating new geometry or materials.
8. The first run contains a real editable QuadSphere (or equivalent) with no render-only fallback path.

**Persistence note:** the format version is introduced now and extended, never silently mutated, by every later phase. See [PERSISTENCE.md](./PERSISTENCE.md).

---

### Phase 3 — Object mode, topology editing, transforms, and modifier stack

**Goal:** the core low-poly modeling loop: organize, transform, cut, join, bridge, and repeat geometry non-destructively.

**Status:** 3B selection foundation, destructive vertex/edge/face deletion, vertex merge, a two-boundary-edge bridge, and object join are implemented. 3A object transforms, gizmos, view-gizmo drag orbit, session object multi-selection, one-level persistent groups, grid snapping, and vertex axis locks are implemented. The PS1 look module is a collapsed render effect. The non-destructive Mirror / Grid Array / Radial Array stack, provenance-mapped picking/overlays, additive touch tap selection, face extrusion, and single-face inset are implemented; destructive base edits now work under an active stack, bridge supports equal-length boundary chains/loops, a single-segment quad loop cut, and direct base-vertex dragging under modifiers are implemented.

**Sequence:** 3A object/view operations → 3B base-mesh topology editing → 3C modifiers and final snapping polish. Object transforms must land before join (join bakes node transforms); selection/delete commands and edge selection must land before merge/bridge.

**Deliverables**

- **Phase 3A — object and view operations.** Object mode, multi-object selection, and transform sessions for Translate, Rotate, and Scale at object level and at vertex/edge/face level, with object-space gizmos and numeric inspector parity. Parent/child object groups remain first-class scene data with their own transforms, selection, rename, and undoable reparenting/dissolve.
- **Phase 3A — view gizmo.** Dragging the orientation/view gizmo orbits the view/world around the camera target; clicking axes retains the existing snap-to-axis behavior. This is view navigation, distinct from object or element transform gizmos.
- **Phase 3B — destructive topology editing.** Delete selected vertices, edges ("sides"), or faces with an explicit manifold/boundary policy; extrude, inset, and loop cut. Weld/merge selected vertices by tolerance.
- **Phase 3B — object join and bridging.** Join two or more selected nodes into one editable DCEL using baked world transforms, preserving per-corner UVs, seam flags, and materials. Joining does not accidentally weld coincident vertices; merge/weld remains a separate explicit operation. Bridge selected edges/loops with twist and segment controls and reject non-manifold results.
- Vertex, edge, and face transforms with correct pivot behavior.
- Axis locking: X/Y/Z keys on desktop; on-screen axis chips and locked-handle state on pen/touch. Drag vectors are mathematically projected onto the locked axis, not merely visually guided.
- Incremental grid snapping toggle (default steps 0.1, 0.25, 0.5, 1.0), applied to moved coordinates. Snapping reads the global grid and displays a snap badge while active.
- Modifier stack framework with ordered, enabled, serializable definitions:
  - Mirror: local axis, winding corrected, center vertices welded, mirror-plane boundaries stitched.
  - Grid Array: X/Y repetition with spacing and centering options; separate shells remain valid closed DCELs.
  - Radial Array: circular repetition around a chosen local axis with count, angle, and radius/offset parameters.
- Evaluated mesh cache with per-stage invalidation, provenance for picking, and a clean “edit base mesh” policy while modifiers are live.
- Modifier UI: add, remove, reorder, toggle, edit parameters; every change is a command.
- Save format expands to include object/group hierarchy, transforms, joined topology, and modifiers. (Groups, parentage, and modifier stacks are now optional v1 manifest fields.)

**Acceptance gates**

1. Axis locking produces strictly zero motion on the two locked axes under adversarial pointer movement.
2. Grid snapping lands moved coordinates exactly on the chosen increment and is reversible as one command.
3. Extrude/inset/loop cut/weld preserve 2-manifold invariants and undo exactly. (Single-segment loop cut implemented for quad rings.)
4. Mirror center seam is welded with no duplicate center vertices or visible split; mirrored winding faces outward.
5. Reordering, disabling, and parameter-editing modifiers updates the evaluated mesh and invalidation only downstream stages.
6. Every modifier parameter is serialized, round-tripped, and restored with the correct evaluated result.
7. Touch transform controls remain 44 CSS px and do not conflict with one/two-finger camera gestures.
8. A 100k-triangle test scene remains interactive on the target iPad; budgets are measured, not assumed.
9. Object and group transforms are exact, undoable, serialized, and preserve child transforms across reparent/dissolve.
10. Modifier evaluation retains provenance to base elements for picking and overlays.
10. Dragging the view gizmo orbits the view without conflicting with object transform gizmos or the camera's one-finger orbit.
11. Deleting vertices, edges, or faces either produces a valid boundary/manifold result or is blocked with a clear reason; undo restores the exact prior topology.
12. Join preserves UV/seam/material assignments and baked transforms; merge and bridge operations validate manifoldness and undo as a single command.
13. Multi-element selection supports additive/toggle selection with Shift/Cmd/Ctrl and a sticky 44px pen Add mode; all selected elements render distinct overlays without duplicate indices; selection remains session state.
14. PS1 controls live in a collapsed opt-in render-effects module by default and never participate in the geometry modifier evaluation chain.

**Registered feature requests (2026-11-01):**

| Request | Phase | Integration intent |
|---|---|---|
| Create groups of objects | **3A (one level implemented)** | Groups are scene data with average-position pivots, outliner children, numeric/gizmo transforms, ungroup baking, undo, autosave patches, and `.lpoli` serialization. Nested groups and viewport child selection remain. |
| Transform objects — position, rotate, scale | **3A (implemented)** | Numeric local transforms, object-space Move/Rotate/Scale gizmos, group transforms, undo/persistence, and group gizmos are implemented. |
| Rotate the world by moving the gizmo | **3A (implemented)** | Dragging the viewport orientation gizmo orbits the view/world around the camera target; axis-click snap and center-frame remain. |
| Delete sides, vertices, and faces | **3B (implemented)** | Selected faces are removed, or every face incident to selected edges/vertices. The DCEL is rebuilt with boundary loops, UVs/materials retained, and one undoable command. Seam flags are not yet remapped. |
| Join objects | **3B (implemented)** | Session object multi-selection joins into the active target with relative-transform baking, UV/material preservation, undo, and journal replay. Exact coincident positions can still weld in the DCEL builder. |
| Merge vertices | **3B (implemented)** | Selected vertices weld to their centroid; collapsed faces are dropped and the resulting DCEL is validated. No tolerance-based auto-weld yet. |
| Bridge edges | **3B (implemented)** | Two ordered boundary chains or loops with equal segment counts bridge into a validated quad strip. Twist/orientation controls and non-boundary bridge paths remain. |
| Select multiple vertices, edges, and faces | **3B (implemented)** | Session selection sets per active node and element mode. Additive/toggle selection via Shift/Cmd/Ctrl, a sticky 44px Add toggle, and one-finger touch taps. Multi-element overlays, no duplicate indices, selection stays non-undoable; touch drags handles/gizmos and orbits on empty space. |
| Hide PS1 options in a collapsible/render-effect module | **3C (implemented)** | The Inspector now exposes a collapsed **PS1 look** render-effect module. It remains a view/render effect, not a geometry modifier; both toggles remain off by default and unaffected by Solid/Lit. |

---

### Phase 4 — UV editing, texture layers, and projection painting

**Goal:** a pen-native low-poly texturing workflow without a second app.

**Deliverables**

- Resizable split viewport: 3D view and 2D UV canvas with linked selection and shared tools.
- Seam marking on edges as commands, stored in the DCEL edge flags and serialized.
- Chart extraction from seams and LSCM unwrapping. Pin handling, degenerate-face rejection, and deterministic results for tests.
- UV selection/transform tools with 16 CSS px screen-space tolerance in the UV view.
- Multi-layer texture stack using `OffscreenCanvas` 2D contexts, blend modes, opacity, visibility, rename, reorder, add/delete.
- A composite cache that uploads a single GPU texture only when a layer or composite changes; complete disposal path.
- 3D-to-UV projection painting: pen strokes raycast/project onto the mesh, pressure controls brush falloff/size, tilt shapes the stamp; strokes commit as one undoable command.
- Texture serialization in `.lpoli` and autosave of texture layer changes. Memory budget and layer limits are explicit in the UI.

**Acceptance gates**

**Exit audit:** [conditional pass](./PHASE4_AUDIT.md) — functional gates pass in browser/desktop development; multi-angle tolerance and physical-iPad memory remain deferred verification.

1. Marking a seam changes the visible UV island boundary and is undoable.
2. LSCM produces finite, non-overlapping UVs for the standard test charts; solver failure is surfaced, not hidden.
3. A paint stroke is projected onto the intended face and produces comparable results at multiple camera angles within a defined tolerance.
4. Pen pressure and tilt materially change brush output and are preserved in input diagnostics.
5. Layer reorder/blend changes do not reallocate WebGL textures when only pixels change, and dispose correctly on project close.
6. Texture-heavy project round-trips with all layer pixel content restored, within the iOS memory ceiling.
7. UV and paint interactions never require a continuous render loop while idle.

---

### Phase 5 — Lighting, baking, shape keys, and interchange

**5A implemented:** editable directional/point/ambient lighting, per-light hard shadows, Lit document-light preview, dedicated Light workspace, and direct-light texture baking. OBJ/GLB interchange and minimal shape keys are implemented; GLB morph import/export and shape-weight animation tracks are implemented; GLB animation clips also round-trip transform and Mesh Motion data. Reference-image planes, world-space annotations, and baked AO are implemented. Animation foundation, camera/light tracks, texture-swap tracks, and render still/frames/video capability are implemented. See [PHASE5_LIGHTING.md](./PHASE5_LIGHTING.md).

**Goal:** finish the asset loop: light it, animate it, move it in and out.

**Deliverables**

- Point and directional lights with simple transform controls and scene list integration.
- Lit viewport path using the same flat-shaded geometry, with a stable light-intensity model.
- Soft shadow/AO baking with progress reporting and an undoable bake result. Texel lightmapping remains a documented extension, not a half-built second path.
- Shape keys (morph targets) with add/rename/delete, weight values, and a timeline scrubber. Topology changes that would invalidate keys are blocked with a clear explanation.
- Animated preview driven by the scrubber rather than a continuous animation loop; playback explicitly opts into a scheduler-driven loop.
- Import: `.obj` (v/vt/f, quads and n-gons preserved where possible), `.glb` (triangles converted to DCEL), and images as texture layers.
- Export: `.obj` with quads preserved, `.glb` through Three's exporter (triangulated), and `.lpoli` for native projects.
- Drag-and-drop for imports in the Tauri window and browser development mode. Native save/share dialogs for exports; drag-out behavior is explicitly tested and not promised where WKWebView cannot support it.
- Final save format expansion: shape keys, lights, bake data, material references, and animation metadata.

**Acceptance gates**

1. All importers validate and repair or reject malformed data without crashing the app or corrupting the document.
2. OBJ quads survive import and round-trip through `.lpoli`; OBJ export reproduces face/edge/vertex counts as expected.
3. GLB import creates valid DCEL topology and preserves UV seams where vertex attributes differ.
4. Shape key interpolation is deterministic, undoable, and exported as GLTF morph targets.
5. A baked hard-shadow result survives save/reload and clears on request.
6. Lit and Unlit/PS1 modes remain visually distinct, and the PS1 material never falls back to Three's default shader.
7. Full Phase 1–5 project can be saved, relaunched cold, and restored with no visual topology regressions.
8. Memory stays under the agreed ceiling throughout a 30-minute paint/animate/export session on the target iPad.

---

### Phase 6 — Render and publish

**Status:** foundation implemented. Scene cameras, Render workspace, camera-driven clean preview, virtual/output resolution, nearest/smooth upscaling, PNG stills and frame sequences, WebM/MP4 recording where the codec is supported, a free camera-editing view with camera list/name/FOV, camera frustum/arrow handles, View through toggle, and an always-open live preview pane with animation playback are implemented. Native MP4 export is implemented on Apple; Windows/Linux use the WebView recorder or frame sequence fallback.

- Render workspace after Animation.
- Document cameras with position, target, and FOV.
- Virtual render target independent of viewport size.
- Output resolution and upscaling.
- Clean render pass with shadows and baked textures.
- Still PNG, PNG frame sequence, and capability-gated WebM/MP4.

AO is implemented as an interactive per-face Lit preview and a per-texel bake-time pass; bake scratch memory is streamed and released between phases. Video output is silent because the document has no audio tracks.

---

## 5. Persistence is cross-cutting, not a final phase

Autosave and project I/O ship with the data they protect.

| Phase | Persistence obligation |
|---|---|
| 1 | No document data yet; establish platform boundary, error model, and IndexedDB availability checks. |
| 2 | Autosave journal, recovery UI, `.lpoli` v1, Tauri atomic file commands, geometry round-trip tests. |
| 3 | Object/group hierarchy, transforms, joined topology, destructive-edit deltas, and modifier stack in the format; recovery preserves evaluated results. |
| 4 | PNG texture chunks, per-layer metadata, texture autosave policy, memory quotas. |
| 5 | Shape keys, lights, bake data, import/export metadata, format v2+ migration. |

No phase is “done” if it adds document state that cannot be persisted or undone.

---

## 6. Verification strategy

### Automated

- **Type and component checks:** `svelte-check` with strict TypeScript (pinned to a version supported by Svelte tooling).
- **Unit tests (Vitest, introduced with Phase 2):**
  - DCEL invariants and randomized execute/undo/redo cycles.
  - Primitive topology counts and manifold checks.
  - Triangulation winding and area.
  - Modifier seam welding and winding correction.
  - Screen-space distance math, including extreme zoom and aspect ratios.
  - Axis projection and snapping precision.
  - `.lpoli` encode/decode, malformed headers, truncated payloads, checksums, version migration.
  - Autosave replay, stale checkpoint detection, and journal pruning.
  - LSCM finite values and chart topology.
- **Renderer instrumentation (dev):**
  - Frames requested vs rendered.
  - Buffer reallocations per edit.
  - Active GPU geometries/materials/textures.
  - Steady-state allocation checks around input and render loops.
- **Golden files:** a small set of `.lpoli` fixtures representing quads, n-gons, seams, modifiers, and textures.

### Manual / device

An interaction matrix is run at the end of each phase:

| Device | Inputs |
|---|---|
| macOS desktop | mouse + keyboard, trackpad where relevant |
| iPad landscape | finger gestures, Apple Pencil, hardware keyboard |
| iPad portrait | same, compact layout |
| Browser dev | mouse; touch emulation for layout only (not accepted as gesture proof) |

Required gesture checks: one-finger orbit, two-finger pinch/pan, two-finger tap undo, three-finger tap redo, pen select/drag, pen never orbiting, accidental palm touch during pen stroke, overlay hit areas, safe-area behavior, background/foreground recovery.

### Performance budgets (initial, to be confirmed on hardware)

- **Idle:** 0 WebGL frames.
- **Interaction:** no more than one render per display frame; no allocation in the hot path in steady state.
- **Buffer policy:** position-only updates mutate existing buffers; reallocations counted and logged.
- **History:** ≤ 32 MB or 100 commands, whichever is reached first; configurable, never unbounded.
- **Autosave journal:** ≤ 20 MB geometry per project before checkpoint compaction; texture journal budget separate.
- **Canvas:** DPR capped at 2 desktop and initially 1.5 on iPadOS pending profiling.
- **Textures (Phase 4):** 512² default, arbitrary rectangular sizes up to 4096 px and the texture pixel budget, memory budget surfaced before adding layers.
- **Idle JS heap:** instrumented per phase; any growth across repeated mount/edit/dispose cycles is a defect.

---

## 7. Toolchain baseline

Versions were checked on 2026-11-01 and are intentionally conservative where peer dependencies require it.

| Component | Baseline | Reason |
|---|---|---|
| Node.js | 26.12.0 (installed) | Satisfies Vite 8 engines. |
| npm | 11.20.0 (installed) | Present and sufficient; no pnpm requirement. Commit `package-lock.json`. |
| Svelte | 5.57.x | Current Svelte 5 release. |
| Vite | 8.3.x | Current major; requires Node ≥ 20.19. |
| `@sveltejs/vite-plugin-svelte` | 7.3.x | Supports Vite 8 and Svelte 5. |
| Three.js | 0.187.x | Current release and matching types. |
| TypeScript | 5.9.x | Current stable tooling support; `svelte-check` currently declares `^5 || ^6`, so TS 7 is not yet adopted. |
| Tauri CLI / API | 2.12.x | Current v2 line. |
| Tauri Rust crate | 2.12.x | Match CLI line. |
| Rust | 1.94.1 (installed) | Satisfies current Tauri/plugins. |
| Xcode | 26.x, iOS 26.2 SDK (installed) | Present locally. |
| Vitest | introduced in Phase 2 | Dev-only; no runtime weight. |

### Local mobile readiness

Current machine check:

- Xcode and iOS SDKs are present.
- **Missing:** CocoaPods, Rust iOS targets (`aarch64-apple-ios`, `aarch64-apple-ios-sim`), and installed simulator runtimes.
- An Apple ID/team and signing capability are required for on-device sideloading. This is user-owned configuration; credentials are never placed in the repository.

Before the first hardware build, install CocoaPods and Rust targets, create an iOS simulator, and verify a signed debug build on the actual iPad. The app remains testable in browser and macOS while this is pending.

### Intended scripts (once scaffolded)

```text
npm run dev          Vite only, browser development
npm run check        svelte-check + TypeScript
npm run build        production frontend build
npm run tauri dev    desktop app with HMR
npm run tauri build  desktop bundle
npm run tauri ios dev  iOS dev build (after init/signing)
```

---

## 8. Dependency policy

**Runtime dependencies**

- `svelte`
- `three`
- `@tauri-apps/api`
- `@tauri-apps/plugin-dialog` (native open/save dialogs)

**Rust dependencies**

- `tauri`
- `serde` / `serde_json`
- `tauri-plugin-dialog`
- Standard-library filesystem APIs for byte-level atomic writes.

**Deliberately absent**

- Tailwind, Bootstrap, or any CSS/UI kit.
- SvelteKit and SSR routing for a single-canvas desktop app.
- Pinia/Zustand/Redux or similar state library.
- Geometry, CSG, parametric modeling, or LSCM libraries.
- Icon packs. The icon set is a local SVG registry.
- Heavy animation, physics, or renderer wrappers.

If a new dependency is proposed, record: what native/bespoke alternative was rejected, bundle/runtime cost, iOS memory impact, and license.

---

## 9. Risk register

| Risk | Why it matters | Mitigation |
|---|---|---|
| DCEL undo is harder than transform undo | Bad undo would poison trust in every modeling tool. | Build transactional local patches first, fuzz execute/undo/redo against invariant checks, and forbid full-scene clones from the start. Keep operations on a shared mutator API. |
| iOS WKWebView memory kills long sessions | The app may be suspended or killed during real work. | No reactive proxies on mesh data, bounded caches/history, typed-array reuse, explicit texture caps, 30 s delta autosave, background flush, recovery UI. |
| Gesture conflicts on iPad | Palm touches, pinch starts, and undo taps fight each other. | One explicit gesture state machine, movement/time thresholds, pen-active suppression window, instrumentation panel, device testing before feature expansion. |
| Affine mapping and vertex snapping fight clipping | Naive affine tricks can produce distorted or missing triangles. | Implement both in clip space before perspective divide, keep affine data as manual `uv·w`/`w` varyings (GLSL ES has no `noperspective` qualifier), test near clip planes and all camera angles. |
| Shading modes delivered before topology | Risk of building a disposable Three.js preview that becomes architecture. | Confine Phase 1 fixture to dev-only module; remove on arrival of the DCEL. Never persist or expose it as a mesh node. |
| Tauri iOS file access and export | File pickers are security-scoped and save behavior differs from desktop. | Import with copied files, write native projects into app Documents, enable Files/iMazing sharing, keep Rust byte I/O, verify save/export on hardware early. |
| LSCM solver scope | Sparse least-squares can balloon in time and memory. | Isolate solver as pure TS with fixtures, cap chart/test sizes, solve in bounded chunks/worker only if profiling demands it. |
| Format evolution | Early saves become unreadable or silently wrong. | Versioned container, strict decode validation, migrations with golden files, every phase adds round-trip tests. |
| Modifiers + direct topology editing | Selecting evaluated geometry can point to the wrong base vertices. | Evaluate with provenance, define edit-base behavior explicitly, test mirror/array picking before shipping the stack UI. |
| On-demand loop creep | “Temporary” animation loops erase the core performance promise. | Scheduler is the only rAF entry point; instrumentation asserts zero idle frames; long-running animation must be explicit and cancellable. |
| Bundle creep | A 3D editor can drown in tiny dependencies. | Enforced dependency policy and local SVG/CSS primitives. |

---

## 10. Approved decisions

Approved on 2026-11-01:

1. **Phase 1 implementation slice.** Phase 1 includes the minimal DCEL cube and one vertex-move command so shading, picking, and gesture undo are exercised against real document state. The general topology kernel remains Phase 2.
2. **Minimum iPadOS.** iPadOS **16.4+**. This is the first Safari version with `OffscreenCanvas`, which Phase 4 depends on. Older iPads are not supported by the texture stack.
3. **Texture packing in `.lpoli`.** Texture layers use **binary PNG chunks** in the container rather than base64 strings, to avoid the size and peak-memory penalty on iOS. This supersedes the literal base64 example in the addendum.
4. **Bundle identifier.** `com.loupoli.studio`, chosen instead of the initial `com.loupoli.app` after Tauri warned that a `.app` suffix conflicts with the macOS application bundle extension. Signing credentials stay local and out of version control.
5. **PS1 is opt-in.** Unlit defaults to correct perspective-correct mapping with no vertex snapping. A single PS1 look toggle enables vertex snapping and affine UVs; it is off on first load and restores prior shading when disabled.
6. **Bent quads are render-only bilinear patches.** Non-planar quads keep a single editable DCEL face but use adaptive render tessellation to avoid a triangle-diagonal texture crease. This is a rendering exception to the usual in-place buffer policy and does not change topological counts.
7. **Persistence v1.** The project format is a 28-byte-header CRC-checked binary envelope with a JSON manifest and fixed-order aligned typed-array columns. Autosave uses one IndexedDB checkpoint plus bounded command deltas; it is never a per-edit scene clone.

Implementation proceeds against these decisions. Any future change is recorded here rather than silently altering the format or roadmap.

---

## 11. Definition of done for every phase

- Requested scope works end to end; no disabled placeholder shipped for an unimplemented feature.
- Document mutations are undoable and persistable.
- Idle viewport has zero WebGL frames.
- Touch interaction is usable at 44 px without hover.
- No new dependency without justification.
- Invariant, format, and relevant math tests pass.
- Verified in browser, macOS Tauri, and — once available — physical iPad.
- Memory/leak checks are clean after repeated open/edit/close cycles.
- Documentation reflects actual behavior, including known constraints.

---

## 12. Planning references

Checked while preparing this baseline:

- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) — Xcode, CocoaPods, and Rust iOS targets for mobile development.
- [Tauri v2 iOS code signing](https://v2.tauri.app/distribute/sign/ios/) — device install requirements.
- [Tauri v2 Dialog plugin](https://v2.tauri.app/plugin/dialog/) — native open/save dialogs and mobile platform support.
- [Tauri v2 File System plugin platform notes](https://v2.tauri.app/plugin/file-system/) — iOS access is restricted to the application folder by default; the app therefore uses explicit Rust commands for byte I/O.
- [MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) — browser support baseline used for the iPadOS 16.4 recommendation.
- [Tauri dialog plugin iOS source](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/dialog/ios/Sources/DialogPlugin.swift) — document picker copy/scoped modes and the iOS save-dialog workaround; behavior must still be verified on hardware.
