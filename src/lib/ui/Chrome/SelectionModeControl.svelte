<script lang="ts">
  import Icon from '../Icons/Icon.svelte';
  import type { SelectionMode } from '../../scene/MeshNode';
  import type { EditorSession } from '../../editor/EditorSession.svelte';

  /** Session projection for the viewport selection-mode switch. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  const modes: ReadonlyArray<{
    id: SelectionMode;
    short: string;
    label: string;
  }> = [
    { id: 'vertex', short: 'V', label: 'Vertex' },
    { id: 'edge', short: 'E', label: 'Edge' },
    { id: 'face', short: 'F', label: 'Face' }
  ];
</script>

<div
  class="selection-mode loupoli-panel"
  role="group"
  aria-label="Selection mode"
>
  {#each modes as mode}
    <button
      type="button"
      class="mode-button"
      class:active={session.snapshot.selectionMode === mode.id}
      aria-pressed={session.snapshot.selectionMode === mode.id}
      aria-label={`${mode.label} selection mode`}
      title={`${mode.label} selection mode`}
      onclick={() => session.setSelectionMode(mode.id)}
    >
      <span class="mode-key" aria-hidden="true">{mode.short}</span>
      <span class="mode-label">{mode.label}</span>
    </button>
  {/each}
  <span class="mode-divider" aria-hidden="true"></span>
  <button
    type="button"
    class="mode-button add-button"
    class:active={session.snapshot.additiveSelection}
    aria-pressed={session.snapshot.additiveSelection}
    aria-label="Additive selection mode"
    title="Additive selection — add or remove elements without clearing"
    onclick={() =>
      session.setAdditiveSelection(!session.snapshot.additiveSelection)}
  >
    <Icon name="plus" size={13} />
    <span class="mode-label">Add</span>
  </button>
</div>

<style>
  .selection-mode {
    display: inline-flex;
    width: fit-content;
    padding: 3px;
    border-radius: var(--radius-md);
    gap: 2px;
  }

  .mode-button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    gap: 6px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .mode-button:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .mode-button.active {
    color: var(--bg-canvas);
    background: var(--accent-primary);
  }

  .mode-divider {
    width: 1px;
    align-self: stretch;
    margin: 5px 2px;
    background: var(--border-subtle);
  }

  .add-button.active {
    color: var(--accent-primary);
    background: var(--bg-selected);
    box-shadow: inset 0 0 0 1px var(--accent-primary);
  }

  .mode-key {
    font-size: 10px;
    font-weight: var(--weight-semibold);
    opacity: 0.8;
  }

  .mode-button.active .mode-key {
    opacity: 1;
  }

  .mode-label {
    font-family: var(--font-body);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
  }

  @media (max-width: 620px) {
    .mode-label {
      display: none;
    }

    .mode-button {
      min-width: 44px;
      padding: 0;
    }
  }
</style>
