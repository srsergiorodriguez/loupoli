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
- Inspector sections include **Scene**, **Transform**, **Animation**, **Selection**, **Mesh**, **Shape keys**, **Modifiers**, **PS1 look**, and **Controls**. Animate has the modeling tools needed to edit vertices and capture shape keys; shape keys are authored in Animate only.
- Timeline:
  - Play/pause
  - Scrubbable ruler
  - Tracks and key diamonds
  - Current frame and FPS
- Key insertion rounds the playhead to the exact integer key frame, and the ruler/track lanes share the same horizontal inset so diamonds and playhead align. The timeline sits above the status bar and is inset beside the ActionDock. Animate keeps the modeling tool rail and selection controls, but hides the view gizmo so the timeline remains unobstructed. Transform edits show from the current animated pose; an existing key at the current frame updates automatically, while an unkeyed frame requires Key transform.
- Animation Inspector:
  - FPS, start/end frame
  - Loop toggle
  - New-key interpolation
  - Key/delete key
  - Track list and key list

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
