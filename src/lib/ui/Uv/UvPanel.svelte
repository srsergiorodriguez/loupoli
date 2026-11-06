<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import { shortcutBus } from '../../input/ShortcutBus';
  import { commandForKeyboardEvent } from '../../input/commands';
  import NumberField from '../Primitives/NumberField.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import ActionButton from '../Primitives/ActionButton.svelte';
  import PaneFrame from '../Panels/PaneFrame.svelte';
  import PaneHeader from '../Panels/PaneHeader.svelte';
  import { uvClickMoved } from '../../uv/uvView';

  /** Props for the UV editing pane. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);
  let dragging = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let dragMoved = false;
  let lassoing = $state(false);
  let uvLassoPath = $state<[number, number][]>([]);
  let lassoAdditive = false;
  let uvPanning = $state(false);
  let keyboardKind = $state<'move' | 'rotate' | 'scale' | null>(null);
  let keyboardNumeric = $state('');
  let lastPointerX = 0;
  let lastPointerY = 0;
  let hasLastPointer = false;
  let panLastX = 0;
  let panLastY = 0;
  let panStartX = 0;
  let panStartY = 0;
  let panMoved = false;
  let panCanClear = false;
  let deltaU = $state(0);
  let deltaV = $state(0);
  let angle = $state(0);
  let scaleFactor = $state(1);
  let activePointerId: number | null = null;

  const selectedCount = $derived(session.snapshot.uvSelectedCorners.length);
  const axisLock = $derived(session.snapshot.uvAxisLock);
  const transformMode = $derived(session.snapshot.uvTransformMode);
  const pinnedCount = $derived(session.snapshot.uvPinnedCorners.length);
  const lassoMode = $derived(session.snapshot.lassoMode);
  const activeEditor = $derived(session.snapshot.activeEditor);
  const clampMode = $derived(session.snapshot.uvClampMode);
  const fineMode = $derived(session.snapshot.uvFineMode);
  const uvZoom = $derived(session.snapshot.uvZoom);
  const uvDragScale = $derived(session.snapshot.uvDragScale);

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
    const onWheel = (event: WheelEvent): void => {
      if (!canvas || width <= 0 || height <= 0) {
        return;
      }
      event.preventDefault();
      const point = localPoint(event);
      session.zoomUv(
        Math.exp(-event.deltaY * 0.0015),
        width,
        height,
        point.x,
        point.y
      );
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const unregisterShortcuts = shortcutBus.register(windowKeyDown);
    return () => {
      observer.disconnect();
      if (canvas) {
        canvas.removeEventListener('wheel', onWheel);
      }
      unregisterShortcuts();
      detachKeyboardTransform(false);
    };
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
    session.snapshot.textureAssetId;
    session.snapshot.uvSelectedCorners.length;
    session.snapshot.activeNodeId;
    session.snapshot.uvOpen;
    if (canvas && width > 0 && height > 0) {
      session.drawUvView(canvas, width, height);
    }
  });

  function localPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function trackPointer(event: PointerEvent): void {
    const point = localPoint(event);
    lastPointerX = point.x;
    lastPointerY = point.y;
    hasLastPointer = true;
  }

  function startKeyboardTransform(kind: 'move' | 'rotate' | 'scale'): void {
    const point = hasLastPointer
      ? { x: lastPointerX, y: lastPointerY }
      : { x: width / 2, y: height / 2 };
    if (
      !session.beginUvKeyboardTransform(
        kind,
        width,
        height,
        point.x,
        point.y
      )
    ) {
      return;
    }
    keyboardKind = kind;
    keyboardNumeric = '';
    window.addEventListener('pointermove', keyboardPointerMove);
  }

  function keyboardPointerMove(event: PointerEvent): void {
    if (!keyboardKind) {
      return;
    }
    event.preventDefault();
    const point = localPoint(event);
    lastPointerX = point.x;
    lastPointerY = point.y;
    hasLastPointer = true;
    session.updateUvKeyboardTransform(point.x, point.y, width, height);
  }

  function finishKeyboardTransform(): void {
    if (!keyboardKind) {
      return;
    }
    keyboardKind = null;
    keyboardNumeric = '';
    window.removeEventListener('pointermove', keyboardPointerMove);
    session.finishUvKeyboardTransform();
  }

  function cancelKeyboardTransform(): void {
    if (!keyboardKind) {
      return;
    }
    keyboardKind = null;
    keyboardNumeric = '';
    window.removeEventListener('pointermove', keyboardPointerMove);
    session.cancelUvKeyboardTransform();
  }

  function detachKeyboardTransform(cancel: boolean): void {
    window.removeEventListener('pointermove', keyboardPointerMove);
    if (keyboardKind && cancel) {
      session.cancelUvKeyboardTransform();
    }
    keyboardKind = null;
    keyboardNumeric = '';
  }

  function windowKeyDown(event: KeyboardEvent): void {
    if (session.snapshot.activeEditor !== 'uv') {
      return;
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
    const key = event.key.toLowerCase();
    if (keyboardKind) {
      if (key === 'enter') {
        event.preventDefault();
        event.stopPropagation();
        const number = Number(keyboardNumeric);
        if (keyboardNumeric.trim().length > 0 && Number.isFinite(number)) {
          const kind = keyboardKind;
          const lock = session.snapshot.uvAxisLock;
          cancelKeyboardTransform();
          if (kind === 'move') {
            session.applyUvMove(
              lock === 'v' ? 0 : number,
              lock === 'v' ? number : 0
            );
          } else if (kind === 'rotate') {
            session.applyUvRotate(number);
          } else {
            session.applyUvScale(number);
          }
        } else {
          finishKeyboardTransform();
        }
        return;
      }
      if (key === 'escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelKeyboardTransform();
        return;
      }
      if (key === 'u' || key === 'v') {
        event.preventDefault();
        event.stopPropagation();
        session.setUvAxisLock(key);
        return;
      }
      if (key === 'backspace') {
        event.preventDefault();
        event.stopPropagation();
        keyboardNumeric = keyboardNumeric.slice(0, -1);
        return;
      }
      if (/^[0-9.-]$/.test(key)) {
        event.preventDefault();
        event.stopPropagation();
        keyboardNumeric += key;
        return;
      }
    }
    const matched = commandForKeyboardEvent(event);
    if (
      matched === 'tool.move' ||
      matched === 'tool.rotate' ||
      matched === 'tool.scale'
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (session.snapshot.uvSelectedCorners.length > 0) {
        const kind =
          matched === 'tool.move'
            ? 'move'
            : matched === 'tool.rotate'
              ? 'rotate'
              : 'scale';
        startKeyboardTransform(kind);
      }
      return;
    }
    if (matched === 'uv.axisU' || matched === 'uv.axisV') {
      event.preventDefault();
      event.stopPropagation();
      session.setUvAxisLock(matched === 'uv.axisU' ? 'u' : 'v');
    }
  }

  function beginPan(event: PointerEvent, clearOnClick = false): void {
    uvPanning = true;
    panCanClear = clearOnClick;
    const point = localPoint(event);
    panLastX = point.x;
    panLastY = point.y;
    panStartX = point.x;
    panStartY = point.y;
    panMoved = false;
    activePointerId = event.pointerId;
    window.addEventListener('pointermove', windowPointerMove);
    window.addEventListener('pointerup', windowPointerUp);
    window.addEventListener('pointercancel', windowPointerCancel);
  }

  function pointerDown(event: PointerEvent): void {
    if (keyboardKind) {
      finishKeyboardTransform();
      event.preventDefault();
      return;
    }
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      beginPan(event, false);
      return;
    }
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    session.setActiveEditor('uv');
    canvas.focus({ preventScroll: true });
    const point = localPoint(event);
    if (lassoMode) {
      lassoing = true;
      uvLassoPath = [[point.x, point.y]];
      lassoAdditive =
        event.shiftKey || event.metaKey || event.ctrlKey;
      activePointerId = event.pointerId;
      window.addEventListener('pointermove', windowPointerMove);
      window.addEventListener('pointerup', windowPointerUp);
      window.addEventListener('pointercancel', windowPointerCancel);
      return;
    }
    const additive =
      event.shiftKey || event.metaKey || event.ctrlKey;
    const hit = session.pickUvElement(
      point.x,
      point.y,
      width,
      height,
      additive
    );
    if (!hit || !session.beginUvDrag(point.x, point.y, width, height)) {
      beginPan(event, true);
      return;
    }
    dragging = true;
    dragMoved = false;
    dragStartX = point.x;
    dragStartY = point.y;
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
    trackPointer(event);
    if (uvPanning) {
      if (!panMoved && uvClickMoved(panStartX, panStartY, point.x, point.y)) {
        panMoved = true;
      }
      session.panUv(point.x - panLastX, point.y - panLastY);
      panLastX = point.x;
      panLastY = point.y;
      return;
    }
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
    if (!dragging) {
      return;
    }
    if (!dragMoved && uvClickMoved(dragStartX, dragStartY, point.x, point.y)) {
      dragMoved = true;
    }
    session.updateUvDrag(point.x, point.y, width, height, event.shiftKey);
  }

  function windowPointerUp(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) {
      return;
    }
    detachDragListeners();
    if (uvPanning) {
      uvPanning = false;
      if (panCanClear && !panMoved) {
        session.clearUvSelectionOnClick();
      }
      panMoved = false;
      panCanClear = false;
      return;
    }
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
    if (!dragging) {
      return;
    }
    const moved = dragMoved;
    dragging = false;
    dragMoved = false;
    if (moved) {
      session.finishUvDrag();
    } else {
      session.finishUvClick();
      session.cancelUvDrag();
    }
  }

  function keyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    if (keyboardKind) {
      cancelKeyboardTransform();
      return;
    }
    if (uvPanning) {
      detachDragListeners();
      uvPanning = false;
    } else if (lassoing) {
      detachDragListeners();
      lassoing = false;
      uvLassoPath = [];
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
    if (uvPanning) {
      uvPanning = false;
      return;
    }
    if (lassoing) {
      lassoing = false;
      uvLassoPath = [];
      return;
    }
    if (!dragging) {
      return;
    }
    dragging = false;
    session.cancelUvDrag();
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

</script>

{#snippet uvHeader()}
  <PaneHeader
    label="UV"
    active={activeEditor === 'uv'}
    meta={`${selectedCount} corner${selectedCount === 1 ? '' : 's'} · ${Math.round(uvZoom * 100)}%${uvDragScale !== null ? ` · ×${uvDragScale.toFixed(2)}` : ''}`}
  />
{/snippet}

{#snippet uvToolbar()}
  <div class="uv-toolbar">
    <div class="uv-group" role="group" aria-label="UV transform">
      <IconButton
        label="Move UVs"
        icon="move"
        tooltip="Move UVs (G)"
        active={transformMode === 'move'}
        onActivate={() => session.setUvTransformMode('move')}
      />
      <IconButton
        label="Rotate UVs"
        icon="rotate"
        tooltip="Rotate UVs (R)"
        active={transformMode === 'rotate'}
        onActivate={() => session.setUvTransformMode('rotate')}
      />
      <IconButton
        label="Scale UVs"
        icon="scale"
        tooltip="Scale UVs (S)"
        active={transformMode === 'scale'}
        onActivate={() => session.setUvTransformMode('scale')}
      />
    </div>
    <span class="uv-divider" aria-hidden="true"></span>
    <div class="uv-group" role="group" aria-label="UV constraints">
      <ActionButton
        label="U"
        active={axisLock === 'u'}
        disabled={transformMode === 'rotate'}
        onActivate={() => session.setUvAxisLock('u')}
      />
      <ActionButton
        label="V"
        active={axisLock === 'v'}
        disabled={transformMode === 'rotate'}
        onActivate={() => session.setUvAxisLock('v')}
      />
      <ActionButton
        label="Fine"
        active={fineMode}
        onActivate={() => session.setUvFineMode(!fineMode)}
      />
    </div>
    <span class="uv-divider" aria-hidden="true"></span>
    <div class="uv-group" role="group" aria-label="UV operations">
      <IconButton
        label="Sync UV selection"
        icon="sync"
        tooltip="Sync from 3D selection"
        onActivate={() => session.syncUvFrom3d()}
      />
      <IconButton
        label="Pin UVs"
        icon="pin"
        tooltip={pinnedCount === 2 ? 'Clear UV pins' : 'Pin selected corners'}
        active={pinnedCount === 2}
        disabled={pinnedCount !== 2 && selectedCount !== 2}
        onActivate={() => session.toggleUvPins()}
      />
      <IconButton
        label="Unwrap UVs"
        icon="unwrap"
        tooltip="Unwrap UV charts"
        onActivate={() => session.unwrapUv()}
      />
      <IconButton
        label="Stack islands"
        icon="stack"
        tooltip="Stack selected islands"
        onActivate={() => session.stackUvIslands()}
      />
      <IconButton
        label="Mirror stack islands"
        icon="mirror"
        tooltip="Stack selected islands with mirrored correspondence"
        onActivate={() => session.mirrorStackUvIslands()}
      />
    </div>
    <span class="uv-divider" aria-hidden="true"></span>
    <div class="uv-group" role="group" aria-label="UV view">
      <IconButton
        label="Zoom out"
        icon="minus"
        tooltip="Zoom UV out"
        onActivate={() => session.zoomUv(1 / 1.25, width, height)}
      />
      <IconButton
        label="Fit UV view"
        icon="frame"
        tooltip="Fit UV view"
        onActivate={() => session.resetUvView()}
      />
      <IconButton
        label="Zoom in"
        icon="plus"
        tooltip="Zoom UV in"
        onActivate={() => session.zoomUv(1.25, width, height)}
      />
      <IconButton
        label="Clamp UVs"
        icon="lock"
        tooltip="Clamp direct transforms"
        active={clampMode}
        onActivate={() => session.setUvClampMode(!clampMode)}
      />
    </div>
  </div>
{/snippet}

{#snippet uvFooter()}
  <div class="uv-foot">
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
    <span class="uv-foot-hint">
      {#if keyboardKind}
        {keyboardKind === 'move' ? 'Grab' : keyboardKind === 'rotate' ? 'Rotate' : 'Scale'}
        · {keyboardNumeric ? `${keyboardKind === 'move' ? (session.snapshot.uvAxisLock === 'v' ? 'ΔV' : 'ΔU') : keyboardKind === 'rotate' ? 'Angle' : 'Factor'} ${keyboardNumeric}` : 'move pointer or type a number'}
        · U/V axis · Enter {keyboardNumeric ? 'apply' : 'commit'} · Esc cancel
      {:else}
        16 px pick · {pinnedCount === 2 ? '2 pins' : 'auto pins'} · {session.snapshot.snapEnabled ? `snap ${session.snapshot.snapStep}` : 'snap off'}
      {/if}
    </span>
  </div>
{/snippet}

<PaneFrame
  label="UV editor"
  header={uvHeader}
  toolbar={uvToolbar}
  footer={uvFooter}
>
  <div class="uv-canvas-wrap" bind:this={host}>
    <canvas
      bind:this={canvas}
      class="uv-canvas"
      class:lasso-mode={lassoMode}
      class:panning={uvPanning}
      tabindex="0"
      aria-label="UV editor. Drag UV vertices, edges, faces, or islands to transform them."
      onpointerdown={pointerDown}
      onpointermove={trackPointer}
      onpointerenter={trackPointer}
      onkeydown={keyDown}
      oncontextmenu={(event) => event.preventDefault()}
    ></canvas>
    {#if lassoing && uvLassoPath.length > 1}
      <svg class="uv-lasso-overlay" aria-hidden="true">
        <polygon
          points={uvLassoPath.map(([x, y]) => `${x},${y}`).join(' ')}
        />
      </svg>
    {/if}

    {#if session.snapshot.uvError}
      <p class="uv-error" role="status">{session.snapshot.uvError}</p>
    {/if}
  </div>


</PaneFrame>

<style>
  .uv-canvas-wrap {
    position: absolute;
    inset: 0;
  }






  .uv-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    min-height: var(--hit-min);
  }

  .uv-divider {
    width: 1px;
    height: 24px;
    margin: 0 2px;
    background: var(--border-subtle);
  }

  .uv-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .uv-canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: crosshair;
    outline: none;
  }


  .uv-canvas.lasso-mode {
    cursor: crosshair;
  }

  .uv-canvas.panning {
    cursor: grabbing;
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

  .uv-canvas:focus-visible {
    outline: none;
    box-shadow: inset 0 2px 0 var(--accent-primary);
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


  .uv-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--hit-min);
    padding: 0 var(--space-3);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    white-space: nowrap;
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

  .uv-apply:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .uv-foot-hint {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 720px) {
    .uv-foot-hint {
      display: none;
    }
  }
</style>
