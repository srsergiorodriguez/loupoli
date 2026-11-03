<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import NumberField from '../Primitives/NumberField.svelte';
  import PaneFrame from '../Panels/PaneFrame.svelte';
  import PaneHeader from '../Panels/PaneHeader.svelte';

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

  const textureSize = $derived(session.snapshot.textureSize);
  const brushColor = $derived(session.snapshot.uvBrushColor);
  const brushSize = $derived(session.snapshot.uvBrushSize);
  const brushOpacity = $derived(session.snapshot.uvBrushOpacity);
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

  onDestroy(detachPointer);

  $effect(() => {
    session.snapshot.uvRevision;
    session.snapshot.textureActiveId;
    session.snapshot.textureLayers.length;
    if (canvas && width > 0 && height > 0) {
      session.drawPaintView(canvas, width, height);
    }
  });

  function localPoint(event: PointerEvent): { x: number; y: number } {
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

  function pointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    session.setActiveEditor('paint');
    canvas.focus({ preventScroll: true });
    const point = localPoint(event);
    brushX = point.x;
    brushY = point.y;
    brushVisible = true;
    if (
      !session.beginTexturePaint(
        point.x,
        point.y,
        width,
        height,
        pressureOf(event)
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
    if (!painting || event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    const point = localPoint(event);
    brushX = point.x;
    brushY = point.y;
    session.updateTexturePaint(
      point.x,
      point.y,
      width,
      height,
      pressureOf(event)
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

  function keyDown(event: KeyboardEvent): void {
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

  function setColor(event: Event): void {
    session.setUvBrushColor((event.currentTarget as HTMLInputElement).value);
  }
</script>

{#snippet paintHeader()}
  <PaneHeader
    label="Paint"
    active={activeEditor === 'paint'}
    detail={activeLayer?.name ?? 'No layer'}
    meta={`${textureSize}² · ${activeLayer?.pattern ?? '—'}`}
  />
{/snippet}

{#snippet paintFooter()}
  <div class="paint-foot">
    <label class="paint-field paint-color">
      <span>Color</span>
      <input
        type="color"
        value={brushColor}
        aria-label="Paint brush color"
        onchange={setColor}
      />
    </label>
    <label class="paint-field">
      <span>Size</span>
      <NumberField
        value={brushSize}
        label="Paint brush size"
        step={1}
        precision={0}
        min={2}
        max={128}
        framed
        onCommit={(value) => session.setUvBrushSize(value)}
      />
    </label>
    <label class="paint-field">
      <span>Opacity</span>
      <NumberField
        value={brushOpacity}
        label="Paint brush opacity"
        step={0.05}
        precision={2}
        min={0.01}
        max={1}
        framed
        onCommit={(value) => session.setUvBrushOpacity(value)}
      />
    </label>
    <span class="paint-hint">
      {activeLayer
        ? 'Paint the active layer · pen pressure · ⌘/Ctrl+Z undoes a stroke'
        : 'Add a texture layer in the Inspector'}
    </span>
  </div>
{/snippet}

<PaneFrame label="Paint editor" header={paintHeader} footer={paintFooter}>

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
    flex-wrap: wrap;
  }

  .paint-field {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--space-1);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .paint-field :global(.number-field) {
    width: 96px;
  }

  .paint-color input {
    width: var(--hit-min);
    height: var(--control-h);
    padding: 0;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: transparent;
  }

  .paint-hint {
    flex: 1 1 100%;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: 1.3;
  }
</style>
