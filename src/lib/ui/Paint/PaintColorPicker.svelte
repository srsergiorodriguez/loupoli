<script lang="ts">
  import { onMount } from 'svelte';
  import { rgbaColor } from '../../paint/brush';
  import { hexToHsv, hsvToHex, normalizeHexColor, type HsvColor } from '../../paint/color';

  /** Body-mounted HSV and alpha color picker for one Paint color slot. */
  interface Props {
    label: string;
    color: string;
    alpha: number;
    x: number;
    y: number;
    anchor: HTMLElement;
    onChangeColor: (color: string) => void;
    onChangeAlpha: (alpha: number) => void;
    onClose: () => void;
  }

  let {
    label,
    color,
    alpha,
    x,
    y,
    anchor,
    onChangeColor,
    onChangeAlpha,
    onClose
  }: Props = $props();

  // Mounted fresh for each picker session, so the initial props are intentional.
  // svelte-ignore state_referenced_locally
  let hsv = $state<HsvColor>(hexToHsv(color));
  // svelte-ignore state_referenced_locally
  let alphaValue = $state(alpha);
  // svelte-ignore state_referenced_locally
  let hexDraft = $state(hsvToHex(hsv));
  let svField: HTMLButtonElement;
  let dragPointer: number | null = null;
  const cssColor = $derived(rgbaColor(hsvToHex(hsv), alphaValue));

  onMount(() => {
    const outside = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!host.contains(target) && !anchor.contains(target)) {
        onClose();
      }
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', onClose);
      stopSvDrag();
    };
  });

  let host: HTMLDivElement;

  function emit(next: HsvColor): void {
    hsv = next;
    const nextHex = hsvToHex(next);
    hexDraft = nextHex;
    onChangeColor(nextHex);
  }

  function setAlpha(next: number): void {
    alphaValue = Math.min(1, Math.max(0, next));
    onChangeAlpha(alphaValue);
  }

  function updateSv(event: PointerEvent): void {
    const rect = svField.getBoundingClientRect();
    emit({
      h: hsv.h,
      s: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      v: Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height))
    });
  }

  function beginSvDrag(event: PointerEvent): void {
    event.preventDefault();
    dragPointer = event.pointerId;
    updateSv(event);
    window.addEventListener('pointermove', moveSvDrag);
    window.addEventListener('pointerup', endSvDrag);
    window.addEventListener('pointercancel', endSvDrag);
  }

  function moveSvDrag(event: PointerEvent): void {
    if (event.pointerId === dragPointer) {
      event.preventDefault();
      updateSv(event);
    }
  }

  function endSvDrag(): void {
    stopSvDrag();
  }

  function stopSvDrag(): void {
    dragPointer = null;
    window.removeEventListener('pointermove', moveSvDrag);
    window.removeEventListener('pointerup', endSvDrag);
    window.removeEventListener('pointercancel', endSvDrag);
  }

  function commitHex(): void {
    const next = normalizeHexColor(hexDraft);
    if (!next) {
      hexDraft = hsvToHex(hsv);
      return;
    }
    hsv = hexToHsv(next);
    hexDraft = next;
    onChangeColor(next);
  }
</script>

<div
  bind:this={host}
  class="color-picker"
  style:left={`${x}px`}
  style:top={`${y}px`}
  role="dialog"
  aria-label={`${label} color`}
>
  <header>
    <span>{label}</span>
    <button type="button" aria-label="Close color picker" onclick={onClose}>×</button>
  </header>

  <button
    type="button"
    bind:this={svField}
    class="sv-field"
    aria-label="Saturation and value"
    style:background={`linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h} 100% 50%)`}
    onpointerdown={beginSvDrag}
    onkeydown={(event) => {
      const step = event.shiftKey ? 0.1 : 0.01;
      if (event.key === 'ArrowLeft') emit({ ...hsv, s: Math.max(0, hsv.s - step) });
      else if (event.key === 'ArrowRight') emit({ ...hsv, s: Math.min(1, hsv.s + step) });
      else if (event.key === 'ArrowUp') emit({ ...hsv, v: Math.min(1, hsv.v + step) });
      else if (event.key === 'ArrowDown') emit({ ...hsv, v: Math.max(0, hsv.v - step) });
      else return;
      event.preventDefault();
    }}
  >
    <span
      class="sv-cursor"
      style:left={`${hsv.s * 100}%`}
      style:top={`${(1 - hsv.v) * 100}%`}
    ></span>
  </button>

  <label class="slider-row">
    <span>Hue</span>
    <input
      class="hue"
      type="range"
      min="0"
      max="360"
      step="1"
      value={hsv.h}
      oninput={(event) => emit({ ...hsv, h: Number(event.currentTarget.value) })}
    />
  </label>

  <label class="slider-row">
    <span>Alpha</span>
    <span class="alpha-track">
      <span class="alpha-color" style:background={`linear-gradient(to right, ${rgbaColor(hsvToHex(hsv), 0)}, ${rgbaColor(hsvToHex(hsv), 1)})`}></span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={alphaValue}
        aria-label={`${label} alpha`}
        oninput={(event) => setAlpha(Number(event.currentTarget.value))}
      />
      <span class="alpha-thumb" style:left={`${alphaValue * 100}%`}></span>
    </span>
    <output>{Math.round(alphaValue * 100)}%</output>
  </label>

  <footer>
    <label class="hex-row">
      <span>Hex</span>
      <input
        type="text"
        value={hexDraft}
        spellcheck="false"
        oninput={(event) => (hexDraft = event.currentTarget.value)}
        onchange={commitHex}
        onblur={commitHex}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitHex();
          }
        }}
      />
    </label>
    <span class="preview">
      <span class="preview-fill" style:background={cssColor}></span>
    </span>
  </footer>
