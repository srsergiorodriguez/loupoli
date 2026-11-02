<script lang="ts">
  import Icon from '../Icons/Icon.svelte';
  import type { IconName } from '../Icons/types';

  /** Props for an icon-only action with a 44px touch hit region. */
  interface Props {
    label: string;
    icon: IconName;
    onActivate?: () => void;
    disabled?: boolean;
    tooltip?: string;
    tooltipPlacement?: 'bottom' | 'right';
  }

  let {
    label,
    icon,
    onActivate,
    disabled = false,
    tooltip,
    tooltipPlacement = 'bottom'
  }: Props = $props();
</script>

<button
  type="button"
  class="icon-button"
  aria-label={label}
  {disabled}
  data-tooltip={tooltip}
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

  .icon-button[data-tooltip]::after {
    content: attr(data-tooltip);
    position: absolute;
    z-index: var(--z-popover);
    padding: 6px 8px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-panel-strong);
    box-shadow: var(--shadow-popover);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    line-height: 1.2;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    -webkit-backdrop-filter: blur(var(--blur-strong));
    backdrop-filter: blur(var(--blur-strong));
    transition:
      opacity var(--motion-fast) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
  }

  .icon-button[data-tooltip-placement='bottom']::after {
    top: calc(100% + 8px);
    left: 50%;
    transform: translate(-50%, -2px);
  }

  .icon-button[data-tooltip-placement='right']::after {
    top: 50%;
    left: calc(100% + 8px);
    transform: translate(-2px, -50%);
  }

  @media (hover: hover) and (pointer: fine) {
    .icon-button[data-tooltip]:hover::after,
    .icon-button[data-tooltip]:focus-visible::after {
      opacity: 1;
      transition-delay: 450ms;
    }

    .icon-button[data-tooltip-placement='bottom']:hover::after,
    .icon-button[data-tooltip-placement='bottom']:focus-visible::after {
      transform: translate(-50%, 0);
    }

    .icon-button[data-tooltip-placement='right']:hover::after,
    .icon-button[data-tooltip-placement='right']:focus-visible::after {
      transform: translate(0, -50%);
    }
  }

  :global(:root[data-density='touch']) .icon-button {
    width: var(--hit-min);
    height: var(--hit-min);
  }
</style>
