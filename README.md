# loupoli

**A simple and friendly 3D modeler for iPad and desktop.**

loupoli is a low-poly, pen-first modeler built around a real half-edge mesh,
direct editing, and a local-first workflow. This README is the repository hub
for both using and building the app. Deep implementation notes live in
[docs](docs/README.md).

**Try it:** [Web app](https://srsergiorodriguez.github.io/loupoli/app/) ·
[Landing page](https://srsergiorodriguez.github.io/loupoli/) ·
[Documentation](docs/README.md) · [License](LICENSE)

![loupoli desktop viewport](docs/media/desktop-overview.png)

## Status

| Platform | State |
|---|---|
| Web / PWA | Deployed and installable from Safari; offline shell and browser storage |
| iPadOS | Signed development build installed and smoke-tested; no public installer or App Store release yet |
| macOS | Tauri target builds; native window smoke test still pending |
| Windows / Linux | Tauri target exists; not built or verified on hardware yet |
| App Store / TestFlight | Not started |

Native installers and executables are not published yet. When they are ready,
they will be distributed alongside the web build. The web app is usable today
without an account.

## Use loupoli

### Web app

Open <https://srsergiorodriguez.github.io/loupoli/app/>.

On iPad, use **Share → Add to Home Screen** to install the PWA. After the first
load it can run offline. Important work should still be exported as a `.lpoli`
file because browsers may evict origin storage.

The web build saves a downloaded project copy rather than overwriting a file.
Native builds use real file dialogs and save in place.

### Native builds

The native shell is built with Tauri for macOS, Windows, Linux, and iPadOS. It
adds native project dialogs, atomic save-in-place, AVFoundation MP4 export on
Apple platforms, and normal app-lifecycle behavior.

There is no public native download yet. The iPad development build is installed
from Xcode with a development certificate.

### First steps

- The first-run scene and **New Project** both create an editable cube.
- Workspace tabs switch between **Model**, **UV**, **Paint**, **Light**,
  **Animate**, and **Render**.
- The Inspector is a right column on desktop and a non-modal bottom sheet on iPad.
- The status bar owns snapping and shows the current tool hints.
- Save with **Cmd/Ctrl+S**; the browser build downloads a copy.

### Input at a glance

| Input | Behavior |
|---|---|
| Pencil | Selects and edits; never orbits. Pressure and tilt affect painting. |
| Touch tap | Selects the current vertex, edge, or face. |
| Touch drag on empty space | Orbits. On a handle or gizmo, edits instead. |
| Two fingers | Pan and pinch zoom. |
| Two-finger tap / three-finger tap | Undo / redo. |
| Mouse | LMB edits handles; LMB on empty space orbits; RMB pans; wheel zooms. |
| Shift / Cmd / Ctrl | Adds to or removes from a selection; the sticky **Add** control does the same for touch and pen. |

The complete controls table, save behavior, and platform notes are in
[docs/USAGE.md](docs/USAGE.md).

## Develop loupoli

### Requirements

- Node.js 22.12 or newer
- Rust 1.90 or newer
- Xcode and CocoaPods for the Apple/iOS shell

### Common commands

```bash
npm install
npm run dev          # browser development at http://localhost:1420
npm run tauri dev    # native desktop shell
npm run check        # Svelte + strict TypeScript diagnostics
npm test             # geometry, document, history, and format tests
npm run build        # production frontend
npm run preview:pwa  # serve the production PWA locally
```

### iPad development

```bash
npx tauri ios init
APPLE_DEVELOPMENT_TEAM=YOUR_TEAM_ID npx tauri ios build
```

The device must be trusted, have Developer Mode enabled, and have a valid Apple
Development certificate/profile. `npx tauri ios dev` runs a hot-reload build
that loads the frontend from the Mac and therefore requires Local Network
permission; a release build embeds the frontend and is standalone.

### Web deployment

The repository deploys through GitHub Actions:

- `.github/workflows/pages.yml` builds the app and landing page.
- The landing page is served at the repository root.
- The PWA is served at `/app/`.
- Vite and the manifest/service worker use the repository base path.

See [docs/PWA.md](docs/PWA.md) for the full deployment and browser limitations.

## Implemented

- **Mesh and modeling:** Z-up WebGL2 viewport, columnar half-edge DCEL with
  explicit boundaries, per-corner UVs, seams, materials, adaptive bilinear
  quads, selection, transforms, topology tools, groups, and modifiers.
- **UV and paint:** seam charts, LSCM unwrap, pinned unwrap, shared atlases,
  layered textures, paint/eraser/shapes/gradient/fill, projection painting,
  pressure and tilt, adjustable hardness/smoothing/noise, and pressure-aware
  stamp spacing with coalesced Pencil samples.
- **Lighting:** directional and point lights, hard/soft shadows, per-corner AO
  preview, direct-light and AO texture baking, and bake-atlas preparation.
- **Animation and render:** transform/shape-weight/texture/camera/light tracks,
  multiple clips, mesh-motion poses, scene cameras, clean still/frame/MP4
  rendering, and cancellable jobs.
- **Persistence and interchange:** `.lpoli` v10 with binary texture chunks,
  IndexedDB autosave/recovery, OBJ/GLB import/export, and native file I/O.
- **Platforms:** installable PWA, Tauri desktop shell, and signed iPad
  development build.

## Architecture

The document owns the source of truth. `THREE.BufferGeometry` is derived render
data; all editing and undo commands operate on the DCEL. The UI session is a
projection over the runtime and never stores document geometry in Svelte runes.

```text
src/
  design/            CSS tokens, base styles, canvas theme extraction
  lib/
    editor/          Runtime, session projection, history, commands
    geometry/        Half-edge DCEL, primitives, topology, modifiers
    input/           Pointer-type router, gestures, shortcuts
    paint/           Brush engine and raster painting
    platform/        Browser/Tauri project and media adapters
    project/         `.lpoli` codec and autosave journal
    render/          WebGL2 viewport, camera rig, materials, light rigs
    scene/           Scene nodes, groups, lights, cameras, animation
    ui/              Chrome, panels, primitives, Inspector and workspace UI
src-tauri/           Tauri v2 shell, native dialogs, Rust file I/O, MP4 writer
docs/                Plans, architecture, persistence, UI rules, guides, media
site/                Public landing page deployed at the Pages root
```

Key boundaries:

- Commands are the only document mutation path; gestures commit once.
- The renderer schedules frames on demand and has no idle loop.
- Browser/Tauri differences sit behind platform adapters.
- The PWA service worker is never registered inside Tauri.

## Verification

Current checks:

- `npm run check`: 0 errors, 0 warnings.
- `npm test`: **272 tests across 58 files**.
- `npm run build`: passes.
- `cargo test` in `src-tauri`: **7 passing tests**.
- Signed iPad release installed and launched on an iPad Air with iPadOS 26.6.1.
- GitHub Actions builds and deploys the landing page and PWA successfully.

Still unverified:

- Windows and Linux native builds.
- macOS native window smoke test.
- App Store/TestFlight packaging and review.
- Long-session memory and performance on physical iPad hardware.

## Limitations

- The PWA cannot save in place, use the native AVFoundation MP4 writer, or
  guarantee browser storage. Export important work.
- Native installers are not published yet.
- The iPad build is a development install, not an App Store release.
- GLTF texture import, skinning, and external OBJ texture maps are still future
  work.
- Physical iPad performance, palm rejection at the edges, and App Store
  distribution need hardware packaging validation.

## Contributions

loupoli is **source-available**, not open source. External code contributions,
pull requests, and patches are not accepted at this time; keeping the project
single-author avoids licensing and provenance ambiguity. Bug reports and
feedback through GitHub issues are welcome.

## License

loupoli's source is available under the
[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0).
Personal, educational, research, and other noncommercial use is permitted.
Commercial use and commercial derivatives require a separate written license;
see [COMMERCIAL.md](COMMERCIAL.md).

The sample gorilla model and texture used for documentation screenshots are
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), not
under PolyForm. See [ASSETS.md](ASSETS.md) for attribution.

## Documentation

| Document | Purpose |
|---|---|
| [Using loupoli](docs/USAGE.md) | Web/native use, controls, saves, installation |
| [Documentation index](docs/README.md) | Reading order and ownership |
| [Working instructions](AGENTS.md) | Engine, persistence, UI, and quality rules |
| [Master plan](docs/PLAN.md) | Product scope, phases, risks, approved decisions |
| [Architecture](docs/ARCHITECTURE.md) | Runtime boundaries, DCEL, rendering, platform |
| [Persistence](docs/PERSISTENCE.md) | Autosave journal and `.lpoli` format |
| [PWA](docs/PWA.md) | Deployment, installation, and browser limitations |
| [UI map](docs/UI_MAP.md) | Shell regions and workspace ownership |
| [UI rules](docs/UI_RULES.md) | Behavioral UI contracts |
| [Design system](docs/DESIGN_SYSTEM.md) | Tokens, typography, components, visual QA |
