<script lang="ts">
  import Icon from '../Icons/Icon.svelte';
  import type { IconName } from '../Icons/types';

  /** Consistent icon+text action used across inspector modules. */
  interface Props {
    label: string;
    icon?: IconName;
    disabled?: boolean;
    active?: boolean;
    variant?: 'default' | 'primary' | 'danger';
    onActivate?: () => void;
  }

  let {
    label,
    icon,
    disabled = false,
    active = false,
    variant = 'default',
    onActivate
  }: Props = $props();
</script>

<button
  type="button"
  class="action-button action-button--{variant}"
  class:active
  {disabled}
  aria-pressed={active}
  onclick={() => onActivate?.()}
>
  {#if icon}<Icon name={icon} size={14} />{/if}
  <span>{label}</span>
</button>

<style>
  .action-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--control-h);
    gap: var(--space-1);
    padding: 0 var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    white-space: nowrap;
    cursor: pointer;
  }

  .action-button:hover:not(:disabled) {
    border-color: var(--border-strong);
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .action-button.active {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
    background: var(--bg-selected);
  }

  .action-button--danger:hover:not(:disabled) {
    border-color: var(--accent-danger);
    color: var(--accent-danger);
  }

  .action-button:disabled {
    opacity: var(--opacity-disabled);
    cursor: default;
  }

  .action-button:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 1px;
  }
</style>
