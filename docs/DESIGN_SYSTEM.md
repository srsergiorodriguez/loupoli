# loupoli — Design System

**Status:** Phase 2 tokens, shell, scene controls, selection overlays, autosave states, and recovery UI implemented; later component inventory remains planned.  
**Related:** [Plan](./PLAN.md) · [Architecture](./ARCHITECTURE.md) · [Persistence](./PERSISTENCE.md) · [README](../README.md)

---

## 1. Design direction

**Working name: “Signal Graphite.”**

A dark, low-chrome studio surface with warm typography, hairline structure, and a single acid-lime signal color. It should feel closer to a precision instrument than a game launcher: quiet at rest, legible under pressure, and unmistakably built for a low-poly modeling workflow.

What that means in practice:

- **The mesh is the hero.** Panels recede; the canvas owns the screen. No decorative gradients or animated backgrounds compete with geometry.
- **Density without punishment.** Desktop is compact and mouse-efficient. Touch expands the hit areas without turning the UI into oversized cards.
- **Technical, not “cyber.”** Monospace is reserved for numbers and state, not every label. No glow, scanlines, or neon everywhere. The PS1 reference lives in the shader and the icon/wordmark geometry.
- **One signal color.** Lime marks the active tool, current selection, and actionable primary controls. Axes retain conventional X/Y/Z colors. Everything else is graphite, warm white, or a quiet secondary periwinkle.
- **Honest surfaces.** Glass panels use an 8 px blur over a solid dark base and a visible 1 px edge. They must remain readable if `backdrop-filter` is unavailable.

---

## 2. Brand

- **Name:** always `loupoli`, lowercase. Never “Loupoli” in UI, title bars, dialog copy, or about screens.
- **Wordmark:** lowercase, tight tracking, semibold, with a small faceted mark. The mark is a low-poly folded “l” or faceted diamond; final vector asset comes with app icons.
- **App icon direction:** a single folded lime facet on near-black, no text at small sizes. Verify against the graphite UI and in monochrome contexts.
- **Voice:** direct, calm, specific. “Autosaved 12:42” / “Save a copy” / “This loop has a non-quad blocker.” No exclamation marks, no playful failure messages, no “Oops.”
- **Extension:** `.lpoly` in lowercase.

---

## 3. Design tokens

Tokens live in `src/design/tokens.css`. Components consume semantic tokens; no component should hard-code palette hex values, spacing numbers, or z-indexes.

### 3.1 Core CSS

```css
:root {
  color-scheme: dark;

  /* Canvas and surfaces */
  --bg-canvas: #121214;
  --bg-panel: rgba(24, 24, 28, 0.88);
  --bg-panel-strong: rgba(26, 26, 31, 0.96);
  --bg-surface: #18181c;
  --bg-raised: #202027;
  --bg-input: rgba(9, 9, 12, 0.72);
  --bg-hover: rgba(255, 255, 255, 0.055);
  --bg-pressed: rgba(255, 255, 255, 0.09);
  --bg-selected: rgba(201, 244, 92, 0.13);
  --bg-scrim: rgba(0, 0, 0, 0.45);

  /* Structure */
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.15);
  --border-focus: #c9f45c;
  --hairline: 1px;

  /* Type */
  --text-primary: #f2efe6;
  --text-secondary: #a6a3ac;
  --text-tertiary: #8e8c96;
  --text-disabled: #57565e;
  --text-inverse: #151807;

  /* Signal colors */
  --accent-primary: #c9f45c;
  --accent-primary-hover: #d8ff7d;
  --accent-primary-muted: rgba(201, 244, 92, 0.13);
  --accent-secondary: #8f8ff8;
  --accent-danger: #ff6b7a;
  --accent-warning: #ffb45e;
  --accent-success: #72e2b2;
  --selection: var(--accent-primary);
  --selection-hover: #ffffff;

  /* Axes */
  --axis-x: #ff6b7d;
  --axis-y: #9bdd72;
  --axis-z: #71a8ff;

  /* Viewport furniture */
  --grid-minor: rgba(255, 255, 255, 0.065);
  --grid-major: rgba(255, 255, 255, 0.12);
  --wireframe-edge: rgba(242, 239, 230, 0.26);
  --wireframe-edge-active: var(--accent-primary);
  --vertex-handle: rgba(242, 239, 230, 0.62);
  --material-solid: #cec8b9;
  --material-texture-a: #263129;
  --material-texture-b: #c8c2ad;
  --viewport-key-light: #fff2dc;
  --viewport-fill-light: #8eb6ff;

  /* Typography */
  --font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  --font-display: "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: "SF Mono", ui-monospace, "Cascadia Mono", "Roboto Mono", monospace;

  --text-2xs: 0.6875rem; /* 11px */
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.8125rem;  /* 13px */
  --text-md: 0.875rem;   /* 14px */
  --text-lg: 1rem;       /* 16px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.75rem;   /* 28px */
  --leading-tight: 1.2;
  --leading-ui: 1.35;
  --leading-body: 1.5;
  --tracking-ui: 0.005em;
  --tracking-label: 0.08em;
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;

  /* Spacing */
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-panel: var(--space-3);
  --space-control-gap: var(--space-2);

  /* Shape */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-pill: 999px;

  /* Controls */
  --control-h-sm: 24px;
  --control-h: 30px;
  --control-h-lg: 36px;
  --hit-min: 44px;
  --control-h-touch: 44px;
  --icon-size: 18px;
  --icon-size-touch: 20px;

  /* Chrome geometry */
  --shell-inset: 12px;
  --topbar-h: 48px;
  --toolrail-w: 52px;
  --inspector-w: 304px;
  --status-h: 28px;
  --gizmo-size: 88px;
  --gizmo-size-touch: 112px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);

  /* Glass and elevation */
  --blur-panel: 8px;
  --blur-strong: 16px;
  --shadow-panel:
    inset 0 1px 0 rgba(255, 255, 255, 0.035),
    0 12px 32px rgba(0, 0, 0, 0.32);
  --shadow-popover:
    0 18px 50px rgba(0, 0, 0, 0.48),
    0 2px 8px rgba(0, 0, 0, 0.3);

  /* Focus and disabled */
  --focus-ring-width: 2px;
  --focus-ring-offset: 2px;
  --opacity-disabled: 0.38;
  --opacity-muted: 0.64;

  /* Motion */
  --motion-instant: 80ms;
  --motion-fast: 140ms;
  --motion-panel: 220ms;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);

  /* Stacking */
  --z-canvas: 0;
  --z-hud: 10;
  --z-chrome: 20;
  --z-panel: 30;
  --z-popover: 40;
  --z-modal: 50;
  --z-toast: 60;
}
```

