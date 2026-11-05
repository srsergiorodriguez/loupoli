<script lang="ts">
  import { onDestroy } from 'svelte';
  import { mount, unmount } from 'svelte';
  import { rgbaColor } from '../../paint/brush';
  import PaintColorPicker from './PaintColorPicker.svelte';

  /** One Paint color trigger with a body-mounted HSV/alpha picker. */
  interface Props {
    label: string;
    color: string;
    alpha: number;
    onColor: (color: string) => void;
    onAlpha: (alpha: number) => void;
  }

  let { label, color, alpha, onColor, onAlpha }: Props = $props();
  let trigger: HTMLButtonElement;
  let open = $state(false);
  let picker: Record<string, unknown> | null = null;
  let pickerHost: HTMLDivElement | null = null;
  const preview = $derived(rgbaColor(color, alpha));

  onDestroy(close);

  function close(): void {
    if (picker) {
      unmount(picker as never);
      picker = null;
    }
    pickerHost?.remove();
    pickerHost = null;
    open = false;
  }

  function toggle(): void {
    if (open) {
      close();
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = 252;
    const height = 330;
    const x = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
    let y = rect.bottom + 6;
    if (y + height > window.innerHeight - 8) {
      y = Math.max(8, rect.top - height - 6);
    }
    pickerHost = document.createElement('div');
    document.body.appendChild(pickerHost);
    picker = mount(PaintColorPicker, {
      target: pickerHost,
      props: {
        label,
        color,
        alpha,
        x,
        y,
        anchor: trigger,
        onChangeColor: onColor,
        onChangeAlpha: onAlpha,
        onClose: close
      }
    }) as unknown as Record<string, unknown>;
    open = true;
  }
</script>

<button
  type="button"
  class="paint-color-trigger"
  bind:this={trigger}
  aria-label={`${label} color, ${Math.round(alpha * 100)}% alpha`}
  aria-haspopup="dialog"
  aria-expanded={open}
  title={`${label} color`}
  onclick={toggle}
>
  <span class="paint-color-visual">
    <span class="paint-color-fill" style:background={preview}></span>
  </span>
</button>

<style>
  .paint-color-trigger {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--hit-min);
    height: var(--hit-min);
    padding: 0;
    background: transparent;
    cursor: pointer;
  }

  .paint-color-trigger:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: -2px;
    border-radius: var(--radius-sm);
  }

  .paint-color-visual {
    position: relative;
    display: block;
    width: 32px;
    height: 24px;
    overflow: hidden;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-xs);
    background:
      linear-gradient(45deg, var(--bg-raised) 25%, transparent 25%) 0 0 / 8px 8px,
      linear-gradient(-45deg, var(--bg-raised) 25%, transparent 25%) 0 4px / 8px 8px,
      linear-gradient(45deg, transparent 75%, var(--bg-raised) 75%) 4px -4px / 8px 8px,
      linear-gradient(-45deg, transparent 75%, var(--bg-raised) 75%) -4px 0 / 8px 8px,
      var(--bg-input);
  }

  .paint-color-trigger:hover .paint-color-visual {
    border-color: var(--border-strong);
  }

  .paint-color-fill {
    position: absolute;
    inset: 0;
  }
</style>
