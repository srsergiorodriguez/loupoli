<script lang="ts">
  import IconButton from '../Primitives/IconButton.svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';

  /** Floating output-resolution preview of the last still render. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();
</script>

{#if session.snapshot.renderPreviewUrl}
  <aside class="render-preview loupoli-panel" aria-label="Render preview">
    <header>
      <div>
        <span class="kicker">Render preview</span>
        <span class="detail">
          {session.snapshot.renderVirtualWidth}×{session.snapshot.renderVirtualHeight}
          virtual → {session.snapshot.renderOutputWidth}×{session.snapshot.renderOutputHeight}
          · {session.snapshot.renderUpscale}
        </span>
      </div>
      <IconButton
        label="Close render preview"
        icon="close"
        tooltip="Close preview"
        onActivate={() => session.clearRenderPreview()}
      />
    </header>
    <img
      src={session.snapshot.renderPreviewUrl}
      alt="Upscaled render preview"
    />
  </aside>
{/if}

<style>
  .render-preview {
    position: absolute;
    top: calc(50% - (var(--status-h) + var(--safe-bottom)) / 2);
    left: 50%;
    z-index: 7;
    display: flex;
    flex-direction: column;
    width: min(620px, calc(100% - 32px));
    max-height: calc(100% - var(--status-h) - var(--safe-bottom) - 32px);
    padding: 8px;
    overflow: hidden;
    transform: translate(-50%, -50%);
    pointer-events: auto;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: var(--control-h);
    padding: 0 2px 7px;
  }

  .kicker {
    display: block;
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .detail {
    display: block;
    margin-top: 2px;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 10px;
  }

  img {
    display: block;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    max-height: 380px;
    object-fit: contain;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-canvas);
    image-rendering: auto;
  }
</style>
