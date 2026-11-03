<script lang="ts">
  import BrandMark from '../Brand/BrandMark.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import { shortcut } from '../../input/shortcuts';
  import type { EditorSession } from '../../editor/EditorSession.svelte';

  /** Session projection used by the application bar. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  const undoLabel = $derived(
    session.snapshot.undoLabel ? `Undo ${session.snapshot.undoLabel}` : 'Undo'
  );
  const redoLabel = $derived(
    session.snapshot.redoLabel ? `Redo ${session.snapshot.redoLabel}` : 'Redo'
  );
  const saveLabel = $derived.by(() => {
    if (session.snapshot.fileBusy) {
      return 'Working…';
    }
    if (session.snapshot.recovered) {
      return 'Recovered';
    }
    switch (session.snapshot.autosaveStatus) {
      case 'dirty':
        return 'Unsaved';
      case 'saving':
        return 'Saving…';
      case 'saved':
        return 'Autosaved';
      case 'error':
        return 'Autosave error';
      case 'unavailable':
        return 'Autosave off';
      default:
        return '';
    }
  });
  const workspace = $derived(
    !session.snapshot.uvOpen
      ? 'model'
      : session.snapshot.uvPaintMode
        ? 'paint'
        : 'uv'
  );

  function chooseWorkspace(next: 'model' | 'uv' | 'paint'): void {
    session.setWorkspace(next);
  }

  const autosaveTitle = $derived(
    session.snapshot.autosaveError ??
      (session.snapshot.lastAutosavedAt
        ? `Last autosaved ${new Date(session.snapshot.lastAutosavedAt).toLocaleTimeString()}`
        : 'Changes autosave every 30 seconds while dirty')
  );
</script>

<header class="topbar loupoli-panel" aria-label="Application">
  <div class="identity">
    <BrandMark size={21} />
    <span class="wordmark">loupoli</span>
    <span class="divider" aria-hidden="true"></span>
    <span class="project" title={session.snapshot.projectName}>
      {session.snapshot.projectName}
    </span>
    {#if saveLabel}
      <span
        class="project-state"
        data-state={session.snapshot.recovered
          ? 'recovered'
          : session.snapshot.autosaveStatus}
        title={autosaveTitle}
      >
        {saveLabel}
      </span>
    {/if}
  </div>

  <nav class="workspaces" aria-label="Workspace">
    <button
      type="button"
      class="workspace"
      class:active={workspace === 'model'}
      aria-pressed={workspace === 'model'}
      onclick={() => chooseWorkspace('model')}
    >Model</button>
    <button
      type="button"
      class="workspace"
      class:active={workspace === 'uv'}
      aria-pressed={workspace === 'uv'}
      onclick={() => chooseWorkspace('uv')}
    >UV</button>
    <button
      type="button"
      class="workspace"
      class:active={workspace === 'paint'}
      aria-pressed={workspace === 'paint'}
      onclick={() => chooseWorkspace('paint')}
    >Paint</button>
  </nav>

  <div class="actions">
    <IconButton
      label="Open project"
      icon="open"
      disabled={session.snapshot.fileBusy || session.snapshot.recoveryAvailable}
      onActivate={() => void session.openProject()}
      tooltip="Open project"
      shortcut={shortcut('open').display}
    />
    <IconButton
      label="Save project"
      icon="save"
      disabled={session.snapshot.fileBusy || session.snapshot.recoveryAvailable}
      onActivate={() => void session.saveProject()}
      tooltip="Save project"
      shortcut={shortcut('save').display}
    />
    <span class="divider divider--actions" aria-hidden="true"></span>
    <IconButton
      label={undoLabel}
      icon="undo"
      disabled={!session.snapshot.canUndo}
      onActivate={() => session.undo()}
      tooltip={undoLabel}
      shortcut={shortcut('undo').display}
    />
    <IconButton
      label={redoLabel}
      icon="redo"
      disabled={!session.snapshot.canRedo}
      onActivate={() => session.redo()}
      tooltip={redoLabel}
      shortcut={shortcut('redo').display}
    />
    <span class="divider divider--actions" aria-hidden="true"></span>
    <span class="inspector-toggle">
      <IconButton
        label={session.sidebarVisible ? 'Collapse sidebar' : 'Open sidebar'}
        icon={session.sidebarVisible ? 'close' : 'sliders'}
        onActivate={() => session.toggleInspector()}
        tooltip={session.sidebarVisible ? 'Collapse sidebar' : 'Open sidebar'}
      />
    </span>
  </div>
</header>

<style>
  .topbar {
    position: fixed;
    z-index: var(--z-chrome);
    top: calc(var(--safe-top) + var(--space-3));
    left: calc(var(--safe-left) + var(--space-3));
    right: calc(var(--safe-right) + var(--space-3));
    height: var(--topbar-h);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: 0 var(--space-2) 0 var(--space-3);
    border-radius: var(--radius-lg);
    overflow: visible;
  }

  .identity {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: var(--space-2);
  }

  .wordmark {
    color: var(--text-primary);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    letter-spacing: -0.025em;
    line-height: 1;
  }

  .divider {
    display: block;
    width: 1px;
    height: 16px;
    margin: 0 var(--space-1);
    background: var(--border-subtle);
  }

  .project {
    overflow: hidden;
    max-width: min(30vw, 320px);
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    line-height: var(--leading-ui);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-state {
    padding: 3px 6px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-xs);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.03em;
    line-height: 1;
    white-space: nowrap;
  }

  .project-state[data-state='dirty'],
  .project-state[data-state='saving'] {
    color: var(--accent-primary);
  }

  .project-state[data-state='error'] {
    color: var(--accent-warning);
  }

  .project-state[data-state='recovered'] {
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .workspaces {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 2px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: rgba(0, 0, 0, 0.18);
  }

  .workspace {
    min-width: 52px;
    height: calc(var(--control-h) - 4px);
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-label);
    cursor: pointer;
  }

  .workspace:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .workspace.active {
    background: var(--bg-selected);
    color: var(--accent-primary);
    box-shadow: inset 0 0 0 var(--hairline) var(--accent-primary);
  }

  .workspace:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 1px;
  }

  .divider--actions {
    margin: 0 var(--space-1);
  }

  .inspector-toggle {
    display: inline-flex;
  }

  @media (max-width: 899px) {
    .topbar {
      gap: var(--space-2);
      padding-left: var(--space-3);
      padding-right: var(--space-1);
    }

    .wordmark {
      font-size: var(--text-md);
    }

    .project {
      max-width: 16vw;
    }

    .workspaces {
      margin-left: auto;
    }

    .workspace {
      min-width: var(--hit-min);
      padding: 0 var(--space-1);
    }

    .inspector-toggle {
      display: inline-flex;
    }
  }

  @media (max-width: 620px) {
    .project-state {
      display: none;
    }
  }

  @media (max-width: 720px) {
    .workspace {
      min-width: 44px;
      font-size: 9px;
    }

    .wordmark {
      display: none;
    }
  }

  @media (max-width: 520px) {
    .project,
    .divider:not(.divider--actions) {
      display: none;
    }

    .topbar {
      gap: var(--space-1);
    }
  }
</style>
