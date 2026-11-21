<script lang="ts">
  import type { Snippet } from 'svelte';
  import ActionButton from './ActionButton.svelte';
  import type { IconName } from '../Icons/types';

  /** One option in a shared selector-and-add creation row. */
  interface Option {
    readonly value: string;
    readonly label: string;
  }

  /** Shared selector + Add row with an optional trailing action. */
  interface Props {
    label: string;
    value: string;
    options: readonly Option[];
    onChange: (value: string) => void;
    addLabel?: string;
    addIcon?: IconName;
    addDisabled?: boolean;
    onAdd: () => void;
    children?: Snippet;
  }

  let {
    label,
    value,
    options,
    onChange,
    addLabel = 'Add',
    addIcon = 'plus',
    addDisabled = false,
    onAdd,
    children
  }: Props = $props();
</script>

<div class="create-row" class:has-trailing={children !== undefined} role="group" aria-label={label}>
  <select
    {value}
    aria-label={label}
    onchange={(event) => onChange(event.currentTarget.value)}
  >
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
  <ActionButton
    label={addLabel}
    icon={addIcon}
    disabled={addDisabled}
    onActivate={onAdd}
  />
  {@render children?.()}
</div>

<style>
  .create-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-1);
  }

  .create-row.has-trailing {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }

  select {
    min-width: 0;
    min-height: var(--control-h);
    padding: 0 var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
  }

  select:hover {
    background: var(--bg-hover);
  }

  select:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 1px;
  }
</style>
