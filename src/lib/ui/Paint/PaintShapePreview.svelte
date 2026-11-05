<script lang="ts">
  import type { ProjectionPreview } from '../../editor/types';

  /** Screen-space preview for a projected line, shape, or gradient. */
  interface Props {
    preview: ProjectionPreview;
  }

  let { preview }: Props = $props();

  const minX = $derived(Math.min(preview.startX, preview.endX));
  const minY = $derived(Math.min(preview.startY, preview.endY));
  const width = $derived(Math.abs(preview.endX - preview.startX));
  const height = $derived(Math.abs(preview.endY - preview.startY));
  const centerX = $derived((preview.startX + preview.endX) / 2);
  const centerY = $derived((preview.startY + preview.endY) / 2);
  const gradientId = 'loupoli-paint-preview-gradient';
</script>

<svg class="paint-shape-preview" width="100%" height="100%" aria-hidden="true">
  <defs>
    <linearGradient
      id={gradientId}
      gradientUnits="userSpaceOnUse"
      x1={preview.startX}
      y1={preview.startY}
      x2={preview.endX}
      y2={preview.endY}
    >
      <stop offset="0" stop-color={preview.color} stop-opacity={preview.colorAlpha} />
      <stop
        offset="1"
        stop-color={preview.secondaryColor}
        stop-opacity={preview.secondaryColorAlpha}
      />
    </linearGradient>
    <radialGradient
      id={`${gradientId}-radial`}
      gradientUnits="userSpaceOnUse"
      cx={preview.startX}
      cy={preview.startY}
      r={Math.max(1, Math.hypot(
        preview.endX - preview.startX,
        preview.endY - preview.startY
      ))}
    >
      <stop offset="0" stop-color={preview.color} stop-opacity={preview.colorAlpha} />
      <stop
        offset="1"
        stop-color={preview.secondaryColor}
        stop-opacity={preview.secondaryColorAlpha}
      />
    </radialGradient>
  </defs>

  {#if preview.kind === 'line'}
    <line
      x1={preview.startX}
      y1={preview.startY}
      x2={preview.endX}
      y2={preview.endY}
      stroke={preview.color}
      stroke-width={Math.max(2, preview.size * 0.55)}
      stroke-linecap="round"
      opacity={0.55 * preview.colorAlpha}
    />
  {:else if preview.kind === 'rectangle'}
    <rect
      x={minX}
      y={minY}
      width={width}
      height={height}
      fill={preview.filled ? preview.color : 'none'}
      fill-opacity={preview.filled ? 0.18 * preview.colorAlpha : 0}
      stroke={preview.color}
      stroke-opacity={preview.colorAlpha}
      stroke-width="2"
      stroke-dasharray={preview.filled ? undefined : '6 4'}
    />
  {:else if preview.kind === 'ellipse'}
    <ellipse
      cx={centerX}
      cy={centerY}
      rx={Math.max(1, width / 2)}
      ry={Math.max(1, height / 2)}
      fill={preview.filled ? preview.color : 'none'}
      fill-opacity={preview.filled ? 0.18 * preview.colorAlpha : 0}
      stroke={preview.color}
      stroke-opacity={preview.colorAlpha}
      stroke-width="2"
      stroke-dasharray={preview.filled ? undefined : '6 4'}
    />
  {:else}
    <line
      x1={preview.startX}
      y1={preview.startY}
      x2={preview.endX}
      y2={preview.endY}
      stroke={`url(#${gradientId}${preview.gradient === 'radial' ? '-radial' : ''})`}
      stroke-width={Math.max(3, preview.size * 0.45)}
      stroke-linecap="round"
      opacity={0.7 * Math.max(preview.colorAlpha, preview.secondaryColorAlpha)}
    />
    <circle
      cx={preview.startX}
      cy={preview.startY}
      r="4"
      fill={preview.color}
      fill-opacity={preview.colorAlpha}
    />
    <circle
      cx={preview.endX}
      cy={preview.endY}
      r="4"
      fill={preview.secondaryColor}
      fill-opacity={preview.secondaryColorAlpha}
    />
  {/if}
</svg>

<style>
  .paint-shape-preview {
    position: fixed;
    z-index: var(--z-hud);
    inset: 0;
    pointer-events: none;
    overflow: visible;
  }
</style>