Density override for touch:

```css
:root[data-density="touch"] {
  --control-h: var(--control-h-touch);
  --control-h-sm: 36px;
  --control-h-lg: 48px;
  --hit-min: 44px;
  --topbar-h: 56px;
  --status-h: 32px;
  --inspector-w: 288px;
  --icon-size: var(--icon-size-touch);
  --space-panel: var(--space-4);
}
```

### 3.2 Additional tokens required by viewport code

The renderer reads a small, explicit subset of tokens at startup through `getComputedStyle` and converts them to Three.js colors:

- `--bg-canvas` → renderer clear color
- `--grid-minor`, `--grid-major` → grid shader
- `--wireframe-edge` → Wireframe mode; `--accent-primary` → selection, gizmo, and front-wire overlays; `--accent-warning` → UV seams
- `--axis-x`, `--axis-y`, `--axis-z` → gizmo and transform handles
- `--vertex-handle` → unselected topology handles
- `--material-solid`, `--material-texture-a`, `--material-texture-b` → Phase 1 material fixture
- `--viewport-key-light`, `--viewport-fill-light` → viewport lighting
- `--hud-bottom`, `--hud-bottom-raised` → bottom HUD and touch-toolrail clearance

Do not maintain a second hex palette in TypeScript. The CSS token file is the source of truth.

The 16 CSS px picking radius is a behavioral constant, not a visual token. It lives in `render/MeshNodeView.ts` (with the shared export in `render/ViewportRenderer.ts`) and is exercised by picking tests.

### 3.3 Token rules

- Semantic names beat appearance names. Use `--accent-danger`, not `--red`.
- Components may reference semantic tokens and local sizing variables, never raw palette values.
- No arbitrary `z-index` values; always reference `--z-*`.
- `rgba()` is used for translucent surfaces because it is explicit and predictable in WebKit.
- `backdrop-filter` must have a solid fallback via `@supports`.
- Do not add a light theme until dark-mode density and contrast are proven. The token layer is structured so a future theme is possible, but this is not a v1 feature.

---

## 4. Foundations

### 4.1 Typography

| Role | Token | Size / weight | Usage |
|---|---|---|---|
| Wordmark | display | 15px / 600 | Lowercase `loupoli`; tracking `-0.015em` |
| Project title | UI | 13px / 500 | Center topbar, truncates gracefully |
| Body / controls | UI | 12–13px / 400–500 | Most labels and controls |
| Section label | UI | 11px / 600, tracking `.08em` | Uppercase group labels; high contrast secondary |
| Numeric | mono | 11–12px / 400 | Vector fields, stats, time, autosave |
| HUD / status | mono | 11px / 400 | 3D coordinates, gesture state |
| Display / empty state | display | 20px / 500 | Empty scene title, large counts |
| Error | UI | 12px / 500 | Inline validation and toasts |

