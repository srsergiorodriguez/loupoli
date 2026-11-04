<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import NumberField from '../Primitives/NumberField.svelte';
  import PaneFrame from '../Panels/PaneFrame.svelte';
  import PaneHeader from '../Panels/PaneHeader.svelte';
  import type { PaintTool } from '../../paint/types';

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
  const paintTool = $derived(session.snapshot.paintTool);
  const secondaryColor = $derived(session.snapshot.paintSecondaryColor);
  const hardness = $derived(session.snapshot.paintHardness);
  const smoothing = $derived(session.snapshot.paintSmoothing);
  const noise = $derived(session.snapshot.paintNoise);
  const shapeFilled = $derived(session.snapshot.paintShapeFilled);
  const gradient = $derived(session.snapshot.paintGradient);
  const tools: readonly { tool: PaintTool; label: string }[] = [
    { tool: 'brush', label: 'Brush' },
    { tool: 'eraser', label: 'Erase' },
    { tool: 'line', label: 'Line' },
    { tool: 'rectangle', label: 'Rect' },
    { tool: 'ellipse', label: 'Ellipse' },
    { tool: 'gradient', label: 'Gradient' },
    { tool: 'fill', label: 'Fill' }
  ];

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
    session.snapshot.textureAssetId;
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

  function setSecondaryColor(event: Event): void {
    session.setPaintSecondaryColor((event.currentTarget as HTMLInputElement).value);
  }

  function setRange(
    event: Event,
    apply: (value: number) => void
  ): void {
    apply(Number((event.currentTarget as HTMLInputElement).value));
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

{#snippet paintToolbar()}
  <div class="paint-tools" role="group" aria-label="Paint tool">
    {#each tools as item (item.tool)}
      <button
        type="button"
        class:active={paintTool === item.tool}
        aria-pressed={paintTool === item.tool}
        onclick={() => session.setPaintTool(item.tool)}
      >{item.label}</button>
    {/each}
  </div>
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
    <label class="paint-field paint-range">
      <span>Hard</span>
      <input
        type="range"
        min="0.01"
        max="1"
        step="0.01"
        value={hardness}
        aria-label="Brush hardness"
        oninput={(event) => setRange(event, (value) => session.setPaintHardness(value))}
      />
    </label>
    <label class="paint-field paint-range">
      <span>Smooth</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={smoothing}
        aria-label="Brush smoothing"
        oninput={(event) => setRange(event, (value) => session.setPaintSmoothing(value))}
      />
    </label>
    <label class="paint-field paint-range">
      <span>Noise</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={noise}
        aria-label="Brush noise"
        oninput={(event) => setRange(event, (value) => session.setPaintNoise(value))}
      />
    </label>
    {#if paintTool === 'gradient'}
      <label class="paint-field paint-color">
        <span>To</span>
        <input
          type="color"
          value={secondaryColor}
          aria-label="Gradient secondary color"
          onchange={setSecondaryColor}
        />
      </label>
      <label class="paint-field">
        <span>Type</span>
        <select
          value={gradient}
          aria-label="Gradient type"
          onchange={(event) =>
            session.setPaintGradient(
              event.currentTarget.value as 'linear' | 'radial'
            )}
        >
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
      </label>
    {/if}
    {#if paintTool === 'rectangle' || paintTool === 'ellipse'}
      <button
        type="button"
        class="paint-option"
        class:active={shapeFilled}
        aria-pressed={shapeFilled}
        onclick={() => session.setPaintShapeFilled(!shapeFilled)}
      >{shapeFilled ? 'Filled' : 'Outline'}</button>
    {/if}
    <span class="paint-hint">
      {activeLayer
        ? 'Paint the active layer · pen pressure · ⌘/Ctrl+Z undoes a stroke'
        : 'Add a texture layer in the Inspector'}
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

  .paint-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    padding: var(--space-1) 0;
  }

  .paint-tools button,
  .paint-option {
    min-width: 44px;
    min-height: var(--hit-min);
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-tertiary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .paint-tools button:hover,
  .paint-option:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .paint-tools button.active,
  .paint-option.active {
    color: var(--bg-canvas);
    background: var(--accent-primary);
  }

  .paint-range input {
    width: 72px;
    accent-color: var(--accent-primary);
  }

  .paint-field select {
    min-height: var(--control-h);
    padding: 0 var(--space-1);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
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
