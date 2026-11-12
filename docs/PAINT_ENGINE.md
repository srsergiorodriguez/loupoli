# Paint engine

## Purpose

The paint engine converts pointer input into one consistent raster stroke whether the user paints in the **Paint pane** or directly on the 3D model. Pane and projection painting must not have separate brush rules.

## Pipeline

```text
Paint pane:   CSS point -> texture point
Projection:   screen ray -> surface UV -> texture point
                         ↓
                 StrokeSampler
                         ↓
            GPU coverage-mask dabs
                         ↓
       dirty-region layer composite
                         ↓
             pane canvas + 3D texture
```

### `StrokeSampler`

`StrokeSampler` owns:

- Arc-length dab spacing.
- Pressure and tilt interpolation along a segment.
- Pressure-adjusted radius and capped dab density.
- Jitter and noise.
- Continuity resets at UV/face boundaries.

Both adapters feed the same class. Pointer-event frequency must not change the visible stroke.

### GPU coverage surface

`GpuStampSurface` rasterizes brush tips through WebGL2:

- One cached GPU context.
- Instanced dab quads with hardness falloff.
- A coverage mask accumulated with premultiplied source-over.
- Color and stroke opacity applied once when the mask is presented.
- Eraser strokes reuse the same mask and composite with destination-out.

The mask is presented only in the dirty rectangle. The preview layer is rebuilt from the committed layer plus the current mask, so opacity is not double-applied.

### Layer compositing

`TextureAsset.refreshPreviewRegion()` rebuilds only the dirty rectangle for normal raster stacks. Effect and lighting layers that depend on the full accumulated image fall back to a full composite.

### Commit and undo

The stroke remains a scratch-layer transaction. On pointer-up, the existing localized `TexturePaintPatch` is captured; `.lpoli` and undo do not know which view produced the stroke.

## Invariants

1. The same texture-space sample sequence must produce the same dabs in the pane and projection paths.
2. Stroke opacity is applied once, not once per dab.
3. Only the dirty rectangle is composited and presented.
4. Projection never crosses a UV island or face discontinuity.
5. The pane and 3D view read the same composited texture.
6. CPU stamping remains only as a fallback for a failed WebGL context or for non-stroke shape tools.

## Tests

- `StrokeSampler.test.ts`: pressure-dependent density, pressure interpolation, and segment reset.
- `brush.test.ts`: fixed gradient/color behavior and pressure-aware stamp spacing.
- Texture-library tests continue to cover layer metadata and commands.
