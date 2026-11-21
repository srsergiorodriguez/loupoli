<script lang="ts">
  import Icon from '../Icons/Icon.svelte';
  import type { IconName } from '../Icons/types';

  /** Compact dense-surface action with an accessible label and optional visible text. */
  interface Props {
    label: string;
    icon?: IconName;
    text?: string;
    destructive?: boolean;
    disabled?: boolean;
    pressed?: boolean;
    onActivate?: () => void;
  }

  let {
    label,
    icon,
    text = '',
    destructive = false,
    disabled = false,
    pressed = undefined,
    onActivate
  }: Props = $props();
</script>

<button
  type="button"
  class="compact-action"
  class:danger={destructive}
  class:has-text={text.length > 0}
  aria-label={label}
  aria-pressed={pressed}
  {disabled}
  onpointerdown={(event) => event.stopPropagation()}
  onclick={() => onActivate?.()}
>
  {#if icon}<Icon name={icon} size={11} />{/if}
  {#if text}<span>{text}</span>{/if}
</button>

<style>
  .compact-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: 20px;
    min-height: 20px;
    padding: 0 3px;
    gap: 2px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-xs);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 9px;
    line-height: 1;
    cursor: pointer;
  }

  .compact-action:hover:not(:disabled) {
    border-color: var(--border-strong);
    color: var(--text-primary);
  }

  .compact-action.danger:hover:not(:disabled) {
    border-color: var(--accent-danger);
    color: var(--accent-danger);
  }

  .compact-action:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .compact-action:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 1px;
  }

  .compact-action.has-text {
    font-family: var(--font-ui);
  }

  .compact-action span {
    white-space: nowrap;
  }

  :global(:root[data-density='touch']) .compact-action {
    min-width: var(--hit-min);
    min-height: var(--hit-min);
  }
</style>