</div>

<style>
  .color-picker {
    position: fixed;
    z-index: var(--z-popover);
    width: 252px;
    padding: var(--space-2);
    border: var(--hairline) solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    box-shadow: var(--shadow-popover);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  header button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    color: var(--text-tertiary);
    font-size: 18px;
    line-height: 1;
  }

  header button:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .sv-field {
    position: relative;
    display: block;
    width: 100%;
    height: 148px;
    padding: 0;
    overflow: hidden;
    border: 0;
    border-radius: var(--radius-sm);
    cursor: crosshair;
    touch-action: none;
  }

  .sv-cursor {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .slider-row {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 32px;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .slider-row input,
  .alpha-track input {
    min-width: 0;
    width: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .hue {
    height: 14px;
    border: 0;
    border-radius: var(--radius-pill);
    opacity: 1 !important;
    appearance: none;
    -webkit-appearance: none;
    background: linear-gradient(
      to right,
      #f00 0%,
      #ff0 16.666%,
      #0f0 33.333%,
      #0ff 50%,
      #00f 66.666%,
      #f0f 83.333%,
      #f00 100%
    );
  }

  .hue::-webkit-slider-thumb {
    width: 10px;
    height: 18px;
    border: 2px solid white;
    border-radius: var(--radius-xs);
    background: transparent;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
    appearance: none;
    -webkit-appearance: none;
  }

  .hue::-moz-range-thumb {
    width: 10px;
    height: 18px;
    border: 2px solid white;
    border-radius: var(--radius-xs);
    background: transparent;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
  }

  .alpha-track {
    position: relative;
    display: block;
    height: 14px;
    overflow: hidden;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-pill);
    background:
      linear-gradient(45deg, var(--bg-raised) 25%, transparent 25%) 0 0 / 8px 8px,
      linear-gradient(-45deg, var(--bg-raised) 25%, transparent 25%) 0 4px / 8px 8px,
      linear-gradient(45deg, transparent 75%, var(--bg-raised) 75%) 4px -4px / 8px 8px,
      linear-gradient(-45deg, transparent 75%, var(--bg-raised) 75%) -4px 0 / 8px 8px,
      var(--bg-input);
  }

  .alpha-color,
  .alpha-track input {
    position: absolute;
    inset: 0;
  }

  .alpha-track input {
    z-index: 2;
  }

  .alpha-track input:focus-visible + .alpha-thumb {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 2px;
  }

  .alpha-thumb {
    position: absolute;
    top: 50%;
    z-index: 1;
    width: 10px;
    height: 18px;
    border: 2px solid white;
    border-radius: var(--radius-xs);
    background: transparent;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  output {
    color: var(--text-secondary);
    text-align: right;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: var(--hairline) solid var(--border-subtle);
  }

  .hex-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .hex-row input {
    width: 88px;
    min-height: var(--control-h);
    padding: 0 var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .preview {
    position: relative;
    width: 32px;
    height: var(--control-h);
    overflow: hidden;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background:
      linear-gradient(45deg, var(--bg-raised) 25%, transparent 25%) 0 0 / 8px 8px,
      linear-gradient(-45deg, var(--bg-raised) 25%, transparent 25%) 0 4px / 8px 8px,
      linear-gradient(45deg, transparent 75%, var(--bg-raised) 75%) 4px -4px / 8px 8px,
      linear-gradient(-45deg, transparent 75%, var(--bg-raised) 75%) -4px 0 / 8px 8px,
      var(--bg-input);
  }

  .preview-fill {
    position: absolute;
    inset: 0;
  }
</style>
