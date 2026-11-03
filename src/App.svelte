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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void session.saveProject();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'o'
      ) {
        event.preventDefault();
        void session.openProject();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      compactQuery.removeEventListener('change', syncCompact);
      pointerQuery.removeEventListener('change', syncDensity);
      window.removeEventListener('keydown', onKeyDown);
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
    class:uv-side={session.snapshot.uvOpen && session.snapshot.uvLayout === 'side' && !session.compactLayout}
    style={`--uv-height:${session.snapshot.uvSplit * 100}%; --uv-side-width:${session.snapshot.uvSplit * 100}%`}
    aria-label="3D viewport"
  >
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
        <span class="context-scene">Scene</span>
        <span class="context-separator" aria-hidden="true">/</span>
        <span class="context-object">{session.snapshot.objectName}</span>
        <span class="selection-badge">
          {session.snapshot.selectionMode === 'vertex'
            ? 'Vertex'
            : session.snapshot.selectionMode === 'edge'
              ? 'Edge'
              : 'Face'}{session.snapshot.selectedElements.length > 1
            ? ` · ${session.snapshot.selectedElements.length}`
            : ''}
        </span>
      </div>

      <div class="selection-mode-wrap">
        <SelectionModeControl {session} />
      </div>

      <div class="viewport-hud">
        <ShadingControl {session} />
        <OrientationGizmo {session} />
      </div>

      {#if !session.snapshot.uvOpen}
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
        <ActionDock {session} />
        <ActionHud state={session.snapshot.actionState} />
      {:else}
        <UvPanel {session} />
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
  </main>

  <TopBar {session} />
  <ProjectBanner {session} />
  <ToolRail {session} onFocusViewport={focusViewport} />
  <Inspector {session} />
  <StatusBar {session} />
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
    overflow: hidden;
    background: var(--bg-canvas);
  }

  @media (min-width: 900px) {
    .app-shell[data-sidebar-open='true'] .viewport {
      right: calc(
        var(--safe-right) + var(--inspector-w) + var(--space-3) * 2
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
    position: fixed;
    z-index: var(--z-hud);
    inset: 0;
    width: 100vw;
    height: 100dvh;
    pointer-events: none;
  }

  .lasso-overlay polygon {
    fill: rgba(201, 244, 92, 0.08);
    stroke: var(--accent-primary);
    stroke-width: 1.5;
    stroke-dasharray: 5 4;
    vector-effect: non-scaling-stroke;
  }

  .viewport.uv-open > canvas {
    height: calc(100% - var(--uv-height));
  }

  .viewport.uv-open.uv-side > canvas {
    width: calc(100% - var(--uv-side-width) - var(--space-3));
    height: 100%;
  }

  .viewport.uv-side .viewport-hud {
    display: none;
  }

  canvas:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: -4px;
  }

  .viewport-context {
    position: fixed;
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
    position: fixed;
    z-index: var(--z-hud);
    top: calc(
      var(--safe-top) + var(--topbar-h) + var(--space-3) * 2 + 25px
    );
    left: calc(
      var(--safe-left) + var(--toolrail-w) + var(--space-3) * 2 + 4px
    );
    pointer-events: auto;
  }

  .viewport-hud {
    position: fixed;
    z-index: var(--z-hud);
    top: calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2);
    right: calc(
      var(--safe-right) + var(--inspector-w) + var(--space-3) * 2
    );
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    pointer-events: none;
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
    position: fixed;
    z-index: var(--z-hud);
    top: calc(
      var(--safe-top) + var(--topbar-h) + var(--space-3) * 2 + 25px
    );
    left: calc(
      var(--safe-left) + var(--toolrail-w) + var(--space-3) * 2 + 4px
    );
    pointer-events: auto;
  }

  .viewport-hud {
      top: calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2);
      right: calc(var(--safe-right) + var(--space-3));
      gap: var(--space-2);
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

    .selection-mode-wrap {
    position: fixed;
    z-index: var(--z-hud);
    top: calc(
      var(--safe-top) + var(--topbar-h) + var(--space-3) * 2 + 25px
    );
    left: calc(
      var(--safe-left) + var(--toolrail-w) + var(--space-3) * 2 + 4px
    );
    pointer-events: auto;
  }

  .viewport-hud {
      top: calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2);
      left: calc(var(--safe-left) + var(--space-3));
      right: calc(var(--safe-right) + var(--space-3));
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: flex-end;
    }
  }
</style>
