# loupoli UI map

This is the authoritative map of the application shell. New controls must be assigned to one of these regions before implementation.

## Contents

- [Shell regions](#shell-regions)
- [Subregions](#subregions)
- [Inspector section sets](#inspector-section-sets)
- [Ownership rules](#ownership-rules)
- [Active editor](#active-editor)
- [Future workspaces](#future-workspaces)

## Shell regions

| Region | Responsibility | Owns |
| --- | --- | --- |
| **Application Bar** | Identity, project file state, global document actions | Brand, project name, save state, open, save, undo, redo, about, documentation, sidebar toggle |
| **Workspace Tabs** | Switch the working context | Model, UV, Paint, Light, Animate, Render. Reserved: Export interchange workspace |
| **Tool Rail** | Active-pointer tools shared across editors | Select, Lasso, Move, Rotate, Scale |
| **Selection Bar** | Element mode and selection combination | V/E/F, Island (UV only), Loop (3D Edge only), All, Add, Sub |
| **Viewport Stage** | 3D editing surface plus its overlays | Viewport context strip, compact Selection Bar, icon-only Shading Bar, bottom-right View Gizmo, lasso, transform/action HUD, Action Dock; Light workspace adds selectable/draggable light markers and arrow-tip direction handles |
| **PaneHost** | Workspace-owned auxiliary pane | 44 px edge divider, resizable width; used by UV, Paint, and Render preview |
| **PaneFrame** | Shared pane interior | PaneHeader, optional PaneToolbar, flexible body, optional footer; used by UV, Paint, and Render preview |
| **UV Editor** | UV chart-editing surface inside PaneHost | UV Toolbar, UV Canvas, UV Footer |
| **Paint Editor** | Texture-space painting surface inside PaneHost | Paint header, texture canvas with optional read-only UV overlay, brush footer |
| **Render Preview** | Always-open live output inside PaneHost | Dimensions/upscale/frame header, play/pause, live canvas; camera and scene edits refresh it |
| **Inspector** | Properties of the active object/selection/context | Capability-filtered Inspector Sections, ordered per workspace; full-space About/Documentation modals |
| **Action Dock** | One-shot topology actions | Extrude, Inset, Loop Cut, Loop Slide |
| **Status Bar** | Persistent status | Context hint, mesh counts, and snap state; no renderer internals |
| **Notifications** | Transient operation feedback | Bottom-center toast stack above the status bar; import, export, render, and recoverable operation results |

## Subregions

- **Viewport context strip** — object/group name, element mode, active-editor marker. Its left inset follows Tool Rail visibility; Paint, Light, and Render start at the pane inset when the rail is hidden.
- **Shading Bar** — icon-only Wireframe, Solid, Texture, Texture + Wire, Lit, below the Selection Bar.
- **Seam overlay** — 3D seams appear only in the UV workspace; the UV canvas always shows seams.
- **PaneHeader** — one 44 px title row with active dot, detail, meta, and optional actions.
- **PaneToolbar** — optional second row for pane-specific commands, such as UV operations.
- **View Actions** — Frame and Home in a vertical cluster left of the View Gizmo.
- **View Gizmo** — signed axis endpoints and center frame.
- **UV Toolbar** — UV-only operations: U/V locks, Sync 3D, Pin, Unpin, Unwrap, Stack, Mirror stack, Fit, Clamp.
- **UV Canvas** — charts, texture, picking, lasso, paint.
- **UV Footer** — exact UV values and transform hints.
- **Inspector Section** — one collapsible disclosure with a title, optional meta, and body. Visibility and order come from the shared workspace capability policy and section registry, never from per-section workspace checks.

### Inspector section sets

- **Model:** Scene → Transform → Selection → Mesh → Modifiers. PS1 look controls live in Render.
- **UV:** Scene → Selection. Selection remains for edge/seam authoring; 3D editing sections are hidden.
- **Paint:** Scene → Brush → Texture. Brush and Texture are adjacent; 3D selection overlays are hidden while the selection set persists.
- **Light:** Scene → Lighting. Mesh editing and selection chrome are hidden; Scene remains for choosing the bake target.
- **Render:** Scene → Camera → Render. Mesh editing and selection chrome are hidden; the active camera and output settings drive the clean render. Scene lists only mesh objects/groups; cameras and lights live in their own lists. **View through** hides camera handles; orbit/pan/zoom returns to free editing.
- **Animate:** Scene → Animation → Shape keys → Transform → Selection. Animate has no Mesh, Modifiers, PS1 look, or ActionDock.
- **Import / Export:** Import OBJ/GLB, Export OBJ…, Export OBJ frames…, and Export GLB. OBJ frames use a focused dialog for source, clip, frame mode/range/step, and shared texture inclusion.
- **Timeline:** per-track **+ Key**, **Add keys** multi-select, key **Copy/Paste/Delete**, selected-key interpolation, Mesh Motion pose editing with Finish/Cancel, integer-frame diamond dragging, adaptive ruler ticks, minus/Fit/plus zoom, wheel pan, and Ctrl/Cmd+wheel zoom. Transform and shape-weight tracks share the same interaction. The timeline dock owns clip selection and New/Duplicate/Delete actions, transport, track keying, key deletion, interpolation, and diamond movement.
- **Scene import/export:** one labeled **Import / Export** menu; import options precede a separator and export options. The primitive selector remains below the object list because new objects append there.
- **Tooltip** — command label plus shortcut, from the command registry.

## Ownership rules

1. A cross-editor action lives in shared chrome.
2. A UV-only action lives in the UV Editor.
3. The Inspector never owns global tool state.
The Viewport Stage owns overlays so they adapt to the visible 3D rectangle, not the window.
4. The Selection Bar owns every selection mode and combination modifier.
5. The Tool Rail owns pointer tools, not selection combination.
6. The Action Dock owns one-shot topology commands.
7. The Application Bar owns document-level actions only, including New Project.
8. A workspace owns its PaneHost placement; UV, Paint, and Render preview share the side-by-side pane host and resizable divider.

## Active editor

- The active editor is the pane last clicked by the user.
- `activeEditor` is `3d` or `uv`.
- Clicking a canvas or its View Gizmo activates that editor.
- Clicking shared chrome or the Inspector does not change the active editor.
- Switching workspace sets the active editor: Model/Light/Animate/Render → 3D; UV/Paint → UV.
- Island mode, All, Lasso, and context transforms target the active editor.
- The active editor is shown with a lime dot and title accent, never a full border.

## Future workspaces

Workspace identifiers are reserved now so adding them does not require renaming layout regions:

- `model`
- `uv`
- `paint`
- `light`
- `animation`
- `render`
- `animation`
- `export`

Model, UV, Paint, Light, Animate, and Render are implemented. Export remains a future workspace and must reuse the active-editor, Inspector Section, command, and shortcut contracts.
