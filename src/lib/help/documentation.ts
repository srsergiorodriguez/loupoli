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

/** Workspace documentation used by the application-bar reference dialog. */
export const DOCUMENTATION: readonly DocumentationPage[] = [
  {
    id: 'model',
    label: 'Model',
    title: 'Modeling',
    summary:
      'Model is the direct-edit workspace. Selection, transforms, one-shot topology tools, modifiers, and shape keys all act on the active editable mesh.',
    image: '/documentation/model.png',
    alt: 'Model workspace with a textured sample model, grid ground, Scene outliner, and vertex selection handles.',
    sections: [
      {
        heading: 'Selection',
        paragraphs: [
          'The V, E, and F buttons choose vertex, edge, or face selection. A plain click replaces the element selection. Add, Shift, Cmd, or Ctrl extends it; Sub removes elements. Changing mode clears the element set, while object selection remains in the Scene outliner.',
          'The Loop toggle is available in Edge mode. Enabling it expands the current edge selection; it walks through connected quad edges, follows an open boundary, and stops at a pole or a non-quad junction. The same Edge mode supports marking seams for UV work.'
        ],
        controls: [
          'V / E / F: vertex, edge, or face mode',
          'Add, Sub, Shift, Cmd, Ctrl: selection combination',
          'X / Y / Z: lock a transform to a world axis'
        ]
      },
      {
        heading: 'Transforms and topology',
        paragraphs: [
          'The Move, Rotate, and Scale tools use the object transform when the element set is empty. With elements selected, the gizmo sits at the selection median and moves only those vertices. Typed values in Transform commit exact numbers; Enter confirms and Escape cancels a modal transform.',
          'Extrude and Inset are face operations available from the ActionDock. Loop Cut uses the first selected edge (or a selected edge loop) and splits the surrounding quad ring. Loop Slide moves the selected edge loop. These operations commit one validated mesh replacement and remain editable through undo.',
          'With modifiers active, direct vertex edits and topology operations target the base mesh. The stack re-evaluates after each commit, so the displayed surface and the editable base can differ. Apply modifiers bakes the enabled stack into the base mesh; this is the way to edit Mirror-generated seam geometry. Shape keys and Mesh Motion block Apply because their indices depend on the current vertex count.'
        ],
        controls: [
          'G / R / S: move, rotate, or scale',
          'E / I / L: extrude, inset, or loop cut',
          'Shift+L: loop slide',
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
    image: '/documentation/uv.png',
    alt: 'UV workspace with a sample texture atlas, UV charts, and the 3D viewport.',
    sections: [
      {
        heading: 'Seams and charts',
        paragraphs: [
          'UVs are stored per face corner. A seam cuts the corner fan along one edge, allowing the two sides of the surface to use separate coordinates. Seams define chart boundaries; Unwrap operates on the selected faces and their marked cuts.',
          'The 3D and UV selections are linked. Selecting a face in the viewport highlights its UV corners, and selecting UV corners updates the viewport selection. Switch to Island mode to work with one connected chart at a time.'
        ],
        controls: [
          'V / E / F / Island: UV selection mode',
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
    image: '/documentation/paint.png',
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
          'Paint in the texture pane, or choose Brush or Eraser and paint on the 3D model. Projected strokes use the surface UV coordinates and stop at face boundaries, so paint does not jump between islands. In the texture pane, use the wheel to zoom and drag with the middle or right mouse button to pan. Over the 3D model, middle mouse or Alt orbits and right mouse or Space pans.'
        ],
        controls: [
          'Eye: show or hide the read-only UV overlay over the texture',
          'From / To: gradient endpoint colors and alpha',
          'B / E: brush or eraser in the toolbar',
          'Left drag: paint or select; middle/right drag: pan the texture pane',
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
    image: '/documentation/light.png',
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
          'Bake lighting writes direct light and shadows into a multiply layer on the active texture. If the active object has overlapping UV islands, Bake offers a confirmed Prepare bake atlas step: it creates a duplicate object with a unique shelf-packed UV layout and a resampled texture, hides the original, and keeps the original object and texture for recovery. The copy and its lighting layer are created in one action. Existing non-overlapping UV layers are preserved, whole-island packing and a four-pixel bleed protect island edges, and symmetric painting ends on the duplicate. Bake normals follow authored winding on concave surfaces instead of a per-face center test. Ambient occlusion is previewed per face corner in Lit and baked per texel into the same result. The result is a normal texture layer, so it can be previewed in Texture, edited in Paint, and removed with undo.',
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
    image: '/documentation/animate.png',
    alt: 'Animate workspace with a sample model, shape-key track, timeline, and Animation inspector.',
    sections: [
      {
        heading: 'Tracks and keys',
        paragraphs: [
          'The timeline shows one transform row for the active object or group and one weight row for each shape key. Move the playhead to a whole frame, change the transform or weight, then use + Key on the row. A key stores the visible pose at that frame.',
          'Diamonds can be dragged between whole frames and selected for interpolation editing. Linear blends between values; Step holds the previous value until the next key. Delete removes the selected key. The Animation section controls FPS, start and end frames, looping, and the default interpolation for new keys. Camera and light animation use the same clip timeline. In Light and Render, the timeline is hidden by default and can be opened from the top-bar Timeline button; Animate always shows it.'
        ],
        controls: [
          'Play / pause: transport buttons',
          'Wheel: pan the timeline; Ctrl/Cmd + wheel: zoom',
          'Delete key: remove the selected diamond',
          'Interpolation: Linear or Step on the selected key'
        ]
      },
      {
        heading: 'Shape keys',
        paragraphs: [
          'A shape key stores a complete target position set for one mesh. Add shape key creates a key at zero weight. Edit target captures a live edited mesh into that key and restores the base when you Finish. Capture base does the same from the unchanged base workflow.',
          'Weight blends the target positions into the evaluated mesh. Shape keys evaluate beneath modifiers. The Shape keys section provides rename, visibility, drag reorder, weight, Edit target, Capture base, and Delete controls.'
        ],
        controls: [
          'Add shape key: create a zero-weight target',
          'Edit target: edit the target directly, then Finish',
          'Capture base: capture the current base mesh',
          '+ Key on a shape row: store its weight at the frame'
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
    image: '/documentation/render.png',
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
          'Virtual resolution is the internal render size and defines the camera frame; the camera frustum marker follows its aspect. Output resolution is the saved image size. Upscale chooses nearest or smooth sampling between them. If the two aspect ratios differ, the virtual frame is letterboxed or pillarboxed into the output, with background or transparent bars, never stretched. Shading selects Lit, Texture, or Solid; the background can be transparent or a solid color.',
          'The docked preview pane is always visible and updates live through the active camera whenever the camera, scene, lighting, or animation pose changes. Play and Pause run the existing animation playback without leaving Render. Render PNG writes one still. Render frames writes a PNG sequence. Render WebM appears when the WebView supports it. Render MP4 is native on macOS/iPad and falls back to the WebView recorder on Windows/Linux when available. PNG stills, sequences, and video frames use the same color-managed frame path. Rendered output uses the evaluated modifier geometry and the assigned texture, and excludes editor helpers.'
        ],
        controls: [
          'Output kind: still, frame sequence, WebM, or MP4. Long exports and bakes show progress in the global strip and can be cancelled. MP4 is native on macOS/iPad; other platforms use the WebView recorder when available. Video export is silent; audio is not part of the project timeline.',
          'Virtual width / height: internal render size',
          'Output width / height: saved image size',
          'Play/Pause: run the animation in the live preview',
          'Virtual size: camera frame aspect; Output size: delivery canvas with letterboxing when aspects differ',
          'Upscale: nearest or smooth; Shading: Lit, Texture, or Solid'
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
