/** One tab in the illustrated tutorial. */
export interface TutorialPage {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly intro: string;
  readonly image: string;
  readonly alt: string;
  readonly steps: readonly string[];
  readonly note: string;
}

/** Tutorial pages, one for each workspace in the application bar. */
export const TUTORIALS: readonly TutorialPage[] = [
  {
    id: 'model',
    label: 'Model',
    title: 'Shape a low-poly object',
    intro:
      'The scene starts with a textured gorilla, a ground grid, and the document sun. Use the Selection bar to work on one element type at a time.',
    image: '/tutorial/model.png',
    alt: 'Model workspace showing the gorilla, ground grid, Scene outliner, and vertex selection handles.',
    steps: [
      'Select **Gorilla** in the Scene outliner. Use **V**, **E**, or **F** in the Selection bar to choose vertex, edge, or face selection.',
      'Click an element in the viewport. Turn on **Add** or hold Shift, Cmd, or Ctrl to extend the selection. **Sub** removes elements from it.',
      'Drag the **Move**, **Rotate**, or **Scale** gizmo. Press **G**, **R**, or **S** for a modal transform; press **X**, **Y**, or **Z** to lock an axis.',
      'Select a face and choose **Extrude** or **Inset** in the ActionDock. Drag to set the amount, or type a number and press Enter.',
      'Select one edge and choose **Loop Cut** in the ActionDock. Use **Loop Slide** to move the most recent cut along its quad ring.',
      'Press **F** to frame the selection and **Home** to return to the default view. The inspector Transform fields accept exact typed values.'
    ],
    note: 'The gorilla is a single mesh with per-corner UVs. The ground is an editable grid primitive.'
  },
  {
    id: 'uv',
    label: 'UV',
    title: 'Lay out the UV charts',
    intro:
      'The UV pane edits the active object’s corner UVs. Seams split the mesh into charts before an unwrap.',
    image: '/tutorial/uv.png',
    alt: 'UV workspace with the gorilla texture displayed in the UV pane and the texture atlas mapped to the mesh.',
    steps: [
      'Choose **UV** in the workspace tabs. The UV pane opens beside the 3D viewport.',
      'In the Selection bar choose **E**, then select an edge in the 3D view. Turn on **Seam** to mark a chart boundary. Repeat for every cut.',
      'Switch to **F** or **Island**, select the faces you want to unwrap, and choose **Unwrap**. Two selected corners can be pinned first.',
      'Choose **Fit** to fit the charts in the pane. Drag corners, or use **G**, **R**, and **S**; **U** and **V** lock one axis.',
      'Use **Stack** to copy the active island’s layout to another island when the topology and chart shape match.',
      'The UV footer reports the selected corner count, U/V delta, and whether clamping is active.'
    ],
    note: 'Overlapping islands are rejected by Unwrap and by the lighting bake. The texture asset is shared by the gorilla and the ground only when assigned to both.'
  },
  {
    id: 'paint',
    label: 'Paint',
    title: 'Paint the texture atlas',
    intro:
      'Paint edits the active texture layer. The pane shows the current atlas; the 3D viewport can project brush strokes onto the model.',
    image: '/tutorial/paint.png',
    alt: 'Paint workspace with the gorilla texture atlas and the Brush inspector open.',
    steps: [
      'Choose **Paint**. Open **Texture** in the inspector and select the asset assigned to the gorilla.',
      'Select a raster layer, or add a new layer. The Paint toolbar and Brush inspector edit the active layer.',
      'Choose **Brush**, **Eraser**, **Line**, **Rectangle**, **Ellipse**, **Gradient**, or **Fill**. Set **Size**, **Opacity**, **Hardness**, **Smoothing**, and **Noise** in Brush.',
      'Paint in the texture pane. Use the mouse wheel to zoom, the middle mouse button or Alt to orbit, and the right mouse button or Space to pan.',
      'Brush and Eraser also paint directly on the 3D model: drag across the textured surface. Middle mouse or Alt orbits, right mouse or Space pans.',
      'Each stroke previews on a scratch layer and commits as one undoable pixel patch when you release.'
    ],
    note: 'The projected brush and eraser use the assigned texture’s UV layout; each stroke remains within one face.'
  },
  {
    id: 'light',
    label: 'Light',
    title: 'Light and bake the scene',
    intro:
      'Light holds the document light rig. Lit mode uses the same lights as the bake.',
    image: '/tutorial/light.png',
    alt: 'Light workspace with the sun marker, ground shadow, and Lighting inspector.',
    steps: [
      'Choose **Light**. The viewport switches to Lit and shows the document lights.',
      'In **Lighting**, choose **Add light** and select **Directional light** or **Point light**. Select the light in the list.',
      'Drag a light marker to move it. For a directional light, drag the arrow tip to aim it.',
      'Set **Color**, **Intensity**, and **Cast shadows** in Lighting. Directional lights also expose **Shadow softness**.',
      'To bake, select an object with a texture and non-overlapping UVs, then choose **Bake lighting**. The result is added as a multiply lighting layer.',
      'Preview the bake in **Texture** or **Lit**; undo removes the lighting layer patch.'
    ],
    note: 'The bake includes enabled direct lights and shadows. Ambient is applied without shadowing.'
  },
  {
    id: 'animate',
    label: 'Animate',
    title: 'Key transforms and shape weights',
    intro:
      'Animate adds a timeline below the viewport. The active object and each shape key have their own track.',
    image: '/tutorial/animate.png',
    alt: 'Animate workspace with the gorilla selected, shape-key track, and animation timeline.',
    steps: [
      'Choose **Animate** and select an object in the Scene outliner.',
      'Move the playhead to a frame, then change Position, Rotation, or Scale in Transform. Click **+ Key** on the object track to store the transform.',
      'Open **Shape keys**, choose **Add shape key**, then **Edit target**. Modify the mesh, choose **Finish**, and set the key weight.',
      'Click **+ Key** on the shape key’s timeline row to store its current weight. Drag diamonds between whole frames to retime them.',
      'Select a diamond to edit its interpolation or remove it. Use the ruler, transport buttons, and **Fit** control to inspect the range.',
      'The timeline uses whole frames. Transform and shape-weight tracks use the same linear and step interpolation controls.'
    ],
    note: 'These screenshots keep the current scene and add one empty shape key so the weight track is visible.'
  },
  {
    id: 'render',
    label: 'Render',
    title: 'Compose and export a frame',
    intro:
      'Render edits the active scene camera and writes a clean image without editor overlays.',
    image: '/tutorial/render.png',
    alt: 'Render workspace with the gorilla framed by the camera marker and the Camera and Render inspector sections.',
    steps: [
      'Choose **Render**. The viewport becomes a free camera-editing view with the grid available for navigation.',
      'Select a camera in **Camera**, or choose **Add from view**. Use **Frame** to frame it and **From view** to replace its position and target.',
      'Choose **Through** to look through the camera. Orbit, pan, or zoom to leave the camera view; the camera handles return.',
      'In **Render**, set **Output kind**, virtual and output resolution, **Upscale**, **Shading**, and the background.',
      'Choose **Preview** to inspect the upscaled image in the floating portal. Choose **Render PNG**, **Render frames**, **Render WebM**, or **Render MP4** when the format is available.',
      'Rendered output excludes grids, selection overlays, camera markers, and light markers.'
    ],
    note: 'Rendering uses the evaluated modifier stack; GLB and OBJ exports do the same.'
  }
] as const;
