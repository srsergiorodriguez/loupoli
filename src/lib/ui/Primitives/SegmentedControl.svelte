<script lang="ts">
  import Icon from '../Icons/Icon.svelte';
  import type { IconName } from '../Icons/types';

  /** One option in a shared segmented control. */
  export interface SegmentedOption {
    readonly id: string;
    readonly label: string;
    readonly icon?: IconName;
    readonly title?: string;
    readonly disabled?: boolean;
  }

  /** Props for a single-select segmented control. */
  interface Props {
    label: string;
    options: readonly SegmentedOption[];
    value: string;
    variant?: 'workspace' | 'panel';
    onSelect: (id: string) => void;
  }

  let {
    label,
    options,
    value,
    variant = 'panel',
    onSelect
  }: Props = $props();
</script>

<div class="segmented segmented--{variant}" role="group" aria-label={label}>
  {#each options as option (option.id)}
    <button
      type="button"
      class:active={option.id === value}
      aria-pressed={option.id === value}
      aria-label={option.title ?? option.label}
      title={option.title ?? option.label}
      disabled={option.disabled}
      onclick={() => onSelect(option.id)}
    >
      {#if option.icon}
        <Icon name={option.icon} size={14} />
      {/if}
      <span>{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
  }

  .segmented--workspace {
    padding: 2px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 44px;
    min-height: var(--control-h);
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-label);
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  button.active {
    background: var(--bg-selected);
    color: var(--accent-primary);
    box-shadow: inset 0 0 0 var(--hairline) var(--accent-primary);
  }

  button.active:hover {
    color: var(--accent-primary-hover);
  }

  button:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 1px;
  }

  button:disabled {
    opacity: var(--opacity-disabled);
    cursor: default;
  }

  .segmented--workspace button {
    min-width: 52px;
    height: calc(var(--control-h) - 4px);
    min-height: calc(var(--control-h) - 4px);
  }

  :global(:root[data-density='touch']) .segmented button {
    min-width: var(--hit-min);
    min-height: var(--hit-min);
  }

  @media (max-width: 620px) {
    .segmented--workspace button {
      min-width: 44px;
      padding: 0 var(--space-1);
    }
  }
</style>
