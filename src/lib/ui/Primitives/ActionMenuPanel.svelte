<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../Icons/Icon.svelte';
  import type { ActionMenuOption } from './ActionMenu.svelte';

  /** Body-mounted menu surface so Inspector overflow cannot clip it. */
  interface Props {
    options: readonly ActionMenuOption[];
    x: number;
    y: number;
    onClose: () => void;
  }

  let { options, x, y, onClose }: Props = $props();
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

<style>
  .action-menu-items {
    position: fixed;
    z-index: var(--z-popover);
    width: 184px;
    padding: 3px;
    border: var(--hairline) solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-panel-strong);
    box-shadow: var(--shadow-panel);
  }

  button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    min-height: var(--hit-min);
    gap: var(--space-1);
    padding: 0 var(--space-2);
    border: var(--hairline) solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: var(--border-strong);
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  button:disabled {
    opacity: var(--opacity-disabled);
    cursor: default;
  }
</style>
