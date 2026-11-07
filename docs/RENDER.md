# Render workspace and camera

**Status:** Camera and render foundation implemented. Scene cameras, camera-driven preview, virtual/output resolution, nearest/smooth upscaling, color-managed PNG stills, deterministic PNG frame sequences, and WebM/MP4 recording where the WebView supports the codec are implemented.

## Contents

1. [Camera](#1-camera)
2. [Render workspace](#2-render-workspace)
3. [Virtual resolution](#3-virtual-resolution)
4. [Still output](#4-still-output)
5. [Video and sequences](#5-video-and-sequences)
6. [Next](#6-next)

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

- Cameras are saved in `.lpoli`.
- The Camera Inspector uses the shared outliner list, with editable camera names, position, target, and a field-of-view slider.
- **Add from view** captures the current navigation camera.
- Editing the camera does not force the viewport back to the camera view. The Render workspace is a free camera-editing view with orbit, pan, zoom, the orientation gizmo, a camera marker/frustum, a camera list with editable names/FOV, and an always-open live render preview pane. **Through** is a toggle: it enters the camera view and hides camera handles; orbiting, panning, or zooming leaves it, shows the handles again, and returns to free editing. **Frame camera** frames the camera for free editing. Drag the camera body to move it, drag the target/arrow handle to re-aim it, or use the compact Camera Inspector action row: **Frame**, **From view**, and **Through/Exit**, with **Delete camera** isolated last/right.
- The camera frustum marker uses the virtual-resolution aspect, so changing the virtual width or height reshapes the camera rectangle immediately. The output dimensions do not reshape the camera: output is a delivery canvas for the same composition.
- Virtual and output aspect ratios can differ. Output preserves the virtual aspect and letterboxes or pillarboxes the remainder, using the render background or transparent pixels; it never stretches the frame. The live preview uses the same output-frame fitting.
- The render preview pane is always present in Render. It uses the shared PaneHost/PaneFrame, displays the live virtual-resolution frame through the active camera, and refreshes whenever the camera, scene, lighting, or animation pose changes. Its header shows virtual → output size and the current frame. The play/pause button runs the existing animation playback; the width is remembered separately from the UV split. There is no separate Preview action or floating portal.
- Camera animation tracks will be added with the animation timeline.

## 2. Render workspace

`Render` is a dedicated workspace after Light. It removes modeling chrome, keeping the grid only as a navigation aid in free camera editing; captures remain clean.

![Camera editing in the Render workspace](media/render-workspace.png)

![Live render preview in its docked pane](media/render-preview.png)

Inspector sections:

- **Scene**
- **Camera**
- **Render**

The render path is separate from the interactive viewport state:

- Clean scene: no grid, gizmos, selection overlays, handles, or light markers
- Explicit `PerspectiveCamera` built from the document camera
- Offscreen sRGB WebGL render target with camera/light/object helpers excluded
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

Rendered focus shadows are baked by the renderer's current light state; baked lighting remains a static-texture result. The offscreen target is sRGB so PNG, sequence, and video colors match the editor preview path.

## 5. Video and sequences

- **PNG frame sequence:** renders each frame at the exact animation time, upscales it, and saves a folder on native platforms or a ZIP in the browser. Verified with a 64×36 sequence and valid PNG entries.
- **WebM:** uses `MediaRecorder` on a canvas capture and is enabled only when the WebView reports support.
- **MP4:** also uses `MediaRecorder` when the WebView supports an MP4 codec; otherwise the UI omits it and points to WebM/frames. Native AVFoundation encoding remains the reliable path for iPad production.
- Video rendering is real-time driven by the animation FPS; it is not a production-grade offline encoder yet.
- PNG stills, sequences, WebM, and MP4 all use the same color-managed frame canvas.
- The Frame range is explicit and separate from the animation range.

## 6. Next

- Camera animation tracks
- Native iPad/macOS MP4 encoder
- Render progress/cancel UI and progress reporting

AO is bakeable into the lighting layer; the realtime Lit preview remains direct-light only.
