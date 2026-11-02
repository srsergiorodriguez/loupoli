<script lang="ts">
  import Icon from '../Icons/Icon.svelte';
  import type { IconName } from '../Icons/types';

  /** Props for a tool-rail action with an optional pressed state. */
  interface Props {
    label: string;
    icon: IconName;
    onActivate: () => void;
    active?: boolean;
    tooltipPlacement?: 'right' | 'bottom';
  }

  let {
    label,
    icon,
    onActivate,
    active = undefined,
    tooltipPlacement = 'right'
  }: Props = $props();
</script>

<button
  type="button"
  class="tool-button"
  class:is-active={active === true}
  aria-label={label}
  aria-pressed={active === undefined ? undefined : active}
  data-tooltip={label}
  data-tooltip-placement={tooltipPlacement}
  onclick={onActivate}
>
  <span class="tool-icon"><Icon name={icon} size={19} /></span>
  <span class="tool-label">{label}</span>
</button>

<style>
  .tool-button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    margin: 0 auto;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    background: transparent;
    transition:
      background-color var(--motion-instant) var(--ease-out),
      color var(--motion-instant) var(--ease-out);
  }

  .tool-button:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .tool-button:active {
    background: var(--bg-pressed);
  }

  .tool-button.is-active {
    color: var(--accent-primary);
    background: var(--bg-selected);
  }

  .tool-button.is-active::before {
    content: '';
    position: absolute;
    top: 50%;
    left: -6px;
    width: 2px;
    height: 16px;
    border-radius: var(--radius-pill);
    background: var(--accent-primary);
    transform: translateY(-50%);
  }

  .tool-icon {
    display: grid;
    place-items: center;
    pointer-events: none;
  }

  .tool-label {
    display: none;
    pointer-events: none;
  }

  .tool-button::after {
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

  .tool-button[data-tooltip-placement='right']::after {
    top: 50%;
    left: calc(100% + 8px);
    transform: translate(-2px, -50%);
  }

  .tool-button[data-tooltip-placement='bottom']::after {
    top: calc(100% + 8px);
    left: 50%;
    transform: translate(-50%, -2px);
  }

  @media (hover: hover) and (pointer: fine) {
    .tool-button:hover::after,
    .tool-button:focus-visible::after {
      opacity: 1;
      transition-delay: 450ms;
    }

    .tool-button[data-tooltip-placement='right']:hover::after,
    .tool-button[data-tooltip-placement='right']:focus-visible::after {
      transform: translate(0, -50%);
    }

    .tool-button[data-tooltip-placement='bottom']:hover::after,
    .tool-button[data-tooltip-placement='bottom']:focus-visible::after {
      transform: translate(-50%, 0);
    }
  }

  :global(:root[data-density='touch']) .tool-button {
    width: var(--hit-min);
    height: var(--hit-min);
  }

  @media (max-width: 899px) {
    .tool-button {
      width: 64px;
      height: 52px;
      flex-direction: column;
      gap: 3px;
    }

    :global(:root[data-density='touch']) .tool-button {
      width: 64px;
      height: 52px;
    }

    .tool-button.is-active::before {
      top: auto;
      bottom: -6px;
      left: 50%;
      width: 16px;
      height: 2px;
      transform: translateX(-50%);
    }

    .tool-label {
      display: block;
      color: currentColor;
      font-size: var(--text-2xs);
      font-weight: var(--weight-medium);
      line-height: 1;
    }
  }
</style>
