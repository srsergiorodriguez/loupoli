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

### Brush presets and dynamics

Bundled presets set brush hardness, smoothing, spacing, noise, pressure response, tilt shaping, taper-in, and eraser/brush tool state. Pressure response is shared by radius, spacing, and optional opacity; minimum size floors the pressure response. Tilt shaping is an explicit toggle. Taper-in applies over a texture-pixel distance from the start of the stroke and is shared by pane and projection sampling.

### Brush size

Brush Size is a **texture-space diameter in texels**, shared by the Paint pane and projected painting. Zoom and surface orientation change the on-screen outline, not the resulting texture dab size.

### `StrokeSampler`

`StrokeSampler` owns:

- Arc-length dab spacing.
- Pressure and tilt interpolation along a segment.
- Pressure-adjusted radius and spacing.
- Optional pressure-opacity modulation (off by default).
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

### Image placement

Image import is previewed with an initial Contain/Cover/Stretch/Native fit, then placed directly in the Paint pane. Placement supports drag-to-move, uniform corner scaling, top-handle or two-finger rotation, two-finger pinch/translation, exact angle/opacity fields, blend selection, and new-layer or raster-layer replacement. Commit is one undoable operation; cancel discards the bitmap preview.

### Input parity

Pane and projected painting share one pressure policy: pen pressure is clamped to 0.1–1 with a 0.5 fallback for a zero-pressure contact, while mouse and touch always use 1. Both paths feed the same texture-space `PaintEngine` and `StrokeSampler`.

### Opacity policy

- Color alpha and Brush Opacity are separate.
- New layers start at 100% opacity.
- Bucket fill uses color alpha only; it does not inherit Brush Opacity.
- Layer opacity is the final transparency control.

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
