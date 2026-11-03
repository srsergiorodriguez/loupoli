<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Shared pane title row: active label, detail, meta, and optional actions. */
  interface Props {
    label: string;
    active: boolean;
    detail?: string;
    meta?: string;
    actions?: Snippet;
  }

  let {
    label,
    active,
    detail = '',
    meta = '',
    actions = undefined
  }: Props = $props();
</script>

<header class="pane-header">
  <div class="pane-heading">
    <span class="pane-kicker" class:active>{label}<span class="active-dot"></span></span>
    {#if detail}
      <span class="pane-detail">{detail}</span>
    {/if}
    {#if meta}
      <span class="pane-meta">{meta}</span>
    {/if}
  </div>
  {#if actions}
    <div class="pane-actions">{@render actions()}</div>
  {/if}
</header>

<style>
  .pane-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--hit-min);
    padding: 0 var(--space-3);
  }

  .pane-heading {
    display: flex;
    align-items: baseline;
    min-width: 0;
    gap: var(--space-2);
  }

  .pane-kicker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .active-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent-primary);
    opacity: 0;
  }

  .pane-kicker.active .active-dot {
    opacity: 1;
  }

  .pane-detail,
  .pane-meta {
    overflow: hidden;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pane-detail {
    color: var(--text-secondary);
  }

  .pane-meta {
    margin-left: auto;
  }

  .pane-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
</style>
