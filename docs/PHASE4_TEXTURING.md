# loupoli — Phase 4 Texturing Plan

**Status:** Phase 4 foundation in progress. UV seam authoring, overlay rendering, undo/autosave, `.lpoly` persistence, and a resizable UV split with linked corner selection, Move/Rotate/Scale drag, U/V locks, snap, and exact numeric entry are implemented. Two-way UV-to-3D linking, unwrap, texture layers, and projection painting remain.

**Goal:** a pen-native low-poly texturing workflow without leaving `loupoli`: mark seams, unwrap and edit UVs, build a layered texture, and paint directly on the model.

---

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
- Default texture size is **1024²**; hard maximum is **2048²**.
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
- 2D UV canvas with chart-agnostic corner selection, 16 CSS px tolerance, and linked 3D selection. **Implemented; 3D-to-UV sync is signature-driven, and Sync 3D is explicit.**
- Move UVs with U/V constraints and snap, undo/cancel. **Implemented: `MoveUvCornersCommand`, per-corner autosave patches, 0.25 default snap increment.**
- Rotate/scale UVs around the median and exact numeric entry. **Implemented; rotate snap is 15°, numeric values are exact and unsnapped.**
- UV overlays for selected corners/edges/faces and seam boundaries. **Implemented for seams, selected corners, and selected faces.**
- No unwrap yet; existing primitive UVs are editable immediately. **Implemented.**

### Slice 3 — Chart extraction and LSCM unwrap

- Build charts from seam edges and boundary loops.
- Implement a bespoke LSCM solver: no LSCM dependency.
- Handle pinned vertices, degenerate triangles, disconnected charts, and solver failure.
- Deterministic output for the same mesh, seams, pins, and solver settings.
- Commit the unwrap as one command with before/after per-corner UVs.
- Test charts: cube cross, cylinder wall, open grid, mirrored sphere quadrant.
- Surface failures explicitly; never write NaN or silently discard a chart.

### Slice 4 — Texture layer stack and format v2

- Layer add/delete/rename/reorder/visibility/opacity/blend.
- Composite cache: recompute only when a layer or composite changes; mutate the existing GPU texture.
- `.lpoly` format v2 with binary PNG chunks, per-layer metadata, CRC, size/limit validation, and v1 migration.
- Autosave texture journal separate from geometry, with explicit byte quotas and checkpoint compaction.
- Dispose layers, composites, textures, and OffscreenCanvas contexts on close/recovery.

### Slice 5 — 3D projection painting

- Raycast-to-UV stamp with pressure/tilt input.
- Brush size/opacity/flow and eraser.
- One command per stroke; undo restores the previous layer pixels (bounded by a stroke patch budget).
- No continuous loop; at most one scheduled frame per changed stroke step.
- Texture memory and paint history surfaced in the Inspector.

---

## 4. Format and autosave implications

`.lpoly` v1 is frozen. Phase 4 introduces v2 rather than silently changing v1 chunk meanings.

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
| Texture size | 1024² default, 2048² hard maximum |
| Layer count | 8 default maximum |
| One RGBA layer at 1024² | ~4 MB CPU + ~4 MB GPU |
| Composite at 1024² | ~4 MB CPU + ~4 MB GPU |
| Texture working budget | 96 MB across layers, composite, and upload staging |
| Geometry history | existing 32 MB / 100 commands |
| Texture history | separate bounded patch budget, target 24 MB |

The Inspector must warn before a layer addition would cross the working budget. The exact ceiling will be adjusted after physical iPad profiling.

---

## 6. Verification gates

1. Seam toggle is visible, undoable, serialized, and restored by autosave. **Implemented.**
2. UV corners can be selected and transformed without a continuous render loop.
3. Each test chart unwraps to finite, non-overlapping UVs or reports a specific failure.
4. UV edits and unwrap results round-trip through `.lpoly` v2.
5. Layer reorder/blend changes reuse the existing GPU texture allocation.
6. A texture-heavy project restores all layer pixels within the memory budget.
7. Paint strokes project to the intended face at multiple camera angles within tolerance.
8. Pen pressure/tilt change brush output and survive input diagnostics.
9. Idle WebGL frames remain zero throughout.
10. Dispose paths release all texture, composite, canvas, geometry, and material owners.

---

## 7. Risks and open questions

- **LSCM robustness:** bespoke solvers can produce flipped or overlapping charts. The implementation needs explicit chart validation and a clear failure UI, not an invisible fallback.
- **UV selection model:** corner-based selection is required for seams; face/vertex UV grouping must be defined before the UV transform UI ships.
- **Texture undo granularity:** whole-layer snapshots are too large. Stroke patches and layer-operation patches need separate budgets.
- **iOS profiling:** 2048² layers may be too expensive on older iPads. The default and cap remain provisional until hardware validation.
- **Format churn:** v2 must be additive and versioned; do not retrofit texture chunks into v1.
