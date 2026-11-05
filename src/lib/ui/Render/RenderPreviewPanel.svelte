<script lang="ts">
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import PaneFrame from '../Panels/PaneFrame.svelte';
  import PaneHeader from '../Panels/PaneHeader.svelte';

  /** Docked output-resolution preview of the last still render. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  const detail = $derived(
    `${session.snapshot.renderPreviewWidth}×${session.snapshot.renderPreviewHeight} → ${session.snapshot.renderOutputWidth}×${session.snapshot.renderOutputHeight}`
  );
</script>

{#snippet previewHeader()}
  <PaneHeader
    label="Render preview"
    active={false}
    {detail}
    meta={session.snapshot.renderUpscale}
  >
    {#snippet actions()}
      <IconButton
        label="Close render preview"
        icon="close"
        tooltip="Close preview"
        tooltipPlacement="bottom"
        onActivate={() => session.clearRenderPreview()}
      />
    {/snippet}
  </PaneHeader>
{/snippet}

<PaneFrame label="Render preview" header={previewHeader}>
  <div class="render-preview-body">
    <img src={session.snapshot.renderPreviewUrl} alt="Rendered scene preview" />
  </div>
</PaneFrame>

<style>
  .render-preview-body {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--space-3);
    background:
      linear-gradient(45deg, var(--bg-raised) 25%, transparent 25%) 0 0 / 12px 12px,
      linear-gradient(-45deg, var(--bg-raised) 25%, transparent 25%) 0 6px / 12px 12px,
      linear-gradient(45deg, transparent 75%, var(--bg-raised) 75%) 6px -6px / 12px 12px,
      linear-gradient(-45deg, transparent 75%, var(--bg-raised) 75%) -6px 0 / 12px 12px,
      var(--bg-canvas);
  }

  img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-panel);
  }
</style>
