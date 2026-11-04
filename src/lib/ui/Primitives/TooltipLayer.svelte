<script lang="ts">
  import { onMount, tick } from 'svelte';

  /** Body-level tooltip surface, above every panel and popover. */
  let text = $state('');
  let visible = $state(false);
  let left = $state(0);
  let top = $state(0);
  let placement = $state<'bottom' | 'right'>('bottom');
  let tooltip = $state<HTMLDivElement | null>(null);
  let activeTarget: HTMLElement | null = null;
  let showTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (showTimer !== null) {
      clearTimeout(showTimer);
      showTimer = null;
    }
  }

  function hide(): void {
    clearTimer();
    activeTarget = null;
    visible = false;
  }

  function targetFor(event: Event): HTMLElement | null {
    const target = event.target;
    return target instanceof Element
      ? target.closest<HTMLElement>('[data-tooltip]')
      : null;
  }

  async function showFor(target: HTMLElement): Promise<void> {
    const next = target.dataset.tooltip ?? '';
    if (!next || activeTarget === target) {
      return;
    }
    clearTimer();
    activeTarget = target;
    showTimer = setTimeout(() => {
      showTimer = null;
      if (activeTarget !== target) {
        return;
      }
      text = next;
      placement =
        target.dataset.tooltipPlacement === 'right' ? 'right' : 'bottom';
      const rect = target.getBoundingClientRect();
      left =
        placement === 'right'
          ? rect.right + 8
          : rect.left + rect.width / 2;
      top = placement === 'right' ? rect.top + rect.height / 2 : rect.bottom + 8;
      visible = true;
      void tick().then(() => {
        if (!visible || !tooltip) {
          return;
        }
        const bounds = tooltip.getBoundingClientRect();
        if (placement === 'right') {
          left = Math.max(
            8,
            Math.min(window.innerWidth - bounds.width - 8, left)
          );
          top = Math.max(
            8,
            Math.min(window.innerHeight - bounds.height - 8, top)
          );
        } else {
          left = Math.max(
            bounds.width / 2 + 8,
            Math.min(window.innerWidth - bounds.width / 2 - 8, left)
          );
          top =
            top + bounds.height > window.innerHeight - 8
              ? Math.max(8, rect.top - bounds.height - 8)
              : top;
        }
      });
    }, 350);
  }

  onMount(() => {
    const onPointerOver = (event: PointerEvent): void => {
      const target = targetFor(event);
      if (target) {
        void showFor(target);
      }
    };
    const onPointerOut = (event: PointerEvent): void => {
      if (!activeTarget) {
        return;
      }
      const next = event.relatedTarget;
      if (next instanceof Node && activeTarget.contains(next)) {
        return;
      }
      hide();
    };
    const onFocusIn = (event: FocusEvent): void => {
      const target = targetFor(event);
      if (target) {
        void showFor(target);
      }
    };
    const onFocusOut = (): void => hide();
    const onLayout = (): void => hide();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        hide();
      }
    };

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('scroll', onLayout, true);
    window.addEventListener('resize', onLayout);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimer();
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('scroll', onLayout, true);
      window.removeEventListener('resize', onLayout);
      window.removeEventListener('keydown', onKeyDown);
    };
  });
</script>

{#if visible}
  <div
    bind:this={tooltip}
    class="tooltip-layer"
    data-placement={placement}
    style:left={`${left}px`}
    style:top={`${top}px`}
    aria-hidden="true"
  >
    {text}
  </div>
{/if}

<style>
  .tooltip-layer {
    position: fixed;
    z-index: var(--z-toast);
    max-width: min(280px, calc(100vw - 16px));
    padding: 6px 8px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-panel-strong);
    box-shadow: var(--shadow-popover);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    line-height: 1.25;
    pointer-events: none;
    -webkit-backdrop-filter: blur(var(--blur-strong));
    backdrop-filter: blur(var(--blur-strong));
  }

  .tooltip-layer[data-placement='bottom'] {
    transform: translate(-50%, 0);
  }

  .tooltip-layer[data-placement='right'] {
    transform: translate(0, -50%);
  }
</style>
