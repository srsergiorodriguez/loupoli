# loupoli — Persistence and iOS Memory Safety

**Status:** Phase 4 persistence plus Phase 5A lighting. Autosave, `.lpoly` v4, browser fallbacks, and Tauri byte I/O are implemented; groups, transforms, modifier stacks, seam flags, texture assets, node texture bindings, lights, ambient settings, and render cameras round-trip. The manifest may contain up to 32 cameras; older files without cameras receive a default camera. v4 stores the texture asset library and lighting metadata. v3 files remain readable; legacy v1/v2 compatibility is deferred. Minimal shape keys, visibility/order metadata, and shape-weight animation tracks round-trip as binary payload. See [PHASE5_LIGHTING.md](./PHASE5_LIGHTING.md).
**Related:** [Docs index](./README.md) · [Plan](./PLAN.md) · [Architecture](./ARCHITECTURE.md) · [Design System](./DESIGN_SYSTEM.md) · [README](../README.md)

`loupoli` must survive an aggressive WKWebView process kill. Persistence is split into two independent layers:

1. **Autosave cache** — IndexedDB recovery data written as a checkpoint plus localized command deltas.
2. **`.lpoly` project file** — the authoritative, portable user artifact saved through a native dialog or browser download.

Autosave is never presented as a manual save, and a manual save is never implied by autosave.

## Contents