Rules:

- Use `font-variant-numeric: tabular-nums` on all numeric fields, counters, coordinates, and timelines.
- Do not use all-caps for the brand or for full sentences.
- No text below 11px in the product UI. Decorative micro-labels may use 11px minimum.
- Numeric controls display a stable precision (for example `0.250`) but strip unnecessary trailing zeros unless the field is actively focused on a fixed step.
- Long labels truncate with ellipsis and a `title`/accessible label; do not wrap topbar project names aggressively.

### 4.2 Spacing and layout rhythm

Use the 4px scale exclusively. The primary layout rhythm is:

- Panel padding: 12px desktop / 16px touch.
- Between related controls: 8px.
- Between groups: 16px.
- Between major sections: 24px.
- Panel gap: 12px.
- Floating panels sit 12px from safe-area edges.

### 4.3 Surfaces

- **Canvas:** matte `#121214`, no gradient.
- **Panel:** `--bg-panel` with 8px backdrop blur and a 1px subtle border.
- **Raised control:** `--bg-raised` with a stronger border only when focus/selection requires it.
- **Input wells:** darker than the panel, inset appearance, no heavy shadow.
- **Popovers:** stronger blur (16px), stronger shadow, same border language as panels.
- **No nested glass panels.** If content needs another grouping, use a section rule or an inset well instead of another blur layer; WebKit compositing cost is real.
- Provide `@supports not (backdrop-filter: blur(8px))` fallback backgrounds at ≥96% opacity.

### 4.4 Icons

- Local inline SVG registry, 24×24 viewBox, 1.5px stroke, rounded joins only where it helps legibility.
- Visual icon size: 18px desktop, 20px touch.
- Icons are drawn on the pixel grid where possible; avoid subpixel stroke widths.
- No icon-only action without an accessible name and, for unfamiliar actions, a tooltip/label.
- The icon set should feel geometric and mechanism-like: tool shapes, axis arrows, seam links, layer stacks, simple transforms. Not skeuomorphic.

### 4.5 Focus, hover, and states

- `:focus-visible` uses a 2px lime ring with 2px offset. Never remove focus indication.
- Hover is a fine-pointer enhancement only. All actions and states must remain discoverable and usable on touch.
- Selected state combines a lime tint and a non-color indicator (left rail, icon weight, or checkmark).
- Disabled controls use `--opacity-disabled`, retain layout, and expose an `aria-disabled` explanation where relevant.
- Pressed state is immediate (80ms) and uses a slight background shift, not bounce.
- Avoid animation on numeric values or mesh-related flash; fast, functional transitions only.

### 4.6 Motion

- Micro feedback: 80ms.
- Hover/press/tooltip: 140ms.
- Panel/bottom-sheet transitions: 220ms.
- Motion properties are limited to opacity and transform. Do not animate width/height of dense panels except during a deliberate resizable splitter drag.
- Respect `prefers-reduced-motion: reduce`: remove transforms and durations, keep state changes instant.
- No ambient pulse, shimmer, or infinite animation. The renderer has the same rule.

### 4.7 Accessibility and input affordances

- Touch and pen targets: minimum 44×44 CSS px even when the visual control is smaller. Expand hit areas with padding or an absolutely positioned hit region.
- Desktop pointer targets may be 30px visual; the same controls become at least 44px under `[data-density="touch"]`.
- Every icon-only button has `aria-label`. Switch/toggle semantics use `role="switch"`/`aria-checked`, or real inputs.
- Status messages use a polite live region. Errors use an alert or persistent inline message.
- Do not rely on color alone for axis, selection, or save state. Pair with labels, shapes, or text.
- Inputs select text normally; the rest of the shell sets `user-select: none`.
- User-scalable zoom is disabled in the Tauri shell because the canvas owns pinch gestures. Numeric inputs use sufficiently large text and browser/OS accessibility zoom remains available at the system level.
- `prefers-reduced-transparency` and a fallback for no backdrop-filter result in higher-opacity surfaces.
- `prefers-contrast: more` strengthens border/subtle text tokens.

---

## 5. Layout

