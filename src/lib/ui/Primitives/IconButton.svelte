<script lang="ts">
  import Icon from '../Icons/Icon.svelte';
  import type { IconName } from '../Icons/types';

  /** Props for an icon-only action with a 44px touch hit region. */
  interface Props {
    label: string;
    icon: IconName;
    onActivate?: () => void;
    disabled?: boolean;
    active?: boolean;
    tooltip?: string;
    shortcut?: string;
    tooltipPlacement?: 'bottom' | 'right';
  }

  let {
    label,
    icon,
    onActivate,
    disabled = false,
    active = false,
    tooltip,
    shortcut = '',
    tooltipPlacement = 'bottom'
  }: Props = $props();
</script>

<button
  type="button"
  class="icon-button"
  class:active
  aria-label={label}
  aria-keyshortcuts={shortcut || undefined}
  {disabled}
  data-tooltip={tooltip ? `${tooltip}${shortcut ? ` — ${shortcut}` : ''}` : undefined}
  data-tooltip-placement={tooltipPlacement}
  onclick={() => onActivate?.()}
>
  <Icon name={icon} size={18} />
</button>

<style>
  .icon-button {
    position: relative;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: var(--control-h);
    height: var(--control-h);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    background: transparent;
    transition:
      background-color var(--motion-instant) var(--ease-out),
      color var(--motion-instant) var(--ease-out),
      opacity var(--motion-instant) var(--ease-out);
  }

  .icon-button.active {
    color: var(--accent-primary);
    background: var(--bg-selected);
  }

  .icon-button:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .icon-button:active:not(:disabled) {
    background: var(--bg-pressed);
  }

  .icon-button:disabled {
    color: var(--text-disabled);
    opacity: var(--opacity-disabled);
  }

  :global(:root[data-density='touch']) .icon-button {
    width: var(--hit-min);
    height: var(--hit-min);
  }
</style>
