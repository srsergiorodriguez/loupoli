<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import PaneFrame from '../Panels/PaneFrame.svelte';
  import PaneHeader from '../Panels/PaneHeader.svelte';
  import PaintToolbar from './PaintToolbar.svelte';

  /** Session projection for the dedicated texture-paint workspace. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();
  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);
  let painting = $state(false);
  let activePointerId: number | null = null;
  let brushX = $state(0);
  let brushY = $state(0);
  let brushVisible = $state(false);
  let panning = false;
  let panPointerId: number | null = null;
  let panLastX = 0;
  let panLastY = 0;
  let pinchActive = false;
  let pinchLastCenter = { x: 0, y: 0 };
  let pinchLastDistance = 0;
  const touchPointers = new Map<number, { x: number; y: number }>();

  const textureAssets = $derived(session.snapshot.textureAssets);
  const activeAsset = $derived(
    textureAssets.find((asset) => asset.id === session.snapshot.textureAssetId) ?? null
  );
  const brushSize = $derived(session.snapshot.uvBrushSize);
  const activeLayer = $derived(
    session.snapshot.textureLayers.find(
      (layer) => layer.id === session.snapshot.textureActiveId
    ) ?? null
  );
  const activeEditor = $derived(session.snapshot.activeEditor);


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

  onDestroy(() => {
    detachPointer();
    detachTouchTracking();
  });

  $effect(() => {
    session.snapshot.uvRevision;
    session.snapshot.textureAssetId;
    session.snapshot.textureActiveId;
    session.snapshot.textureLayers.length;
    session.snapshot.paintUvOverlay;
    session.snapshot.activeNodeId;
    if (canvas && width > 0 && height > 0) {
      session.drawPaintView(canvas, width, height);
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

  function pressureOf(event: PointerEvent): number {
    return event.pointerType === 'pen'
      ? Math.min(1, Math.max(0.1, event.pressure || 0.5))
      : 1;
  }

  function tiltOf(event: PointerEvent): { x: number; y: number } {
    return event.pointerType === 'pen'
      ? { x: event.tiltX, y: event.tiltY }
      : { x: 0, y: 0 };
  }

  function pointerDown(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      const point = localPoint(event);
      touchPointers.set(event.pointerId, point);
      if (touchPointers.size === 1) {
        attachTouchTracking();
      } else if (touchPointers.size === 2) {
        event.preventDefault();
        if (painting) {
          detachPointer();
          painting = false;
          session.cancelTexturePaint();
        }
        beginPinch();
        return;
      } else {
        return;
      }
    }
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      beginPaintPan(event);
      return;
    }
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    session.setActiveEditor('paint');
    canvas.focus({ preventScroll: true });
    const point = localPoint(event);
    const tilt = tiltOf(event);
    brushX = point.x;
    brushY = point.y;
    brushVisible = true;
    if (
      !session.beginTexturePaint(
        point.x,
        point.y,
        width,
        height,
        pressureOf(event),
        tilt.x,
        tilt.y
      )
    ) {
      return;
    }
    painting = true;
    activePointerId = event.pointerId;
    window.addEventListener('pointermove', windowPointerMove);
    window.addEventListener('pointerup', windowPointerUp);
    window.addEventListener('pointercancel', windowPointerCancel);
  }

  function pointerTrack(event: PointerEvent): void {
    const point = localPoint(event);
    brushX = point.x;
    brushY = point.y;
    brushVisible = true;
  }

  function windowPointerMove(event: PointerEvent): void {
    if (
      !painting ||
      event.pointerId !== activePointerId ||
      (event.pointerType === 'touch' && touchPointers.size > 1)
    ) {
      return;
    }
    event.preventDefault();
    const point = localPoint(event);
    const tilt = tiltOf(event);
    brushX = point.x;
    brushY = point.y;
    session.updateTexturePaint(
      point.x,
      point.y,
      width,
      height,
      pressureOf(event),
      tilt.x,
      tilt.y
    );
  }

  function windowPointerUp(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) {
      return;
    }
    detachPointer();
    painting = false;
    session.finishTexturePaint();
  }

  function windowPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) {
      return;
    }
    detachPointer();
    painting = false;
    session.cancelTexturePaint();
  }

  function detachPointer(): void {
    window.removeEventListener('pointermove', windowPointerMove);
    window.removeEventListener('pointerup', windowPointerUp);
    window.removeEventListener('pointercancel', windowPointerCancel);
    activePointerId = null;
  }

  function attachTouchTracking(): void {
    window.addEventListener('pointermove', windowTouchMove);
    window.addEventListener('pointerup', windowTouchUp);
    window.addEventListener('pointercancel', windowTouchUp);
  }

  function detachTouchTracking(): void {
    window.removeEventListener('pointermove', windowTouchMove);
    window.removeEventListener('pointerup', windowTouchUp);
    window.removeEventListener('pointercancel', windowTouchUp);
    touchPointers.clear();
    pinchActive = false;
  }

  function touchPoints(): [{ x: number; y: number }, { x: number; y: number }] | null {
    const points = [...touchPointers.values()];
    return points.length >= 2 ? [points[0], points[1]] : null;
  }

  function beginPinch(): void {
    const points = touchPoints();
    if (!points) {
      return;
    }
    pinchActive = true;
    pinchLastCenter = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
    pinchLastDistance = Math.hypot(
      points[1].x - points[0].x,
      points[1].y - points[0].y
    );
    brushVisible = false;
  }

  function windowTouchMove(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || !touchPointers.has(event.pointerId)) {
      return;
    }
    touchPointers.set(event.pointerId, localPoint(event));
    const points = touchPoints();
    if (!points || !pinchActive) {
      return;
    }
    event.preventDefault();
    const center = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2
    };
    const distance = Math.hypot(
      points[1].x - points[0].x,
      points[1].y - points[0].y
    );
    if (pinchLastDistance > 0) {
      session.zoomPaint(
        distance / pinchLastDistance,
        center.x,
        center.y,
        width,
        height
      );
    }
    session.panPaint(
      center.x - pinchLastCenter.x,
      center.y - pinchLastCenter.y
    );
    pinchLastCenter = center;
    pinchLastDistance = distance;
  }

  function windowTouchUp(event: PointerEvent): void {
    if (event.pointerType !== 'touch') {
      return;
    }
    touchPointers.delete(event.pointerId);
    if (touchPointers.size < 2) {
      pinchActive = false;
    }
    if (touchPointers.size === 0) {
      detachTouchTracking();
    }
  }

  function beginPaintPan(event: PointerEvent): void {
    panning = true;
    panPointerId = event.pointerId;
    panLastX = event.clientX;
    panLastY = event.clientY;
    window.addEventListener('pointermove', windowPanMove);
    window.addEventListener('pointerup', windowPanUp);
    window.addEventListener('pointercancel', windowPanUp);
  }

  function windowPanMove(event: PointerEvent): void {
    if (!panning || event.pointerId !== panPointerId) {
      return;
    }
    event.preventDefault();
    session.panPaint(event.clientX - panLastX, event.clientY - panLastY);
    panLastX = event.clientX;
    panLastY = event.clientY;
  }

  function windowPanUp(event: PointerEvent): void {
    if (event.pointerId !== panPointerId) {
      return;
    }
    panning = false;
    panPointerId = null;
    window.removeEventListener('pointermove', windowPanMove);
    window.removeEventListener('pointerup', windowPanUp);
    window.removeEventListener('pointercancel', windowPanUp);
  }

  function wheel(event: WheelEvent): void {
    event.preventDefault();
    const point = localPoint(event);
    const factor = Math.exp(-event.deltaY * 0.0015);
    session.zoomPaint(factor, point.x, point.y, width, height);
  }

  function keyDown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const paintKey: Record<string, 'brush' | 'eraser' | 'line' | 'rectangle' | 'ellipse' | 'gradient' | 'fill'> = {
      b: 'brush',
      e: 'eraser',
      l: 'line',
      r: 'rectangle',
      o: 'ellipse',
      g: 'gradient',
      f: 'fill'
    };
    const tool = paintKey[event.key.toLowerCase()];
    if (tool) {
      event.preventDefault();
      session.setPaintTool(tool);
      return;
    }
    if (event.key !== 'Escape') {
      return;
    }
    if (painting) {
      event.preventDefault();
      detachPointer();
      painting = false;
      session.cancelTexturePaint();
    }
  }




</script>

{#snippet paintHeader()}
  <PaneHeader
    label="Paint"
    active={activeEditor === 'paint'}
    detail={activeAsset ? `${activeAsset.name} · ${activeLayer?.name ?? 'No layer'}` : activeLayer?.name ?? 'No layer'}
    meta={`${activeAsset?.width ?? 0} × ${activeAsset?.height ?? 0} · ${activeLayer?.kind ?? '—'}`}
  />
{/snippet}

{#snippet paintToolbar()}
  <PaintToolbar {session} />
{/snippet}

{#snippet paintFooter()}
  <div class="paint-foot">
    <span class="paint-hint">
      {#if !activeLayer}
        Add a texture layer in the Inspector
      {:else}
        Drag the model or texture to paint · MMB/Alt orbit · RMB pan · wheel zoom
      {/if}
    </span>
  </div>
{/snippet}

<PaneFrame
  label="Paint editor"
  header={paintHeader}
  toolbar={paintToolbar}
  footer={paintFooter}
>

  <div class="paint-stage" bind:this={host}>
    <canvas
      bind:this={canvas}
      class="paint-canvas"
      tabindex="0"
      aria-label="Texture paint surface"
      onpointerdown={pointerDown}
      onpointermove={pointerTrack}
      onpointerenter={pointerTrack}
      onpointerleave={() => {
        if (!painting) {
          brushVisible = false;
        }
      }}
      onkeydown={keyDown}
      onwheel={wheel}
      oncontextmenu={(event) => event.preventDefault()}
    ></canvas>
    {#if brushVisible}
      <span
        class="brush-cursor"
        style={`left:${brushX}px;top:${brushY}px;width:${brushSize}px;height:${brushSize}px`}
        aria-hidden="true"
      ></span>
    {/if}
  </div>


</PaneFrame>

<style>








  .paint-stage {
    position: absolute;
    inset: 0;
  }

  .paint-canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: none;
    touch-action: none;
  }

  .paint-canvas:focus-visible {
    outline: none;
    box-shadow: inset 0 2px 0 var(--accent-primary);
  }

  .brush-cursor {
    position: absolute;
    border: var(--hairline) solid var(--accent-primary);
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
    pointer-events: none;
    transform: translate(-50%, -50%);
  }







  .paint-foot {
    align-items: center;
    flex-wrap: wrap;
    min-height: var(--status-h);
    padding: 0 var(--space-3);
  }




  .paint-hint {
    flex: 1 1 100%;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: 1.3;
  }
</style>
