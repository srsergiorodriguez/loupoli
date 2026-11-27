<script lang="ts">
  import Icon from '../Icons/Icon.svelte';
  import type { IconName } from '../Icons/types';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import type { MeshActionKind } from '../../editor/types';
  import {
    command as commandDefinition,
    commandTooltipFor,
    type CommandId
  } from '../../input/commands';
  import { shortcut as shortcutDefinition } from '../../input/shortcuts';

  /** Session projection for the one-shot modeling action dock. */
  interface Props {
    session: EditorSession;
  }

  interface ActionChoice {
    readonly kind: MeshActionKind;
    readonly label: string;
    readonly icon: IconName;
    readonly command: CommandId;
  }

  let { session }: Props = $props();

  const actions: readonly ActionChoice[] = [
    { kind: 'extrude', label: 'Extrude', icon: 'extrude', command: 'mesh.extrude' },
    { kind: 'inset', label: 'Inset', icon: 'inset', command: 'mesh.inset' },
    { kind: 'bevel', label: 'Bevel', icon: 'bevel', command: 'mesh.bevel' },
    { kind: 'loop-cut', label: 'Loop Cut', icon: 'loop-cut', command: 'mesh.loopCut' },
    { kind: 'loop-slide', label: 'Loop Slide', icon: 'loop-slide', command: 'mesh.loopSlide' },
    { kind: 'subdivide', label: 'Subdivide', icon: 'subdivide', command: 'mesh.subdivide' }
  ];

  function actionTooltip(action: ActionChoice): string {
    if (action.kind === 'loop-slide' && !available(action.kind)) {
      return `${action.label} — select an edge loop first`;
    }
    if (action.kind === 'bevel' && !available(action.kind)) {
      return `${action.label} — select an interior edge with valence-three endpoints`;
    }
    return commandTooltipFor(action.command);
  }

  function actionShortcut(action: ActionChoice): string {
    const id = commandDefinition(action.command).shortcut;
    return id ? shortcutDefinition(id).display : '';
  }

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
    if (kind === 'bevel') {
      return snapshot.bevelAvailable;
    }
    if (kind === 'loop-cut') {
      return snapshot.selectionMode === 'edge' && count >= 1;
    }
    if (kind === 'subdivide') {
      return snapshot.activeNodeId !== null && snapshot.activeGroupId === null;
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
          aria-pressed={activeKind === action.kind}
          aria-keyshortcuts={actionShortcut(action) || undefined}
          disabled={!available(action.kind) || busy}
          aria-label={actionTooltip(action)}
          title={actionTooltip(action)}
          onclick={() => session.armAction(action.kind)}
        >
          <Icon name={action.icon} size={18} />
          <span>{action.label}</span>
        </button>
      {/each}
    </div>
    {#if session.snapshot.selectionMode === 'edge'}
      {#if session.snapshot.selectedElements.length > 1}
        <p class="action-hint">Select one edge to bevel. Select an edge loop for Loop Slide.</p>
      {:else if !session.snapshot.loopSlideAvailable}
        <p class="action-hint">Select an edge loop to enable Loop Slide.</p>
      {/if}
    {/if}
  </aside>
{/if}

<style>
  .action-dock {
    position: fixed;
    z-index: var(--z-hud);
    left: var(--app-inset-left);
    bottom: calc(var(--safe-bottom) + var(--status-h) + var(--space-3));
    padding: 4px;
    border-radius: var(--radius-lg);
    -webkit-backdrop-filter: blur(var(--blur-panel));
    backdrop-filter: blur(var(--blur-panel));
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(64px, 1fr));
    gap: 4px;
  }

  .action-hint {
    max-width: 220px;
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
