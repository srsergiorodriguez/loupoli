# Phase 4 exit audit

**Status:** Conditional pass — feature-complete in browser/desktop development; two verification gates remain explicit deferrals.

**Date:** 2026-11-04  
**Scope:** [Master Plan Phase 4](./PLAN.md#phase-4--uv-editing-texture-layers-and-projection-painting) and the [Phase 4 texturing plan](./PHASE4_TEXTURING.md).

## Decision

Phase 4 is feature-complete. UV authoring, chart unwrap, texture layers, texture persistence, texture-space painting, and projected painting are implemented and covered by the test suite. The Phase 4 implementation work should stop here.

This is a **conditional exit**, not an unconditional device sign-off:

- The multi-angle projected-paint tolerance in Plan gate 3 has implementation evidence but no repeatable automated tolerance test.
- Plan gate 6’s iOS memory ceiling cannot be measured without the physical iPad/WKWebView pass.
- Dedicated texture pixel deltas remain a performance deferral; texture edits safely force a full v3 checkpoint.

These are tracked below. They do not block starting Phase 5A lighting; they do block calling Phase 4 a hardware-verified exit.

## Plan acceptance gates

| # | Gate | Result | Evidence / residual |
|---:|---|---|---|
| 1 | Seam marking changes the visible UV island boundary and is undoable | **Pass** | `SetEdgeSeamsCommand.test.ts`, UV chart tests, `.lpoly` seam round-trip. |
| 2 | LSCM produces finite, non-overlapping UVs or reports a specific failure | **Pass** | `lscm.test.ts` covers quad, seam-separated cube, pins, and closed-sphere rejection; `uvValidation.test.ts` covers overlap validation. |
| 3 | Projected paint produces comparable results at multiple camera angles within a defined tolerance | **Partial** | `beginProjectionPaint`, `PaintEngine.beginProjected`, per-face UV sampling, and prior runtime checks are in place. There is no repeatable two-angle tolerance test with a defined threshold. |
| 4 | Pen pressure/tilt materially change brush output and survive input diagnostics | **Pass** | Tilt shaping is in `paint/brush.ts`; pressure/tilt reach `PaintEngine`; `PointerReading` exposes both and the Status Bar displays them. |
| 5 | Layer reorder/blend changes do not reallocate WebGL textures when only pixels change | **Pass** | Runtime audit: changing layer opacity kept the same composite texture, asset texture, and lit material instances; `refreshTexture()` only schedules upload. |
| 6 | Texture-heavy project restores all layer pixels within the iOS memory ceiling | **Partial** | Added an eight-layer `.lpoly` round-trip test; PNG payloads, metadata, alpha mode, and filter restore. Physical memory/lifecycle is not measurable in browser/desktop audit. |
| 7 | UV and paint interactions never require a continuous render loop while idle | **Pass** | Runtime audit: render count stayed at `4` across a 3-second idle window and `hasScheduledFrame()` was false. |

## Additional Phase 4 plan gates

| Gate | Result | Evidence / residual |
|---|---|---|
| Seams visible, undoable, serialized, autosave-restored | **Pass** | Command/journal tests and v3 seam round-trip. |
| UV corners transform without a continuous loop | **Pass** | UV transforms use scheduled frames; idle render gate above covers the viewport. |
| Each test chart unwraps or reports failure | **Pass with residual fixtures** | Cube/quad/pins/closed-chart coverage exists; broader cylinder/grid fixture breadth is still a test-coverage improvement, not a known failure. |
| UV and unwrap round-trip through `.lpoly` | **Pass** | `ReplaceUvCommand` and lpoly UV columns/tests. |
| Layer reorder/blend reuse texture allocation | **Pass** | Runtime texture/material identity check. |
| Texture-heavy restore within memory budget | **Partial** | Eight-layer format round-trip passes; memory ceiling requires the deferred iPad pass. |
| Projected strokes hit the intended face | **Pass (single-angle/runtime)** | Surface picking and UV sampling implementation; multi-angle tolerance remains gate 3. |
| Pressure/tilt affect output and diagnostics | **Pass** | Paint brush and status-bar diagnostics. |
| Idle WebGL frames stay zero | **Pass** | Runtime audit: count stable at 4; no scheduled frame. |
| Dispose paths release texture/composite/canvas/geometry/material owners | **Pass by code inspection** | `TextureAsset.dispose`, `TextureLibrary.dispose/reset`, `ViewportRenderer.dispose`, and `MeshNodeView.dispose` cover owned resources. No automated leak-count assertion. |

## Accepted deferrals

1. **Dedicated texture pixel deltas** — current behavior is safe: texture edits mark autosave dirty and force a fresh v3 checkpoint with PNG chunks. Pending delta journaling is an optimization, not a correctness gap.
2. **Physical iPad/WKWebView memory and lifecycle validation** — blocked on target hardware. This includes the 96 MB texture working budget, 2048² behavior, and real WKWebView process-kill recovery.
3. **Multi-angle projected-paint tolerance** — implementation exists; add a repeatable visual/regression check with a documented pixel-distance threshold before claiming hardware-level acceptance.

## Exit actions completed

- Added eight-layer texture round-trip coverage.
- Verified idle render count is flat.
- Verified layer pixel changes reuse the composite texture/material.
- Confirmed pen diagnostics expose pressure and tilt.
- Confirmed no malformed or missing texture layer entries in the full-cap stack.
- Recorded the two remaining verification gaps and the texture-delta deferral.

## Recommended next step

Start **Phase 5A: editable lights**. Carry the three deferrals above as explicit Phase 4 follow-ups rather than reopening feature work.
