<script lang="ts">
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionRow from '../Primitives/ActionRow.svelte';
  import ModalDialog from '../Primitives/ModalDialog.svelte';

  /** Confirmation for the destructive unique-bake-atlas preparation. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();
  const prompt = $derived(session.snapshot.bakeAtlasPrompt);
  const megabytes = $derived(
    prompt ? Math.max(1, Math.ceil(prompt.estimatedBytes / 1_000_000)) : 0
  );

  function close(): void {
    session.dismissBakeAtlasPrompt();
  }
</script>

{#if prompt}
  <ModalDialog
    title="Prepare bake atlas"
    kicker="Lighting"
    onClose={close}
  >
    <p class="lead">
      {prompt.nodeName} has overlapping UV islands. One lighting texture cannot
      store different light for two surfaces that share the same texel.
    </p>
    <p>
      This is the first step: it creates a duplicate object with unique UVs
      and a resampled texture. The original object is hidden and kept. After
      the copy is ready, press <strong>Bake lighting</strong> again to write the
      lighting layer. Symmetric painting ends on the duplicate, so finish
      symmetric paint before continuing.
    </p>
    <dl class="atlas-stats">
      <div><dt>Texture</dt><dd>{prompt.textureName}</dd></div>
      <div><dt>Atlas size</dt><dd>{prompt.fromWidth}×{prompt.fromHeight} → {prompt.targetWidth}×{prompt.targetHeight}</dd></div>
      <div><dt>Unique cells</dt><dd>{prompt.chartCount}</dd></div>
      <div><dt>Layers</dt><dd>{prompt.layerCount}</dd></div>
      <div><dt>Approx. layer memory</dt><dd>{megabytes} MB</dd></div>
    </dl>
    <p class="warning">
      The duplicate is a new bake target. Its UVs no longer mirror the original,
      and painting on one side will not update the other.
    </p>

    {#snippet actions()}
      <ActionRow align="end">
        <ActionButton label="Cancel" onActivate={close} />
        <ActionButton
          label="Create bake copy"
          icon="copy"
          onActivate={() => void session.prepareBakeAtlas()}
        />
      </ActionRow>
    {/snippet}
  </ModalDialog>
{/if}

<style>
  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: var(--leading-body);
  }

  .lead {
    color: var(--text-primary);
  }

  .atlas-stats {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: var(--space-2) 0;
    padding: var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .atlas-stats div {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
  }

  dt {
    color: var(--text-tertiary);
  }

  dd {
    margin: 0;
    color: var(--text-secondary);
    text-align: right;
  }

  .warning {
    color: var(--accent-warning);
  }
</style>
