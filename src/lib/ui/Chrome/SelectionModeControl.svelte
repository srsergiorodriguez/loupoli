<script lang="ts">
  import Icon from '../Icons/Icon.svelte';
  import type { SelectionMode } from '../../scene/MeshNode';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import { shortcut } from '../../input/shortcuts';

  /** Session projection for the viewport selection-mode switch. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  type ContextMode = SelectionMode | 'island';

  const modes = $derived<ReadonlyArray<{
    id: ContextMode;
    short: string;
    label: string;
  }>>([
    { id: 'vertex', short: 'V', label: 'Vertex' },
    { id: 'edge', short: 'E', label: 'Edge' },
    { id: 'face', short: 'F', label: 'Face' },
    ...(session.snapshot.activeEditor === 'uv'
      ? [{ id: 'island' as const, short: 'I', label: 'Island' }]
      : [])
  ]);

  function chooseMode(mode: ContextMode): void {
    if (mode === 'island') {
      session.setUvSelectionMode('island');
      return;
    }
    session.setSelectionMode(mode);
    if (session.snapshot.uvOpen) {
      session.setUvSelectionMode(mode);
    }
  }

  function isActive(id: ContextMode): boolean {
    if (session.snapshot.activeEditor !== 'uv') {
      return session.snapshot.selectionMode === id;
    }
    return session.snapshot.uvSelectionMode === id;
  }

  function toggleCombine(mode: 'add' | 'subtract'): void {
    session.setSelectionCombineMode(
      session.snapshot.selectionCombineMode === mode ? 'replace' : mode
    );
  }
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
      class:active={isActive(mode.id)}
      aria-pressed={isActive(mode.id)}
      aria-label={`${mode.label} selection mode`}
      title={`${mode.label} selection mode`}
      onclick={() => chooseMode(mode.id)}
    >
      <span class="mode-key" aria-hidden="true">{mode.short}</span>
      <span class="mode-label">{mode.label}</span>
    </button>
  {/each}
  <span class="mode-divider" aria-hidden="true"></span>
  <button
    type="button"
    class="mode-button"
    aria-label="Select all elements in the current mode in the active editor"
    title={`Select all elements in the active editor — ${shortcut('selectAll').display}`}
    onclick={() => session.selectAllActive()}
  >
    <span class="mode-label">All</span>
  </button>
  <button
    type="button"
    class="mode-button"
    class:active={session.snapshot.selectionCombineMode === 'add'}
    aria-pressed={session.snapshot.selectionCombineMode === 'add'}
    aria-label="Add to selection"
    title="Add to selection"
    onclick={() => toggleCombine('add')}
  >
    <Icon name="plus" size={13} />
    <span class="mode-label">Add</span>
  </button>
  <button
    type="button"
    class="mode-button"
    class:active={session.snapshot.selectionCombineMode === 'subtract'}
    aria-pressed={session.snapshot.selectionCombineMode === 'subtract'}
    aria-label="Subtract from selection"
    title="Subtract from selection"
    onclick={() => toggleCombine('subtract')}
  >
    <Icon name="minus" size={13} />
    <span class="mode-label">Subtract</span>
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
