<script lang="ts">
  import { onMount } from 'svelte';
  import { drawStamp, strokeRandom } from '../../paint/brush';
  import type { PaintSettings } from '../../paint/types';

  /** Live brush-character preview rendered with the engine's stamp code. */
  interface Props {
    settings: PaintSettings;
  }

  let { settings }: Props = $props();
  let canvas: HTMLCanvasElement;
  const size = 44;

  $effect(() => {
    settings.color;
    settings.radius;
    settings.hardness;
    settings.noise;
    settings.tool;
    draw();
  });

  onMount(draw);

  function draw(): void {
    if (!canvas) {
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size, size);
    const radius = Math.min(22, Math.max(4, settings.radius * 0.4 + 3));
    const random = strokeRandom(7);
    if (settings.tool === 'eraser') {
      context.beginPath();
      context.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
      context.strokeStyle =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--text-secondary')
          .trim() || '#a6a3ac';
      context.lineWidth = 1.5;
      context.stroke();
      context.beginPath();
      context.arc(size / 2, size / 2, radius * 0.35, 0, Math.PI * 2);
      context.fillStyle =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--text-tertiary')
          .trim() || '#8e8c96';
      context.fill();
      return;
    }
    drawStamp(
      context,
      size / 2,
      size / 2,
      radius,
      {
        ...settings,
        color: settings.tool === 'gradient' ? settings.color : settings.color
      },
      1,
      random,
      false
    );
  }
</script>

<canvas
  bind:this={canvas}
  class="brush-preview"
  style:width={`${size}px`}
  style:height={`${size}px`}
  aria-label="Brush preview"
></canvas>

<style>
  .brush-preview {
    display: block;
    flex: 0 0 auto;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background:
      linear-gradient(45deg, var(--bg-raised) 25%, transparent 25%) 0 0 / 10px 10px,
      linear-gradient(-45deg, var(--bg-raised) 25%, transparent 25%) 0 5px / 10px 10px,
      linear-gradient(45deg, transparent 75%, var(--bg-raised) 75%) 5px -5px / 10px 10px,
      linear-gradient(-45deg, transparent 75%, var(--bg-raised) 75%) -5px 0 / 10px 10px,
      var(--bg-input);
  }
</style>
