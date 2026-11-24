# Using loupoli

## Web app

Open the deployed app at:

https://srsergiorodriguez.github.io/loupoli/app/

On iPad, open the same URL in Safari and choose **Share → Add to Home Screen** to install the PWA. The web app is fully functional for modeling, UVs, painting, lighting, animation, and rendering. It saves projects as downloaded `.lpoli` copies rather than writing in place.

The PWA can run offline after the first load. Browser storage can be evicted, so export important work.

## Native app

The native Tauri shell is the desktop and App Store target. It adds native file dialogs, atomic save-in-place, AVFoundation MP4 export on Apple platforms, and the normal app lifecycle.

Native builds are currently development builds and are not published as executables or installers yet. The iPad build has been installed and smoke-tested from Xcode; macOS, Windows, and Linux packaging is planned.

The native and web builds use the same editor and `.lpoli` format. Move work between them by saving a project and opening it in the other app.

## First steps

- The first-run scene and New Project both create an editable cube.
- Use the workspace tabs to switch between Model, UV, Paint, Light, Animate, and Render.
- The Inspector is on the right on desktop and is a non-modal bottom sheet on iPad.
- The status bar owns snapping and displays the current tool hints.
- Save with **Cmd/Ctrl+S**; the browser build downloads a copy.

## Input model

The footer **Pencil** toggle selects the input policy:

- **Pencil mode (default, persisted):** the Pencil selects, edits, and paints. The finger is navigation-only on the canvas: one-finger drag orbits in 3D or pans the Paint texture, and two fingers pan/pinch. Canvas taps do not select.
- **Touch mode:** the finger behaves like the mouse primary button. Tap selects, handles and gizmos edit, empty drag orbits, and one finger paints in the Paint pane. Two fingers still pan/pinch.
- **Pencil:** selects and edits in either mode. It never moves the camera. Pressure and tilt affect painting. Hovering the Pencil previews the brush in the Paint pane and on the projected surface; tilt rotates and flattens the cursor footprint.
- **Eyedropper:** open a Paint color swatch and choose **Pick**, then click the texture to sample its composited color. Esc cancels the pick.
- Two-finger tap undoes and three-finger tap redoes in both modes.

The Pencil toggle sits before Snap in the status bar and is stored in `localStorage`.
- **Mouse** uses the DCC mappings below. LMB on a topology handle edits; LMB on empty space or a face away from a handle orbits.
- Shift/Cmd/Ctrl adds to a selection. The sticky **Add** control provides additive selection for touch and pen.
- A plain tap on empty viewport space clears the selection.

## Controls

