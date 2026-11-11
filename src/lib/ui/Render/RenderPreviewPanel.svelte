<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import PaneFrame from '../Panels/PaneFrame.svelte';
  import PaneHeader from '../Panels/PaneHeader.svelte';

  /** Always-on live output preview through the active render camera. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();
  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(0);
  let height = $state(0);
  let drawTimer = 0;
  let lastDrawAt = 0;

  const activeCamera = $derived(
    session.snapshot.cameras.find(
      (camera) => camera.id === session.snapshot.activeCameraId
    ) ?? null
  );
  const hasAnimation = $derived(
    session.snapshot.animationTracks.some((track) => track.hasTrack)
  );
  const playing = $derived(session.snapshot.animationPlaying);
  const detail = $derived(
    `${session.snapshot.renderVirtualWidth}×${session.snapshot.renderVirtualHeight} → ${session.snapshot.renderOutputWidth}×${session.snapshot.renderOutputHeight}`
  );
  const meta = $derived(
    `${session.snapshot.renderUpscale} · f${Math.round(session.snapshot.animationFrame)}`
  );

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) {
        return;
      }
      width = rect.width;
      height = rect.height;
    });
    observer.observe(host);
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        scheduleResumeRedraw();
      }
    };
    const onPageShow = (): void => scheduleResumeRedraw();
    const onFocus = (): void => scheduleResumeRedraw();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
    };
  });

  onDestroy(() => {
    if (drawTimer) {
      window.clearTimeout(drawTimer);
    }
  });

  function scheduleResumeRedraw(): void {
    requestAnimationFrame(() => {
      if (!host) {
        return;
      }
      const rect = host.getBoundingClientRect();
      if (rect.width > 0) {
        width = rect.width;
      }
      if (rect.height > 0) {
        height = rect.height;
      }
      if (width > 0 && height > 0) {
        scheduleDraw();
      }
    });
  }

  $effect(() => {
    // Publishing in the Render workspace increments this revision. The canvas
    // itself is never driven by an idle loop.
    session.snapshot.renderPreviewRevision;
    session.snapshot.renderBusy;
    session.snapshot.workspace;
    if (session.snapshot.renderBusy) {
      if (drawTimer) {
        window.clearTimeout(drawTimer);
        drawTimer = 0;
      }
      return;
    }
    if (width > 0 && height > 0) {
      scheduleDraw();
    }
  });

  function scheduleDraw(): void {
    if (drawTimer) {
      window.clearTimeout(drawTimer);
    }
    const previewFps = playing
      ? Math.min(60, Math.max(8, session.snapshot.animationFps))
      : 30;
    const interval = 1000 / previewFps;
    const wait = Math.max(0, interval - (performance.now() - lastDrawAt));
    drawTimer = window.setTimeout(() => {
      drawTimer = 0;
      if (
        !canvas ||
        width <= 0 ||
        height <= 0 ||
        session.snapshot.renderBusy
      ) {
        return;
      }
      lastDrawAt = performance.now();
      session.drawRenderPreview(canvas, width, height);
    }, wait);
  }

  function togglePlayback(): void {
    if (!activeCamera || !hasAnimation || session.snapshot.renderBusy) {
      return;
    }
    if (playing) {
      session.pauseAnimation();
    } else {
      session.playAnimation();
    }
  }
</script>

{#snippet previewHeader()}
  <PaneHeader
    label="Render preview"
    active={false}
    {detail}
    {meta}
  >
    {#snippet actions()}
      <IconButton
        label={playing ? 'Pause animation' : 'Play animation'}
        icon={playing ? 'pause' : 'play'}
        active={playing}
        pressed={playing}
        disabled={!activeCamera || !hasAnimation || session.snapshot.renderBusy}
        tooltip={!hasAnimation
          ? 'No animation keys'
          : session.snapshot.renderBusy
            ? 'Rendering'
            : playing
              ? 'Pause animation'
              : 'Play animation'}
        tooltipPlacement="bottom"
        onActivate={togglePlayback}
      />
    {/snippet}
  </PaneHeader>
{/snippet}

<PaneFrame label="Render preview" header={previewHeader}>
  <div class="render-preview-body" bind:this={host}>
    <canvas bind:this={canvas} aria-label="Live render preview"></canvas>
    {#if !activeCamera}
      <p class="preview-empty">Add a camera to preview the render.</p>
    {:else if session.snapshot.renderBusy}
      <p class="preview-empty">Rendering…</p>
    {/if}
  </div>
</PaneFrame>

<style>
  .render-preview-body {
    position: absolute;
    inset: 0;
    padding: var(--space-3);
    background:
      linear-gradient(45deg, var(--bg-raised) 25%, transparent 25%) 0 0 / 12px 12px,
      linear-gradient(-45deg, var(--bg-raised) 25%, transparent 25%) 0 6px / 12px 12px,
      linear-gradient(45deg, transparent 75%, var(--bg-raised) 75%) 6px -6px / 12px 12px,
      linear-gradient(-45deg, transparent 75%, var(--bg-raised) 75%) -6px 0 / 12px 12px,
      var(--bg-canvas);
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .preview-empty {
    position: absolute;
    top: 50%;
    left: 50%;
    width: max-content;
    max-width: calc(100% - 32px);
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-panel-strong);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    text-align: center;
    transform: translate(-50%, -50%);
  }
</style>
