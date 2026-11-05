# OBJ and GLB interchange

**Status:** OBJ and GLB import/export are implemented with simple per-face material colors. Both imports are one undoable scene transaction. OBJ preserves quads/n-gons and UVs; GLB is triangulated by definition. OBJ export can target the active object or the whole scene and can include the assigned composite texture as a PNG beside the MTL. GLB export is validated in Blender with indexed primitives and node TRS transforms.

## Coordinate boundary

- File formats use Y-up.
- loupoli uses Z-up.
- Import converts Y-up to app Z-up.
- Export converts app Z-up to Y-up.
- Imported objects are world-baked; glTF node transforms are flattened.

## OBJ

Implemented:

- `v`, `vt`, `f`, `o`/`g`, and `usemtl`
- Negative indices
- Quads and n-gons
- Per-corner UVs
- Simple `Kd` MTL diffuse colors
- Malformed-index validation
- Export with global OBJ vertex/UV indices
- Export of an `.obj` and `.mtl` bundle
- Source choice: active object or whole scene
- Optional composite texture export as a PNG referenced by `map_Kd`
- Browser ZIP or native folder bundle

Limitations:

- A browser import currently selects the OBJ file only; external MTL is not read automatically.
- External texture maps are not read on import; OBJ export writes the assigned composite texture only.
- Normal maps are not exported.
- Export uses the base DCEL, not the evaluated modifier result.

![OBJ export options](media/scene-interchange.png)

## GLB

Implemented with Three's GLTF loader/exporter:

- Binary GLB import
- Triangles converted to validated DCEL topology
- Per-corner UVs and split seams preserved
- Material base colors become the node palette
- Multiple meshes import as separate nodes
- Binary GLB export with triangulated geometry, indexed primitives, and simple materials
- Y-up conversion at both boundaries
- Node TRS output and material names for broad DCC compatibility
- Exported GLB opened successfully in Blender 5.1

Limitations:

- PBR material complexity is reduced to base color.
- GLTF textures, animations, and skins are not imported yet. Morph targets import into shape keys and export as relative GLB morph targets with influences.
- Non-manifold GLB triangle soup is rejected with a clear error.
- Export uses the base DCEL and simple per-face colors.
- GLB does not embed textures yet; use the OBJ + PNG path when a texture file is needed.

## Materials

The current simple material model is:

- A node owns a palette of hex colors.
- Every face references a palette index.
- Renderer geometry receives vertex colors from the face material.
- OBJ `Kd` and GLB base colors map into that palette.
- No material graph, roughness/metalness editor, or per-material texture is exposed yet.

## Import safety

- OBJ parser validates indices and requires polygon faces.
- GLB conversion catches DCEL validation failures and reports the source mesh.
- Imports use one `CompositeCommand`, so undo removes the entire imported batch.
- File picker/native read errors surface through the project error banner.