| Input | Action |
|---|---|
| Pen | Select a vertex, edge, or face in the current mode. In vertex mode, drag the selected vertex. Pen never moves the camera. |
| Mouse LMB on a topology element | Select it, or drag it in vertex mode. |
| Object row click | Make that object active. Shift/Cmd/Ctrl-click toggles multi-selection; the sticky **Multi-select objects** toggle does the same for pen/touch. |
| Group row click | Select the group for numeric or gizmo transforms. Group children stay editable from the indented outliner rows. |
| X/Y/Z while a vertex is selected | Toggle a world-axis lock for the next vertex drag. 44 px X/Y/Z chips provide the same control for pen/touch. |
| Grid snap toggle/step | Snap object/vertex movement, gizmo rotation, and action amounts from the status-bar control; Shift+Tab toggles snapping, world steps 0.01–1.0, with independent UV and rotation steps. |
| Move/Rotate/Scale handle | With an element selection, the gizmo sits at the selection median and drags the selected elements; otherwise it transforms the active object/group on that axis. Pen, mouse, and touch are supported. |
| Two-sided (Mesh Inspector) | Render backfaces for billboard/foliage cards. Works with Cutout or Blend texture alpha. |
| Texture + Wire | Texture surface plus a front-only topological wire overlay. Back edges are depth-occluded. |
| Select object in Paint | Activates that object's assigned texture for painting. |
| Merge textures | With two or more textured objects selected, pack their UV layouts into one shared atlas. Texture layers are flattened; the operation is undoable. |
| ActionDock | Tap/click Extrude, Inset, Bevel, Loop Cut, or Loop Slide to arm it. Drag up/right to set the amount; release applies. Type an exact amount then Enter; Esc cancels. Bevel amount is a world-space width. Subdivide splits the selected faces into triangles, or the whole mesh into quads when nothing is selected. |
| E / I | Arm Extrude / Inset for the current face selection. |
| Bevel | Select one interior edge, then choose Bevel in the Action Dock. Drag or type the width. One edge per operation; endpoint corners are absorbed by the surrounding faces. Endpoints must be interior valence-three vertices; the topology rebuild resets UV seams. |
| L / Shift+L | Arm Loop Cut for the selected edge or loop / Loop Slide for the selected edge loop. Loop Cut follows the selected edge; Loop Slide moves either way from its starting position. |
| Subdivide | In the ActionDock, split selected faces into triangles, or split every face once into quads when no face is selected. UVs, materials, and seams are preserved; one undo restores the mesh. |
| Deform / Noise Displace / Weld | Add from the Modifiers section. Deform twists, bends, or tapers; Noise Displace moves vertices along normals with seeded noise; Weld merges nearby vertices. Each supports per-modifier Apply. |
| Type a number during an action | Exact amount: units for Extrude, percent for Inset and Loop position. Enter applies. |
| V / E / F buttons | Switch vertex, edge, or face selection mode; 1 / 2 / 3 are the keyboard shortcuts. |
| Shift+Tab | Toggle grid snapping. |
| Two-finger tap over a pane | Undo while a pane, such as UV or Paint, has focus. |
| Cmd/Ctrl+D | Duplicate the active mesh object in place. |
| Shift, Cmd, or Ctrl + click | Toggle an element in the current selection. |
| Right-drag | Pan the view. |
| Lasso tool + drag | Select a screen-space region in the current element mode. |
| Multi | Sticky multi-selection for pen, mouse, and touch taps. Clicking a selected element removes it. |
| Touch tap / drag | One-finger tap selects the current element mode; dragging a handle or gizmo edits, while empty-space drag orbits unless the Lasso tool is active. With Multi on, taps toggle the set. |
| Mouse LMB on empty canvas or a mesh face away from a handle | Orbit the camera. |
| Alt/Option + LMB | Orbit. Useful for trackpads and one-button mice. |
| Alt/Option + Shift + LMB | Pan. |
| Mouse MMB | Orbit. |
| Shift + MMB | Pan. |
| Lasso / touch drag | Lasso works with mouse, Pencil, and one-finger touch when the Lasso tool is active. |
| Mouse wheel | Zoom. |
| One-finger touch | Orbit on empty space; drag handles and gizmos edit. |
| Two-finger touch | Pinch to zoom; drag to pan in the viewport, UV pane, and Paint pane. |
| Pencil-mode one-finger touch in UV/Paint | No canvas action; use two fingers to pan/zoom. Pencil edits/selects/paints. |
| Two-finger tap | Undo. |
| Three-finger tap | Redo. |
| Cmd/Ctrl+Z | Undo. |
| Shift+Cmd/Ctrl+Z, Ctrl+Y | Redo. |
| Cmd/Ctrl+S | Save the project. |
| Cmd/Ctrl+O | Open a project. |
| G | Start a modal move of the active object or group. Move the mouse to set the offset. |
| R | Start a modal rotate. Without an axis constraint, rotation follows the pointer angle around the object pivot; moving counterclockwise on screen rotates counterclockwise. |
| S | Start a modal scale. Without an axis constraint, scaling is uniform and follows the pointer distance from the object pivot. |
| X / Y / Z during G/R/S | Constrain to an axis. Pressing the same axis again clears the constraint. |
| Type a number during G/R/S | Exact amount: units for move, degrees for rotate, factor for scale. Move requires an axis constraint. |
| Enter / left click | Commit the modal transform. |
| Escape / right click | Cancel the modal transform and restore the previous pose. |
| F | Frame the active object. |
| Escape | Cancel the active drag or modal transform, or close the mobile inspector. |
| Orientation gizmo | Drag to orbit. Click a bright `+X/+Y/+Z` or darker `−X/−Y/−Z` endpoint to view that side. Click the center to frame the active object. Use the toolbar Home button or `Home` to reset to Blender Front (camera on −Y). |

Selection modes are switched with the **Vertex / Edge / Face** control at the top-left of the viewport. The Scene outliner selects the active object; picking always edits that object.
