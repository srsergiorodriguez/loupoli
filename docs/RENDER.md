# Render workspace and camera

**Status:** Foundation implemented. Scene cameras, camera-driven preview, virtual/output resolution, nearest/smooth upscaling, and a clean PNG still render are implemented. Frame sequences and WebM/MP4 video are the next Render milestones.

## Contents

1. [Camera](#1-camera)
2. [Render workspace](#2-render-workspace)
3. [Virtual resolution](#3-virtual-resolution)
4. [Still output](#4-still-output)
5. [Next](#5-next)

## 1. Camera

Cameras are document objects, not session state:

```ts
interface CameraSnapshot {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}
```

- Cameras are saved in `.lpoly`.
- The Camera Inspector lists cameras and exposes name, position, target, and field of view.
- **Add from view** captures the current navigation camera.
- The Render workspace looks through the active camera; navigation controls are locked there so the composition preview matches the output.
- Camera animation tracks will be added with the animation timeline.

## 2. Render workspace

`Render` is a dedicated workspace after Light. It removes modeling chrome and the grid, leaving a camera-composition view.

![Render workspace](media/render-workspace.png)

Inspector sections:

- **Scene**
- **Camera**
- **Render**
- **Controls**

The render path is separate from the interactive viewport state:

- Clean scene: no grid, gizmos, selection overlays, handles, or light markers
- Explicit `PerspectiveCamera` built from the document camera
- Offscreen WebGL render target
- Still render through the active camera
- The viewport is restored after rendering

## 3. Virtual resolution

Virtual resolution is the internal render size; output resolution is the saved image size.

```text
render target: 320 × 180
output:       1280 × 720
upscale:      4× nearest
```

- Explicit virtual width/height and output width/height
- Nearest-neighbor or smooth upscaling
- Render size is independent of viewport CSS size and device pixel ratio
- Output can equal virtual resolution
- Transparent PNG background or a solid color
- Shading: Lit with realtime shadows, Texture/baked, or Solid

## 4. Still output

The still path:

1. Capture the active camera.
2. Render a clean frame at virtual resolution.
3. Flip readback into `ImageData` order.
4. Upscale into the output canvas.
5. Encode PNG.
6. Save through the native dialog or browser download.

Rendered focus shadows are baked by the renderer's current light state; baked lighting remains a static-texture result.

## 5. Next

- Animation workspace and timeline
- PNG frame sequence
- WebM where `MediaRecorder` is available
- MP4 through a platform encoder, with capability detection
- Animation frame-range rendering

AO remains deferred. Hard/soft shadows are already bakeable.
