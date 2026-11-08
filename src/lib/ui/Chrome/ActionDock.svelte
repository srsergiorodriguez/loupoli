<script lang="ts">
  import Icon from '../Icons/Icon.svelte';
  import type { IconName } from '../Icons/types';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import type { MeshActionKind } from '../../editor/types';

  /** Session projection for the one-shot modeling action dock. */
  interface Props {
    session: EditorSession;
  }

  interface ActionChoice {
    readonly kind: MeshActionKind;
    readonly label: string;
    readonly icon: IconName;
  }

  let { session }: Props = $props();

  const actions: readonly ActionChoice[] = [
    { kind: 'extrude', label: 'Extrude', icon: 'extrude' },
    { kind: 'inset', label: 'Inset', icon: 'inset' },
    { kind: 'loop-cut', label: 'Loop Cut', icon: 'loop-cut' },
    { kind: 'loop-slide', label: 'Loop Slide', icon: 'loop-slide' }
  ];

  const activeKind = $derived(session.snapshot.actionState?.kind ?? null);
  const busy = $derived(
    session.snapshot.actionState !== null &&
      session.snapshot.actionState.phase !== 'armed'
  );

  function available(kind: MeshActionKind): boolean {
    const snapshot = session.snapshot;
    if (!snapshot.activeNodeId || snapshot.activeGroupId !== null) {
      return false;
    }
    const count = snapshot.selectedElements.length;
    if (kind === 'extrude') {
      return snapshot.selectionMode === 'face' && count > 0;
    }
    if (kind === 'inset') {
      return snapshot.selectionMode === 'face' && count === 1;
    }
    if (kind === 'loop-cut') {
      return snapshot.selectionMode === 'edge' && count >= 1;
    }
    return snapshot.loopSlideAvailable;
  }
</script>

{#if session.snapshot.activeNodeId !== null && session.snapshot.activeGroupId === null}
  <aside class="action-dock loupoli-panel" aria-label="Mesh actions">
    <div class="action-grid">
      {#each actions as action (action.kind)}
        <button
          type="button"
          class:active={activeKind === action.kind}
          disabled={!available(action.kind) || busy}
          aria-label={action.kind === 'loop-slide' && !available(action.kind)
            ? `${action.label} — select an edge loop first`
            : action.label}
          title={action.kind === 'loop-slide' && !available(action.kind)
            ? `${action.label} — select an edge loop first`
            : action.label}
          onclick={() => session.armAction(action.kind)}
        >
          <Icon name={action.icon} size={18} />
          <span>{action.label}</span>
        </button>
      {/each}
    </div>
    {#if session.snapshot.selectionMode === 'edge' &&
      !session.snapshot.loopSlideAvailable}
      <p class="action-hint">Select an edge loop to enable Loop Slide.</p>
    {/if}
  </aside>
{/if}

<style>
  .action-dock {
    position: fixed;
    z-index: var(--z-hud);
    left: calc(var(--safe-left) + var(--space-3));
    bottom: calc(var(--safe-bottom) + var(--status-h) + var(--space-3));
    padding: 4px;
    border-radius: var(--radius-lg);
    -webkit-backdrop-filter: blur(var(--blur-panel));
    backdrop-filter: blur(var(--blur-panel));
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(64px, 1fr));
    gap: 4px;
  }

  .action-hint {
    max-width: 148px;
    margin: 4px 2px 2px;
    color: var(--text-tertiary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
    line-height: var(--leading-tight);
  }

  button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 64px;
    min-height: var(--hit-min);
    gap: 3px;
    padding: 4px 6px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
    line-height: 1.1;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  button.active {
    border-color: var(--border-focus);
    color: var(--accent-primary);
    background: var(--bg-selected);
  }

  button:disabled {
    opacity: 0.42;
    cursor: default;
  }

</style>
