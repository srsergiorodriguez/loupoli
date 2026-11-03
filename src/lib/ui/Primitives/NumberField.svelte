<script lang="ts">
  import { scrubNumber } from '../numberScrub';

  /** A numeric input with horizontal drag-scrubbing and exact typing. */
  interface Props {
    value: number;
    label: string;
    step?: number;
    precision?: number;
    min?: number;
    max?: number;
    unit?: string;
    framed?: boolean;
    onCommit: (value: number) => void;
  }

  let {
    value,
    label,
    step = 0.1,
    precision = 3,
    min,
    max,
    unit = '',
    framed = false,
    onCommit
  }: Props = $props();

  let input: HTMLInputElement;
  let draft = $state('');
  let dragging = $state(false);
  let pointerId: number | null = null;
  let startX = 0;
  let startValue = 0;
  let currentValue = 0;
  let moved = false;

  $effect(() => {
    if (!dragging) {
      draft = display(value);
    }
  });

  function display(next: number): string {
    if (!Number.isFinite(next)) {
      return '0';
    }
    const normalized =
      Math.abs(next) < 0.5 * 10 ** -precision ? 0 : next;
    return normalized.toFixed(precision);
  }

  function clamp(next: number): number {
    return Math.min(
      max ?? Number.POSITIVE_INFINITY,
      Math.max(min ?? Number.NEGATIVE_INFINITY, next)
    );
  }

  function beginDrag(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    pointerId = event.pointerId;
    startX = event.clientX;
    startValue = value;
    currentValue = value;
    moved = false;
    window.addEventListener('pointermove', moveDrag);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', cancelDrag);
  }

  function moveDrag(event: PointerEvent): void {
    if (pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - startX;
    if (!moved && Math.abs(dx) < 3) {
      return;
    }
    if (!moved) {
      moved = true;
      dragging = true;
      input.blur();
    }
    event.preventDefault();
    currentValue = scrubNumber(
      startValue,
      dx,
      step,
      event.shiftKey,
      min,
      max
    );
    draft = display(currentValue);
  }

  function endDrag(event: PointerEvent): void {
    if (pointerId !== event.pointerId) {
      return;
    }
    removeListeners();
    if (dragging) {
      dragging = false;
      onCommit(clamp(currentValue));
    }
  }

  function cancelDrag(event: PointerEvent): void {
    if (pointerId !== event.pointerId) {
      return;
    }
    removeListeners();
    if (dragging) {
      dragging = false;
      draft = display(value);
    }
  }

  function removeListeners(): void {
    pointerId = null;
    window.removeEventListener('pointermove', moveDrag);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', cancelDrag);
  }

  function commitDraft(): void {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      draft = display(value);
      return;
    }
    const next = clamp(parsed);
    draft = display(next);
    if (Math.abs(next - value) > 1e-9) {
      onCommit(next);
    }
  }

  function keyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
      input.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      draft = display(value);
      input.blur();
    }
  }

  $effect(() => () => removeListeners());
</script>

<div class="number-field" class:framed>
  <input
    bind:this={input}
    type="text"
    inputmode="decimal"
    value={draft}
    aria-label={label}
    oninput={(event) => (draft = event.currentTarget.value)}
    onchange={commitDraft}
    onkeydown={keyDown}
    onpointerdown={beginDrag}
  />
  {#if unit}
    <span class="unit" aria-hidden="true">{unit}</span>
  {/if}
</div>

<style>
  .number-field {
    display: flex;
    align-items: center;
    min-width: 0;
    width: 100%;
    gap: 4px;
  }

  .number-field.framed {
    min-height: var(--control-h);
    padding: 0 6px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-xs);
    background: var(--bg-input);
  }

  input {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    cursor: ew-resize;
    touch-action: none;
  }

  input:focus-visible {
    color: var(--accent-primary);
  }

  .unit {
    flex: 0 0 auto;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 9px;
  }

  @media (pointer: coarse) {
    .number-field.framed {
      min-height: var(--hit-min);
    }
  }
</style>
