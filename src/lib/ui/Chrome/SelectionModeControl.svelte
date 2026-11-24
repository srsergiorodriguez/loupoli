<script lang="ts">
  import type { SelectionMode } from '../../scene/MeshNode';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import { command, commandTooltipFor, type CommandId } from '../../input/commands';

  /** Session projection for the viewport selection-mode switch. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  type ContextMode = SelectionMode | 'island';

  const paintMode = $derived(session.snapshot.workspace === 'paint');
  const modes = $derived<ReadonlyArray<{
    id: ContextMode;
    short: string;
    label: string;
    command: CommandId;
  }>>(
    paintMode
      ? [
          {
            id: 'face',
            short: 'F',
            label: command('selection.face').label,
            command: 'selection.face'
          },
          {
            id: 'island',
            short: 'I',
            label: command('selection.island').label,
            command: 'selection.island'
          }
        ]
      : [
          {
            id: 'vertex',
            short: 'V',
            label: command('selection.vertex').label,
            command: 'selection.vertex'
          },
          {
            id: 'edge',
            short: 'E',
            label: command('selection.edge').label,
            command: 'selection.edge'
          },
          {
            id: 'face',
            short: 'F',
            label: command('selection.face').label,
            command: 'selection.face'
          },
          ...(session.snapshot.activeEditor === 'uv'
            ? [{
                id: 'island' as const,
                short: 'I',
                label: command('selection.island').label,
                command: 'selection.island' as const
              }]
            : [])
        ]
  );

  function chooseMode(mode: ContextMode): void {
    if (paintMode) {
      if (
        session.snapshot.paintSelectMode &&
        session.snapshot.paintSelectScope === mode
      ) {
        session.setPaintSelectMode(false);
        return;
      }
      session.setPaintSelectScope(mode === 'island' ? 'island' : 'face');
      session.setPaintSelectMode(true);
      return;
    }
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
    if (paintMode) {
      return (
        session.snapshot.paintSelectMode &&
        session.snapshot.paintSelectScope === id
      );
    }
    if (session.snapshot.activeEditor !== 'uv') {
      return session.snapshot.selectionMode === id;
    }
    return session.snapshot.uvSelectionMode === id;
  }

  function toggleCombine(): void {
    session.setSelectionCombineMode(
      session.snapshot.selectionCombineMode === 'add' ? 'replace' : 'add'
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
      title={commandTooltipFor(mode.command)}
      onclick={() => chooseMode(mode.id)}
    >
      <span class="mode-key" aria-hidden="true">{mode.short}</span>
    </button>
  {/each}
  {#if !paintMode && session.snapshot.activeEditor !== 'uv' && session.snapshot.selectionMode === 'edge'}
    <span class="mode-divider" aria-hidden="true"></span>
    <button
      type="button"
      class="mode-button"
      class:active={session.snapshot.loopSelect}
      aria-pressed={session.snapshot.loopSelect}
      aria-label="Toggle edge loop selection"
      title="Select the full edge loop when clicking an edge"
      onclick={() => session.setLoopSelect(!session.snapshot.loopSelect)}
    >
      <span class="mode-label mode-label--all">{command('selection.loop').label}</span>
    </button>
  {/if}
  <span class="mode-divider" aria-hidden="true"></span>
  <button
    type="button"
    class="mode-button"
    aria-label="Select all elements in the current mode in the active editor"
    title={commandTooltipFor('selection.all')}
    onclick={() => session.selectAllActive()}
  >
    <span class="mode-label mode-label--all">{command('selection.all').label}</span>
  </button>
  <button
    type="button"
    class="mode-button"
    class:active={session.snapshot.selectionCombineMode === 'add'}
    aria-pressed={session.snapshot.selectionCombineMode === 'add'}
    aria-label="Multi-select mode: add or remove elements"
    title="Multi-select mode: add or remove elements"
    onclick={toggleCombine}
  >
    <span class="mode-label mode-label--combine">Multi</span>
  </button>
</div>

<style>
  .selection-mode {
    display: inline-flex;
    width: fit-content;
    padding: 2px;
    border-radius: var(--radius-md);
    gap: 1px;
  }

  .mode-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    min-width: 38px;
    min-height: 44px;
    gap: 4px;
    padding: 0;
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
    margin: 4px 1px;
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

  @media (pointer: coarse) {
    .mode-button {
      width: 44px;
      min-width: 44px;
    }
  }

  .mode-label--all,
  .mode-label--combine {
    font-family: var(--font-body);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
  }
</style>