1. [Durability model](#1-durability-model)
2. [Autosave engine](#2-autosave-engine)
3. [`.lpoly` project format v4](#3-lpoly-project-format-v4)
4. [Tauri / Rust filesystem boundary](#4-tauri-rust-filesystem-boundary)
5. [iOS lifecycle and memory](#5-ios-lifecycle-and-memory)
6. [Testing](#6-testing)


## 1. Durability model

| Layer | Storage | Frequency | Scope | Guaranteed? |
|---|---|---|---|---|
| Autosave checkpoint | IndexedDB | Session baseline; refreshed on compaction | Scene needed to reconstruct the current document | Best effort; OS may evict |
| Autosave deltas | IndexedDB | Every 30 s while dirty, plus visibility/pagehide | Localized transitions since checkpoint | Best effort; at most ~30 s lost on crash |
| Manual `.lpoly` | User-chosen path | User/Cmd+S | Complete Phase 2 project | Durable, user-owned |
| In-memory history | Bounded RAM | Immediate | Recent edits | Not durable |

UI states are distinct: `Unsaved`, `Saving…`, `Autosaved`, `Recovery available`, `Recovered`, `Autosave error`. The top bar labels recovered work until a manual save or explicit discard.

---

## 2. Autosave engine

Implementation: `src/lib/project/AutosaveService.ts`, integrated by `EditorRuntime`.

### 2.1 Unit of capture

Each committed command produces a serializable `JournalPatch`:

- `move-vertex` — node id, vertex index, committed position.
- `insert-node` — scene index plus a detached `NodeSnapshot` (metadata, transform, mesh columns).
- `remove-node` — node id.
- `transform-node` — node id plus position, rotation, and scale.
- `replace-mesh` — node id plus a complete localized mesh snapshot after destructive topology.
- `insert-group` / `remove-group` — group snapshot with transform, or a group id.
- `parent-node` — node id plus the new group id or null.
- `transform-group` — group id and position/rotation/scale.
- `set-modifiers` — node id plus the complete ordered modifier stack.
- A command may emit an ordered array of patches. Joining objects records `replace-mesh` for the target followed by `remove-node` patches; undoing records the reverse insertions.

Undo and redo append the inverse/forward transitions, so replay reconstructs the current document without replaying command history semantics. Add/delete nodes store only the affected node, never the whole scene. Vertex edits store numeric deltas.

`NodeSnapshot` copies typed arrays before they can mutate; IndexedDB's structured clone stores the arrays directly. No base64 is used.

Texture edits and paint/bake strokes are not represented as autosave pixel deltas; they mark the autosave dirty and force a fresh v4 checkpoint with PNG chunks on the next flush. Paint history stores only the localized before/after dirty rectangle. Topology, material, and light commands use localized journal patches.

### 2.2 Schedule

- `AutosaveService` owns one `setInterval(30_000)`; no animation-frame or Svelte timer writes state.
- While clean, the interval is a no-op.
- On the first dirty transition, the current in-memory checkpoint is retained; the first flush persists checkpoint + pending deltas.
- A flush serializes the checkpoint and delta snapshots before async I/O; it never holds live mutable arrays while the transaction is in flight.
- `visibilitychange → hidden` and `pagehide` trigger a best-effort flush.
- A failed write leaves the dirty flag set and surfaces `Autosave error`; the next tick retries.

### 2.3 Checkpoints and compaction

- The session checkpoint is captured at autosave initialization (or immediately after a recovered document is accepted).
- A checkpoint is encoded from the current scene when the delta journal exceeds **512 deltas** or **4 MB**, or when texture pixels change; that checkpoint replaces the in-memory baseline and deltas are cleared.
- When a manual save or open resets persistence, a fresh baseline is captured; it is not written until the first dirty flush.
- Checkpoint generation can copy the current mesh columns and should not run during a pen stroke. The current implementation only compacts on a 30 s flush when the caps are exceeded.

### 2.4 Limits

| Limit | Phase 2 value |
|---|---|
| Autosave delta count before checkpoint | 512 |
| Autosave delta bytes before checkpoint | 4 MB |
| `.lpoly` file size | 128 MB |
| Scene nodes per project | 1,024 |
| Vertices per mesh | 1,000,000 |
| Half-edges per mesh | 4,000,000 |
| Edges per mesh | 2,000,000 |
| Faces per mesh | 2,000,000 |
| History | 100 commands / 32 MB retained |

Texture budget: 512² default per asset, 2048² format cap, 64–2048 presets, eight-layer stack cap, per-asset storage. Texture autosave stores full PNGs in the checkpoint, so texture-heavy projects increase the checkpoint size.

### 2.5 IndexedDB schema

Database: **`loupoli-autosave`** (version 1)
Object store: **`state`**
Record key: **`current`**

```ts
{
  version: 1,
  checkpoint: Uint8Array,      // complete .lpoly v4 bytes (texture asset and bake PNG chunks included)
  settings: ProjectSettings,   // shading + PS1 flags
  deltas: JournalPatch[],      // transitions since checkpoint
  updatedAt: number
}
```

Only one recovery lineage is current in Phase 2. There is no per-project ID or sequence table yet; naming and multi-document recovery come with project management. This is deliberately one latest autosave, not a per-edit scene clone log.

### 2.6 Restore flow

1. Runtime initialization reads the one autosave record.
2. If present, it sets `recoveryAvailable` and does not start a new autosave or overwrite the record.
3. The recovery banner offers **Recover** or **Discard**.
4. **Recover** decodes the `.lpoly` v4 checkpoint, applies deltas in order, then validates/replaces the scene and imports texture PNGs. It resets history, applies saved viewport settings, and starts a new autosave baseline immediately.
5. **Discard** deletes the record and starts a new baseline from the current scene.
6. Save/Open are disabled until recovery is resolved.
7. Any decode/replay error is reported; the invalid record is not partly applied.

This is explicit recovery, never a silent replacement of the user's current scene or a newer file.

### 2.7 Cleared by manual save/open

- A successful manual save or file open clears the old recovery lineage.
- Autosave restarts with the current document as a clean baseline.
- Recovered work remains labelled until a manual save completes.

---

## 3. `.lpoly` project format v4

Implementation: `src/lib/project/lpoly.ts`. Rust validates the envelope and checksum but never parses document semantics.

`.lpoly` is a single-file, little-endian binary container around a UTF-8 JSON manifest and aligned typed-array payload columns.

### 3.1 File header

The header is **28 bytes**:

| Offset | Size | Type | Field |
|---:|---:|---|---|
| 0 | 8 | bytes | Magic `4C 50 4F 4C 59 00 00 00` (`LPOLY\0\0\0`) |
| 8 | 2 | u16 | Container version (`3` or `4`) |
| 10 | 2 | u16 | Flags (reserved, `0`) |
| 12 | 4 | u32 | Manifest JSON byte length |
| 16 | 4 | u32 | Payload byte length |
| 20 | 4 | u32 | CRC-32 (IEEE) over bytes from offset 28 to EOF |
| 24 | 4 | u32 | Reserved (`0`) |
| 28 | … | bytes | Manifest JSON |
| pad | … | bytes | Zero padding to a 4-byte payload start |
| … | … | bytes | Fixed-order typed-array columns |

`payloadStart = align4(28 + manifestLength)`, and the file must end exactly at `payloadStart + payloadLength`. v4 appends aligned texture asset PNG chunks after the mesh columns; the file is aligned to four bytes.

Validation occurs before geometry allocation:

- Exact magic and supported version.
- Lengths match the actual file.
- CRC-32 matches.
- Manifest is valid JSON with the expected format/version/settings shape.
- Counts are within caps and match column lengths.
- Each node/index pair is unique and in range.
- `HalfEdgeMesh.fromColumns` validates the full DCEL after columns are rebuilt.

Rust also validates magic, version, header lengths, file length, and CRC before reading/writing, but does not parse JSON/topology.

### 3.2 Manifest shape

```json
{
  "format": "lpoly",
  "version": 4,
  "settings": {
    "shading": "unlit",
    "ps1Snap": false,
    "ps1Affine": false
  },
  "textures": {
    "assets": [
      {
        "id": "texasset-1",
        "name": "Texture 1",
        "width": 512,
        "height": 512,
        "filter": "nearest",
        "alphaMode": "opaque",
        "activeId": "texlayer-1",
        "layers": [
          {
            "id": "texlayer-1",
            "name": "Base",
            "visible": true,
            "opacity": 1,
            "color": "#c8c2ad",
            "pattern": "solid",
            "blendMode": "normal",
            "kind": "fill",
            "role": "color",
            "pngLength": 24692
          }
        ]
      }
    ]
  },
  "lighting": {
    "ambientColor": "#ffffff",
    "ambientIntensity": 0.22,
    "lights": [
      {
        "id": "light-1",
        "name": "Sun",
        "kind": "directional",
        "color": "#fff4e0",
        "intensity": 2.4,
        "enabled": true,
        "castShadows": true,
        "shadowSoftness": 0.35,
        "position": [2, 2, 4],
        "direction": [-0.32, 0.23, -0.92]
      }
    ]
  },
  "cameras": [
    {
      "id": "camera-1",
      "name": "Camera",
      "position": [4, -6, 4],
      "target": [0, 0, 0],
      "fov": 42
    }
  ],
  "nodes": [
    {
      "id": "uuid",
      "name": "QuadSphere",
      "primitive": "quadsphere",
      "visible": true,
      "textureId": "texasset-1",
      "materialPalette": ["#c8c2ad"],
      "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "mesh": {
        "vertexCount": 26,
        "halfEdgeCount": 96,
        "edgeCount": 48,
        "faceCount": 24
      }
    }
  ]
}
```

No array offsets are stored. Columns are written in the fixed order below and 4-byte aligned; the decoder reads them sequentially using the counts. This is deterministic and keeps the manifest small.

### 3.3 Payload layout per node

For each node, in order:

1. `positions` — `f32`, `vertexCount × 3`
2. `vertexOut` — `i32`, `vertexCount`
3. `heOrigin` — `u32`, `halfEdgeCount`
4. `heTwin` — `u32`, `halfEdgeCount`
5. `heNext` — `u32`, `halfEdgeCount`
6. `heFace` — `i32`, `halfEdgeCount`
7. `heEdge` — `u32`, `halfEdgeCount`
8. `heUv` — `f32`, `halfEdgeCount × 2`
9. `edgeHalfEdge` — `u32`, `edgeCount`
10. `edgeFlags` — `u8`, `edgeCount`. Bit 0 is the UV seam flag; other bits remain reserved.

11. `faceHalfEdge` — `u32`, `faceCount`
12. `faceMaterial` — `i32`, `faceCount`

UV moves use a localized `move-uv` autosave patch per corner; unwrap uses one `replace-uv` patch containing the full per-corner UV column. UV coordinates remain in the existing `heUv` column. Texture assets, node bindings, simple material palettes, shape-key payloads, lights, ambient settings, render cameras, and animation are part of `.lpoly` v4 and the v4 autosave checkpoint.

Every array starts on a 4-byte boundary. `heFace = -1` marks a boundary half-edge. Boundary loops are serialized as ordinary half-edge cycles. UVs are per-corner (per half-edge). Seam flags round-trip and are authorable through the Edge-mode Seam action; face materials also round-trip.

### 3.4 v4 texture asset chunks

After all mesh columns, v4 writes each asset layer's binary PNG in manifest order. Raster layers are authoritative; fill layers retain their deterministic color/pattern metadata. Each chunk is 4-byte aligned; `pngLength` comes from the manifest and is bounded before allocation. The container CRC covers the manifest and every PNG chunk.

- v3 files read with default lighting; v4 files restore lights and ambient.
- v4 files restore texture assets, node bindings, lights, and ambient settings on open; a project without textures resets to one default asset.
- Texture/bake edits mark autosave dirty and force a fresh v4 checkpoint; recovery restores texture PNGs.
- Layer PNGs are never base64 or JSON strings.

### 3.5 Not yet serialized

- Nested object groups and group reparenting beyond the current one-level groups
- Shape keys, lights, material definitions
- Camera position/target
- Active object and selection

v3 and v4 are accepted during development. Unknown/newer container versions are rejected with a clear message. Texture and lighting fields are validated before allocation.

### 3.6 Save protocol

1. TypeScript encodes and validates the current scene, texture assets, node bindings, lights, and ambient settings into a v4 `.lpoly` byte array.
2. Tauri save dialog chooses a path; browser mode triggers a download.
3. For Tauri, Rust re-checks size, magic, header lengths, and CRC.
4. Rust writes a same-directory temporary file with `create_new`, `write_all`, and `sync_all`.
5. It renames over the destination. Unix replacement is atomic; Windows may remove the old destination first because `rename` does not replace it.
6. Failure leaves the old destination intact and removes the temporary file.
7. Browser fallback creates a `Blob` download; it does not claim native durability.

### 3.7 Open protocol

1. Native dialog selects a path; browser uses a file input.
2. Rust enforces 128 MB and validates the envelope/CRC before returning bytes.
3. TypeScript decodes manifest and columns and rebuilds/validates every DCEL.
4. Only after success does the runtime replace the document, import v4 texture PNGs, and reset history/autosave.
5. Errors are shown as project errors without mutating the current scene.

---

## 4. Tauri / Rust filesystem boundary

Implementation: `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src/lib/platform/projectFiles.ts`.

### 4.1 Commands

```text
read_project_file(path) -> Vec<u8>
write_project_file(path, Vec<u8>) -> ()
```

- Native open/save dialogs come from `tauri-plugin-dialog`.
- Capability permission: `dialog:default`.
- Paths originate from native dialogs, never remote content.
- Maximum read/write size: 128 MB.
- `.lpoly` extension is enforced by the dialog filter and suggested name; arbitrary chosen paths still receive byte validation.
- Rust does not parse document semantics; TypeScript owns schema/topology.
- Temp filename includes `.filename.tmp-<pid>-<timestamp>` in the same directory.
- A failed save removes the temp file and leaves the destination in place.

### 4.2 Browser fallback

- Save: `Blob` + object URL + temporary download link named `<project>.lpoly`.
- Open: hidden file input accepting `.lpoly`; `cancel` and a window-focus fallback handle cancellation.
- The platform adapter dynamically imports Tauri plugins only when `__TAURI_INTERNALS__` exists, so browser mode has no native dependency at runtime.

---

## 5. iOS lifecycle and memory

- No Svelte proxy wraps typed arrays, DCEL columns, or Three.js objects.
- Autosave stores one checkpoint and bounded deltas, not a snapshot per edit.
- History has command and byte caps; file/node/mesh caps are enforced before allocation.
- All derived geometries and materials are disposed with node views.
- Checkpoints/deltas use typed arrays and structured clone; no base64.
- A best-effort flush runs on visibility loss and pagehide.
- Recovery is explicit; manual save and autosave states are distinct.

The iOS project is still uninitialized. WKWebView background suspension, native file dialogs, security-scoped document providers, and physical-iPad memory behavior remain to be validated after iOS packaging.

---

## 6. Testing

Implemented automated coverage:

- `.lpoly` round-trips a scene containing QuadSphere, Cylinder (n-gon caps), and Grid (open boundary loops), including seam flags, materials, transforms, IDs, and byte-for-byte re-encoding.
- Corrupt checksum and foreign magic are rejected.
- Empty scenes round-trip.
- Node snapshots preserve mesh columns and boundary counts.
- Journal patches replay a checkpoint into the current document (primitive addition, vertex move, deletion).
- A 100-edit history session restores the exact initial `.lpoly` bytes and stays within the history budget.
- Rust tests cover envelope/CRC validation, atomic write/read, and missing-directory rejection.

Manual/browser verification:

- Autosave flush and reload shows the explicit recovery banner.
- Recover restores a moved vertex and structural node additions.
- Browser save produces a readable `.lpoly`; browser open restores the saved scene via a file input.
- No app console warnings/errors during the flows.

Still required before production: iOS native dialog/file tests, quota-eviction behavior, large-project profiling, and camera/project-name persistence.