### 5.1 Wide desktop / iPad landscape (≥ 900px wide)

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  loupoli   Untitled · edited      File  Edit  View      ↶  ↷    Save     │  48
│                                                                          │
│  ┌────┐  ┌────────────────────────────────────────────┐  ┌────────────┐  │
│  │    │  │                                            │  │ Scene      │  │
│  │ T  │  │                                            │  │────────────│  │
│  │ o  │  │              VIEWPORT                      │  │ Properties │  │
│  │ o  │  │                                                │ Transform  │  │
│  │ l  │  │                                    SHADING  │  │            │  │
│  │ s  │  │                                      GIZMO  │  │ Modifiers  │  │
│  │    │  │                                            │  │            │  │
│  └────┘  └────────────────────────────────────────────┘  └────────────┘  │
│                                                                          │
│  Snap 0.25   ·   Vertices 128 / Edges 256 / Faces 128      Autosaved 12:42 │ 28
└──────────────────────────────────────────────────────────────────────────┘
```

- Canvas is absolutely positioned and fills the entire shell, including behind floating chrome.
- Topbar, tool rail, and inspector are floating translucent panels; the status strip sits along the bottom edge with a top hairline.
- Topbar: brand at left, project title next to it, menus centered/left, edit actions and save at right. Menus collapse to an overflow on narrow widths.
- Tool rail: 52px wide; tools appear only when implemented. Vertical groups separated by a hairline.
- Inspector: 304px wide, scrolls internally. Sections have sticky group headers where useful.
- Viewport HUD: orientation gizmo at top-right inside the canvas, shading selector directly below it, small selection stats at bottom-left. At compact landscape widths the gizmo/shading cluster reflows into a horizontal row above the model so controls do not sit on the object.
- Do not let floating panels overlap each other. At constrained widths, the inspector collapses first, then the tool rail becomes a bottom dock.

### 5.2 Narrow / portrait iPad (< 900px)

```text
┌──────────────────────────────────────┐
│ loupoli   Untitled       ⋯      Save │  56 + safe-top
│                                      │
│                                      │
│              VIEWPORT                │
│                                      │
│                          [gizmo]     │
│                                      │
│   ┌──────── floating tool dock ───┐  │
│   │  Select  Move  Rotate  Scale  │  │  56
│   └───────────────────────────────┘  │
│  Snap 0.25 · 12:42       Inspector ↑ │  32 + safe-bottom
└──────────────────────────────────────┘
           ↑ bottom inspector sheet when opened
