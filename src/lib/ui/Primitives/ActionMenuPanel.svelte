<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../Icons/Icon.svelte';
  import type { ActionMenuOption } from './ActionMenu.svelte';

  /** Body-mounted menu surface so Inspector overflow cannot clip it. */
  interface Props {
    options: readonly ActionMenuOption[];
    title?: string;
    x: number;
    y: number;
    onClose: () => void;
  }

  let { options, title = '', x, y, onClose }: Props = $props();
  let host: HTMLDivElement;

  onMount(() => {
    const outside = (event: PointerEvent): void => {
      if (!host.contains(event.target as Node)) {
        onClose();
      }
    };
    const closeOnLayout = (): void => onClose();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', closeOnLayout);
    window.addEventListener('scroll', closeOnLayout, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', closeOnLayout);
      window.removeEventListener('scroll', closeOnLayout, true);
    };
  });

  function choose(option: ActionMenuOption): void {
    if (option.disabled) {
      return;
    }
    onClose();
    option.onSelect();
  }
</script>

<div
  class="action-menu-items"
  bind:this={host}
  style:left={`${x}px`}
  style:top={`${y}px`}
  role="menu"
>
  {#if title}<div class="action-menu-title">{title}</div>{/if}
  {#each options as option (option.label)}
    {#if option.separatorBefore}<div class="action-menu-separator"></div>{/if}
    <button
      type="button"
      class:destructive={option.destructive}
      role="menuitem"
      disabled={option.disabled}
      onclick={() => choose(option)}
    >
      {#if option.icon}<Icon name={option.icon} size={16} />{/if}
      <span>{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .action-menu-items {
    position: fixed;
    z-index: var(--z-popover);
    width: 240px;
    padding: 6px;
    border: var(--hairline) solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    box-shadow: var(--shadow-popover);
  }

  .action-menu-title {
    margin: 0 4px 5px;
    padding: 2px 6px 7px;
    border-bottom: var(--hairline) solid var(--border-subtle);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .action-menu-separator {
    height: 1px;
    margin: 6px 8px;
    background: var(--border-subtle);
  }

  button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    min-height: var(--hit-min);
    gap: 10px;
    padding: 0 10px;
    border: var(--hairline) solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: transparent;
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  button.destructive {
    color: var(--accent-danger);
  }

  button > :global(svg) {
    flex: 0 0 auto;
    color: var(--text-secondary);
  }

  button:hover:not(:disabled) > :global(svg) {
    color: var(--text-primary);
  }

  button.destructive:hover:not(:disabled) {
    color: var(--accent-danger);
    background: var(--bg-hover);
  }

  button:disabled {
    opacity: var(--opacity-disabled);
    cursor: default;
  }
</style>
