# Shape keys

**Status:** Minimal shape-key support implemented. Keys store absolute morph positions, expose weights, evaluate into the rendered mesh, persist as binary payload, and import glTF morph targets. Shape-key weights are animatable with linear/step tracks. Captured shape keys can be edited live with the normal mesh tools through the **Edit / Finish / Cancel** flow.

## Model

```ts
interface ShapeKey {
  id: string;
  name: string;
  weight: number;              // 0–1
  targetPositions: Float32Array; // absolute, same vertex order as the base mesh
}
```

- The base DCEL remains the editable topology.
- The evaluated mesh is `base + Σ(weight × (target − base))`.
- Modifiers evaluate on top of the shape-key result.
- Vertex indices and UVs are unchanged, so selection and picking remain valid.

## UI

Animate Inspector → **Shape keys**:

- Add shape key
- **Edit**: enter the stored target, edit it live with the normal mesh tools, then **Finish** to record one undoable capture or **Cancel** to discard
- Weight slider per key
- Key/Unkey: add or remove a shape-weight timeline key
- Capture: stores the current edited base mesh as the key target, restores the source base, and leaves weight at 0
- Delete key

![Shape keys](media/shape-keys.png)

## Undo and persistence

- Adding/removing/weighting/updating keys uses one undoable `SetShapeKeysCommand`.
- Shape-key edits are journaled through `set-shape-keys`.
- Shape-key target positions are stored as aligned Float32 payload per node, not JSON arrays.
- Autosave checkpoints preserve them.

## Topology guard

Changing the node mesh through the topology command path throws:

> Remove shape keys before changing topology.

This prevents stale per-vertex morph targets. Use **Edit** for the direct live-target workflow. **Capture** remains available for the base-first workflow: edit the base mesh, then capture it into a key and restore the source base. The captured key stays at weight 0 so the base remains editable; raise its weight or add a weight key to preview it. Finish topology edits before adding keys.

## glTF

GLB import maps `morphAttributes.position` and morph influence weights into shape keys. GLB export writes shape keys as relative morph targets, with weights preserved as morph influences. A browser round-trip verified that a keyed +1 vertex deformation survives export/import at weight 0.5.

## Animation

Shape weights use the same linear/step interpolation as transform keys. Press **Key** on a shape key to create its weight track. The track appears in the timeline with diamonds and can be scrubbed. Changing the weight slider while a weight track exists updates the key at the current frame. **Unkey** removes the current weight key.

## Remaining

- - Sculpt/edit-shape mode
- Shape-key-aware topology editing or conversion
