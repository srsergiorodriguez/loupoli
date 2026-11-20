<script lang="ts">
  import type { Snippet } from 'svelte';
  import ActionRow from './ActionRow.svelte';

  /** Shared labeled action cluster used by Inspector sections. */
  interface Props {
    children: Snippet;
    label?: string;
    align?: 'start' | 'between' | 'end';
    danger?: boolean;
  }

  let { children, label, align = 'start', danger = false }: Props = $props();
</script>

<div class="action-group" class:danger>
  {#if label}<span class="action-group-label">{label}</span>{/if}
  <ActionRow {align}>{@render children()}</ActionRow>
</div>

<style>
  .action-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-top: var(--space-2);
    border-top: var(--hairline) solid var(--border-subtle);
  }

  .action-group-label {
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .danger .action-group-label {
    color: var(--accent-danger);
  }
</style>
