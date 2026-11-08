<script lang="ts">
  import BrandMark from '../Brand/BrandMark.svelte';
  import AboutModal from '../Help/AboutModal.svelte';
  import DocumentationModal from '../Help/DocumentationModal.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import SegmentedControl from '../Primitives/SegmentedControl.svelte';
  import { shortcut } from '../../input/shortcuts';
  import type { EditorSession } from '../../editor/EditorSession.svelte';

  /** Session projection used by the application bar. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();
  let aboutOpen = $state(false);
  let documentationOpen = $state(false);

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
  const workspace = $derived(session.snapshot.workspace);

  const workspaceOptions = [
    { id: 'model', label: 'Model' },
    { id: 'uv', label: 'UV' },
    { id: 'paint', label: 'Paint' },
    { id: 'light', label: 'Light' },
    { id: 'animation', label: 'Animate' },
    { id: 'render', label: 'Render' }
  ] as const;

  function chooseWorkspace(next: string): void {
    if (
      next === 'model' ||
      next === 'light' ||
      next === 'uv' ||
      next === 'paint' ||
      next === 'animation' ||
      next === 'render'
    ) {
      session.setWorkspace(next);
    }
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

  <div class="workspace-tabs">
    <SegmentedControl
      label="Workspace"
      options={workspaceOptions}
      value={workspace}
      variant="workspace"
      onSelect={chooseWorkspace}
    />
  </div>

  <div class="actions">
    <IconButton
      label="New project"
      icon="new-file"
      disabled={session.snapshot.fileBusy}
      onActivate={() => {
        if (
          session.snapshot.canUndo &&
          !window.confirm('Start a new project? Unsaved changes will be discarded.')
        ) {
          return;
        }
        session.newProject();
      }}
      tooltip="New project"
      shortcut={shortcut('newProject').display}
    />
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
    <IconButton
      label={session.snapshot.autosaveEnabled
        ? 'Pause autosave'
        : 'Resume autosave'}
      icon="autosave"
      pressed={!session.snapshot.autosaveEnabled}
      onActivate={() =>
        session.setAutosaveEnabled(!session.snapshot.autosaveEnabled)}
      tooltip={session.snapshot.autosaveEnabled
        ? 'Pause background autosave'
        : 'Resume background autosave'}
    />
    {#if workspace === 'light' || workspace === 'render'}
      <span class="divider divider--actions" aria-hidden="true"></span>
      <IconButton
        label={session.snapshot.timelineVisible ? 'Hide timeline' : 'Show timeline'}
        icon="rows"
        active={session.snapshot.timelineVisible}
        pressed={session.snapshot.timelineVisible}
        onActivate={() => session.toggleTimeline()}
        tooltip={session.snapshot.timelineVisible ? 'Hide timeline' : 'Show timeline'}
      />
    {/if}
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
    <IconButton
      label="About loupoli"
      icon="info"
      onActivate={() => (aboutOpen = true)}
      tooltip="About loupoli"
    />
    <IconButton
      label="Documentation"
      icon="book"
      onActivate={() => (documentationOpen = true)}
      tooltip="Documentation"
    />
    <span class="divider divider--actions" aria-hidden="true"></span>
    <span class="inspector-toggle">
      <IconButton
        label={session.sidebarVisible ? 'Collapse sidebar' : 'Open sidebar'}
        icon="sliders"
        onActivate={() => session.toggleInspector()}
        tooltip={session.sidebarVisible ? 'Collapse sidebar' : 'Open sidebar'}
      />
    </span>
  </div>
</header>

{#if aboutOpen}
  <AboutModal onClose={() => (aboutOpen = false)} />
{/if}
{#if documentationOpen}
  <DocumentationModal onClose={() => (documentationOpen = false)} />
{/if}

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

  .workspace-tabs {
    display: flex;
    align-items: center;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
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

    .workspace-tabs {
      margin-left: auto;
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
