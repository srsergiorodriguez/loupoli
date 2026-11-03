<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import Icon from '../Icons/Icon.svelte';
  import NumberField from '../Primitives/NumberField.svelte';

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
  let painting = $state(false);
  let lassoing = $state(false);
  let uvLassoPath = $state<[number, number][]>([]);
  let lassoAdditive = false;
  let deltaU = $state(0);
  let deltaV = $state(0);
  let angle = $state(0);
  let scaleFactor = $state(1);
  let activePointerId: number | null = null;
  let brushVisible = $state(false);
  let brushX = $state(0);
  let brushY = $state(0);

  const selectedCount = $derived(session.snapshot.uvSelectedCorners.length);
  const uvSplit = $derived(session.snapshot.uvSplit);
  const axisLock = $derived(session.snapshot.uvAxisLock);
  const transformMode = $derived(session.snapshot.uvTransformMode);
  const pinnedCount = $derived(session.snapshot.uvPinnedCorners.length);
  const paintMode = $derived(session.snapshot.uvPaintMode);
  const selectionMode = $derived(session.snapshot.uvSelectionMode);
  const lassoMode = $derived(session.snapshot.uvLassoMode);
  const subtractMode = $derived(session.snapshot.uvSubtractMode);
  const layout = $derived(session.snapshot.uvLayout);
  const effectiveLayout = $derived(
    session.compactLayout ? 'bottom' : layout
  );

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
    if (!paintMode) {
      brushVisible = false;
    }
  });

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

  function updateBrushCursor(event: PointerEvent): void {
    if (!paintMode) {
      brushVisible = false;
      return;
    }
    const point = localPoint(event);
    brushX = point.x;
    brushY = point.y;
    brushVisible = true;
  }

  function toggleLasso(): void {
    const next = !lassoMode;
    if (next && paintMode) {
      session.setUvPaintMode(false);
    }
    session.setUvLassoMode(next);
  }

  function pointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    updateBrushCursor(event);
    const point = localPoint(event);
    const pressure =
      event.pointerType === 'pen' ? Math.max(0.2, event.pressure) : 1;
    if (paintMode) {
      if (
        session.beginUvPaint(
          point.x,
          point.y,
          width,
          height,
          pressure
        )
      ) {
        painting = true;
        activePointerId = event.pointerId;
        window.addEventListener('pointermove', windowPointerMove);
        window.addEventListener('pointerup', windowPointerUp);
        window.addEventListener('pointercancel', windowPointerCancel);
      }
      return;
    }
    if (lassoMode) {
      lassoing = true;
      uvLassoPath = [[point.x, point.y]];
      lassoAdditive =
        event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        session.snapshot.additiveSelection;
      activePointerId = event.pointerId;
      window.addEventListener('pointermove', windowPointerMove);
      window.addEventListener('pointerup', windowPointerUp);
      window.addEventListener('pointercancel', windowPointerCancel);
      return;
    }
    const additive =
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey ||
      session.snapshot.additiveSelection;
    const hit = session.pickUvElement(
      point.x,
      point.y,
      width,
      height,
      additive
    );
    if (
      !hit ||
      !session.beginUvDrag(point.x, point.y, width, height)
    ) {
      return;
    }
    dragging = true;
    activePointerId = event.pointerId;
    window.addEventListener('pointermove', windowPointerMove);
    window.addEventListener('pointerup', windowPointerUp);
    window.addEventListener('pointercancel', windowPointerCancel);
  }

  function windowPointerMove(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    const point = localPoint(event);
    updateBrushCursor(event);
    if (lassoing) {
      const previous = uvLassoPath[uvLassoPath.length - 1];
      if (
        !previous ||
        Math.hypot(point.x - previous[0], point.y - previous[1]) >= 1
      ) {
        uvLassoPath = [...uvLassoPath, [point.x, point.y]];
      }
      return;
    }
    if (painting) {
      const pressure =
        event.pointerType === 'pen' ? Math.max(0.2, event.pressure) : 1;
      session.updateUvPaint(point.x, point.y, width, height, pressure);
      return;
    }
    if (!dragging) {
      return;
    }
    session.updateUvDrag(point.x, point.y, width, height);
  }

  function windowPointerUp(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) {
      return;
    }
    detachDragListeners();
    if (lassoing) {
      lassoing = false;
      const points = uvLassoPath;
      uvLassoPath = [];
      session.selectUvLasso(
        points.map(([x, y]) => ({ x, y })),
        lassoAdditive,
        width,
        height
      );
      return;
    }
    if (painting) {
      painting = false;
      session.finishUvPaint();
      return;
    }
    if (!dragging) {
      return;
    }
    dragging = false;
    session.finishUvDrag();
  }

  function keyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    if (lassoing) {
      detachDragListeners();
      lassoing = false;
      uvLassoPath = [];
    } else if (painting) {
      detachDragListeners();
      painting = false;
      session.cancelUvPaint();
    } else if (dragging) {
      detachDragListeners();
      dragging = false;
      session.cancelUvDrag();
    } else {
      session.toggleUvView();
    }
  }

  function windowPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) {
      return;
    }
    detachDragListeners();
    if (lassoing) {
      lassoing = false;
      uvLassoPath = [];
      return;
    }
    if (painting) {
      painting = false;
      session.cancelUvPaint();
      return;
    }
    if (!dragging) {
      return;
    }
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
    if (effectiveLayout === 'side') {
      const viewport = host.closest('.viewport')?.getBoundingClientRect();
      if (!viewport || viewport.width <= 0) {
        return;
      }
      session.setUvSplit((viewport.right - event.clientX) / viewport.width);
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

  function applyNumeric(mode: 'move' | 'rotate' | 'scale'): void {
    if (selectedCount === 0) {
      return;
    }
    if (mode === 'move') {
      session.applyUvMove(Number(deltaU), Number(deltaV));
    } else if (mode === 'rotate') {
      session.applyUvRotate(Number(angle));
    } else {
      session.applyUvScale(Number(scaleFactor));
    }
  }

  function resizeKey(event: KeyboardEvent): void {
    if (effectiveLayout === 'side') {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      event.preventDefault();
      session.setUvSplit(
        uvSplit + (event.key === 'ArrowLeft' ? 0.03 : -0.03)
      );
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    event.preventDefault();
    session.setUvSplit(uvSplit + (event.key === 'ArrowUp' ? 0.03 : -0.03));
  }
</script>

<section
  class="uv-pane loupoli-panel"
  class:side={effectiveLayout === 'side'}
  aria-label="UV editor"
>
  <div
    class="uv-resize"
    role="slider"
    aria-label="Resize UV view"
    aria-orientation={effectiveLayout === 'side' ? 'vertical' : 'horizontal'}
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
      <div class="uv-element-modes" role="group" aria-label="UV selection mode">
        <button
          type="button"
          class="uv-element"
          class:active={selectionMode === 'vertex'}
          aria-pressed={selectionMode === 'vertex'}
          aria-label="UV vertex selection"
          onclick={() => session.setUvSelectionMode('vertex')}
        >V</button>
        <button
          type="button"
          class="uv-element"
          class:active={selectionMode === 'edge'}
          aria-pressed={selectionMode === 'edge'}
          aria-label="UV edge selection"
          onclick={() => session.setUvSelectionMode('edge')}
        >E</button>
        <button
          type="button"
          class="uv-element"
          class:active={selectionMode === 'face'}
          aria-pressed={selectionMode === 'face'}
          aria-label="UV face selection"
          onclick={() => session.setUvSelectionMode('face')}
        >F</button>
        <button
          type="button"
          class="uv-element uv-element--island"
          class:active={selectionMode === 'island'}
          aria-pressed={selectionMode === 'island'}
          aria-label="UV island selection"
          onclick={() => session.setUvSelectionMode('island')}
        >Island</button>
      </div>
      <button
        type="button"
        class="uv-action"
        aria-label="Select all UV corners"
        onclick={() => session.selectAllUv()}
      >All</button>
      <button
        type="button"
        class="uv-action"
        class:active={lassoMode}
        aria-pressed={lassoMode}
        aria-label="UV lasso selection"
        onclick={toggleLasso}
      ><Icon name="lasso" size={15} /></button>
      <button
        type="button"
        class="uv-action uv-subtract"
        class:active={subtractMode}
        aria-pressed={subtractMode}
        aria-label="Subtract from UV selection"
        onclick={() => session.setUvSubtractMode(!subtractMode)}
      >−</button>
      <div class="uv-modes" role="group" aria-label="UV transform mode">
        <button
          type="button"
          class="uv-mode"
          class:active={transformMode === 'move'}
          aria-label="UV Move"
          aria-pressed={transformMode === 'move'}
          onclick={() => session.setUvTransformMode('move')}
        ><Icon name="move" size={15} /></button>
        <button
          type="button"
          class="uv-mode"
          class:active={transformMode === 'rotate'}
          aria-label="UV Rotate"
          aria-pressed={transformMode === 'rotate'}
          onclick={() => session.setUvTransformMode('rotate')}
        ><Icon name="rotate" size={15} /></button>
        <button
          type="button"
          class="uv-mode"
          class:active={transformMode === 'scale'}
          aria-label="UV Scale"
          aria-pressed={transformMode === 'scale'}
          onclick={() => session.setUvTransformMode('scale')}
        ><Icon name="scale" size={15} /></button>
      </div>
      <button
        type="button"
        class="uv-chip"
        disabled={transformMode === 'rotate'}
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
        disabled={transformMode === 'rotate'}
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
        class="uv-action"
        aria-label={pinnedCount === 2 ? 'Clear UV pins' : 'Pin selected UV corners'}
        disabled={pinnedCount !== 2 && selectedCount !== 2}
        onclick={() => session.toggleUvPins()}
      >{pinnedCount === 2 ? 'Unpin' : 'Pin'}</button>
      <button
        type="button"
        class="uv-action"
        aria-label="Unwrap UV charts"
        onclick={() => session.unwrapUv()}
      >Unwrap</button>
      <button
        type="button"
        class="uv-action"
        aria-label="Stack selected UV islands onto the active island"
        onclick={() => session.stackUvIslands()}
      >Stack</button>
      <button
        type="button"
        class="uv-layout"
        aria-label={effectiveLayout === 'side' ? 'Use bottom UV layout' : 'Use side-by-side UV layout'}
        title={session.compactLayout
          ? 'Side layout needs a wider window'
          : effectiveLayout === 'side'
            ? 'Switch to bottom layout'
            : 'Switch to side-by-side layout'}
        disabled={session.compactLayout}
        onclick={() => session.toggleUvLayout()}
      ><Icon name={effectiveLayout === 'side' ? 'rows' : 'columns'} size={15} /></button>
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
      class:paint-mode={paintMode}
      class:lasso-mode={lassoMode}
      tabindex="0"
      aria-label="UV editor. Drag corners to transform UVs, or enable Paint to brush the active texture layer."
      onpointerdown={pointerDown}
      onpointermove={updateBrushCursor}
      onpointerenter={updateBrushCursor}
      onpointerleave={() => {
        if (!painting) {
          brushVisible = false;
        }
      }}
      onkeydown={keyDown}
    ></canvas>
    {#if lassoing && uvLassoPath.length > 1}
      <svg class="uv-lasso-overlay" aria-hidden="true">
        <polygon
          points={uvLassoPath.map(([x, y]) => `${x},${y}`).join(' ')}
        />
      </svg>
    {/if}
    {#if paintMode && brushVisible}
      <div
        class="uv-brush-cursor"
        style={`left:${brushX}px;top:${brushY}px;width:${session.snapshot.uvBrushSize}px;height:${session.snapshot.uvBrushSize}px`}
        aria-hidden="true"
      ></div>
    {/if}
    {#if selectedCount === 0 && !paintMode && effectiveLayout !== 'side'}
      <p class="uv-empty">
        Select UV vertices, edges, faces, or islands. Drag to move; U/V locks
        and grid snap apply.
      </p>
    {/if}
    {#if session.snapshot.uvError}
      <p class="uv-error" role="status">{session.snapshot.uvError}</p>
    {/if}
  </div>

  <footer class="uv-foot">
    <button
      type="button"
      class="uv-paint-toggle"
      class:active={paintMode}
      aria-label="Toggle texture paint brush"
      aria-pressed={paintMode}
      onclick={() => session.setUvPaintMode(!paintMode)}
    >Paint</button>
    {#if paintMode}
      <div class="uv-brush-controls">
        <input
          type="color"
          class="uv-brush-color"
          value={session.snapshot.uvBrushColor}
          aria-label="Brush color"
          oninput={(event) =>
            session.setUvBrushColor(event.currentTarget.value)}
        />
        <label class="uv-brush-slider">
          <span>Size {session.snapshot.uvBrushSize}px</span>
          <input
            type="range"
            min="2"
            max="128"
            step="1"
            value={session.snapshot.uvBrushSize}
            aria-label="Brush size in texture pixels"
            oninput={(event) =>
              session.setUvBrushSize(Number(event.currentTarget.value))}
          />
        </label>
        <label class="uv-brush-slider">
          <span>Opacity {Math.round(session.snapshot.uvBrushOpacity * 100)}%</span>
          <input
            type="range"
            min="0.01"
            max="1"
            step="0.01"
            value={session.snapshot.uvBrushOpacity}
            aria-label="Brush opacity"
            oninput={(event) =>
              session.setUvBrushOpacity(Number(event.currentTarget.value))}
          />
        </label>
      </div>
    {:else}
    <form
      class="uv-numeric"
      onsubmit={(event) => {
        event.preventDefault();
        applyNumeric(transformMode);
      }}
    >
      {#if transformMode === 'move'}
        <label class="uv-field">
          <span>ΔU</span>
          <NumberField
            value={deltaU}
            label="Exact U delta"
            step={0.001}
            precision={3}
            framed
            onCommit={(next) => (deltaU = next)}
          />
        </label>
        <label class="uv-field">
          <span>ΔV</span>
          <NumberField
            value={deltaV}
            label="Exact V delta"
            step={0.001}
            precision={3}
            framed
            onCommit={(next) => (deltaV = next)}
          />
        </label>
      {:else if transformMode === 'rotate'}
        <label class="uv-field">
          <span>Angle°</span>
          <NumberField
            value={angle}
            label="Exact rotation angle in degrees"
            step={0.5}
            precision={2}
            unit="°"
            framed
            onCommit={(next) => (angle = next)}
          />
        </label>
      {:else}
        <label class="uv-field">
          <span>Factor</span>
          <NumberField
            value={scaleFactor}
            label="Exact scale factor"
            step={0.005}
            precision={3}
            min={0.001}
            framed
            onCommit={(next) => (scaleFactor = next)}
          />
        </label>
      {/if}
      <button
        type="submit"
        class="uv-apply"
        aria-label="Apply exact UV transform"
        disabled={selectedCount === 0}
      >Apply</button>
    </form>
    {/if}
    <span class="uv-foot-hint">
      {#if paintMode}
        paint active layer · pen pressure · {session.snapshot.snapEnabled ? `snap ${session.snapshot.snapStep}` : 'snap off'}
      {:else}
        16 px pick · {pinnedCount === 2 ? '2 pins' : 'auto pins'} · {session.snapshot.snapEnabled ? `snap ${session.snapshot.snapStep}` : 'snap off'}
      {/if}
    </span>
  </footer>
</section>

<style>
  .uv-pane {
    position: absolute;
    z-index: var(--z-hud);
    left: calc(var(--safe-left) + var(--toolrail-w) + var(--space-3));
    right: var(--space-3);
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

  .uv-pane.side {
    top: calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2);
    right: var(--space-3);
    bottom: calc(var(--safe-bottom) + var(--status-h));
    left: auto;
    width: var(--uv-side-width);
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

  .uv-pane.side .uv-head {
    flex-wrap: wrap;
    align-items: flex-start;
    padding: var(--space-2);
  }

  .uv-pane.side .uv-title-group {
    flex: 1 1 auto;
    min-height: var(--hit-min);
  }

  .uv-pane.side .uv-actions {
    flex: 1 1 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .uv-pane.side .uv-foot {
    flex-wrap: wrap;
    align-items: center;
    padding: var(--space-2);
    white-space: normal;
  }

  .uv-pane.side .uv-numeric {
    flex: 1 1 100%;
    flex-wrap: wrap;
  }

  .uv-pane.side .uv-foot-hint {
    flex: 1 1 100%;
    display: none;
  }

  .uv-pane.side .uv-resize {
    top: 0;
    bottom: 0;
    left: -44px;
    width: 44px;
    height: auto;
    cursor: ew-resize;
  }

  .uv-pane.side .uv-resize::after {
    top: 50%;
    bottom: auto;
    left: 0;
    width: 4px;
    height: 52px;
    transform: translateY(-50%);
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

  .uv-element,
  .uv-chip,
  .uv-action,
  .uv-layout,
  .uv-close,
  .uv-mode {
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

  .uv-element:hover,
  .uv-chip:hover,
  .uv-action:hover,
  .uv-layout:hover,
  .uv-close:hover,
  .uv-mode:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .uv-element.active,
  .uv-chip.active,
  .uv-action.active,
  .uv-mode.active {
    border-color: var(--accent-primary);
    background: var(--bg-selected);
    color: var(--accent-primary);
  }

  .uv-element,
  .uv-chip:disabled,
  .uv-layout:disabled,
  .uv-mode:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .uv-element-modes {
    display: flex;
    align-items: center;
    gap: 1px;
    padding-right: var(--space-1);
    border-right: var(--hairline) solid var(--border-subtle);
  }

  .uv-element {
    min-width: var(--hit-min);
    min-height: var(--hit-min);
    padding: 0 var(--space-1);
    border: var(--hairline) solid transparent;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .uv-element--island {
    min-width: 52px;
  }

  .uv-modes {
    display: flex;
    gap: 1px;
    margin-right: var(--space-1);
  }

  .uv-mode {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .uv-action {
    padding: 0 var(--space-2);
    white-space: nowrap;
  }

  .uv-layout,
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

  .uv-canvas.paint-mode {
    cursor: none;
  }

  .uv-canvas.lasso-mode {
    cursor: crosshair;
  }

  .uv-lasso-overlay {
    position: absolute;
    z-index: 2;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .uv-lasso-overlay polygon {
    fill: rgba(201, 244, 92, 0.08);
    stroke: var(--accent-primary);
    stroke-width: 1.5;
    stroke-dasharray: 5 4;
    vector-effect: non-scaling-stroke;
  }

  .uv-subtract {
    font-size: var(--text-md);
    line-height: 1;
  }

  .uv-brush-cursor {
    position: absolute;
    z-index: 2;
    border: var(--hairline) solid var(--accent-primary);
    border-radius: 50%;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.55),
      inset 0 0 0 1px rgba(0, 0, 0, 0.35);
    background: rgba(201, 244, 92, 0.06);
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  .uv-canvas:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: -3px;
  }

  .uv-error {
    position: absolute;
    top: var(--space-2);
    left: 50%;
    width: min(420px, calc(100% - 32px));
    margin: 0;
    padding: var(--space-2);
    border: var(--hairline) solid var(--accent-warning);
    border-radius: var(--radius-xs);
    background: var(--bg-panel-strong);
    color: var(--accent-warning);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: 1.5;
    text-align: center;
    transform: translateX(-50%);
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
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--hit-min);
    padding: 0 var(--space-3);
    border-top: var(--hairline) solid var(--border-subtle);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    white-space: nowrap;
  }

  .uv-paint-toggle {
    min-width: var(--hit-min);
    min-height: var(--hit-min);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .uv-paint-toggle.active {
    border-color: var(--accent-primary);
    background: var(--bg-selected);
    color: var(--accent-primary);
  }

  .uv-paint-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .uv-brush-controls {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .uv-brush-color {
    width: var(--hit-min);
    height: var(--control-h);
    padding: 2px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-xs);
    background: transparent;
    cursor: pointer;
  }

  .uv-brush-slider {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 9px;
    white-space: nowrap;
  }

  .uv-brush-slider input {
    width: 100%;
    accent-color: var(--accent-primary);
  }

  .uv-numeric {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  .uv-field {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-tertiary);
  }

  .uv-field :global(.number-field) {
    width: 68px;
  }

  .uv-apply {
    min-height: var(--hit-min);
    min-width: var(--hit-min);
    padding: 0 var(--space-2);
    border: var(--hairline) solid var(--border-strong);
    border-radius: var(--radius-xs);
    background: var(--bg-raised);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .uv-apply:hover:not(:disabled) {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .uv-apply:disabled,
  .uv-action:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .uv-foot-hint {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 1100px) {
    .uv-pane {
      left: calc(var(--safe-left) + var(--space-3));
      right: calc(var(--safe-right) + var(--space-3));
    }
  }

  @media (max-width: 720px) {
    .uv-foot-hint {
      display: none;
    }

    .uv-head {
      gap: var(--space-1);
    }

    .uv-action {
      padding: 0 6px;
    }
  }
</style>
