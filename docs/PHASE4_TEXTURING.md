# loupoli — Phase 4 Texturing Plan

**Status:** Phase 4 feature-complete; **conditional exit** pending the deferred multi-angle and physical-iPad verification recorded in the [Phase 4 exit audit](./PHASE4_AUDIT.md). UV editing, seam/LSCM unwrap, texture layers, raster painting, projected brush/shape/gradient/fill painting, tilt shaping, v4 persistence, and v4 autosave checkpoints are implemented.

**Goal:** a pen-native low-poly texturing workflow without leaving `loupoli`: mark seams, unwrap and edit UVs, build a layered texture, and paint directly on the model.

## Contents

1. [Ground truth already in place](#1-ground-truth-already-in-place)
2. [Data and ownership rules](#2-data-and-ownership-rules)
3. [Delivery slices](#3-delivery-slices)
4. [Format and autosave implications](#4-format-and-autosave-implications)
5. [Memory budget](#5-memory-budget)
6. [Verification gates](#6-verification-gates)
7. [Risks and open questions](#7-risks-and-open-questions)


## 1. Ground truth already in place

- The DCEL stores per-corner UVs (`heUv`) and 8-bit edge flags.
- `.lpoly` v1 already serializes `heUv` and `edgeFlags`; seam bits round-trip.
- Seam bit `0` (`EDGE_SEAM`) is owned by seam authoring. Other bits stay reserved.
- Seam toggles are local `SetEdgeSeamsCommand` operations with per-edge autosave patches.
- The viewport renders marked seams as an amber overlay independently of the shading mode, including on modifier-evaluated copies via provenance.
- There is still one WebGL2 renderer and one on-demand render scheduler. Phase 4 must not add a second renderer.

---

## 2. Data and ownership rules

### Seams

- A seam is an undirected DCEL edge flag, not a duplicated vertex.
- Marking/clearing a seam never changes topology or render triangle count.
- Topology operations that rebuild the DCEL may drop seam flags; the resulting command must report that seam assignments were reset, not silently pretend they survived.
- Future chart extraction consumes seam-marked edges plus open boundary loops.

### UVs

- UVs remain per half-edge corner so one topological vertex can carry different coordinates on either side of a seam.
- UV edits are localized commands over corner indices and before/after `Vec2` values.
- UV selection is a session-only set, just like 3D element selection. It never enters undo history.
- The UV view uses the same 16 CSS px selection tolerance and 44 px tool targets. **Move/rotate/scale and exact numeric fields implemented.**
- UV transforms must support axis constraints, numeric entry, snap, undo, and cancel, reusing the transform interaction model where practical.

### Texture layers

- Each layer owns an `OffscreenCanvas` 2D context, optional PNG backing bytes, metadata, and a CPU dirty flag.
- Layer order is bottom-to-top; each layer has visibility, opacity, blend mode, name, and a stable ID.
- Default texture size is **512²** per asset, with 64–2048 presets; hard maximum is **2048²**.
- Default layer limit is **8**; the Inspector surfaces the remaining budget before adding a layer.
- Layer dimensions are fixed for a project. Changing the project texture size requires an explicit, undoable resample.
- The viewport uploads one composite `CanvasTexture`, not one texture per layer.
- OffscreenCanvas is required by the iPadOS 16.4 baseline. A canvas-2D fallback may exist for development but is not a second rendering path.
- No base64 PNG or layer pixels are retained as strings.

### Painting

- A paint stroke is collected in layer space, then committed as one undoable command on pointer-up.
- Pen pressure controls size/flow/opacity falloff; tilt shapes the stamp.
- The stroke is raycast to a render triangle, mapped through the DCEL face and per-corner UVs, and written to the active layer.
- Painting must not continuously render while idle. Stroke updates schedule frames only when pixels change.
- Finger touch remains navigation; Pencil and mouse paint.

---

## 3. Delivery slices

### Slice 1 — Seam authoring foundation (implemented)

- `EDGE_SEAM` flag API, seam overlay, Inspector toggle, command, journal patches, tests.
- Seam bits already round-trip through `.lpoly`.

### Slice 2 — UV viewport and UV transforms (implemented)

- Resizable 3D/UV split with one renderer and one scheduler. **Implemented.**
- 2D UV canvas with chart-agnostic corner selection, 16 CSS px tolerance, and linked 3D selection. **Implemented both ways: 3D-to-UV sync is signature-driven, Sync 3D is explicit, and a UV pick highlights the owning 3D faces without expanding the UV set.**
- Move UVs with U/V constraints and snap, undo/cancel. **Implemented: `MoveUvCornersCommand`, per-corner autosave patches, 0.25 default snap increment.**
- Rotate/scale UVs around the median and exact numeric entry. **Implemented; rotate snap is 15°, numeric values are exact and unsnapped.**
- UV overlays for selected corners/edges/faces and seam boundaries. **Implemented for seams, selected corners, and selected faces.**
- Existing primitive UVs are editable immediately, and seam-chart unwrap is implemented.

### Slice 3 — Chart extraction and LSCM unwrap (first pass implemented)

- Build charts from seam edges and boundary loops. **Implemented by `extractUvCharts`.**
- Implement a bespoke LSCM solver: no LSCM dependency. **Implemented with sparse triangle gradients and conjugate-gradient normal equations.**
- Handle pinned vertices, degenerate triangles, disconnected charts, and solver failure. **Two selected corners pin the chart; automatic farthest boundary pair otherwise. Degenerate/zero-area/flipped/overlapping charts fail explicitly.**
- Deterministic output for the same mesh, seams, pins, and solver settings. **Deterministic chart order, pins, and shelf packing.**
- Commit the unwrap as one command with before/after per-corner UVs. **Implemented with `ReplaceUvCommand` and a `replace-uv` autosave patch.**
- Test charts: cube cross, cylinder wall, open grid, mirrored sphere quadrant. **Quad, seam-separated cube, and closed-chart rejection tests are present; broader fixtures pending.**
- Surface failures explicitly; never write NaN or silently discard a chart. **Closed charts, non-finite results, zero-area triangles, and mixed winding fail before applying.**
- Two-corner pins and full triangle-overlap rejection are implemented; broader chart fixtures and pin editing remain open.

### Slice 4 — Texture layer stack and format v4 (implemented)

- Layer add/delete/reorder/visibility/opacity/rename. **Implemented.**
- Normal/Multiply/Screen blend modes. **Implemented and persisted in v2.**
- Color fills and active-layer selection. **Implemented, including raster layers.**
- Composite cache: recompute only when a layer or composite changes; one GPU texture. **Implemented. Layer canvases are OffscreenCanvas; the composite is a single HTML canvas wrapped in one CanvasTexture.**
- `.lpoly` format v2 with binary PNG chunks, per-layer metadata, CRC, size/limit validation, and v1 migration. **Implemented for manual save/open; v1 decode retained.**
- Autosave texture journal separate from geometry, with explicit byte quotas and checkpoint compaction. **Implemented as a fresh v4 checkpoint when texture pixels change; dedicated texture-only pixel deltas are a documented performance deferral.**
- Dispose layers, composites, textures, and OffscreenCanvas contexts on close/recovery. **Dispose path exists; project load resets the session stack.**

### Slice 5 — 3D projection painting (Brush/Eraser implemented)

- Raycast-to-UV stamp with pressure/tilt input. **UV-canvas and 3D projected Brush/Eraser, line, rectangle, ellipse, gradient, and UV-island fill are implemented; tilt shapes stamps.**
- Brush size/opacity/flow and eraser. **Size/opacity/color and eraser are implemented; flow remains.**
- One command per stroke; undo restores the previous layer pixels (bounded by a stroke patch budget).
- No continuous loop; at most one scheduled frame per changed stroke step.
- Texture memory and paint history surfaced in the Inspector.

---

## 4. Format and autosave implications

`.lpoly` v1 is frozen. Phase 4 introduces v2 rather than silently changing v1 chunk meanings. v1 files remain readable; manual save writes v2 with texture chunks.

Planned v2 additions:

- Texture-set metadata: dimensions, layer count, active layer, blend/opacity/visibility/order.
- Binary PNG chunk per layer, aligned and CRC-checked.
- A manifest size cap and per-chunk cap before allocation.
- Migration: v1 projects open with no texture set; saving writes v2 only when texture data exists.

Autosave stores geometry and texture transitions separately. Texture journal entries reference layer IDs and bounded PNG or pixel patches; the journal must never append a full composite per stroke.

---

## 5. Memory budget

Initial targets, to be confirmed on hardware:

| Item | Budget |
|---|---|
| Texture size | 512² default, 2048² hard maximum |
| Layer count | 8 default maximum |
| One RGBA layer at 1024² | ~4 MB CPU + ~4 MB GPU |
| Composite at 1024² | ~4 MB CPU + ~4 MB GPU |
| Texture working budget | 96 MB across layers, composite, and upload staging |
| Geometry history | existing 32 MB / 100 commands |
| Texture history | separate bounded patch budget, target 24 MB |

The Inspector must warn before a layer addition would cross the working budget. The exact ceiling will be adjusted after physical iPad profiling.

---

## 6. Verification gates

Gate-by-gate evidence and residual deferrals live in the [Phase 4 exit audit](./PHASE4_AUDIT.md). Current result: **conditional pass**.

- Functional/texture/seam/LSCM/idle gates: pass in browser/desktop development.
- Eight-layer format round-trip: pass.
- Multi-angle projected-paint tolerance: partial; implementation verified, repeatable threshold test deferred.
- Physical iPad memory/lifecycle: deferred to hardware validation.
- Dedicated texture pixel deltas: accepted performance deferral.

## 7. Risks and open questions

- **LSCM robustness:** bespoke solvers can produce flipped or overlapping charts. The implementation needs explicit chart validation and a clear failure UI, not an invisible fallback.
- **UV selection model:** corner-based selection is required for seams; face/vertex UV grouping must be defined before the UV transform UI ships.
- **Texture undo granularity:** whole-layer snapshots are too large. Stroke patches and layer-operation patches need separate budgets.
- **iOS profiling:** 2048² layers may be too expensive on older iPads. The default and cap remain provisional until hardware validation.
- **Format churn:** v2 must be additive and versioned; do not retrofit texture chunks into v1.
