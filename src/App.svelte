<script lang="ts">
  import { onMount } from 'svelte';
  import TopBar from './lib/ui/Chrome/TopBar.svelte';
  import ToolRail from './lib/ui/Chrome/ToolRail.svelte';
  import ShadingControl from './lib/ui/Chrome/ShadingControl.svelte';
  import SelectionModeControl from './lib/ui/Chrome/SelectionModeControl.svelte';
  import TransformHud from './lib/ui/Chrome/TransformHud.svelte';
  import ActionDock from './lib/ui/Chrome/ActionDock.svelte';
  import ActionHud from './lib/ui/Chrome/ActionHud.svelte';
  import OrientationGizmo from './lib/ui/Chrome/OrientationGizmo.svelte';
  import StatusBar from './lib/ui/Chrome/StatusBar.svelte';
  import Inspector from './lib/ui/Panels/Inspector.svelte';
  import ProjectBanner from './lib/ui/Chrome/ProjectBanner.svelte';
  import UvPanel from './lib/ui/Uv/UvPanel.svelte';
  import PaintPanel from './lib/ui/Paint/PaintPanel.svelte';
  import PaintShapePreview from './lib/ui/Paint/PaintShapePreview.svelte';
  import PaneHost from './lib/ui/Panels/PaneHost.svelte';
  import IconButton from './lib/ui/Primitives/IconButton.svelte';
  import TooltipLayer from './lib/ui/Primitives/TooltipLayer.svelte';
  import AnimationTimeline from './lib/ui/Animation/AnimationTimeline.svelte';
  import { shortcutBus } from './lib/input/ShortcutBus';
  import { commandForKeyboardEvent } from './lib/input/commands';
  import { EditorSession } from './lib/editor/EditorSession.svelte';
  import { EditorRuntime } from './lib/editor/EditorRuntime';

  const session = new EditorSession();

  let canvas: HTMLCanvasElement;
  let startupError = $state<string | null>(null);

  function focusViewport(): void {
    canvas?.focus({ preventScroll: true });
  }

  onMount(() => {
    if (!canvas) {
      return;
    }

    const compactQuery = window.matchMedia('(max-width: 899px)');
    const syncCompact = (): void => {
      session.setCompactLayout(compactQuery.matches);
    };
    syncCompact();
    compactQuery.addEventListener('change', syncCompact);

    const pointerQuery = window.matchMedia('(pointer: coarse)');
    const syncDensity = (): void => {
      document.documentElement.dataset.density = pointerQuery.matches
        ? 'touch'
        : 'fine';
    };
    syncDensity();
    pointerQuery.addEventListener('change', syncDensity);

    try {
      const runtime = new EditorRuntime(canvas, {
        onSnapshot: session.receive
      });
      session.attach(runtime);
      if (import.meta.env.DEV) {
        window.__LOUPOLI_DEBUG__ = { runtime, session };
      }
    } catch (error) {
      startupError =
        error instanceof Error
          ? error.message
          : 'The 3D viewport could not be initialized.';
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && session.inspectorOpen) {
        session.closeInspector();
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const matched = commandForKeyboardEvent(event);
      if (matched === 'file.new') {
        event.preventDefault();
        if (
          session.snapshot.canUndo &&
          !window.confirm('Start a new project? Unsaved changes will be discarded.')
        ) {
          return;
        }
        session.newProject();
      } else if (matched === 'file.save') {
        event.preventDefault();
        void session.saveProject();
      } else if (matched === 'file.open') {
        event.preventDefault();
        void session.openProject();
      }
    };
    const unregisterShortcuts = shortcutBus.register(onKeyDown);

    return () => {
      compactQuery.removeEventListener('change', syncCompact);
      pointerQuery.removeEventListener('change', syncDensity);
      unregisterShortcuts();
      if (
        import.meta.env.DEV &&
        window.__LOUPOLI_DEBUG__?.session === session
      ) {
        delete window.__LOUPOLI_DEBUG__;
      }
      session.dispose();
    };
  });
</script>

<svelte:head>
  <title>loupoli</title>
</svelte:head>

