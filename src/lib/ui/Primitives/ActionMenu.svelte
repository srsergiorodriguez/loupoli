<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../Icons/Icon.svelte';
  import type { IconName } from '../Icons/types';

  /** One selectable menu entry with optional icon and disabled state. */
  export interface ActionMenuOption {
    readonly label: string;
    readonly icon?: IconName;
    readonly disabled?: boolean;
    readonly onSelect: () => void;
  }

  /** Compact shared overflow/action menu. */
  interface Props {
    label?: string;
    icon?: IconName;
    options: readonly ActionMenuOption[];
    align?: 'start' | 'end';
    disabled?: boolean;
  }

  let {
    label = '',
    icon = 'more',
    options,
    align = 'start',
    disabled = false
  }: Props = $props();
  let host: HTMLDivElement;
  let open = $state(false);

  onMount(() => {
    const close = (event: PointerEvent): void => {
      if (open && !host.contains(event.target as Node)) {
        open = false;
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  });

  function choose(option: ActionMenuOption): void {
    if (option.disabled) {
      return;
    }
    open = false;
    option.onSelect();
  }
</script>

<div class="action-menu" bind:this={host}>
  <button
    type="button"
    class="action-menu-trigger"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={label || 'More actions'}
    {disabled}
    onclick={() => (open = !open)}
  >
    <Icon name={icon} size={14} />
    {#if label}<span>{label}</span>{/if}
    <span class="action-menu-chevron" aria-hidden="true">⌄</span>
  </button>
  {#if open}
    <div class="action-menu-items" class:end={align === 'end'} role="menu">
      {#each options as option (option.label)}
        <button
          type="button"
          role="menuitem"
          disabled={option.disabled}
          onclick={() => choose(option)}
        >
          {#if option.icon}<Icon name={option.icon} size={14} />{/if}
          <span>{option.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .action-menu {
    position: relative;
  }

  .action-menu-trigger,
  .action-menu-items button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-height: var(--hit-min);
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

  .action-menu-trigger:hover:not(:disabled),
  .action-menu-items button:hover:not(:disabled) {
    border-color: var(--border-strong);
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .action-menu-trigger:disabled,
  .action-menu-items button:disabled {
    opacity: var(--opacity-disabled);
    cursor: default;
  }

  .action-menu-chevron {
    margin-left: auto;
    color: var(--text-tertiary);
  }

  .action-menu-items {
    position: absolute;
    z-index: var(--z-hud);
    top: calc(100% + 4px);
    left: 0;
    min-width: 168px;
    padding: 3px;
    border: var(--hairline) solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-panel-strong);
    box-shadow: var(--shadow-panel);
  }

  .action-menu-items.end {
    right: 0;
    left: auto;
  }

  .action-menu-items button {
    width: 100%;
    border-color: transparent;
    background: transparent;
    text-align: left;
  }
</style>
