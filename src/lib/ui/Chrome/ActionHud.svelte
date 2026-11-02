<script lang="ts">
  import type { MeshActionSnapshot } from '../../editor/types';

  /** Transient readout for an armed or dragging ActionDock operation. */
  interface Props {
    state: MeshActionSnapshot | null;
  }

  let { state }: Props = $props();

  const label = $derived(
    state?.kind === 'extrude'
      ? 'Extrude'
      : state?.kind === 'inset'
        ? 'Inset'
        : state?.kind === 'loop-cut'
          ? 'Loop Cut'
          : 'Loop Slide'
  );

  const value = $derived.by(() => {
    if (!state) {
      return '';
    }
    if (state.kind === 'extrude') {
      return state.value.toFixed(3);
    }
    return `${Math.round(state.value * 100)}%`;
  });
</script>

{#if state}
  <div
    class="action-hud loupoli-panel"
    role="status"
    aria-live="polite"
    aria-label="{label} {state.phase === 'armed' ? 'armed' : value}"
  >
    <span class="label">{label}</span>
    {#if state.phase === 'armed'}
      <span class="prompt">Drag up or right in the viewport</span>
    {:else}
      <span class="value">{value}</span>
      <span class="prompt">Release to apply</span>
    {/if}
    <span class="hint">Esc cancels</span>
  </div>
{/if}

<style>
  .action-hud {
    position: fixed;
    z-index: var(--z-hud);
    left: 50%;
    bottom: calc(
      var(--safe-bottom) + var(--status-h) + var(--space-3) + 64px
    );
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--control-h);
    max-width: calc(100vw - 24px);
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    transform: translateX(-50%);
    pointer-events: none;
    white-space: nowrap;
  }

  .label {
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .value {
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .prompt,
  .hint {
    color: var(--text-tertiary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
  }

  .hint {
    padding-left: var(--space-2);
    border-left: var(--hairline) solid var(--border-subtle);
  }

  :global(:root[data-density='fine']) .action-hud {
    display: none;
  }
</style>