<div class="app-shell" data-sidebar-open={session.sidebarOpen}>
  <main
    class="viewport"
    class:uv-open={session.snapshot.uvOpen}
    class:pane-open={session.snapshot.uvOpen}
    style={`--pane-width:${session.snapshot.uvSplit * 100}%`}
    aria-label="3D viewport"
  >
    <section class="viewport-stage" aria-label="3D viewport stage">
    <p id="viewport-help" class="visually-hidden">
      Z-up 3D viewport. Choose vertex, edge, or face selection. With a pen or the
      primary mouse button, select elements; use Add mode or Shift/Cmd-click to
      select multiple; right-drag pans. With elements selected, Move, Rotate, and Scale place a
      gizmo at their median; drag its axes with the pen or mouse. The ActionDock
      provides E/I/L/Shift+L actions with drag or exact amounts. Desktop G/R/S
      transforms selections or the active object. Use one finger to orbit, two
      fingers to pan and pinch, two-finger tap to undo, and three-finger tap to
      redo.
    </p>
    <canvas
      bind:this={canvas}
      tabindex="0"
      aria-label="loupoli 3D viewport"
      aria-describedby="viewport-help"
    >
      Your device does not support the WebGL2 canvas required by loupoli.
    </canvas>

    {#if !startupError}
      <div class="viewport-context" aria-live="polite">
        <span
          class="context-editor"
          class:active={session.snapshot.activeEditor === '3d'}
        >
          3D<span class="context-dot" aria-hidden="true"></span>
        </span>
        <span class="context-scene">Scene</span>
        <span class="context-separator" aria-hidden="true">/</span>
        <span class="context-object">{session.snapshot.objectName}</span>
        <span class="selection-badge">
          {#if session.snapshot.workspace === 'paint'}
            Paint
          {:else if session.snapshot.workspace === 'light'}
            Light
          {:else if session.snapshot.workspace === 'animation'}
            Animate
          {:else if session.snapshot.workspace === 'render'}
            Render
          {:else}
            {session.snapshot.selectionMode === 'vertex'
              ? 'Vertex'
              : session.snapshot.selectionMode === 'edge'
                ? 'Edge'
                : 'Face'}{session.snapshot.selectedElements.length > 1
              ? ` · ${session.snapshot.selectedElements.length}`
              : ''}
          {/if}
        </span>
      </div>

      <div
        class="selection-mode-wrap"
        class:no-selection-mode={session.snapshot.activeEditor === 'paint' ||
          session.snapshot.workspace === 'light' ||
          session.snapshot.workspace === 'render' ||
          session.snapshot.workspace === 'animation'}
      >
        {#if session.snapshot.activeEditor !== 'paint' &&
          session.snapshot.workspace !== 'light' &&
          session.snapshot.workspace !== 'render' &&
          session.snapshot.workspace !== 'animation'}
          <SelectionModeControl {session} />
        {/if}
        {#if session.snapshot.workspace !== 'render'}
          <ShadingControl {session} />
        {/if}
      </div>

      {#if session.snapshot.workspace !== 'render'}
        <div class="viewport-hud">
        <div class="view-actions">
          <IconButton
            label="Frame selection"
            icon="frame"
            tooltip="Frame selection"
            shortcut="F"
            tooltipPlacement="bottom"
            onActivate={() => session.frameSelection()}
          />
          <IconButton
            label="Reset view"
            icon="home"
            tooltip="Reset view"
            shortcut="Home"
            tooltipPlacement="bottom"
            onActivate={() => session.resetView()}
          />
        </div>
          <OrientationGizmo {session} />
        </div>
      {/if}

      {#if session.snapshot.lassoMode && session.snapshot.lassoPath.length > 1}
        <svg class="lasso-overlay" aria-hidden="true">
          <polygon
            points={session.snapshot.lassoPath
              .map(([x, y]) => `${x},${y}`)
              .join(' ')}
          />
        </svg>
      {/if}

      <TransformHud modal={session.snapshot.modalTransform} />
      {#if !session.snapshot.uvOpen &&
        session.snapshot.workspace !== 'light' &&
        session.snapshot.workspace !== 'render' &&
        session.snapshot.workspace !== 'animation'}
        <ActionDock {session} />
      {/if}
      <ActionHud state={session.snapshot.actionState} />
      {#if session.snapshot.workspace === 'animation'}
        <AnimationTimeline {session} />
      {/if}
    {:else}
      <section class="startup-error loupoli-panel" role="alert">
        <p class="error-kicker">Graphics unavailable</p>
        <h1>The viewport could not start.</h1>
        <p>{startupError}</p>
        <p class="error-hint">
          loupoli requires a WebGL2-capable WebView with hardware acceleration
          enabled. On desktop, update the graphics driver or try a WebGL2 browser.
        </p>
      </section>
    {/if}
    </section>

    {#if !startupError && session.snapshot.uvOpen}
      <PaneHost
        label={session.snapshot.uvPaintMode ? 'Paint editor' : 'UV editor'}
        width={session.snapshot.uvSplit}
        onResize={(fraction) => session.setUvSplit(fraction)}
      >
        {#if session.snapshot.uvPaintMode}
          <PaintPanel {session} />
        {:else}
          <UvPanel {session} />
        {/if}
      </PaneHost>
    {/if}
  </main>

  {#if session.snapshot.projectionPreview}
    <PaintShapePreview preview={session.snapshot.projectionPreview} />
  {/if}

  {#if session.snapshot.surfaceCursor}
    <div
      class="surface-paint-cursor"
      style:left={`${session.snapshot.surfaceCursor.x}px`}
      style:top={`${session.snapshot.surfaceCursor.y}px`}
      style:width={`${session.snapshot.surfaceCursor.size}px`}
      style:height={`${session.snapshot.surfaceCursor.size}px`}
      aria-hidden="true"
    ></div>
  {/if}

  <TopBar {session} />
  <ProjectBanner {session} />
  {#if session.snapshot.activeEditor !== 'paint' &&
    session.snapshot.workspace !== 'light' &&
    session.snapshot.workspace !== 'render' &&
    session.snapshot.workspace !== 'animation'}
    <ToolRail {session} onFocusViewport={focusViewport} />
  {/if}
  <Inspector {session} />
  <StatusBar {session} />
  <TooltipLayer />
</div>

<style>
  .app-shell {
    position: relative;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: var(--bg-canvas);
    color: var(--text-primary);
  }

  .viewport {
    position: absolute;
    inset: 0;
    display: flex;
    overflow: hidden;
    background: var(--bg-canvas);
  }

  .surface-paint-cursor {
    position: fixed;
    z-index: var(--z-chrome);
    border: var(--hairline) solid var(--accent-primary);
    border-radius: 50%;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.65),
      inset 0 0 0 1px rgba(0, 0, 0, 0.35);
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  .viewport-stage {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    background: var(--bg-canvas);
  }

  @media (min-width: 900px) {
    .app-shell[data-sidebar-open='true'] .viewport {
      right: calc(
        var(--safe-right) + var(--inspector-w) +
          var(--space-3) + var(--space-1)
      );
    }
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    cursor: crosshair;
    outline: none;
  }

  .lasso-overlay {
    position: absolute;
    z-index: var(--z-hud);
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .lasso-overlay polygon {
    fill: rgba(201, 244, 92, 0.08);
    stroke: var(--accent-primary);
    stroke-width: 1.5;
    stroke-dasharray: 5 4;
    vector-effect: non-scaling-stroke;
  }

  canvas:focus-visible {
    outline: none;
    box-shadow: inset 0 2px 0 var(--accent-primary);
  }

  .viewport-context {
    position: absolute;
    z-index: var(--z-hud);
    top: calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2);
    left: calc(
      var(--safe-left) + var(--toolrail-w) + var(--space-3) * 2 + 4px
    );
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: 1;
    pointer-events: none;
  }

  .context-editor {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--text-tertiary);
  }

  .context-editor.active {
    color: var(--text-primary);
  }

  .context-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent-primary);
    opacity: 0;
  }

  .context-editor.active .context-dot {
    opacity: 1;
  }

  .context-object {
    color: var(--text-secondary);
  }

  .context-separator {
    color: var(--text-disabled);
  }

  .selection-badge {
    margin-left: 4px;
    padding: 3px 6px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-xs);
    background: var(--bg-panel);
    color: var(--text-secondary);
    font-size: 10px;
    letter-spacing: 0.04em;
    -webkit-backdrop-filter: blur(var(--blur-panel));
    backdrop-filter: blur(var(--blur-panel));
  }

  .selection-mode-wrap {
    position: absolute;
    z-index: var(--z-hud);
    top: calc(
      var(--safe-top) + var(--topbar-h) + var(--space-3) * 2 + 25px
    );
    left: calc(
      var(--safe-left) + var(--toolrail-w) + var(--space-3) * 2 + 4px
    );
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    pointer-events: none;
  }

  .selection-mode-wrap.no-selection-mode {
    left: calc(var(--safe-left) + var(--space-3));
  }

  .selection-mode-wrap :global(.selection-mode),
  .selection-mode-wrap :global(.shading-control) {
    pointer-events: auto;
  }

  .viewport-hud {
    position: absolute;
    z-index: var(--z-hud);
    right: var(--space-3);
    bottom: calc(var(--safe-bottom) + var(--status-h) + var(--space-3));
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--space-2);
    pointer-events: none;
  }

  .view-actions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    pointer-events: auto;
  }

  .viewport-hud > :global(*) {
    pointer-events: auto;
  }

  .startup-error {
    position: absolute;
    top: 50%;
    left: 50%;
    width: min(460px, calc(100vw - 32px));
    padding: var(--space-6);
    border-radius: var(--radius-lg);
    transform: translate(-50%, -50%);
  }

  .error-kicker {
    margin: 0 0 var(--space-2);
    color: var(--accent-warning);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .startup-error h1 {
    margin: 0 0 var(--space-3);
    color: var(--text-primary);
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: var(--weight-medium);
    letter-spacing: -0.02em;
  }

  .startup-error p {
    margin: 0 0 var(--space-3);
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: var(--leading-body);
  }

  .startup-error .error-hint {
    margin-bottom: 0;
    color: var(--text-tertiary);
  }

  @media (max-width: 899px) {
    .viewport-context {
      top: calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2);
      left: calc(var(--safe-left) + var(--space-3));
    }

    .selection-mode-wrap {
      top: calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2 + 25px);
      left: calc(var(--safe-left) + var(--space-3));
    }
  }

  /* On compact landscape widths the docked inspector and side-mounted HUD
     leave less vertical breathing room for a taller gizmo/shading stack. Lay
     them side-by-side so they sit above the framed object rather than on it. */
  @media (min-width: 1000px) and (max-width: 1199px) {
    .viewport-hud {
      align-items: flex-start;
    }
  }

  @media (max-width: 640px) {
    .viewport-context {
      display: none;
    }
  }
</style>
