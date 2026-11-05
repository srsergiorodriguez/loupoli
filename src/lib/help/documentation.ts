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
  readonly example: string;
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
    alt: 'Model workspace with the front-facing gorilla, grid ground, Scene outliner, and vertex selection handles.',
    sections: [
      {
        heading: 'Selection',
        paragraphs: [
          'The V, E, and F buttons choose vertex, edge, or face selection. A plain click replaces the element selection. Add, Shift, Cmd, or Ctrl extends it; Sub removes elements. Changing mode clears the element set, while object selection remains in the Scene outliner.',
          'The Loop toggle is available in Edge mode. It walks through connected quad edges, follows an open boundary, and stops at a pole or a non-quad junction. The same Edge mode supports marking seams for UV work.'
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
          'Extrude and Inset are face operations available from the ActionDock. Loop Cut requires one selected edge and splits the surrounding quad ring. Loop Slide moves the most recent cut. These operations commit one validated mesh replacement and remain editable through undo.',
          'With modifiers active, direct vertex edits and topology operations target the base mesh. The stack re-evaluates after each commit, so the displayed surface and the editable base can differ.'
        ],
        controls: [
          'G / R / S: move, rotate, or scale',
          'E / I / L: extrude, inset, or loop cut',
          'Shift+L: loop slide',
          'F: frame the selection; Home: reset the view'
        ]
      },
      {
        heading: 'Gorilla example',
        paragraphs: [
          'The gorilla is one mesh with per-corner UVs. Select it in Scene, switch to Face mode, and select the shoulder panels to try Extrude or Inset. The ground is a separate grid primitive, so it can be transformed without changing the gorilla.'
        ]
      }
    ],
    example:
      'The example scene keeps the gorilla and ground as separate scene objects. The ground is selected and transformed independently of the character.'
  },
  {
    id: 'uv',
    label: 'UV',
    title: 'UV editing',
    summary:
      'UV holds per-corner texture coordinates. The UV pane edits the same object selection shown in the 3D viewport, so chart work stays linked to the mesh.',
    image: '/documentation/uv.png',
    alt: 'UV workspace with the gorilla texture atlas, UV charts, and the 3D viewport.',
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
          'Stack compares the topology of two islands and copies the active island layout when vertex, edge, face, and boundary counts match. It is useful for repeated shapes that need identical UV layouts.'
        ],
        controls: [
          'G / R / S: move, rotate, or scale UV corners',
          'U / V: lock the U or V axis',
          'Shift: fine transform precision',
          'Fit: frame the UV layout'
        ]
      },
      {
        heading: 'Gorilla example',
        paragraphs: [
          'The gorilla atlas already has separate charts for the head, limbs, and torso. Open UV, select a chart in Island mode, and move it with G. The texture stays attached to each chart, so the gorilla surface updates while you edit.'
        ]
      }
    ],
    example:
      'The supplied gorilla texture is a 512 × 512 atlas. Its charts appear directly in the UV pane and use the same texture assigned to the mesh.'
  },
  {
    id: 'paint',
    label: 'Paint',
    title: 'Texture painting',
    summary:
      'Paint edits the active texture layer. The texture pane shows the atlas, while the 3D viewport can project brush strokes onto the selected surface.',
    image: '/documentation/paint.png',
    alt: 'Paint workspace showing the gorilla atlas, Paint toolbar, and Brush inspector.',
    sections: [
      {
        heading: 'Assets and layers',
        paragraphs: [
          'A texture asset is a shared stack of layers. Each layer has a name, visibility, opacity, blend mode, and role: color, detail, or lighting. The active layer receives paint. Assets can be assigned to several objects, so a change to a shared atlas appears everywhere that asset is bound.',
          'Texture mode samples the composite atlas. Paint uses the same atlas, which makes the texture pane, UV view, and 3D surface consistent. Layer pixels are authoritative; metadata changes and undo do not redraw them.'
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
          'Brush, Eraser, Line, Rectangle, Ellipse, Gradient, and Fill operate on the active layer. Size, opacity, hardness, smoothing, noise, and shape fill live in Brush. The paint engine previews each gesture on a scratch layer and commits one undoable pixel patch when the pointer is released.',
          'Paint in the texture pane, or choose Brush or Eraser and paint on the 3D model. Projected strokes use the surface UV coordinates and stop at face boundaries, so paint does not jump between islands. In the texture pane, use the wheel to zoom and drag with the middle or right mouse button to pan. Over the 3D model, middle mouse or Alt orbits and right mouse or Space pans.'
        ],
        controls: [
          'B / E: brush or eraser in the toolbar',
          'Left drag: paint or select; middle/right drag: pan the texture pane',
          'Wheel: zoom; MMB/Alt: orbit over the 3D model; Space: pan the 3D view',
          'Pen pressure and tilt: brush radius, opacity, and stamp shape'
        ]
      },
      {
        heading: 'Gorilla example',
        paragraphs: [
          'Select the gorilla’s atlas in Texture, add a raster layer, and paint a mark on the face chart. Switch to the 3D viewport and paint on the face to place the same change through the mesh UVs. Use undo to revert the complete stroke.'
        ]
      }
    ],
    example:
      'The gorilla texture is a shared asset in the example scene. Paint edits its layer stack rather than changing the mesh materials.'
  },
  {
    id: 'light',
    label: 'Light',
    title: 'Lighting',
    summary:
      'Light owns the document light rig. Directional and point lights drive the Lit viewport and the direct-light texture bake.',
    image: '/documentation/light.png',
    alt: 'Light workspace with the sun marker, ground shadow, and Lighting inspector.',
    sections: [
      {
        heading: 'Lights and markers',
        paragraphs: [
          'A directional light has a position marker and a direction arrow. The position is an editor anchor; the arrow direction defines the incoming light. A point light uses its marker position directly. Select a light in the Lighting list or click its marker to edit Color, Intensity, Cast shadows, and Shadow softness.',
          'Lit mode applies the document lights to the shaded viewport. Ambient color and intensity fill the unlit parts of the surface. Hard and soft shadows are available in Lit rendering; the same light state is used by the bake.'
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
          'Bake lighting writes direct light and shadows into a multiply layer on the active texture. The active object needs an assigned texture and a UV layout without overlapping islands. The result is a normal texture layer, so it can be previewed in Texture, edited in Paint, and removed with undo.',
          'If several objects share the texture, the bake creates a copy for the active object before adding the lighting layer. Other objects keep their original asset.'
        ],
        controls: [
          'Bake lighting: direct diffuse light plus shadows',
          'Intensity: light energy; higher values brighten the Lit surface',
          'Ambient: unshadowed fill for the document'
        ]
      },
      {
        heading: 'Gorilla example',
        paragraphs: [
          'The example scene keeps one sun above and to the side of the gorilla. The ground receives the character shadow. Drag the sun arrow tip across the model to see the shadow direction change before baking.'
        ]
      }
    ],
    example:
      'The sun is a directional light. Its marker shows the anchor; the arrow points along the light direction toward the scene.'
  },
  {
    id: 'animate',
    label: 'Animate',
    title: 'Animation',
    summary:
      'Animate adds transform tracks and shape-weight tracks to the document. A key stores a value at a whole frame; playback evaluates the tracks without changing the rest transforms.',
    image: '/documentation/animate.png',
    alt: 'Animate workspace with the gorilla, shape-key track, timeline, and Animation inspector.',
    sections: [
      {
        heading: 'Tracks and keys',
        paragraphs: [
          'The timeline shows one transform row for the active object or group and one weight row for each shape key. Move the playhead to a whole frame, change the transform or weight, then use + Key on the row. A key stores the visible pose at that frame.',
          'Diamonds can be dragged between whole frames and selected for interpolation editing. Linear blends between values; Step holds the previous value until the next key. Delete removes the selected key. The Animation section controls FPS, start and end frames, looping, and the default interpolation for new keys.'
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
        heading: 'Gorilla example',
        paragraphs: [
          'The example scene adds an empty shape key to the gorilla so its weight row is visible. Key a transform at frame 0, move to frame 24, change the object transform, and key it again. Scrub between the two frames to inspect the interpolation.'
        ]
      }
    ],
    example:
      'Camera and light animation are not part of the animation system yet. Transform and shape-weight tracks are document data; the playhead and playback state are session state.'
  },
  {
    id: 'render',
    label: 'Render',
    title: 'Rendering',
    summary:
      'Render composes a clean image through a saved scene camera. The viewport is a free camera-editing view; the camera and output settings define the capture.',
    image: '/documentation/render.png',
    alt: 'Render workspace with the gorilla framed by the camera and Camera and Render inspector sections.',
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
          'Virtual resolution is the internal render size; output resolution is the saved image size. Upscale chooses nearest or smooth sampling between them. Shading selects Lit, Texture, or Solid; the background can be transparent or a solid color.',
          'Preview renders the virtual frame, upscales it, and opens the floating portal. Render PNG writes one still. Render frames writes a PNG sequence. Render WebM and Render MP4 appear when the WebView supports that codec. PNG stills, sequences, and video frames use the same color-managed frame path.'
        ],
        controls: [
          'Output kind: still, frame sequence, WebM, or MP4',
          'Virtual width / height: internal render size',
          'Output width / height: saved image size',
          'Upscale: nearest or smooth; Shading: Lit, Texture, or Solid'
        ]
      },
      {
        heading: 'Gorilla example',
        paragraphs: [
          'The example camera frames the gorilla and its ground. Start in free editing to place the marker, use Through to check the composition, then choose Preview to inspect the framed result before writing a PNG.'
        ]
      }
    ],
    example:
      'Rendered output uses the evaluated modifier geometry and the assigned texture. The render target is color-managed and excludes editor helpers.'
  }
] as const;
