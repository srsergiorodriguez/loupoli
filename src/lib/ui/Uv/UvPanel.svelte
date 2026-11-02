<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';

  /** Props for the UV editing pane. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);
  let resizing = $state(false);
  let dragging = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let activePointerId: number | null = null;

  const selectedCount = $derived(session.snapshot.uvSelectedCorners.length);
  const uvSplit = $derived(session.snapshot.uvSplit);
  const axisLock = $derived(session.snapshot.uvAxisLock);

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) {
        return;
      }
      width = rect.width;
      height = rect.height;
    });
    observer.observe(host);
    return () => observer.disconnect();
  });

  onDestroy(detachDragListeners);

  function detachDragListeners(): void {
    window.removeEventListener('pointermove', windowPointerMove);
    window.removeEventListener('pointerup', windowPointerUp);
    window.removeEventListener('pointercancel', windowPointerCancel);
    activePointerId = null;
  }

  $effect(() => {
    // The runtime owns the DCEL; this effect only asks it to repaint when the
    // UV selection, mesh, or canvas size actually changes.
    session.snapshot.uvRevision;
    session.snapshot.uvSelectedCorners.length;
    session.snapshot.activeNodeId;
    session.snapshot.uvOpen;
    if (canvas && width > 0 && height > 0) {
      session.drawUvView(canvas, width, height);
    }
  });

  function localPoint(event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function pointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const point = localPoint(event);
    const additive =
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey ||
      session.snapshot.additiveSelection;
    const hit = session.pickUvCorner(
      point.x,
      point.y,
      width,
      height,
      additive
    );
    if (!hit || !session.beginUvDrag()) {
      return;
    }
    dragging = true;
    dragStartX = point.x;
    dragStartY = point.y;
    activePointerId = event.pointerId;
    window.addEventListener('pointermove', windowPointerMove);
    window.addEventListener('pointerup', windowPointerUp);
    window.addEventListener('pointercancel', windowPointerCancel);
  }

  function windowPointerMove(event: PointerEvent): void {
    if (!dragging || event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    const point = localPoint(event);
    session.updateUvDragFromPixels(
      point.x - dragStartX,
      point.y - dragStartY,
      width,
      height
    );
  }

  function windowPointerUp(event: PointerEvent): void {
    if (!dragging || event.pointerId !== activePointerId) {
      return;
    }
    detachDragListeners();
    dragging = false;
    session.finishUvDrag();
  }

  function keyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    if (dragging) {
      detachDragListeners();
      dragging = false;
      session.cancelUvDrag();
    } else {
      session.toggleUvView();
    }
  }

  function windowPointerCancel(event: PointerEvent): void {
    if (!dragging || event.pointerId !== activePointerId) {
      return;
    }
    detachDragListeners();
    dragging = false;
    session.cancelUvDrag();
  }

  function resizeStart(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    resizing = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function resizeMove(event: PointerEvent): void {
    if (!resizing) {
      return;
    }
    const fraction = 1 - event.clientY / Math.max(window.innerHeight, 1);
    session.setUvSplit(fraction);
  }

  function resizeEnd(event: PointerEvent): void {
    if (!resizing) {
      return;
    }
    resizing = false;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  function resizeKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    event.preventDefault();
    session.setUvSplit(uvSplit + (event.key === 'ArrowUp' ? 0.03 : -0.03));
  }
</script>

<section class="uv-pane loupoli-panel" aria-label="UV editor">
  <div
    class="uv-resize"
    role="slider"
    aria-label="Resize UV view"
    aria-orientation="horizontal"
    aria-valuenow={Math.round(uvSplit * 100)}
    aria-valuemin="25"
    aria-valuemax="65"
    tabindex="0"
    onpointerdown={resizeStart}
    onpointermove={resizeMove}
    onpointerup={resizeEnd}
    onpointercancel={resizeEnd}
    onkeydown={resizeKey}
  ></div>

  <header class="uv-head">
    <div class="uv-title-group">
      <span class="uv-kicker">UV</span>
      <span class="uv-count">{selectedCount} corner{selectedCount === 1 ? '' : 's'}</span>
    </div>
    <div class="uv-actions">
      <button
        type="button"
        class="uv-chip"
        class:active={axisLock === 'u'}
        aria-label="Constrain UV drag to U"
        aria-pressed={axisLock === 'u'}
        onclick={() => session.setUvAxisLock('u')}
      >U</button>
      <button
        type="button"
        class="uv-chip"
        class:active={axisLock === 'v'}
        aria-label="Constrain UV drag to V"
        aria-pressed={axisLock === 'v'}
        onclick={() => session.setUvAxisLock('v')}
      >V</button>
      <button
        type="button"
        class="uv-action"
        aria-label="Sync UV selection from 3D selection"
        onclick={() => session.syncUvFrom3d()}
      >Sync 3D</button>
      <button
        type="button"
        class="uv-close"
        aria-label="Close UV editor"
        onclick={() => session.toggleUvView()}
      ><span aria-hidden="true">×</span></button>
    </div>
  </header>

  <div class="uv-canvas-wrap" bind:this={host}>
    <canvas
      bind:this={canvas}
      class="uv-canvas"
      tabindex="0"
      aria-label="UV editor. Drag selected corners to move their texture coordinates."
      onpointerdown={pointerDown}
      onkeydown={keyDown}
    ></canvas>
    {#if selectedCount === 0}
      <p class="uv-empty">
        Select 3D faces or click UV corners. Drag to move; U/V locks and grid
        snap apply.
      </p>
    {/if}
  </div>

  <footer class="uv-foot">
    <span>16 px pick · drag corners</span>
    <span>{session.snapshot.snapEnabled ? `Snap ${session.snapshot.snapStep}` : 'Snap off'}</span>
  </footer>
</section>

<style>
  .uv-pane {
    position: fixed;
    z-index: var(--z-hud);
    left: calc(var(--safe-left) + var(--toolrail-w) + var(--space-3));
    right: calc(var(--safe-right) + var(--inspector-w) + var(--space-3) * 2);
    top: calc(100% - var(--uv-height, 38%));
    bottom: calc(var(--safe-bottom) + var(--status-h));
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: visible;
    border-radius: var(--radius-md);
    background: var(--bg-panel-strong);
    box-shadow: var(--shadow-panel);
  }

  .uv-resize {
    position: absolute;
    top: -44px;
    right: 0;
    left: 0;
    height: 44px;
    z-index: 2;
    cursor: ns-resize;
    touch-action: none;
  }

  .uv-resize::after {
    position: absolute;
    bottom: 0;
    left: 50%;
    width: 52px;
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--border-strong);
    content: '';
    transform: translateX(-50%);
  }

  .uv-resize:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 2px;
  }

  .uv-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--hit-min);
    padding: 0 var(--space-3);
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .uv-title-group {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
  }

  .uv-kicker {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .uv-count {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    white-space: nowrap;
  }

  .uv-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .uv-chip,
  .uv-action,
  .uv-close {
    min-width: var(--hit-min);
    min-height: var(--hit-min);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: 1;
    cursor: pointer;
  }

  .uv-chip:hover,
  .uv-action:hover,
  .uv-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .uv-chip.active {
    border-color: var(--accent-primary);
    background: var(--bg-selected);
    color: var(--accent-primary);
  }

  .uv-action {
    padding: 0 var(--space-2);
    white-space: nowrap;
  }

  .uv-close {
    padding: 0;
    font-size: var(--text-md);
  }

  .uv-canvas-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--bg-canvas);
  }

  .uv-canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: crosshair;
    outline: none;
  }

  .uv-canvas:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: -3px;
  }

  .uv-empty {
    position: absolute;
    top: 50%;
    left: 50%;
    width: min(340px, calc(100% - 32px));
    margin: 0;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: 1.6;
    text-align: center;
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  .uv-foot {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--control-h);
    padding: 0 var(--space-3);
    border-top: var(--hairline) solid var(--border-subtle);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: var(--control-h);
    white-space: nowrap;
  }

  @media (max-width: 1100px) {
    .uv-pane {
      left: calc(var(--safe-left) + var(--space-3));
      right: calc(var(--safe-right) + var(--space-3));
    }
  }

  @media (max-width: 720px) {
    .uv-action {
      padding: 0;
      font-size: 0;
    }

    .uv-action::before {
      content: 'Sync';
      font-size: var(--text-2xs);
    }
  }
</style>
