/** One documentation tab, with prose and a reference list of controls. */
export interface DocumentationPage {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly summary: string;
  readonly image: string;
  readonly alt: string;
  readonly sections: readonly {
    readonly heading: string;
    readonly paragraphs: readonly string[];
    readonly controls?: readonly string[];
  }[];
}

const APP_BASE = import.meta.env.BASE_URL;

/** Workspace documentation used by the application-bar reference dialog. */
export const DOCUMENTATION: readonly DocumentationPage[] = [
  {
    id: 'model',
    label: 'Model',
    title: 'Modeling',
    summary:
      'Model is the direct-edit workspace. Selection, transforms, one-shot topology tools, modifiers, and shape keys all act on the active editable mesh.',
    image: `${APP_BASE}documentation/model.png`,
    alt: 'Model workspace with a textured sample model, grid ground, Scene outliner, and vertex selection handles.',
    sections: [
      {
        heading: 'Selection',
        paragraphs: [
          'The vertex, edge, and face buttons choose selection granularity. A plain click replaces the element selection. Multi, Shift, Cmd, or Ctrl toggles subsequent picks; clicking a selected element removes it. Changing mode clears the element set, while object selection remains in the Scene outliner.',
          'The Loop toggle is available in Edge mode. Enabling it expands the current edge selection; it walks through connected quad edges, follows an open boundary, and stops at a pole or a non-quad junction. The same Edge mode supports marking seams for UV work.'
        ],
        controls: [
          'Vertex / Edge / Face icons: choose selection granularity',
          '1 / 2 / 3: keyboard selection-mode shortcuts',
          'Multi, Shift, Cmd, Ctrl: toggle selection',
          'Shift+Tab: toggle grid snapping',
          'X / Y / Z: lock a transform to a world axis'
        ]
      },
      {
        heading: 'Transforms and topology',
        paragraphs: [
          'The Move, Rotate, and Scale tools use the object transform when the element set is empty. With elements selected, the gizmo sits at the selection median and moves only those vertices. Typed values in Transform commit exact numbers; Enter confirms and Escape cancels a modal transform.',
          'Extrude and Inset are face operations available from the ActionDock. Bevel works on one selected interior edge; drag or type its world-space width. Loop Cut uses the first selected edge (or a selected edge loop) and splits the surrounding quad ring. Loop Slide moves the selected edge loop. Subdivide is an immediate linear split: selected faces are poked into triangles, or the whole mesh is split into quads when no face is selected. Per-face UVs, materials, and seams are preserved. These operations commit one validated mesh replacement and remain editable through undo.',
          'With modifiers active, direct vertex edits and topology operations target the base mesh. The stack re-evaluates after each commit, so the displayed surface and the editable base can differ. Each geometry modifier card has Apply modifier, which bakes that modifier into the base mesh. If enabled geometry modifiers sit above it, Apply through also bakes those so the remaining stack evaluates identically. Apply all bakes the whole enabled geometry stack. Render effects such as Outline stay live and are never baked. Shape keys and Mesh Motion block Apply because their indices depend on the current vertex count.'
        ],
        controls: [
          'G / R / S: move, rotate, or scale',
          'Pivot: Median or Object origin (shown with an element selection)',
          'Shift+Tab: toggle grid snapping',
          'E / I / L: extrude, inset, or loop cut',
          'Action Dock: Bevel one selected edge by dragging or typing an exact width; Subdivide splits the whole mesh',
          'Shift+L: loop slide\n          Deform: twist, bend, or taper the active mesh\n          Noise Displace: deterministic seeded normal displacement\n          Weld: merge vertices within a distance threshold',
          'F: frame the selection; Home: reset the view'
        ]
      },
      {
        heading: 'Screenshot notes',
        paragraphs: [
          'The screenshot shows the sample character on a separate grid plane. Vertex mode is active, and the white handles mark selectable vertices across the mesh. The Scene outliner lists the ground and the character as separate objects. The ActionDock is visible, with no topology operation armed.'
        ]
      }
    ]
  },
  {
    id: 'uv',
    label: 'UV',
    title: 'UV editing',
    summary:
      'UV holds per-corner texture coordinates. The UV pane edits the same object selection shown in the 3D viewport, so chart work stays linked to the mesh.',
    image: `${APP_BASE}documentation/uv.png`,
    alt: 'UV workspace with a sample texture atlas, UV charts, and the 3D viewport.',
    sections: [
      {
        heading: 'Seams and charts',
        paragraphs: [
          'UVs are stored per face corner. A seam cuts the corner fan along one edge, allowing the two sides of the surface to use separate coordinates. Seams define chart boundaries; Unwrap operates on the selected faces and their marked cuts.',
          'The 3D and UV selections are linked. Selecting a face in the viewport highlights its UV corners, and selecting UV corners updates the viewport selection. Switch to Island mode to work with one connected chart at a time.',
          'Unwrap uses seam charts and LSCM. If LSCM folds a branch chart, it retries a shape-preserving planar projection and then a rigid face net, so the UV layout keeps the cut and hole shape instead of collapsing it to a circle. Charts with holes can remain uncut when the planar fallback is valid; strongly curved holes may still need a seam cut. If a chart cannot be flattened, the error names its face range and highlights those faces in the 3D viewport.',
          'The optional Pixel art layout toggle adds texel-cell controls to the UV Inspector. Pack cells rotates each seam island in 90-degree steps, fits it into a uniform cell on the active texture grid, and snaps it to texel boundaries; Relax smooths interior UVs first. Use a larger cell or padding for pixel-art atlases. The normal unwrap and free UV editing workflow remains unchanged.'
        ],
        controls: [
          'Vertex / Edge / Face / Island icons: UV selection mode; 1 / 2 / 3 are the keyboard shortcuts',
          'Seam: mark or clear a chart boundary',
          'Unwrap: build charts from the selected faces and seams',
          'Pin / Unpin: hold one or two UV corners during unwrap'
        ]
      },
      {
        heading: 'Editing the layout',
        paragraphs: [
          'Fit frames the current charts in the pane. Drag selected corners, or use G, R, and S for move, rotate, and scale. U and V lock the transform to one texture axis. Clamp keeps direct transforms inside the 0–1 square; it is off by default because rotation can move a different corner outside first.',
          'Stack compares the topology of two islands and copies the active island layout when vertex, edge, face, and boundary counts match. It is useful for repeated shapes that need identical UV layouts. Mirror stack applies a reflected correspondence for symmetric albedo; the texture is intentionally mirrored on the copied island.'
        ],
        controls: [
          'Stack / Mirror stack: copy an island layout directly or with reflected correspondence',
          'G / R / S: move, rotate, or scale UV corners',
          'U / V: lock the U or V axis',
          'Shift: fine transform precision',
          'Fit: frame the UV layout'
        ]
      },
      {
        heading: 'Screenshot notes',
        paragraphs: [
          'The screenshot shows the UV pane filled with separate charts for the head, limbs, and torso. The 3D viewport and the UV pane share the same selection state. The footer reports the selected-corner count and the current U and V delta.'
        ]
      }
    ]
  },
  {
    id: 'paint',
    label: 'Paint',
    title: 'Texture painting',
    summary:
      'Paint edits the active texture layer. The texture pane shows the atlas, while the 3D viewport can project brush strokes onto the selected surface.',
    image: `${APP_BASE}documentation/paint.png`,
    alt: 'Paint workspace showing a sample atlas, Paint toolbar, and Brush inspector.',
    sections: [
      {
        heading: 'Assets and layers',
        paragraphs: [
          'A texture asset is a shared stack of layers. Each layer has a name, visibility, opacity, blend mode, and role: color, detail, or lighting. The active layer receives paint. Assets can be assigned to several objects, so a change to a shared atlas appears everywhere that asset is bound.',
          'New creates a texture from a square preset or a custom width and height. Custom sizes accept any proportion up to 4096 px and the texture pixel budget; Paint displays that aspect ratio. Texture mode samples the composite atlas. Paint uses the same atlas, which makes the texture pane, UV view, and 3D surface consistent. Layer pixels are authoritative; metadata changes and undo do not redraw them.'
        ],
        controls: [
          'Texture: choose the asset and active layer',
          'Add layer: solid, checker, transparent, or image',
          'Normal / Multiply / Screen: layer blend mode'
        ]
      },
      {
        heading: 'Painting',
        paragraphs: [
          'Brush, Eraser, Line, Rectangle, Ellipse, Gradient, and Fill operate on the active layer. Size, opacity, hardness, smoothing, noise, and shape fill live in Brush. The toolbar shows the active color, plus From and To side by side for gradients. Clicking a swatch opens an HSV picker with hue, hex, and alpha; alpha multiplies with brush opacity. The eye button toggles a read-only UV wireframe over the texture; it starts on, seams stay amber, and the overlay never intercepts paint input. The paint engine previews each gesture on a scratch layer and commits one undoable pixel patch when the pointer is released.',
          'Paint in the texture pane, or choose Brush or Eraser and paint on the 3D model. Projected strokes use the surface UV coordinates and stop at face boundaries, so paint does not jump between islands. Selecting another object while Paint is open switches the texture tools to that object\'s assigned texture. The viewport selection dock becomes a Paint variant with Face and Island modes; pick faces or a whole UV island there, then use Fill selected. In the texture pane, use the wheel to zoom and drag with the middle or right mouse button to pan. Over the 3D model, middle mouse or Alt orbits and right mouse or Space pans.'
        ],
        controls: [
          'Eye: show or hide the read-only UV overlay over the texture',
          'From / To: gradient endpoint colors and alpha',
          'B / E: brush or eraser in the toolbar',
          'Left drag: paint, or select with Face/Island active in the Paint selection dock; middle/right drag: pan the texture pane',
          'Wheel: zoom; MMB/Alt: orbit over the 3D model; Space: pan the 3D view',
          'Pen pressure and tilt: brush radius, opacity, and stamp shape'
        ]
      },
      {
        heading: 'Screenshot notes',
        paragraphs: [
          'The screenshot shows the texture atlas in the Paint pane with Brush selected. The Brush inspector exposes size, opacity, hardness, smoothing, and noise, while the top toolbar holds the tool picker and quick controls. The 3D viewport remains visible beside the texture.'
        ]
      }
    ]
  },
  {
    id: 'light',
    label: 'Light',
    title: 'Lighting',
    summary:
      'Light owns the document light rig. Directional and point lights drive the Lit viewport and the direct-light texture bake.',
    image: `${APP_BASE}documentation/light.png`,
    alt: 'Light workspace with sun and fill markers, a ground shadow, and the Lighting inspector.',
    sections: [
      {
        heading: 'Lights and markers',
        paragraphs: [
          'A directional light has a position marker and a direction arrow. The position is an editor anchor; the arrow direction defines the incoming light. A point light uses its marker position directly. Select a light in the Lighting list or click its marker to edit Color, Intensity, Cast shadows, and Shadow softness.',
          'Lit mode applies the document lights to the shaded viewport. Ambient color and intensity fill the unlit parts of the surface. Hard and soft shadows are available in Lit rendering; the same light state is used by the bake. Camera and light animation are edited from the optional top-bar timeline in Light and Render.'
        ],
        controls: [
          'Add light: directional or point',
          'Drag body: move the light; drag arrow tip: aim a directional light',
          'Cast shadows: enable the light shadow in Lit and bake',
          'Shadow softness: widen the sampled light source'
        ]
      },
      {
        heading: 'Baking',
        paragraphs: [
          'Bake lighting writes direct light and shadows into a multiply layer on the active texture. If the active object has overlapping UV islands, Bake offers a confirmed Prepare bake atlas step: it creates a duplicate object with a unique shelf-packed UV layout and a resampled texture, hides the original, and keeps the original object and texture for recovery. The copy and its lighting layer are created in one action. Existing non-overlapping UV layers are preserved, whole-island packing and a four-pixel bleed protect island edges, and symmetric painting ends on the duplicate. Bake normals follow authored winding on concave surfaces instead of a per-face center test. Ambient occlusion is previewed per face corner in Lit and baked per texel into the same result. The result is a normal texture layer, so it can be previewed in Texture, edited in Paint, and removed with undo. Selected textured objects can also be packed into one shared atlas with Merge textures; each texture is flattened, UVs are repacked, and the objects are rebound in one undoable transaction.',
          'If several objects share the texture, the bake creates a copy for the active object before adding the lighting layer. Other objects keep their original asset.'
        ],
        controls: [
          'Bake lighting: direct diffuse light plus shadows',
          'Prepare and bake copy: unique UV layers, resized texture, and lighting',
          'Intensity: light energy; higher values brighten the Lit surface',
          'Ambient: unshadowed fill for the document'
        ]
      },
      {
        heading: 'Screenshot notes',
        paragraphs: [
          'The screenshot shows two directional lights, Sun and Fill, in the Lighting list. The ground receives the character shadow. The Lit viewport reflects the document light state, and the selected Sun exposes its color, intensity, position, and direction fields.'
        ]
      }
    ]
  },
  {
    id: 'animate',
    label: 'Animate',
    title: 'Animation',
    summary:
      'Animate adds transform tracks and shape-weight tracks to the document. A key stores a value at a whole frame; playback evaluates the tracks without changing the rest transforms.',
    image: `${APP_BASE}documentation/animate.png`,
    alt: 'Animate workspace with a sample model, shape-key track, timeline, and Animation inspector.',
    sections: [
      {
        heading: 'Tracks and keys',
        paragraphs: [
          'The timeline shows one transform row for the active object or group and one weight row for each shape key. Move the playhead to a whole frame, change the transform or weight, then use + Key on the row. A key stores the visible pose at that frame.',
          'Diamonds can be dragged between whole frames and selected for interpolation editing. Linear blends between values; Step holds the previous value until the next key. Delete removes the selected key. The Clip section controls the clip name, FPS, start and end frames, looping, and the default interpolation for new keys. The Object animation section controls Mesh motion, Texture, and Shape keys for the active object. Modulators have their own collapsed section. Camera and light animation use the same clip timeline. In Light and Render, the timeline is hidden by default and can be opened from the top-bar Timeline button; Animate always shows it.',
          'Modulators add procedural motion on top of the keyed pose: LFO waves and BPM-synced square pulses, deterministic noise, audio-peak envelope following, and camera orbit around a pivot. Each modulator targets an object, camera, or light and can add to or replace the keyed/rest value. Modulators appear as timeline rows and in the Animate inspector; they persist with the clip and are evaluated during playback, stills, and video export. Add audio imports one audio file for the active clip. The waveform lane follows the clip range, starts and stops with playback, and offers mute and remove controls. Audio assets are stored in the project. Browser WebM/MP4 recording and native Apple MP4 export mux the active clip audio; PNG stills and frame sequences are silent.'
        ],
        controls: [
          'Play / pause: transport buttons',
          'Wheel: pan the timeline; Ctrl/Cmd + wheel: zoom',
          'Delete key: remove the selected diamond',
          'Interpolation: Linear or Step on the selected key',
          'Add modulator: LFO, Noise, Audio envelope, or Orbit in the Modulators inspector\n          Add / Replace audio: timeline clip bar; mute or remove it on the waveform lane'
        ]
      },
      {
        heading: 'Shape keys',
        paragraphs: [
          'A shape key stores a complete target position set for one mesh. Add shape key creates a key at zero weight. Edit target captures a live edited mesh into that key and restores the base when you Finish. Capture current mesh stores the current edited base as the target.',
          'Weight blends the target positions into the evaluated mesh. Shape keys evaluate beneath modifiers. The Shape keys block inside Object animation provides rename, visibility, drag reorder, weight, Key weight, Edit target, Capture current mesh, and Delete controls. Key weight writes the current weight at the playhead; the timeline still owns key selection, deletion, dragging, and interpolation.'
        ],
        controls: [
          'Add shape key: create a zero-weight target',
          'Edit target: edit the target directly, then Finish',
          'Key weight: store the current weight at the playhead',
          'Capture current mesh: capture the current base mesh',
          '+ Key on a shape row: also stores the weight at the frame'
        ]
      },
      {
        heading: 'Screenshot notes',
        paragraphs: [
          'The screenshot shows the timeline with the object transform row and a shape-weight row for an empty shape key. The playhead is at the first frame, and the tracked values are visible without a selected key.'
        ]
      }
    ]
  },
  {
    id: 'render',
    label: 'Render',
    title: 'Rendering',
    summary:
      'Render composes a clean image through a saved scene camera. The viewport is a free camera-editing view; the camera and output settings define the capture.',
    image: `${APP_BASE}documentation/render.png`,
    alt: 'Render workspace with a sample model framed by the camera and Camera and Render inspector sections.',
    sections: [
      {
        heading: 'Cameras and view',
        paragraphs: [
          'Cameras store a name, position, target, and field of view. Add from view creates one from the current navigation camera. Frame places the camera marker and target in view; From view replaces its position, target, and FOV with the current navigation camera.',
          'Through looks through the active camera and hides its handles. Orbiting, panning, or zooming leaves that view and restores the handles. Captures never include the grid, camera markers, light markers, selection overlays, or edit handles.'
        ],
        controls: [
          'Frame: frame the active camera in free editing',
          'From view: update the camera from the viewport',
          'Through: toggle camera view; navigation returns to free editing',
          'FOV: set the perspective field of view'
        ]
      },
      {
        heading: 'Output',
        paragraphs: [
          'Virtual resolution is the internal render size and defines the camera frame; the camera frustum marker follows its aspect. Output resolution is the saved image size. Upscale chooses nearest or smooth sampling between them. If the two aspect ratios differ, the virtual frame is letterboxed or pillarboxed into the output, with background or transparent bars, never stretched. Shading selects Lit, Texture, or Solid; the background can be transparent or a solid color. Final shadows chooses PCF for a fast final image, Ray traced for offline per-light direct shadows on animated scenes, or Baked for existing static lighting textures. The live preview always uses PCF so it stays responsive; the selected final mode applies to stills, frame sequences, and video exports.',
          'The docked preview pane is always visible and updates live through the active camera whenever the camera, scene, lighting, or animation pose changes. Play and Pause run the existing animation playback without leaving Render. Render PNG writes one still. Render frames writes a PNG sequence. Render WebM appears when the WebView supports it. Render MP4 is native on macOS/iPad and uses the WebView recorder when the browser advertises MP4 support; browser video first renders the frame range, then encodes it, so the progress strip shows rendering and encoding phases. PNG stills, sequences, and video frames use the same color-managed frame path. Rendered output uses the evaluated modifier geometry and the assigned texture, and excludes editor helpers.'
        ],
        controls: [
          'Output kind: still, frame sequence, WebM, or MP4. Long exports and bakes show progress in the global strip and can be cancelled. MP4 is native on macOS/iPad; other platforms use the WebView recorder when available. Video export is silent; audio is not part of the project timeline.',
          'Virtual width / height: internal render size',
          'Output width / height: saved image size',
          'Play/Pause: run the animation in the live preview',
          'Virtual size: camera frame aspect; Output size: delivery canvas with letterboxing when aspects differ',
          'Upscale: nearest or smooth; Shading: Lit, Texture, or Solid; Final shadows: PCF, Ray traced, or Baked'
        ]
      },
      {
        heading: 'Screenshot notes',
        paragraphs: [
          'The screenshot shows the active camera around the sample character and its ground. The camera frustum and target handles are visible in free editing, the docked preview pane holds the live render, and the Camera and Render sections hold the composition and output controls.'
        ]
      }
    ]
  }
] as const;
