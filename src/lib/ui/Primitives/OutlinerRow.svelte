<script lang="ts">
  import type { Snippet } from 'svelte';
  import OutlinerDragHandle from './OutlinerDragHandle.svelte';
  import OutlinerVisibility from './OutlinerVisibility.svelte';

  /** Shared scene/texture outliner row with consistent padding and states. */
  interface Props {
    active?: boolean;
    selected?: boolean;
    hidden?: boolean;
    dragging?: boolean;
    dropTarget?: boolean;
    dropAfter?: boolean;
    child?: boolean;
    group?: boolean;
    nodeId?: string;
    textureLayerId?: string;
    lightId?: string;
    cameraId?: string;
    showVisibility?: boolean;
    dragLabel?: string;
    dragTitle?: string;
    dragDisabled?: boolean;
    onDragStart?: (event: PointerEvent) => void;
    visible: boolean;
    visibilityLabel: string;
    onToggleVisibility: (event: MouseEvent) => void;
    selectLabel: string;
    onSelect: (event: MouseEvent) => void;
    children: Snippet;
  }

  let {
    active = false,
    selected = false,
    hidden = false,
    dragging = false,
    dropTarget = false,
    dropAfter = false,
    child = false,
    group = false,
    nodeId = undefined,
    textureLayerId = undefined,
    lightId = undefined,
    cameraId = undefined,
    showVisibility = true,
    dragLabel = 'Drag to reorder',
    dragTitle = 'Drag to reorder',
    dragDisabled = false,
    onDragStart,
    visible,
    visibilityLabel,
    onToggleVisibility,
    selectLabel,
    onSelect,
    children
  }: Props = $props();
</script>

<div
  class="outliner-row"
  class:active
  class:selected
  class:child
  class:group
  class:is-hidden={hidden}
  class:dragging
  class:drop-target={dropTarget}
  class:drop-after={dropTarget && dropAfter}
  data-node-id={nodeId}
  data-texture-layer-id={textureLayerId}
  data-light-id={lightId}
  data-camera-id={cameraId}
  aria-current={active ? 'true' : undefined}
>
  {#if onDragStart}
    <OutlinerDragHandle
      label={dragLabel}
      title={dragTitle}
      disabled={dragDisabled}
      {onDragStart}
    />
  {:else}
    <span class="outliner-drag-spacer" aria-hidden="true"></span>
  {/if}
  <button
    type="button"
    class="outliner-select"
    aria-label={selectLabel}
    aria-pressed={selected || active}
    onclick={(event) => onSelect(event)}
  >
    {@render children()}
  </button>
  {#if showVisibility}
    <OutlinerVisibility
      label={visibilityLabel}
      {visible}
      onToggle={onToggleVisibility}
    />
  {/if}
</div>

<style>
  .outliner-row {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: var(--control-h);
    gap: 2px;
    padding: 2px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
  }

  .outliner-row:hover {
    background: var(--bg-hover);
  }

  .outliner-row.active {
    border-color: var(--accent-primary);
    background: var(--bg-selected);
  }

  .outliner-row.selected {
    border-color: var(--accent-primary);
  }

  .outliner-row.is-hidden {
    opacity: 0.52;
  }

  .outliner-row.dragging {
    opacity: 0.4;
  }

  .outliner-row.drop-target {
    box-shadow: inset 0 2px 0 var(--accent-primary);
  }

  .outliner-row.drop-after {
    box-shadow: inset 0 -2px 0 var(--accent-primary);
  }

  .outliner-row.group {
    color: var(--text-primary);
  }

  .outliner-select {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    min-height: var(--control-h);
    gap: var(--space-2);
    padding: 0 var(--space-1);
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .outliner-row.child .outliner-select {
    padding-left: calc(var(--space-2) + 14px);
  }

  .outliner-drag-spacer {
    flex: 0 0 28px;
    min-height: var(--control-h);
  }

  @media (pointer: coarse) {
    .outliner-drag-spacer {
      flex-basis: var(--hit-min);
    }
  }
</style>