```

- Tool rail becomes a centered bottom dock with 44px+ buttons and short labels or tooltips.
- Inspector becomes a non-modal bottom sheet: hidden by default, opened from the topbar, max height `55dvh`, internal scroll, explicit close control with at least a 44px hit area. The viewport above the sheet remains interactive; no blocking scrim is used.
- Orientation gizmo shrinks visually but its entire 112px interaction area remains.
- Menus are consolidated into a single `⋯` popover.
- The status strip remains above the bottom safe area; it must not be covered by the home indicator.
- Modals (save/recovery) become full-width sheets with a clear cancel action.

### 5.3 Shell geometry

| Region | Desktop / landscape | Touch portrait |
|---|---|---|
| Topbar height | 48px | 56px |
| Topbar inset | 12px | max(12px, safe area) |
| Tool rail | 52px | 56px bottom dock |
| Inspector | 304px | 55dvh bottom sheet |
| Panel gap | 12px | 12px |
| Status strip | 28px | 32px + bottom safe inset |
| Gizmo | 88px | 112px |
| Minimum viewport | 1024×700 window on desktop | any remaining space above dock |

### 5.4 Layering and pointer event rules

```text
z=60  toast
z=50  modal / recovery
z=40  popover / menu / tooltip
z=30  inspector, topbar, tool rail, status
z=20  viewport HUD (gizmo, shading)
z=10  CSS overlays that are pointer-transparent
z=0   WebGL canvas
```

- The shell root is `100vw × 100vh` with `100dvh` as the iOS-safe enhancement, `overflow: hidden`, `overscroll-behavior: none`.
- Canvas: `touch-action: none`, `user-select: none`, no browser gestures.
- The chrome overlay layer is `pointer-events: none`; interactive panels and controls set `pointer-events: auto`. This lets camera gestures pass through empty HUD areas but never through controls.
- Chrome overlay layers (`topbar`, tool rail, inspector, status) and the canvas use explicit stacking contexts. The iPad inspector sheet is non-modal and never covers the whole viewport or installs a blocking scrim. Camera interactions remain available above it.
- Panels never nest backdrop-filter layers; nested sections use flat surface differences.
- No horizontal page scroll at any supported width. Internal inspector scrolls must be intentional and contained.

### 5.5 Safe areas and iOS chrome

- Root sets `viewport-fit=cover` and consumes `env(safe-area-inset-*)` through tokens.
- Topbar and bottom dock respect `--safe-top` / `--safe-bottom`.
- The canvas is allowed to extend into safe areas; the UI is not allowed to sit under the home indicator or camera cutout.
- The iOS status bar may be hidden for immersive editing only after testing legibility and navigation. Do not obscure critical save state.
- Tauri desktop window background is `--bg-canvas` to avoid a white launch flash.

---

## 6. Component system

Components live under `src/lib/ui/` and are built in Svelte 5 rune syntax. Each has typed props, an accessible name/path, scoped styles, and only the states it actually supports. Do not ship a component library showcase page; build primitives as features need them.

### 6.1 Component inventory

Implemented component files and local patterns:

| Component / pattern | Phase | Purpose | Notes |
|---|---:|---|---|
| App shell layout | 1 | Canvas + chrome layout, safe areas, density | `App.svelte` owns layout only, no editor state |
| `TopBar` | 1–2 | Brand, project title, open/save, autosave state, history actions | File actions collapse on narrow widths |
| `ToolRail` | 1–3 | Desktop left rail; bottom-docked touch toolrail | Select, Move, Rotate, Scale, Frame; active state is not color-only |
| `StatusBar` | 1 | Hints, topology counts, renderer state | Hints are context-sensitive; autosave lives in the top bar |
| `OrientationGizmo` | 1–3 | Interactive camera orientation | Drag-to-orbit; tap axis to snap, center to frame |
| `ShadingControl` | 1 | Five viewport modes | Labels on wide desktop, 44px icon-only buttons on touch |
| `SelectionModeControl` | 2 | Vertex/Edge/Face mode switch | 44px targets, active state not color-only |
| `ActionDock` | 3 | One-shot mesh actions | Bottom-left 2×2 grid, 64×44 minimum targets, contextual disabled states |
| `ActionHud` | 2 | Action readout | Bottom-center raised pill; drag/exact/release hints |
| `UvPanel` | 4 | Resizable UV editing split | Bottom pane, 44px mode/lock/action targets, 16 px corner pick, seam overlay, two-way linked selection, exact numeric fields, Unwrap/Pin actions, pin markers, and failure banner |
| `TransformHud` | 2 | G/R/S readout | Bottom-center pill with target, axis, exact value, key hints |
| `Inspector` | 1–3 | Scene, transform, modifiers, mesh actions | Floating panel; section-head pattern |
| `IconButton` | 1 | Compact symbol actions | Accessible label mandatory |
| `ToolButton` | 1–3 | Tool rail item | Selected state has a non-color indicator |
| `Switch` | 1–3 | Snap/visibility and booleans | Larger hit area than visual track |
| `Vector3Field` | 2–3 | XYZ transform rows | Axis colors, unit suffix, 44px touch inputs |
| `Icon` | 1–3 | Local SVG registry | No icon package |
| `ProjectBanner` / save state | 2 | Recovery, save/open errors, autosave status | Explicit Recover/Discard; errors persist until dismissed |
| `.loupoli-panel` surface | 1 | Floating glass surface | Flat nested sections; no nested blur |
| `.section` / `.section-head` | 1–3 | Inspector section layout | Shared local pattern, not a component file |
| Selection actions | 3–4 | Extrude, inset, loop cut, seam, merge, bridge, delete | Compact chips; destructive action separated; seam uses `--accent-warning` |
| `Object multi-select` | 3 | Shift/Cmd-click and sticky toggle; join | 44px rows/actions, lime selected dots |
| Group tree | 3 | Folder rows and indented children | Group active state; bake-on-ungroup |
| Modifier stack | 3 | Ordered cards with enable/order/remove/parameters | Explicit evaluated state and error panel |
| Transform orientation toggle | 3 | Local/Global transform space | Two-button control; 44px touch width/height |
| `Selection gizmo` / `ObjectGizmo` | 3 | Move/Rotate/Scale axes | Median placement for elements; screen-constant size; enlarged Pencil hit volumes |
| Grid snap / axis chips | 3 | Snap toggle/step and X/Y/Z locks | 44px chips, accent state, axis colors |
| PS1 look | 3 | Collapsed render-effect module | Native details/summary; off by default |
| Native selects | 2–3 | Primitive palette and modifier parameters | 44px touch target |

Planned primitives not yet extracted:

- Shared `Button`, `SegmentedControl`, `Tooltip`, `Popover`/`Menu`, `NumberField`, `Kbd`, `Tabs`, `Slider`, `EmptyState`, `Badge`, `Dialog`, `DropZone`, `ListRow`, `ColorField`, `ModifierCard`, `TextureLayerRow`, `Timeline`, `SplitViewport`.
- A shared bottom-HUD shell. Until extracted, `ActionHud` and `TransformHud` use the `--hud-bottom` / `--hud-bottom-raised` tokens and must not be active simultaneously.
- 6.2 behavior rules describe the intended interaction contract for both current local markup and future extracted primitives.

#### Action sizing hierarchy

- **Primary:** 44px minimum height; full-width only for decisive actions such as Add.
- **Tool rail:** 52px rail on desktop; 44px+ touch targets in the bottom dock (measured 64×52 in the iPad toolrail).
- **ActionDock:** 64px minimum width, 44px minimum height; 2×2 grid.
- **Compact Inspector actions:** 30px visual on desktop, 44px touch hit region.
- **HUDs:** non-interactive; minimum height `--control-h`, pointer-events none.

### 6.2 Core component behavior

#### Button

- Variants: `primary` (lime fill, ink text), `secondary` (raised surface, subtle border), `ghost` (transparent until hover), `danger`.
- Visual height 30px desktop, 44px touch; horizontal padding 12px/16px.
- Primary is reserved for a single decisive action in a region (Save, Recover). Do not stack multiple lime fills.
- Labels are sentence case. Icons are optional, never decorative-only inside a labeled button.
- Disabled state is visibly inert and retains size. If the reason is not obvious, the surrounding UI explains it.

#### IconButton / ToolButton

- IconButton visual 30×30 desktop, 44×44 touch; glyph 18/20.
- ToolButton is 40px visual inside the 52px rail, with a 44px hit area. On touch dock, it is at least 44×44.
- Selected tools use lime foreground plus a 2px left indicator or filled base; not lime background alone.
- Tool labels appear in tooltips on pointer devices and accessible names. Portrait dock may show short text labels under icons where width permits.

#### SegmentedControl

- 2–4 mutually exclusive options, used for shading and selection modes.
- 30px visual desktop; 44px touch. Use real radio inputs or correct `role="radiogroup"` semantics.
- Keyboard arrows move selection, Home/End jump to ends.
- Icons may be paired with short text; avoid compressing four labels into a tiny width. On narrow screens use a single popover trigger instead.

#### NumberField / Vector3Field

- Monospace numerals, tabular figures, right-aligned or consistently decimal-aligned.
- Drag-to-scrub on the label/field with pointer capture; Shift = ×10 step, Alt = ×0.1 step. Direct typing supports expressions only if explicitly documented; otherwise parse finite numbers.
- Enter commits, Escape restores the value at focus time, blur commits a valid value.
- Invalid input gets an inline red border and an accessible explanation; it never writes NaN to the document.
- Each XYZ field has a subtle axis stripe/label using `--axis-x/y/z`. Axis is never communicated by color alone.
- On touch, min-height 44px and enough width for a signed number plus decimals.

#### Panel / Inspector

- Header: section title 11px uppercase tracking, optional count/mode on the right, no decorative icons.
- Sections separated by hairlines with 16px vertical padding.
- Sticky inspector tabs at top; content scrolls with momentum only within the panel.
- Scrolling in a panel does not orbit the canvas. Pointer events are confined.
- Inspector collapsed state is explicit; do not leave an empty 304px rail.

#### OrientationGizmo

- Top-right of the viewport, not inside the inspector. Entire visual is a single 88px desktop / 112px touch interactive target, satisfying target guidance without requiring six tiny 44px balls.
- Draw positive axes at full saturation and negative axes as small faded endpoint dots; labels X/Y/Z are always readable.
- Clicking near an axis direction snaps the camera to the nearest orthographic-style view transition (animated, scheduler-driven, cancelable by new input).
- A small cube at the center indicates current orientation and provides an isometric reset.
- No second WebGL context.

#### Status bar

- Left: active contextual hint (tool-specific) or last transient action.
- Center: topology counts when a mesh is selected; hidden on narrow screens.
- Right: snap state (with step), save/autosave state, optionally camera axis.
- Use tabular numerals; status changes are never conveyed by color alone.
- Height 28px desktop / 32px touch plus safe inset.

#### Tooltips

- Fine pointer only, 500ms delay, 140ms fade. Use a short sentence fragment, no period for labels.
- Touch and pen do not depend on tooltips. Long labels live in the inspector or accessible description.
- Tooltips never intercept pointer events and never cover the toolbar target permanently.

### 6.3 States and tokens per control

| State | Visual treatment |
|---|---|
| Default | Surface/raised, subtle border, primary or secondary text |
| Hover (fine pointer) | 6% white overlay; no layout shift |
| Pressed | 9% white overlay or lime-tinted for primary; transform-none |
| Focus-visible | 2px lime ring, 2px offset; must be visible on all surfaces |
| Selected | Lime tint + lime text/indicator; not color alone |
| Disabled | 38% opacity; pointer events not active; accessible reason |
| Invalid | Danger border + inline message + no write |
| Busy | Small inline progress/spinner; disable duplicate submission, not the whole editor |
| Loading | Skeleton only for panels; canvas avoids animated skeletons |

---

## 7. Interaction design

### 7.1 Tool model

- A tool is an explicit active mode in the tool rail or bottom dock, with the active label visible in the status bar.
- No hidden “select + modifier key” mode for essential actions; keyboard shortcuts are accelerators of visible UI.
- Tool help is concise and contextual: one line in the status bar, full guidance in a popover/documentation.
- Construction/tool gestures show live previews without committing until pointer up. Escape cancels. The state is reversible.
- Tools that cannot operate on the current selection are visibly disabled with a reason, not silently no-op.

### 7.2 Touch ergonomics

- 1-finger drag: camera orbit. 2-finger pinch: zoom. 2-finger drag: pan.
- 2-finger tap: undo. 3-finger tap: redo. The gesture must be forgiving but never fire after pinch movement.
- Pen bypasses camera; it does not require disabling touch. While pen is active, palm touch should not orbit.
- No essential action requires hover, right-click, or a keyboard.
- Axis locking during transforms is available as on-screen X/Y/Z chips with 44px targets; pen/touch must be able to constrain a drag without a keyboard.
- Numeric transforms are always accessible in the inspector for exact values.
- All panels remain reachable by thumb where possible; the primary actions sit at the sides/top rather than under the hand.

### 7.3 Mouse and keyboard

- LMB on a vertex handle: select/edit with the active tool.
- LMB drag on empty canvas or a mesh face away from a handle: orbit. This is the trackpad-friendly fallback that keeps navigation available on one-button devices.
- Alt/Option + LMB: orbit (including when starting on a vertex); add Shift to pan.
- MMB drag: orbit; Shift+MMB: pan; wheel: zoom.
- Direct vertex editing takes precedence only when the pointer starts within the 16 CSS px pick radius of a vertex.
- Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo.
- X/Y/Z axis-lock toggle during an active transform; Enter commits; Esc cancels.
- Arrow keys adjust focused numeric fields by one step.
- Tab order is visible and follows the visual layout.

### 7.4 Feedback and tone

- Hover pick feedback: subtle white/lime hover on the closest vertex/edge/face within picking tolerance.
- Select: lime with a stable, crisp indicator. No particle effects or long easing.
- Operation failure: inline error near the action, plus one line in the status bar. Avoid modal interruptions for recoverable errors.
- Autosave text is always literal: “Autosaved 12:42”, “Saving…”, “Autosave failed”. No ambiguous green dot as the only cue.
- Recovery appears as a banner, not a blocking modal, so the user can inspect the recovered scene before choosing.

---

## 8. Viewport visual language

- Grid: XY plane, subtle minor lines, slightly stronger major lines every 10 cells, axis lines in X/Y colors. Fade at distance if the custom grid shader supports it; avoid moiré on Retina.
- Background: flat `--bg-canvas`; no vignette or gradient in the default mode.
- Mesh:
  - Wireframe: 1px-equivalent lines, low-contrast neutral edges; selected/active edges use lime.
  - Solid: warm neutral clay, flat faces, fixed key/fill. No specular.
- **Unlit/PS1:** correct perspective-correct albedo/texture mapping is the default. Vertex snapping and affine texture interpolation are opt-in PS1 effects in the Inspector. Nearest filtering remains part of the retro look.
- **Bent quads:** a non-planar quad remains a single quad in the UI and wireframe, but its textured surface is rendered as a bilinear patch. The modeler should not see a hard triangle-diagonal texture seam when dragging a corner. Topology counts remain topological; internal render tessellation is not surfaced as topology.
  - Lit: scene lighting with the same faceted surfaces; no PBR gloss in the retro mode.
- Selection:
  - Vertex: crisp square/diamond point at least 6px visual, hit radius 16 CSS px.
  - Edge: 2px screen-consistent highlight; avoid unreliable `gl.lineWidth`.
  - Face: subtle lime tint plus outline or centroid marker; must remain legible in all shading modes.
- Transform gizmo: conventional axis colors, 12/16px handles, 44px touch target expansion; active axis brightens, locked axes remain indicated.
- PS1 effect must be visibly intentional but not make editing impossible: optional toggle, never forced on the Solid/Lit modes.
- The canvas is never overlaid with scanlines, film grain, CRT curvature, or screen-space noise in the editor UI. The retro effect belongs to the shading mode, not the tools.

---

## 9. Responsive and density rules

- Density is driven by input capability, not just screen width: `data-density="touch"` on coarse-pointer devices. A large iPad with a trackpad still deserves 44px targets.
- Use width media queries for layout structure; use density attribute for target sizes and panel padding.
- Breakpoints are implementation guidance, not brand constants:
  - `≥ 1280px`: full inspector 304px, full topbar.
  - `900–1279px`: inspector 280px, compressed topbar menus.
  - `< 900px` or portrait viewport: inspector bottom sheet, horizontal tool dock, compact topbar.
- Never scale text with viewport units. Avoid `vw` font sizes.
- On narrow screens, hide nonessential status center content before hiding autosave state.
- The orientation gizmo can shrink visually but never below a whole-gizmo touch target of 88px.
- Use container queries where a component (not the page) changes layout. Do not apply viewport queries inside dense inspector components.

---

## 10. Implementation rules

### Svelte

- Svelte 5 runes only: `$state`, `$derived`, `$effect`, `$props`; no legacy stores or `export let`.
- Components are presentation and intent only. They never mutate `HalfEdgeMesh` or Three.js objects directly.
- Keep reactive state small: IDs, booleans, numeric summaries, open/closed flags. Mesh/Three data stays in engine classes.
- Prefer explicit callbacks/props over implicit context for editor actions. Use context only for stable design-system providers (density, toasts) if needed.
- Effects never own editor lifetime; renderer/lifecycle lives in engine bootstrap and is cleaned up explicitly.
- All clickable controls render a native button/input where possible.

### CSS

- Vanilla CSS with scoped component `<style>` blocks and global tokens/base reset only.
- No Tailwind, no CSS-in-JS, no component CSS library.
- Use `min-height: var(--hit-min)` or an explicit hit-area pseudo-element for touch targets.
- Use `@supports` for backdrop blur, `@media (prefers-reduced-motion)` and `(prefers-reduced-transparency)`.
- Use CSS nesting only where supported consistently in the current WKWebView and Vite build; keep selectors simple.
- Never use `!important` except for narrowly scoped utility resets with a comment.
- Ensure elements with `touch-action: none` are part of the canvas/gesture surface, not the whole document; panels need normal internal scrolling.

### Svelte file examples

```text
src/design/tokens.css
src/design/base.css
src/design/theme.ts
src/lib/ui/primitives/Button.svelte
src/lib/ui/primitives/IconButton.svelte
src/lib/ui/primitives/SegmentedControl.svelte
src/lib/ui/chrome/TopBar.svelte
src/lib/ui/chrome/ToolRail.svelte
src/lib/ui/panels/Inspector.svelte
```

### Definition of done for a UI component

- States: default, hover, active, focus-visible, disabled, selected where applicable.
- 44px touch hit area or a larger composition-level target.
- Keyboard-operable and screen-reader-labeled.
- Handles long labels and narrow widths without hiding actions.
- Uses tokens only for color, spacing, type, radius, blur, motion, and z-index.
- No continuous animation or rendering introduced.
- Tested in desktop and iPad portrait/landscape shells, not only isolated in a gallery.

---

## 11. Phase 1–2 design deliverables

The foundation and topology/persistence slice contain:

- `tokens.css`, `base.css`, and theme token extraction for the renderer.
- Full shell layout with responsive desktop/landscape/portrait variants.
- `TopBar` with open/save/autosave, `ToolRail`, `StatusBar`, selection-mode control, and recovery/project banners.
- `Panel`, `Button`, `IconButton`, `ToolButton`, `SegmentedControl`, `Switch`, `Tooltip`, `Popover`.
- `OrientationGizmo`, `ShadingControl`, and a scene outliner with primitive add/delete.
- Empty viewport/inspector states that explain the real state without disabled future buttons.
- Focus, touch targets, safe-area handling, reduced-motion fallbacks.

Inspector sections for transforms, modifiers, UV layers, and timeline are introduced with their actual features in Phases 3–5. No dead UI is shipped early to “show the layout.”

---

## 12. Visual QA checklist

- The wordmark renders as lowercase `loupoli` everywhere.
- Canvas occupies the full shell and never scrolls the page.
- No floating panel sits under a safe-area inset or the home indicator.
- 44px targets verified with a coarse pointer, including icon buttons, tabs, dock tools, and numeric controls.
- One primary lime action per region; lime is not used decoratively.
- Text contrast meets WCAG AA for normal text; tertiary text is not used for essential labels.
- Blur fallback and reduced-transparency fallback are tested.
- Idle mode shows no loading spinner, pulse, or animation.
- Keyboard tab order is logical; focus rings are visible against every surface.
- iPad portrait bottom sheet can be opened, dismissed, and never traps the user; the viewport above it remains interactive.
- The orientation gizmo is legible at 88px and easy to hit at 112px.
- Shading mode controls remain reachable in every layout.
- Autosave/save status is distinct and readable without color alone.
