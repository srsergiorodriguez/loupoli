<script lang="ts">
  import { onMount } from 'svelte';
  import SelectField from '../Primitives/SelectField.svelte';
  import Switch from '../Primitives/Switch.svelte';
  import {
    GRID_SNAP_STEPS,
    ROTATION_SNAP_STEPS,
    UV_SNAP_STEPS
  } from '../../editor/types';
  import type { EditorSession } from '../../editor/EditorSession.svelte';

  /** Properties for the global snapping controls. */
  interface Props {
    session: EditorSession;
    anchor: HTMLButtonElement | undefined;
    onClose: () => void;
  }

  let { session, anchor, onClose }: Props = $props();
  let host: HTMLDivElement;

  onMount(() => {
    // Escape the status bar's stacking context so the Inspector cannot cover
    // the popover.
    document.body.appendChild(host);
    const outside = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!host.contains(target) && !anchor?.contains(target)) {
        onClose();
      }
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
      host.remove();
    };
  });
</script>

<div
  class="snap-popover loupoli-panel"
  bind:this={host}
  role="dialog"
  aria-label="Snapping settings"
>
  <div class="snap-head">
    <span>Snapping</span>
    <span class="snap-meta">Session</span>
  </div>
  <Switch
    label="Grid snap"
    checked={session.snapshot.snapEnabled}
    onChange={(value) => session.setSnapEnabled(value)}
  />
  <SelectField
    label="World"
    value={String(session.snapshot.snapStep)}
    options={GRID_SNAP_STEPS.map((step) => ({
      value: String(step),
      label: String(step)
    }))}
    onChange={(value) => session.setSnapStep(Number(value))}
  />
  <SelectField
    label="UV"
    value={String(session.snapshot.uvSnapStep)}
    options={UV_SNAP_STEPS.map((step) => ({
      value: String(step),
      label: String(step)
    }))}
    onChange={(value) => session.setUvSnapStep(Number(value))}
  />
  <SelectField
    label="Rotation"
    value={String(session.snapshot.rotationSnapStep)}
    options={ROTATION_SNAP_STEPS.map((step) => ({
      value: String(step),
      label: `${step}°`
    }))}
    onChange={(value) => session.setRotationSnapStep(Number(value))}
  />
  <p class="snap-hint">
    World applies to object and vertex moves and action amounts. UV and
    rotation have independent steps.
  </p>
</div>

<style>
  .snap-popover {
    position: fixed;
    z-index: var(--z-popover);
    right: calc(var(--safe-right) + var(--space-3));
    bottom: calc(var(--status-h) + var(--safe-bottom) + var(--space-2));
    box-sizing: border-box;
    width: min(300px, calc(100vw - var(--space-4)));
    max-height: calc(100dvh - var(--status-h) - var(--safe-bottom) - var(--space-4));
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-3);
  }

  .snap-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .snap-meta {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-regular);
  }

  .snap-hint {
    margin: var(--space-2) 0 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }
</style>
