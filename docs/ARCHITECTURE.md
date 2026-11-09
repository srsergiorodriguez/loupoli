# loupoli — Technical Architecture

**Status:** Phase 2 implementation baseline plus the first Phase 3 slices: multi-element selection, numeric object transforms, and drag-to-orbit orientation gizmo. Later Phase 3 systems remain planned architecture.  
**Related:** [Docs index](./README.md) · [Plan](./PLAN.md) · [Persistence](./PERSISTENCE.md) · [Design System](./DESIGN_SYSTEM.md) · [README](../README.md)

This document fixes the boundaries between Svelte, the editor model, the half-edge kernel, the renderer, input, and the Tauri shell. It is intentionally opinionated: future changes should either fit these boundaries or be recorded as a deliberate architecture change.

## Contents

1. [Runtime layers](#1-runtime-layers)
2. [Coordinates, units, and numeric policy](#2-coordinates-units-and-numeric-policy)
3. [Document model](#3-document-model)
4. [Half-edge DCEL](#4-half-edge-dcel)
5. [Command and undo model](#5-command-and-undo-model)
6. [Modifiers](#6-modifiers)
7. [Rendering architecture](#7-rendering-architecture)
8. [PS1 Unlit shader specification](#8-ps1-unlit-shader-specification)
9. [Input architecture](#9-input-architecture)
10. [Screen-space picking](#10-screen-space-picking)
11. [Platform boundary (Tauri v2)](#11-platform-boundary-tauri-v2)
12. [iOS memory and lifecycle rules](#12-ios-memory-and-lifecycle-rules)
13. [Error model and conventions](#13-error-model-and-conventions)
14. [Deliberate deferrals](#14-deliberate-deferrals)


## 1. Runtime layers

```text
┌──────────────────────────────────────────────────────────────┐
│ Presentation                                                  │
│ Svelte 5 components, design system, DOM/SVG viewport HUD      │
│ reactive projections only; no Three.js objects in runes      │
└─────────────────────────────┬────────────────────────────────┘
                              │ intents / commands
┌─────────────────────────────▼────────────────────────────────┐
│ Editor                                                       │
│ InputRouter, tool controllers, SelectionModel, History,       │
│ AutosaveService, PlatformIO                                   │
└──────────────┬────────────────────────────────┬───────────────┘
               │ pure mutations                 │ invalidation
┌──────────────▼────────────────┐  ┌────────────▼──────────────┐
│ Document                      │  │ Render                    │
│ SceneDocument, MeshNode,      │  │ MeshEvaluator, RenderMesh │
│ HalfEdgeMesh, ModifierDef,    │  │ ViewportRenderer,         │
│ shape keys, UVs, materials    │  │ CameraRig, RenderScheduler│
└──────────────┬────────────────┘  └────────────┬──────────────┘
               │ persistence bytes              │ WebGL2
┌──────────────▼────────────────┐  ┌────────────▼──────────────┐
│ Storage                       │  │ GPU + input surfaces      │
│ IndexedDB journal, .lpoli     │  │ WebGL canvas, CSS/SVG HUD │
└──────────────┬────────────────┘  └───────────────────────────┘
               │
┌──────────────▼────────────────┐
│ Tauri / Rust                  │
│ dialogs, byte validation,     │
│ atomic filesystem writes      │
└───────────────────────────────┘
```

The editor layer owns decisions. The document layer is plain data plus deterministic operations. The render layer only derives drawable artifacts. The presentation layer only presents and dispatches intents.

### Added runtime dependencies

`@tauri-apps/plugin-dialog` (JS) and `tauri-plugin-dialog` (Rust) are the only runtime additions beyond Tauri, Svelte, and Three.js. They provide native macOS/iOS open/save pickers without reimplementing platform dialogs. The plugin handles picker UI only; project bytes are read/written by the small Rust commands and validated in Rust and TypeScript. It adds no document geometry to the WebView and no persistent memory outside the native dialog lifecycle.

### Phase 2 implementation map

| Concern | Implemented module |
|---|---|
| Scene document | `src/lib/scene/SceneDocument.ts`, `MeshNode.ts` |
| Half-edge kernel + boundaries | `src/lib/geometry/HalfEdgeMesh.ts` |
| Primitives | `src/lib/geometry/primitives.ts` |
| Commands / history | `src/lib/editor/commands/`, `History.ts` |
| Multi-node viewport | `src/lib/render/ViewportRenderer.ts`, `MeshNodeView.ts` |
| Picking and overlays | `MeshNodeView` vertex/edge/face paths |
| Autosave journal | `src/lib/project/AutosaveService.ts`, `journal.ts` |
| `.lpoli` codec | `src/lib/project/lpoly.ts` |
| Browser/native files | `src/lib/platform/projectFiles.ts`, `src-tauri/src/lib.rs` |
| Reactive projection | `src/lib/editor/EditorRuntime.ts`, `EditorSession.svelte.ts` |

The implemented scene layer is intentionally smaller than the future layout: active-node editing, primitive add/delete, and vertex moves are live; destructive mesh topology commands and modifier evaluation arrive in Phase 3.

### Rules

1. **No Svelte runes inside geometry or rendering objects.** A `$state` proxy around arrays, Three.js objects, or OffscreenCanvas backing state is forbidden. Use plain classes and mirror small UI summaries into a reactive session store.
2. **No renderer writes into the document.** The renderer consumes snapshots/cached buffers and can only report events upward.
3. **No Three.js import in `geometry/`.** This keeps the topology kernel testable in Node and prevents coordinate-system leaks from render helpers.
4. **No direct Tauri calls from UI components.** All native I/O goes through `platform/`.
5. **No source of truth in the DOM.** Canvas/SVG HUD state is derived from editor state.

### Planned source layout

```text
src/
  app/
    main.ts
    bootstrap.ts
    App.svelte
  design/
    tokens.css
    base.css
    theme.ts              # reads a small set of CSS vars for WebGL/2D colors
  lib/
    ui/
      primitives/         # Button, IconButton, SegmentedControl, NumberField, ...
      chrome/             # TopBar, ToolRail, StatusBar, OrientationGizmo
      panels/             # Inspector, shading, outliner, modifiers, timeline
    editor/
      EditorSession.svelte.ts   # UI-facing reactive projection
      SelectionModel.ts
      History.ts
      tools/
      commands/
      EditorEventBus.ts
    geometry/
      HalfEdgeMesh.ts
      topology/
      primitives/
      triangulate.ts
      modifiers/
      ShapeKeys.ts
    render/
      ViewportRenderer.ts
      MeshNodeView.ts
      CameraRig.ts
      Grid.ts
      materials.ts
    input/
      InputRouter.ts
      GestureRecognizer.ts
      pointerTypes.ts
      picking/
    project/
      AutosaveService.ts
      lpoly.ts
      journal.ts
    scene/
      MeshNode.ts
      SceneDocument.ts
    platform/
      PlatformIO.ts
      tauri.ts
      browser.ts
    utils/
  src-tauri/
    src/lib.rs
    src/commands.rs
    capabilities/default.json
    tauri.conf.json
  docs/
```

### Dependency direction

- `ui` → `editor` (intent calls) and readonly reactive projections.
- `editor` → `geometry`, `project` persistence services, `render` views/API.
- `render` → `geometry` (read-only snapshots), Three.js.
- `geometry` → no app/UI/render imports.
- `persistence` → `geometry`, serializable command deltas, platform interface.
- `platform` → Tauri/browser APIs only.

---

## 2. Coordinates, units, and numeric policy

| Concern | Decision |
|---|---|
| Handedness | Right-handed. X right, Y forward, Z up. `X × Y = Z`. |
| World up | `(0, 0, 1)`. |
| Initialization | `THREE.Object3D.DEFAULT_UP.set(0, 0, 1)` runs in `bootstrap.ts` before any object, camera, light, or control is constructed. |
| Grid | Custom XY grid at `z = 0`. Do not use `GridHelper` unmodified (its default plane is XZ). |
| Units | Generic scene units. 1 unit is displayed as `1`; no unit conversion in v1. |
| Rotation storage | Quaternions for object transforms. Inspector shows Euler XYZ in degrees; internal math uses radians. |
| Precision | Numeric transforms use JS doubles in editor math. GPU positions are `float32`; snapping is applied in double precision before packing. |
| Snapping | Grid increments in world units. Default set: 0.1, 0.25, 0.5, 1.0. Snapping can be disabled. |
| Camera | Perspective, 45° initial FOV, near `0.01`, far `1000`, orbit target on the XY grid. |

Every coordinate conversion uses the renderer's current CSS-pixel viewport rect. Device pixel ratio is never used for pointer math; picking thresholds are in CSS pixels.

### Camera design

The app does **not** use `OrbitControls`. It has two problems here: its damping loop wants continuous frames, and its built-in touch handling competes with the required gesture model.

`CameraRig` owns:

- Perspective camera and orbit target.
- Spherical offset in a Z-up basis: yaw around +Z, elevation from the XY plane, clamped to avoid the poles.
- `orbit(dx, dy)`, `pan(dx, dy, viewportSize)`, `dolly(factor)`, `frameAll()`, `snapToView(axis)`.
- A quaternion/basis used by the orientation gizmo.
- A view transition scheduler that requests at most one frame per animation frame until settled.

The camera must never produce NaN at the poles; clamp elevation to `[-89.5°, +89.5°]`. No damping by default. Immediate response is closer to precise DCC interaction and guarantees idle frames when the pointer stops.

---

## 3. Document model

The document is plain TypeScript data. It is serializable, but serialization is a separate mapping step to the on-disk format.

```ts
/** A stable reference to a scene object. Persistent across edits. */
type MeshNodeId = string;

/** Render-facing mode. This is viewport state, not document topology. */
type ShadingMode = 'wireframe' | 'solid' | 'unlit' | 'lit';

/**
 * One editable object in the scene.
 * `base` is the only editable topology; `modifiers` are evaluated on demand.
 */
interface MeshNode {
  id: MeshNodeId;
  name: string;
  visible: boolean;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number, number]; // xyzw quaternion
    scale: [number, number, number];
  };
  base: HalfEdgeMesh;
  modifiers: ModifierDef[];
  shapeKeys: ShapeKeySet;
  materialIds: number[];
  revision: number;
}

/** Project document. Session-only view state lives elsewhere. */
interface SceneDocument {
  schemaVersion: number;
  id: string;
  name: string;
  nodes: MeshNode[];
  materials: MaterialDef[];
  lights: LightDef[];
  camera: SerializedCameraState;
  grid: GridSettings;
  createdAt: string;
  modifiedAt: string;
}
```

### Session vs document

| Document state (undoable, saved) | Session state (not undoable, UI-only) |
|---|---|
| Mesh nodes, topology, transforms | Active viewport shading mode |
| Modifiers and parameters | Camera orbit pose (saved as a convenience, but not undoable) |
| UVs, seams, material assignments | Selection set |
| Lights, shape keys, bake result | Open panels, tooltips, active tool |
| Project name/grid settings | Hover, transform preview, show-wire overlay |

Selection is deliberately not undoable. Undo restores document geometry; it should not teleport the user through historical selections.

### Stable IDs

Scene nodes use `crypto.randomUUID()`. DCEL element indices are ephemeral. A topology-changing command invalidates the selection; vertex drag commands retain the same selection because they do not change topology. Persistent selection across reloads is not required in early phases.

### Revision flow

- Every document command increments `SceneDocument.revision`.
- Every evaluator knows the `MeshNode.revision` and modifier stack hash it consumed.
- A dirty revision schedules re-evaluation and one renderer invalidation.
- Pure transform changes update the object matrix and don't force mesh re-evaluation unless the modifier stack is object-space dependent.

---

## 4. Half-edge DCEL

### Representation

The DCEL uses parallel typed columns for memory locality and cheap serialization. Indices are 32-bit integers; positions and UVs are 32-bit floats. Counts and capacities are explicit.

```ts
/**
 * Columnar half-edge mesh.
 *
 * Every edge has two half-edges. A boundary half-edge has face = -1 and
 * participates in a boundary loop. Each vertex stores one outgoing half-edge.
 */
class HalfEdgeMesh {
  // Capacity-backed columns — reused, never rebuilt per frame.
  positions: Float32Array;       // 3 per vertex
  vertexOut: Int32Array;         // outgoing half-edge per vertex
  heOrigin: Uint32Array;         // vertex at half-edge tail
  heTwin: Uint32Array;
  heNext: Uint32Array;
  heFace: Int32Array;            // -1 means boundary
  heEdge: Uint32Array;           // owning undirected edge
  heUv: Float32Array;            // per corner (2 per half-edge)
  edgeHalfEdge: Uint32Array;     // canonical half-edge per edge
  edgeFlags: Uint8Array;         // seam/sharp flags
  faceHalfEdge: Uint32Array;
  faceMaterial: Int32Array;

  vertexCount: number;
  halfEdgeCount: number;
  edgeCount: number;
  faceCount: number;

  // free-slot bookkeeping and attribute channels added by later phases
}
```

### Why per-half-edge UVs

UV seams break vertex continuity. If UVs lived on vertices, any seam would force vertex duplication, which would then break the topological vertex model for picking and modeling. Per-corner UVs are the correct low-poly representation: one topological vertex can have multiple UV coordinates per adjacent face, and seams are explicit edge flags.

### Invariants

These are checked in development builds and in tests after every structural operation:

1. Every active half-edge has a twin, and `twin(twin(h)) === h`.
2. `h !== twin(h)`; zero-length/degenerate edges are rejected at operation boundaries.
3. `next` forms a closed cycle within one face or one boundary loop.
4. `origin(next(h)) === destination(h)`.
5. Every face has exactly one representative half-edge; every boundary is a closed loop.
6. Every active vertex has a valid outgoing half-edge unless explicitly isolated (primitives and modeling do not create isolated vertices).
7. Every edge owns exactly two half-edges.
8. Face winding is counter-clockwise when viewed from the front, with outward normals. Mirroring reverses winding deliberately.
9. UVs are finite and within the documented domain (`[0,1]` for the canonical unwrap, with repeat allowed by materials).

`validateInvariants()` is debug-only or enabled behind a dev flag so production input does not pay for full-mesh scans.

### Mutations and capacity

- Geometry columns have `count` and `capacity`. Growth is geometric (for example ×1.5 or ×2), never one allocation per element.
- Normal editing operations mutate existing rows and may append rows. Slots freed by deletion are tracked in a free list for reuse while undo/redo semantics allow it.
- Structural edits do not immediately compact columns. Compaction happens at explicit checkpoints (save, idle maintenance) and must invalidate indices consistently.
- Iteration helpers walk half-edge cycles, not triangle lists. Rendering triangulation and picking are derived from these cycles.
- Every mutation is wrapped in a transaction that records the affected rows and appended/freed indices. See §5.

### Topology operations

| Operation | Core shape | Key risk |
|---|---|---|
| Extrude | Duplicate a face/region boundary loop, create side quads, update twins/next. | Correct boundary stitching for region vs individual faces. |
| Inset | Create an inner offset loop and a ring of quads. | Self-intersection on unusually small/non-convex faces; clamp or reject. |
| Loop cut | Walk a quad ring, split each crossed edge and face. | Non-quad blockers; stop cleanly and preview the blocked point. |
| Weld | Merge vertices by tolerance, remove degenerate faces, repair twins. | Non-manifold results; reject or surface a warning. |
| Seam toggle | Flip an edge flag only. | No topology effect; still a command for undo and persistence. |

Triangulation is a rendering concern:

- Planar quads use a fixed two-triangle diagonal.
- **Non-planar quads are rendered as a 4 × 4 bilinear patch.** This avoids the long texture crease and silhouette fold that appear when a bent quad is exposed as two independent triangle panels. The editable DCEL stays one quad; render triangles are derived and may increase locally while a face is out of plane.
- Simple n-gons use ear clipping.
- Non-planar/degenerate faces are flagged in development when they cannot be rendered safely. They are never silently rendered inside out.
- Each triangle corner receives a flat face normal and the source/interpolated UV, so the bent-quad overlay does not turn into smooth shading.

### Primitives

- **QuadSphere:** cube-sphere projection with six quad patches and no triangle fans at the poles. Subdivision level is a parameter. All interior vertices have valence four.
- **Cylinder:** side quads, n-gon caps by default, optional cap triangulation only if needed by a later modifier. Cap centers are not introduced unless required.
- **Grid:** planar XY quad grid, configurable X/Y divisions and total size.

All primitives are constructed through the same transaction-capable builder so a primitive creation command is undoable and serializable.

---

## 5. Command and undo model

```ts
/**
 * A reversible document mutation.
 * Never captures Svelte state, DOM nodes, Three.js resources, or the whole scene.
 */
interface EditorCommand {
  readonly id: string;
  readonly label: string;
  execute(context: CommandContext): void;
  undo(context: CommandContext): void;
  /** The state transition used by autosave replay. */
  toAutosaveDelta(): SerializedDocumentDelta;
}
```

### History behavior

- New command → truncate redo stack → execute → push.
- Undo → command.undo() → move to redo stack.
- Redo → command.execute() → move back to undo stack.
- Continuous pointer drags build a preview in memory. On pointer up, one command is committed with before/after values. On cancel or Escape, the preview restores the original and no history entry is created.
- Undo stack is bounded by both command count and estimated bytes. Defaults: 100 commands or 32 MB, whichever comes first. When trimming, drop the oldest **base-ward** entries and keep the newest redo/undo semantics coherent.
- Selection changes and camera moves are not commands.
- Autosave does not reuse the undo stack. It observes committed transitions and persists forward/inverse deltas separately.

### Localized patch design

The transaction journal is the core anti-drift mechanism for undo and autosave. For a structural operation it records:

- **Appended rows:** half-edges, edges, faces, vertices added, with their new IDs.
- **Modified rows:** element ID, field-level before/after values.
- **Freed rows:** IDs and their prior values, plus free-list bookkeeping.
- **Metadata:** revision, selection invalidation, mesh-level flags.

For translation/scale/drag operations, the patch is numeric: affected vertex IDs plus `Float32Array` before/after positions. For UV edits, the same principle on per-corner UVs. For material assignment, a compact list of face IDs and old/new material indices.

The rule is simple: **a command may copy the elements it touches, never the entire scene.** A mesh-wide topology rebuild is a red flag and requires an explicit architecture review.

### Serialization vs undo

Undo/redo patches contain enough information to revert in-memory data. Autosave deltas use a named, versioned representation that can replay on a freshly decoded checkpoint without instantiated object closures. The two are produced from the same transaction, not maintained as separate logic.

---

## 6. Modifiers

Modifier definitions are serializable discriminated unions:

```ts
type ModifierDef =
  | { kind: 'mirror'; id: string; enabled: boolean; axis: 'x' | 'y' | 'z'; weldEpsilon: number }
  | { kind: 'grid-array'; id: string; enabled: boolean; countX: number; countY: number; spacingX: number; spacingY: number; centered: boolean }
  | { kind: 'radial-array'; id: string; enabled: boolean; count: number; axis: 'x' | 'y' | 'z'; angle: number; radius: number };
```

Evaluation order is top-to-bottom, exactly as displayed:

```text
shape-key mix → modifier 1 → modifier 2 → … → validate → triangulate → GPU buffers
```

- Modifiers are pure functions over a mesh snapshot and params.
- The base mesh remains editable. The evaluated mesh is derived and never serialized as authoritative data.
- Each stage caches its output keyed by `(inputRevision, modifierId, paramsHash)`. A change invalidates that stage and everything downstream; upstream caches survive.
- Only the latest evaluated chain is retained in production. Debug snapshots are dev-only and explicitly disposed.
- **Provenance:** each evaluated element may carry a `sourceVertex`/`sourceEdge`/`sourceFace` mapping back to the base. This is required for reliable selection when Mirror/Array instances are visible. When a pick lands on a duplicate, the editor operates on the source base element. If an operation cannot be mapped safely, the tool explains and refuses rather than editing the wrong vertex.
- **Winding:** any reflection (mirror or negative array transform) reverses face winding. This is mandatory even if face normals are recomputed later, because the DCEL's next/twin relationships encode orientation.

### Mirror seam specifics

1. Reflect vertices and topology across the local axis.
2. Weld source/mirror vertices within `weldEpsilon` on the mirror plane.
3. Stitch pairs of boundary edges that lie on the seam so they become interior edges.
4. Remove degenerate zero-area faces introduced by clipping at the plane.
5. Validate manifoldness. If clipping produces non-manifold topology, report a modifier error instead of rendering a broken mesh.

### Arrays

Grid and radial arrays duplicate complete shells. They do not weld except where explicitly specified. This keeps arrays predictable and avoids accidentally making every copy a continuous mesh. Each copy's UVs and base seam flags are preserved; any required orientation changes are documented per modifier. Seam bits reach evaluated edges through the modifier provenance map so UV-island boundaries remain visible on duplicated output.

### Element transforms on modifier stacks

Element transforms deliberately operate in **base space** and use the base
selection median as the pivot. The evaluated result may contain multiple copies
of every selected base element, and the selection overlays highlight all copies.

An evaluated-copy pivot is not generally representable as one base-space
transform: a rotation or scale around a copy's visible median would have to be
inverted through each modifier stage, and a cross-copy selection has no single
base pivot. Moving the gizmo to an evaluated median would therefore make
Translate look plausible while Rotate/Scale became misleading.

Evaluation (2026-11-02): keep the base-space pivot and label it in the status
hint. A future explicit active-copy mode could add per-copy mapping, but it
needs a selected-copy identity and a defined cross-copy policy; it is not a
local math fix.

---

## 7. Rendering architecture

### UV charts and unwrap

Seam charts are connected face sets split across seam edges and open boundaries. Chart vertices are corner fans welded across non-seam edges, so one mesh vertex may map to several UV vertices inside the same chart when seams cut through its fan. The unwrap path uses a bespoke LSCM solver over those UV vertices: triangle gradients produce the two Cauchy-Riemann residual rows, the farthest boundary pair is pinned, and the sparse normal equations are solved with conjugate gradients. Charts are aligned by their longest boundary edge and shelf-packed into the UV square. Closed charts fail explicitly; zero-area, mixed-winding, and overlapping results are rejected before any document mutation. Two selected corners may pin a chart; otherwise the farthest boundary pair is automatic. Multi-chart packing improvements remain.

### Viewport sizing

The renderer observes the **canvas** element, not its parent, and derives width/height from the canvas CSS box. This keeps the perspective aspect, picking rectangle, and drawing-buffer size synchronized when a split view changes only the canvas height while the full-viewport parent stays fixed.

### Scheduler

```ts
type RenderReason =
  | 'camera'
  | 'resize'
  | 'document'
  | 'selection'
  | 'shading'
  | 'theme'
  | 'overlay';

/**
 * Coalesces all invalidation reasons into at most one rendered frame.
 * There is no free-running loop.
 */
class RenderScheduler {
  invalidate(reason: RenderReason): void;
  dispose(): void;
}
```

- Engine services publish invalidation reasons through the typed `EditorEventBus`; the scheduler subscribes to that bus. Svelte components do not call `render()` directly.
- `invalidate()` sets a flag and, if no frame is queued, requests one rAF.
- That frame executes all dirty work and clears the flag. It does not schedule another frame.
- Animated view transitions explicitly call `invalidate('camera')` until their state settles.
- CSS-only HUD changes update the DOM and do not require a WebGL redraw. If a panel changes the canvas size, a `resize` invalidation is issued.
- A dev overlay reports frames requested, frames rendered, and the last invalidation reason. Acceptance criteria rely on this.

### Viewport renderer

- One `WebGLRenderer` and one WebGL2 context for the entire app.
- Context flags: alpha off; stencil off; antialias off for the authentic pixel look (revisit if selection clarity suffers); power preference high-performance.
- Canvas backing size = CSS size × `min(devicePixelRatio, 2)`. On iPadOS start at 1.5 and profile.
- `ResizeObserver` drives camera aspect and renderer size changes.
- Scene contents:
  - `Grid` (XY, custom shader or line geometry; depth-write off, drawn first).
  - Root group of `RenderMesh` objects, with one level of scene group wrappers for grouped objects.
- Modifier stacks evaluate a separate render mesh from the unchanged base DCEL and carry vertex/edge/face provenance back to base elements. Picking and overlays use provenance; destructive base edits re-evaluate the stack, while direct base-vertex dragging is paused.
  - Selection/edge overlays.
  - Transform gizmo rendered only when a transform tool is active.
- The orientation gizmo is **not** a second WebGL scene. It is an SVG/canvas overlay computed from the camera basis, which avoids another GPU context and fits the crisp UI language.
- No continuous shadows, animations, or FPS tickers in the default idle state.

### Render buffers and mutation policy

A `RenderMesh` owns dynamic `BufferGeometry` and materials. Its capacity strategy:

1. On first build, allocate for the evaluated triangle count with headroom.
2. On a geometry update, write into the existing `position`, `normal`, and `uv` arrays if capacity suffices.
3. Set the geometry's draw range and mark only touched attribute ranges dirty where the platform supports it.
4. Grow capacity when required, with geometric over-allocation. Ordinary move-only edits mutate buffers. A derived-geometry rebuild is permitted only when adaptive bilinear tessellation changes a quad's render triangle count; the DCEL and materials remain untouched.
5. Wireframe geometry is derived from unique DCEL edges, not triangle diagonals.

Flat normals mean triangle corners are independent in the render buffer. The GPU buffer is not the DCEL and can be duplicated freely for shading quality. Pickers always use topological positions, never render corner copies.

### Transform orientation

Node transforms are stored parent-local. The Inspector can display and edit world-space position/rotation for a child of a one-level group, converting back through the group transform. Translate/rotate gizmos can use world axes; scale remains local because parent rotation with nonuniform scale can require shear.

Element G/R/S and the selection gizmo expand the current V/E/F selection to unique vertices, preview position changes directly, and commit a TransformVerticesCommand containing only affected positions and per-vertex move patches. The runtime feeds the selection-median world frame to the renderer so the existing axis gizmo can target elements; enlarged invisible hit meshes preserve Pencil reliability. With an active modifier stack, element transforms operate on the selected base vertices and re-evaluate the stack; the HUD marks the base-space target.

The ActionDock uses a separate one-shot action state. On pointer-down it swaps the node's base DCEL for a preview generated from the preserved source mesh and re-evaluates modifiers. Topology actions clear the element selection; Loop Slide keeps it. Pointer movement regenerates the preview, release commits a ReplaceMeshCommand or a localized vertex transform, and cancel restores the source mesh and selection. Loop Slide is position-only: it moves the selected loop along its perpendicular quad edges and keeps the selection. Loop Cut auto-selects the new loop. ReplaceMeshCommand still carries before/after loop-cut context for undo/redo. Applying enabled modifiers is a composite ReplaceMeshCommand + SetModifiersCommand: the evaluated mesh becomes the base, the stack clears, and one undo restores both.

Desktop G/R/S runs a transient modal transform in the runtime, targeting selected elements when present and the object/group otherwise. It previews the target transform, derives translation/rotation from the last pointer position or typed values, applies grid snapping to pointer-driven moves, and commits a single TransformNodeCommand/TransformGroupCommand. The transform HUD is a snapshot projection; the document is not cloned for preview.

### Viewport shading modes

Wireframe, Solid, Texture (the PS1/Unlit path), Texture + Wire, and Lit. A fresh app load opens on Model with Texture + Wire; workspace defaults are Texture + Wire for Model, Texture for UV/Paint, and Lit for Light/Animate/Render, with per-workspace manual choices remembered for the session. Texture + Wire rebuilds a camera-facing edge subset when rendering: each edge is kept when either adjacent face normal points toward the camera, then depth-tested so edges hidden behind another part of the model do not show through. Visible front edges receive a small camera-distance-scaled normal offset to avoid surface z-fighting. The overlay updates on camera or object changes. A separate blue preview line marks a pending loop cut.

| Mode | Implementation |
|---|---|
| **Wireframe** | Unique DCEL edges rendered as thin lines; solid faces hidden. No triangle diagonals. |
| **Solid** | Neutral clay surfaces with explicit flat face normals. Fixed viewport key/fill lighting, independent of scene lights. |
| **Unlit / PS1** | Custom `ShaderMaterial`; raw albedo/vertex color/texture with optional PS1 quantization and affine UVs. |
| **Lit** | Scene point/directional lights with flat shading. Phase 1 uses a minimal fixed-light version; Phase 5 wires editable lights. |

Materials are shared per mode where possible. Object-specific material properties (albedo/map) are uniform or material clones that are disposed with the node or cache entry.

### Color management

- WebGL renderer outputs sRGB.
- Texture color space is explicit (`SRGBColorSpace` for albedo).
- Custom ShaderMaterial must apply the color-space conversion include or equivalent; do not let PS1 mode look washed out compared with other modes because of an implicit encode/decode mismatch.
- UI overlay colors and WebGL theme colors are sourced from the same token values via `theme.ts` reading computed CSS custom properties at boot.

---

## 8. PS1 Unlit shader specification

The material is a custom GLSL `ShaderMaterial`, not `MeshBasicMaterial`. This is a hard requirement because the two defining effects are not available on the basic material.

### Vertex stage

1. Transform position to clip space with the standard matrices.
2. **Clip-space quantization:** snap NDC XY to a low-resolution grid while preserving the clip-space w scale. This makes geometry wobble as the camera moves, exactly as PS1 vertices did.
3. **Affine texture setup:** pass `uv * w` and `w` as smooth varyings. GLSL ES 3.00 does not expose `noperspective`, so the affine mapping is reconstructed manually. Recovering screen-linear UVs in the fragment shader produces the characteristic texture swim explicitly, even when the underlying interpolation is perspective-correct.

Illustrative math:

```glsl
vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

// Snap to a virtual 320 × 240 raster in NDC. Rounding happens after
// perspective divide, then is re-scaled by w so clipping remains correct.
vec2 resolution = uSnapResolution;             // e.g. vec2(320.0, 240.0)
vec2 ndc = clip.xy / clip.w;
ndc = floor(ndc * resolution * 0.5 + 0.5) / (resolution * 0.5);
clip.xy = ndc * clip.w;

vAffineUv = uv * clip.w;
vAffineW = clip.w;
gl_Position = clip;
```

Fragment stage:

```glsl
vec2 affineUv = vAffineUv / vAffineW;
vec4 albedo = texture2D(uMap, affineUv) * uTint;
// handle uHasMap == 0, vertex colors, alpha test if needed
gl_FragColor = albedo;
```

### Uniforms and variants

- `uMap`, `uHasMap`
- `uTint` (linear color)
- `uUseVertexColor`
- `uSnapEnabled`, `uAffineEnabled` (or compile-time defines; the UI exposes a "PS1" toggle)
- `uSnapResolution` (default 320 × 240)
- Optional nearest filtering is a texture property, set when PS1 is enabled. Do not silently change the user's texture sampler if unlit without PS1 is selected.

### Requirements and edge cases

- The Render Inspector exposes one **PS1 look** toggle that enables both vertex snapping and affine UV interpolation. It is off by default. Enabling it switches the viewport to Texture + Wire and render shading to Texture / baked; disabling it restores the viewport and render shading that were active before PS1. Uniform updates must reach every per-texture PS1 material clone as well as the base material. Older files with either legacy flag enabled normalize to the single enabled state.
- Default Unlit rendering must therefore look like a correctly mapped, unsnapped albedo view. PS1 is a deliberate mode, not a default.
- Apply quantization in clip space **before** the GPU's clipping stage. Shared vertices snap identically, so no cracks appear within a mesh.
- Do not snap Z; avoid depth fighting. If depth precision needs attention, solve it separately.
- Keep backface culling enabled only for consistently wound primitives. Winding is validated in the DCEL; mirror modifiers reverse it.
- Test at near-plane clipping, extreme zoom, and very large/small triangles.
- Texture wrapping must be explicit; affine UVs may extend outside `[0,1]`.
- The dev calibration fixture must demonstrate visible jitter and texture swim at both portrait and landscape aspect ratios.

### Solid and Lit flat normals

Render buffers carry per-face normals. Solid mode uses a stable neutral light rig owned by the viewport, not the document. Lit mode uses the document lights in Phase 5. The material system must not accidentally become smooth-shaded when geometry is re-indexed.

---

## 9. Input architecture

### Pointer routing

`InputRouter` attaches only to the viewport surface, uses pointer capture, and normalizes events into editor intents.

```ts
interface PointerSample {
  pointerId: number;
  pointerType: 'pen' | 'touch' | 'mouse';
  x: number;              // CSS px relative to viewport
  y: number;
  pressure: number;       // normalized 0..1, defaults for devices without it
  tiltX: number;
  tiltY: number;
  buttons: number;
  coalesced: PointerEvent[];
}
```

Routing:

| Input | Behavior |
|---|---|
| **Pen** | Bypasses camera controls entirely. Routes to active tool: raycast, 16 px topology pick, vertex drag, and (later) texture paint. Pressure and tilt are forwarded. |
| **Touch** | One finger orbits; two fingers pinch and pan; two-finger tap undoes; three-finger tap redoes. No topology editing with fingers. |
| **Mouse** | LMB on a vertex selects/drags it. LMB drag on empty canvas or a face away from a handle orbits as a discoverable fallback for one-button/trackpad setups. Alt/Option+LMB orbits; Alt/Option+Shift+LMB pans; MMB orbits; Shift+MMB pans; wheel dollies. Direct editing still takes precedence when the pointer starts on a vertex. |

Finger topology editing is intentionally absent. The pen is the editing instrument; fingers are the navigation instrument.

### Touch gesture state machine

The recognizer is explicit rather than a pile of ad-hoc listeners.

```text
IDLE
  └─ one touch down → ONE_DOWN
ONE_DOWN
  ├─ movement > 3 px → ORBIT
  ├─ second touch down → TWO_DOWN
  └─ all up within 300 ms and ≤ 10 px → PENDING_2_TAP → undo
TWO_DOWN
  ├─ movement > 6 px or spread change → PINCH_PAN
  ├─ third touch down → THREE_DOWN
  └─ all up quickly without movement → two-finger tap candidate
THREE_DOWN
  └─ all up quickly without movement → three-finger tap candidate → redo
```

Implementation details:

- A gesture stores the maximum pointer count and max per-pointer movement. A tap only fires if every pointer stayed within the 10 px threshold and no pinch/orbit phase began.
- Suppress camera motion until the movement threshold is crossed; this prevents an orbit nudge while the user is forming a two-finger pinch.
- Two-finger tap and three-finger tap are recognized on pointer-up, once, with a small guard interval to prevent duplicate browser click events.
- Ignore synthesized mouse events after touch/pen input.
- Palm rejection: while an active pen pointer exists and for a short cooldown afterward (initial value 300 ms), ignore touch-driven camera gestures. Pen remains fully responsive. This rule lives in the router, not in UI components.
- One-finger touch taps can select the current topology element; a drag that starts on a handle/gizmo edits it, while a drag past the camera-start threshold on empty space switches to orbit. The sticky Add mode provides touch additive selection. Two-finger taps stay reserved for undo and three-finger taps for redo.
- Use `event.getCoalescedEvents()` for pen/mouse moves where supported; coalesce to one tool update per display frame at most and one document commit at gesture end.
- Cancel gestures on `pointercancel`, window blur, or context loss; restore preview state.
- Disable default browser panning/zooming via `touch-action: none` on the canvas and `overscroll-behavior: none` on the shell, not via global event hacks.
- Keyboard axis lock during a transform: X/Y/Z toggles lock, Shift+axis may be reserved later. Esc cancels; Enter commits. Touch receives equivalent on-screen chips.

### Cursor and HUD feedback

- The cursor changes with tool and hover state on fine pointers only.
- The iPad inspector is a non-modal sheet. It may overlay the lower viewport but must leave the upper viewport available for orbit/edit gestures and keep an accessible close action. It does not use a blocking scrim.
- A small HUD chip shows the active gesture mode (`Orbit`, `Pan`, `Zoom`) and axis lock state on touch/pen.
- Selection hover feedback is visible on pen only where a hover event exists; no functionality may require hover.
- Input diagnostics are available in development builds (last pointer type, pressure/tilt, gesture phase, pick result).

---

## 10. Screen-space picking

Picking is done in CSS-pixel space, not world space, so tolerance stays constant at any zoom.

```text
for each candidate (depending on select mode):
  project world position(s) with current viewProjection
  reject behind-camera / outside NDC depth range
  convert to CSS px
  distance:
    vertex → squared point distance to cursor
    edge   → point-to-segment distance
    face   → ray–triangle intersection (Three.Raycaster or bespoke)
  keep candidates within 16 px
choose by:
  1. active selection mode priority (vertex > edge > face)
  2. smallest screen distance
  3. nearest depth among ties, with self-occlusion handled
```

Rules:

- The threshold is **16 CSS px** for touch and pen. Mouse may use the same to keep a single behavior; if differentiated, it must be a documented setting, not an invisible inconsistency.
- Candidate projection data is cached per camera change and invalidated on orbit/resize/document change. Do not project every vertex on every pointer move if a pointer-down pick is enough.
- For occlusion, back-side elements should not win just because they project nearby. Use the evaluated render triangles as an occluder test for candidates, or a depth-tested GPU picking path if profiling shows the CPU test is too slow. The chosen method must share the same 16 px tolerance.
- A pick result is a typed reference:

```ts
type ElementRef =
  | { kind: 'vertex'; nodeId: string; index: number; source?: ElementRef }
  | { kind: 'edge'; nodeId: string; edgeIndex: number; source?: ElementRef }
  | { kind: 'face'; nodeId: string; faceIndex: number; source?: ElementRef };
```

- If a modifier produced the visible geometry, the returned ref points at evaluated geometry and carries the source ref for editing. Tools must either map to base or report that the operation is unavailable.
- Picking must remain stable while the camera moves; no feature may depend on rendered pixel colors.

---

## 11. Platform boundary (Tauri v2)

### Application configuration

- Product name and window title: `loupoli`.
- Identifier: `com.loupoli.studio` (does not end in `.app`, avoiding a macOS bundle-extension conflict).
- Minimum window on desktop: sufficiently large for the two-panel editor (planned 1024 × 700).
- Background color: `#121214` so launch does not flash white.
- Fixed Vite dev port with strict port enforcement for Tauri.
- CSP: self-only scripts; no external network resources. Inline styles are limited to what Svelte/Tauri require.
- Capabilities: only the dialog plugin and explicit app commands are exposed. There is no broad filesystem scope for arbitrary paths.
- iOS Info.plist integration for Documents/file sharing is validated against generated Tauri project files and documented in [PERSISTENCE.md](./PERSISTENCE.md).

### Rust commands

The Rust layer is deliberately thin:

- Native open/save dialogs.
- Read selected project bytes with size limits.
- Validate container magic/length/checksum before returning bytes.
- Atomic project write: temp file in destination directory, flush/sync, rename.
- App data/Documents path resolution.
- Native MP4 streaming on macOS/iOS: an Objective-C AVFoundation `AVAssetWriter` receives JPEG frames over Tauri raw IPC, one frame per command, and finalizes the H.264 container. The writer is compiled only for Apple targets; Windows/Linux report the capability as unavailable and use the WebView recorder or PNG frames.
- No geometry parsing, no document semantics, no autosave scheduling in Rust.

The TypeScript codec is authoritative for document format. Rust validates the container envelope and protects filesystem integrity.

### Browser development mode

`PlatformIO` has a browser implementation:

- Project open via file input; save via Blob download.
- No arbitrary path writing.
- Clearly reports unsupported native features in development.
- Ensures UI/geometry work does not require Tauri to iterate.

### Mobile build path

- `tauri ios init` after desktop foundation.
- Xcode workspace generated by Tauri; never hand-edit generated files without documenting the change.
- Rust targets and CocoaPods are prerequisites.
- Physical-device signing is configured in Xcode and excluded from git.
- App documents are accessible through Files/iMazing if the generated iOS project enables file sharing; test this on hardware.
- Do not rely on browser drag-and-drop or download attributes for iOS project I/O.

---

## 12. iOS memory and lifecycle rules

WKWebView can be killed without a graceful JS unload. The app must assume it can die at any time.

1. **No reactive proxies on large data.** Svelte state only holds IDs, small numeric summaries, and UI flags.
2. **Bound every cache.** History bytes, modifier meshes, picker projections, texture composites, and autosave pending deltas all have limits.
3. **Dispose explicitly.** Every `RenderMesh`, generated material, texture, and geometry has an owner and a `dispose()` path. Teardown is verified by `renderer.info`.
4. **Autosave early.** Every 30 seconds after a dirty command; additionally on `visibilitychange`/`pagehide` where the browser grants time. Recovery never assumes the process survived.
5. **Avoid base64 in memory.** Use Blobs or byte chunks for texture persistence; binary PNG chunks are the approved `.lpoli` representation. See [PHASE4_TEXTURING.md](./PHASE4_TEXTURING.md) for the texturing plan and [PERSISTENCE.md](./PERSISTENCE.md).
6. **Throttle DPR and texture dimensions.** Full Retina at arbitrary canvas size is not an entitlement.
7. **No perpetual timers.** Autosave interval is one timer; rendering only has rAF while invalidated. Clear both on teardown.
8. **Recover visibly.** If autosave data exists, present a recovery action; never silently replace newer user work.

The detailed autosave protocol and quotas live in [PERSISTENCE.md](./PERSISTENCE.md).

---

## 13. Error model and conventions

### Code conventions

- Strict TypeScript: no implicit `any`; use discriminated unions for topology/attribute variants.
- Every exported class and interface has a JSDoc block explaining its structural purpose.
- Non-obvious geometry math has inline comments describing the invariant being preserved.
- Every resource-owning class has `dispose()` and clears listeners/timers.
- Avoid `Object3D` mutation in Svelte components; route through renderer/editor APIs.
- No `cloneDeep` of documents in production paths.
- Prefer typed arrays and preallocated scratch vectors in hot loops.
- Radius, color, spacing, and typography values come from design tokens; no scattered magic values in components.
- Keep DOM event listeners `passive: true` where appropriate; use `preventDefault` only on surfaces where the app owns the gesture.

### Error boundaries

| Boundary | Handling |
|---|---|
| Import/codec | Validate magic, lengths, checksums, counts; reject with a readable error and leave the current project untouched. |
| Topology operation | Validate invariants inside a transaction; on failure, roll back and show a non-modal error. Never render a partially mutated mesh. |
| Modifier | Mark the modifier as failed with a reason; display the last valid evaluated result or bypass only if the UI communicates it. |
| Renderer | WebGL context loss: pause rendering, release derived GPU resources, attempt one restore, and inform the user. Document state remains untouched. |
| Platform I/O | Report permission/path errors without losing the document. Offer an alternate save path. |
| Autosave | Failure is surfaced quietly but persistently; do not claim “all changes saved.” |

### Performance rules

- No allocation in render draw, orbit updates, or pointer sampling after warm-up.
- No stringifying entire documents on the main thread during interaction.
- No full-scene graph traversals per input event.
- No timeline/preview loops unless explicitly playing or animating.
- Use feature detection for `OffscreenCanvas`, `getCoalescedEvents`, and WebGL extensions.

---

## 14. Deliberate deferrals

These are out of scope until a later phase is explicitly opened:

- Multiple WebGL contexts or a second Three.js renderer for gizmos/textures.
- Node/worker-based topology solving. Introduce workers only after profiling, with transferable typed arrays and a clear main-thread mutation boundary.
- CSG/boolean operations.
- Subdivision surfaces.
- PBR materials, shadows, post-processing, and anti-aliasing.
- Cloud sync, accounts, collaborative editing.
- Full plugin/modifier scripting API.
- Mobile Safari standalone web deployment. The target is Tauri.
