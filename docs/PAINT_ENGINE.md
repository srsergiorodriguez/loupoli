# Paint engine

## Purpose

The paint engine converts pointer input into one consistent raster stroke whether the user paints in the **Paint pane** or directly on the 3D model. Pane and projection painting must not have separate brush rules.

## Pipeline

```text
Paint pane:   CSS point -> texture point -> StrokeSampler -> GPU dabs
Projection:   screen point -> StrokeSampler -> screen brush mask
                         ↓
      evaluated mesh depth prepass (visible surface only)
                         ↓
  UV-space mesh raster samples the screen mask per texel
                         ↓
             texture-space coverage mask
                         ↓
  dirty-region layer composite -> pane canvas + 3D texture
```

### Brush presets and dynamics

Bundled presets set brush hardness, smoothing, spacing, noise, pressure response, tilt shaping, taper-in, and eraser/brush tool state. Pressure response is shared by radius, spacing, and optional opacity; minimum size floors the pressure response. Tilt shaping is an explicit toggle. Taper-in applies over a texture-pixel distance from the start of the stroke and is shared by pane and projection sampling.

### Brush size

In the Paint pane, Brush Size is a **texture-space diameter in texels, from 1 to 512**. Projection converts the local UV density under the first surface hit into a screen-space radius and holds that radius for the gesture, so a stroke crossing charts with different UV density remains continuous on screen. Zoom and surface orientation still change the resulting texel footprint.

### `StrokeSampler`

`StrokeSampler` owns:

- Arc-length dab spacing.
- Pressure and tilt interpolation along a segment.
- Pressure-adjusted radius and spacing.
- Optional pressure-opacity modulation (off by default).
- Jitter and noise.
- A single screen-space path for projected strokes, with no resets at UV or face boundaries.

Both adapters feed the same class. Pointer-event frequency must not change the visible stroke.

### GPU coverage surfaces

`GpuStampSurface` rasterizes pane brush tips through WebGL2:

- One cached GPU context.
- Instanced dab quads with hardness falloff.
- A coverage mask accumulated with MAX blending.
- Color and stroke opacity applied once when the mask is presented.
- Eraser strokes reuse the same mask and composite with destination-out.

`GpuProjectedPaintSurface` handles projected Brush and Eraser:

- Rasterizes dabs into a viewport-sized screen mask with MAX blending.
- Renders an encoded visible-surface depth prepass.
- Rasterizes the evaluated mesh in UV space with perspective-correct screen coordinates.
- Rejects texels behind the visible surface and samples the screen brush mask.
- Accumulates a texture-space coverage mask, colorized once per dirty rectangle.

Both masks are presented only in their dirty rectangles. The preview layer is rebuilt from the committed layer plus the current mask, so opacity is not double-applied.

### Layer compositing

`TextureAsset.refreshPreviewRegion()` rebuilds only the dirty rectangle for normal raster stacks. Effect and lighting layers that depend on the full accumulated image fall back to a full composite.

### Pencil interaction

Apple Pencil hover updates the brush footprint before contact. The Paint pane and projected 3D cursor use the same tilt aspect and angle as the stamp. Pencil pressure and tilt remain shared by pane and projected painting. Hardness is the only edge control: low values shrink the solid core and broaden the feather into an airbrush-like falloff, while soft brushes automatically tighten dab overlap so spacing does not appear to widen.

### Eyedropper

The Paint color popover has a one-shot Pick action for the primary and gradient secondary colors. It samples the composited texture at the clicked texel, ignores transparent texels, and leaves the color alpha unchanged. Esc or leaving the workspace cancels the armed pick.

### Image placement

Image import is previewed with an initial Contain/Cover/Stretch/Native fit, then placed directly in the Paint pane. Placement supports drag-to-move, uniform corner scaling, top-handle or two-finger rotation, two-finger pinch/translation, exact angle/opacity fields, and new-layer or raster-layer replacement. Fit is chosen in the import modal; blend is changed in the Inspector after commit. Commit is one undoable operation; cancel discards the bitmap preview.

### Input parity

Pane and projected painting share one pressure policy: pen pressure is clamped to 0.1–1 with a 0.5 fallback for a zero-pressure contact, while mouse and touch always use 1. Both paths use `StrokeSampler` and the same paint settings. Projected strokes use screen-space sampling so internal UV seams do not split the gesture.

### Opacity policy

- Color alpha and Brush Opacity are separate.
- New layers start at 100% opacity.
- Bucket fill uses color alpha only; it does not inherit Brush Opacity.
- Layer opacity is the final transparency control.

### Commit and undo

The stroke remains a scratch-layer transaction. On pointer-up, the existing localized `TexturePaintPatch` is captured; `.lpoli` and undo do not know which view produced the stroke.

## Invariants

1. Pane and projection share pressure, spacing, tilt, smoothing, taper, noise, and opacity policy.
2. Stroke opacity is applied once, not once per dab.
3. Only the dirty rectangle is composited and presented.
4. Projected paint crosses UV seams continuously, never paints hidden surfaces, and never spills into unrelated charts.
5. The pane and 3D view read the same composited texture.
6. CPU stamping remains only as a fallback for a failed WebGL context or for non-stroke shape tools.

## Tests

- `StrokeSampler.test.ts`: pressure-dependent density, pressure interpolation, and segment reset.
- `brush.test.ts`: fixed gradient/color behavior and pressure-aware stamp spacing.
- Texture-library tests continue to cover layer metadata and commands.
