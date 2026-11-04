<script lang="ts">
  import { onDestroy } from 'svelte';
  import { mount, unmount } from 'svelte';
  import Icon from '../Icons/Icon.svelte';
  import type { IconName } from '../Icons/types';
  import ActionMenuPanel from './ActionMenuPanel.svelte';

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
  let trigger: HTMLButtonElement;
  let open = $state(false);
  let panelTarget: HTMLDivElement | null = null;
  let panel: Record<string, unknown> | null = null;

  onDestroy(close);

  function close(): void {
    if (panel) {
      unmount(panel as never);
      panel = null;
    }
    panelTarget?.remove();
    panelTarget = null;
    open = false;
  }

  function toggle(): void {
    if (open) {
      close();
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = 184;
    const height = options.length * 44 + 8;
    let x = align === 'end' ? rect.right - width : rect.left;
    x = Math.max(8, Math.min(window.innerWidth - width - 8, x));
    let y = rect.bottom + 4;
    if (y + height > window.innerHeight - 8) {
      y = Math.max(8, rect.top - height - 4);
    }
    panelTarget = document.createElement('div');
    document.body.appendChild(panelTarget);
    panel = mount(ActionMenuPanel, {
      target: panelTarget,
      props: { options, x, y, onClose: close }
    }) as unknown as Record<string, unknown>;
    open = true;
  }
</script>

<div class="action-menu">
  <button
    type="button"
    class="action-menu-trigger"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={label || 'More actions'}
    {disabled}
    bind:this={trigger}
    onclick={toggle}
  >
    <Icon name={icon} size={14} />
    {#if label}<span>{label}</span>{/if}
    <span class="action-menu-chevron" aria-hidden="true">⌄</span>
  </button>
</div>

<style>
  .action-menu {
    position: relative;
  }

  .action-menu-trigger {
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

  .action-menu-trigger:hover:not(:disabled) {
    border-color: var(--border-strong);
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .action-menu-trigger:disabled {
    opacity: var(--opacity-disabled);
    cursor: default;
  }

  .action-menu-chevron {
    margin-left: auto;
    color: var(--text-tertiary);
  }
</style>
