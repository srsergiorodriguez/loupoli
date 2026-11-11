<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { uvSideSplitForPointer } from '../../uv/uvView';

  /** Shared horizontal workspace pane with a 44px edge divider. */
  interface Props {
    label: string;
    width: number;
    orientation?: 'side' | 'bottom';
    onResize: (fraction: number) => void;
    children: Snippet;
  }

  let {
    label,
    width,
    orientation = 'side',
    onResize,
    children
  }: Props = $props();
  let host: HTMLElement;
  let resizing = $state(false);
  let resizePointerId: number | null = null;

  function startResize(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    resizing = true;
    resizePointerId = event.pointerId;
    // Window listeners survive a lost pointer capture when iPadOS backgrounds
    // the app mid-drag. The divider itself is too narrow to depend on capture.
    window.addEventListener('pointermove', moveResize, { passive: false });
    window.addEventListener('pointerup', endResize);
    window.addEventListener('pointercancel', endResize);
    window.addEventListener('blur', endResize);
  }

  function moveResize(event: PointerEvent): void {
    if (!resizing || event.pointerId !== resizePointerId) {
      return;
    }
    event.preventDefault();
    const viewport = host.closest('.viewport')?.getBoundingClientRect();
    const pane = host.getBoundingClientRect();
    if (!viewport) {
      return;
    }
    if (orientation === 'bottom') {
      if (viewport.height <= 0) {
        return;
      }
      onResize((viewport.bottom - event.clientY) / viewport.height);
      return;
    }
    if (viewport.width <= 0) {
      return;
    }
    onResize(
      uvSideSplitForPointer(
        viewport.right,
        viewport.right - pane.right,
        event.clientX,
        viewport.width
      )
    );
  }

  function endResize(event?: Event): void {
    if (!resizing) {
      return;
    }
    if (event instanceof PointerEvent && event.pointerId !== resizePointerId) {
      return;
    }
    resizing = false;
    resizePointerId = null;
    window.removeEventListener('pointermove', moveResize);
    window.removeEventListener('pointerup', endResize);
    window.removeEventListener('pointercancel', endResize);
    window.removeEventListener('blur', endResize);
  }

  onMount(() => {
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        endResize();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      endResize();
    };
  });

  onDestroy(endResize);

  function resizeKey(event: KeyboardEvent): void {
    const decrease =
      orientation === 'side'
        ? event.key === 'ArrowLeft'
        : event.key === 'ArrowDown';
    const increase =
      orientation === 'side'
        ? event.key === 'ArrowRight'
        : event.key === 'ArrowUp';
    if (!decrease && !increase) {
      return;
    }
    event.preventDefault();
    onResize(width + (decrease ? 0.03 : -0.03));
  }
</script>

<aside
  class="pane-host"
  class:pane-host--bottom={orientation === 'bottom'}
  bind:this={host}
  style={`--pane-width:${width * 100}%; --pane-height:${width * 100}%`}
  aria-label={label}
>
  <div
    class="pane-resizer"
    role="slider"
    aria-label={`Resize ${label}`}
    aria-orientation={orientation === 'bottom' ? 'horizontal' : 'vertical'}
    aria-valuenow={Math.round(width * 100)}
    aria-valuemin="25"
    aria-valuemax="65"
    tabindex="0"
    onpointerdown={startResize}
    onkeydown={resizeKey}
  ></div>
  <div class="pane-content">
    {@render children()}
  </div>
</aside>

<style>
  .pane-host {
    position: relative;
    display: flex;
    flex: 0 0 clamp(300px, var(--pane-width, 38%), calc(100% - 360px));
    flex-direction: column;
    min-width: 0;
    max-width: calc(100% - 360px);
    height: 100%;
    box-sizing: border-box;
    padding:
      calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2)
      var(--space-1)
      calc(var(--safe-bottom) + var(--status-h) + var(--space-3))
      0;
  }

  .pane-content {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .pane-host--bottom {
    flex: 0 0 clamp(180px, var(--pane-height, 30%), calc(100% - 240px));
    width: 100%;
    height: auto;
    max-width: none;
    max-height: calc(100% - 240px);
  }

  .pane-resizer {
    position: absolute;
    z-index: var(--z-popover);
    top: calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2);
    bottom: calc(var(--safe-bottom) + var(--status-h) + var(--space-3));
    left: -22px;
    width: 44px;
    touch-action: none;
    cursor: ew-resize;
  }

  .pane-resizer::after {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 4px;
    height: 52px;
    border-radius: var(--radius-pill);
    background: var(--border-strong);
    content: '';
    transform: translate(-50%, -50%);
  }

  .pane-host--bottom .pane-resizer {
    top: -22px;
    right: 0;
    bottom: auto;
    left: 0;
    width: auto;
    height: 44px;
    cursor: ns-resize;
  }

  .pane-host--bottom .pane-resizer::after {
    top: 50%;
    left: 50%;
    width: 52px;
    height: 4px;
    transform: translate(-50%, -50%);
  }

  .pane-resizer:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 2px;
  }

  @media (max-width: 899px) {
    .pane-host {
      flex-basis: clamp(280px, var(--pane-width, 42%), calc(100% - 330px));
      max-width: calc(100% - 330px);
    }
  }
</style>
