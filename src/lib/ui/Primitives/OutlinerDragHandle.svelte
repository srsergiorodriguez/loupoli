<script lang="ts">
  /** Shared drag affordance for scene and texture outliner rows. */
  interface Props {
    label: string;
    title?: string;
    disabled?: boolean;
    onDragStart: (event: PointerEvent) => void;
  }

  let { label, title = 'Drag to reorder', disabled = false, onDragStart }: Props =
    $props();
</script>

<button
  type="button"
  class="outliner-drag-handle"
  aria-label={label}
  {title}
  {disabled}
  onpointerdown={(event) => onDragStart(event)}
><span aria-hidden="true">⠿</span></button>

<style>
  .outliner-drag-handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: 28px;
    min-height: var(--hit-min);
    border: 0;
    background: transparent;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 13px;
    letter-spacing: -2px;
    cursor: grab;
    touch-action: none;
  }

  .outliner-drag-handle:active {
    cursor: grabbing;
  }

  .outliner-drag-handle:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .outliner-drag-handle:disabled {
    opacity: var(--opacity-disabled);
    cursor: default;
  }

  @media (pointer: coarse) {
    .outliner-drag-handle {
      min-width: var(--hit-min);
    }
  }
</style>
