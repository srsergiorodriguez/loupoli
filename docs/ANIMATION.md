# Animation workspace

**Status:** Foundation implemented. The Animation workspace has transform tracks for objects and groups, keyframe insertion/deletion, linear/step interpolation, scrubbable timeline, and explicit scheduler-driven playback. Transform tracks and shape-weight tracks are implemented. Camera and light animation are not implemented yet.

## Model

Animation is document data:

```ts
interface AnimationTrack {
  id: string;
  targetId: string;
  targetKind: 'node' | 'group';
  keyframes: {
    frame: number;
    transform: NodeTransform;
    interpolation: 'step' | 'linear';
  }[];
}
```

- The project stores FPS, start/end frames, and tracks.
- Keys store complete transform values.
- The rest transform remains on the scene node/group.
- Playback applies a temporary **preview pose** through the renderer; it does not mutate or journal the rest transform.
- Key edits use one undoable `SetAnimationCommand` snapshot.
- Animation persists in `.lpoly` and participates in autosave recovery.

## Workspace

The `Animate` workspace is a 3D workspace with a bottom timeline.

![Animation workspace](media/animation-workspace.png)

- Scene outliner remains available for target selection.
- Inspector sections are ordered **Scene**, **Animation**, **Shape keys**, **Transform**, **Selection**, and **Controls**. Animate does not expose Mesh, Modifiers, or PS1 look, and it does not show the ActionDock. Shape keys are authored in Animate only.
- Timeline:
  - Play/pause
  - Scrubbable ruler
  - Tracks and key diamonds
  - Current frame and FPS
  - Adaptive ruler ticks
  - Minus/Fit/plus zoom; wheel pans and Ctrl/Cmd+wheel zooms
  - Selected-key interpolation editor
- The timeline sits above the status bar and uses the full width because Animate has no ActionDock. It shows an empty transform row for the active object/group and a weight row for every shape key, so the first transform and shape-weight keys are created in the timeline. Each row has a **+ Key** button. Selecting a diamond enables **Delete key**, Delete/Backspace, and an interpolation selector for that key. Diamonds can be dragged horizontally, snap to integer frames, and commit one undo step. Ruler ticks adapt to the visible range; minus/Fit/plus zoom, wheel panning, and Ctrl/Cmd+wheel zooming are available. Key insertion rounds to the exact frame. Transform edits show from the current animated pose; an existing key at the current frame updates automatically, while an unkeyed frame requires a timeline key.
- Animation Inspector:
  - FPS, start/end frame
  - Loop toggle
  - Default interpolation for new keys; select a diamond to edit its existing interpolation in the timeline
  - No duplicate key/delete controls; those live in the timeline

## Playback rules

- A requestAnimationFrame loop runs **only while playing**.
- Pausing cancels the loop; idle remains zero frames.
- Scrubbing evaluates the pose immediately.
- Leaving the Animation workspace pauses playback; the preview pose is cleared except when moving into Render, where the current frame remains renderable.

## Current limitations

- No camera tracks yet.
- No light or material tracks.
- No shape keys yet.
- Keys are complete transforms; per-channel keying comes later.
