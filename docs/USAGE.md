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

- **Pen** selects and edits. It never moves the camera. Pressure and tilt affect painting.
- **Touch** taps to select. One-finger drag orbits on empty space and drags a grabbed handle or gizmo. Two-finger drag pans and pinches, two-finger tap undoes, and three-finger tap redoes.
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
| Grid snap toggle/step | Snap object/vertex movement and action amounts from the status-bar control; world steps 0.01–1.0, with independent UV and rotation steps. |
| Move/Rotate/Scale handle | With an element selection, the gizmo sits at the selection median and drags the selected elements; otherwise it transforms the active object/group on that axis. Pen, mouse, and touch are supported. |
| Texture + Wire | Texture surface plus a front-only topological wire overlay. Back edges are depth-occluded. |
| ActionDock | Tap/click Extrude, Inset, Loop Cut, or Loop Slide to arm it. Drag up/right to set the amount; release applies. Type an exact amount then Enter; Esc cancels. |
| E / I | Arm Extrude / Inset for the current face selection. |
| L / Shift+L | Arm Loop Cut for the selected edge or loop / Loop Slide for the selected edge loop. |
| Type a number during an action | Exact amount: units for Extrude, percent for Inset and Loop position. Enter applies. |
| Shift, Cmd, or Ctrl + click | Add or remove an element from the current selection. |
| Right-drag | Pan the view. |
| Lasso tool + drag | Select a screen-space region in the current element mode. |
| Add toggle | Sticky additive selection for pen, mouse, and touch taps. |
| Touch tap / drag | One-finger tap selects the current V/E/F element; dragging a handle or gizmo edits, while empty-space drag orbits unless the Lasso tool is active. With Add on, taps toggle the set. |
| Mouse LMB on empty canvas or a mesh face away from a handle | Orbit the camera. |
| Alt/Option + LMB | Orbit. Useful for trackpads and one-button mice. |
| Alt/Option + Shift + LMB | Pan. |
| Mouse MMB | Orbit. |
| Shift + MMB | Pan. |
| Lasso / touch drag | Lasso works with mouse, Pencil, and one-finger touch when the Lasso tool is active. |
| Mouse wheel | Zoom. |
| One-finger touch | Orbit on empty space; drag handles and gizmos edit. |
| Two-finger touch | Pinch to zoom; drag to pan. |
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
