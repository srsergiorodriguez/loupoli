<script lang="ts">
  import type { ModalTransformSnapshot } from '../../editor/types';

  /** Props for the transient desktop transform readout. */
  interface Props {
    modal: ModalTransformSnapshot | null;
  }

  let { modal }: Props = $props();

  const operationLabel = $derived(
    modal?.kind === 'translate'
      ? 'Move'
      : modal?.kind === 'rotate'
        ? 'Rotate'
        : 'Scale'
  );

  const axisLabel = $derived(
    modal?.axis ? modal.axis.toUpperCase() : 'Free'
  );

  const displayValue = $derived.by(() => {
    if (!modal) {
      return '';
    }
    if (modal.numeric.length > 0) {
      return modal.kind === 'rotate'
        ? `${modal.numeric}°`
        : modal.kind === 'scale'
          ? `${modal.numeric}×`
          : modal.numeric;
    }
    if (modal.kind === 'rotate') {
      return `${modal.value.toFixed(1)}°`;
    }
    if (modal.kind === 'scale') {
      return `${modal.value.toFixed(3)}×`;
    }
    return modal.value.toFixed(3);
  });

  const hint = $derived(
    !modal
      ? ''
      : modal.kind === 'translate' && modal.axis === null
        ? 'X / Y / Z to constrain · Esc to cancel'
        : 'X / Y / Z axis · type a value · Enter to confirm · Esc to cancel'
  );
</script>

{#if modal}
  <div
    class="transform-hud loupoli-panel"
    role="status"
    aria-live="polite"
    aria-label="{operationLabel} {axisLabel} {displayValue}"
  >
    <span class="operation">{operationLabel}</span>
    <span class="target">{modal.target}</span>
    <span class="axis">{axisLabel}</span>
    <span class="value">{displayValue}</span>
    <span class="hint">{hint}</span>
  </div>
{/if}

<style>
  .transform-hud {
    position: fixed;
    z-index: var(--z-hud);
    left: 50%;
    bottom: var(--hud-bottom);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--control-h);
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    transform: translateX(-50%);
    pointer-events: none;
    white-space: nowrap;
  }

  .operation {
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .target {
    padding: 2px 6px;
    border-radius: var(--radius-xs);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
  }

  .axis {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 20px;
    padding: 0 5px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-xs);
    color: var(--accent-primary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .value {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .hint {
    padding-left: var(--space-2);
    border-left: var(--hairline) solid var(--border-subtle);
    color: var(--text-tertiary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
  }

  @media (max-width: 640px) {
    .transform-hud {
      max-width: calc(100vw - 24px);
    }

    .hint {
      display: none;
    }
  }
</style>
