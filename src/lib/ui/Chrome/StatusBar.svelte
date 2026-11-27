<script lang="ts">
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import SnapPopover from './SnapPopover.svelte';
  import { shortcut } from '../../input/shortcuts';

  /** Session projection used by the status strip. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();
  let snapOpen = $state(false);
  let snapButton = $state<HTMLButtonElement>();

  const counts = $derived(
    session.snapshot.modifiersActive
      ? session.snapshot.evaluatedCounts
      : session.snapshot.counts
  );
</script>

<footer class="status-bar" aria-label="Status">
  <div class="status-cell status-counts text-mono" aria-label="Mesh counts">
    <span>{counts.vertices} V</span>
    <span class="count-separator">·</span>
    <span>{counts.edges} E</span>
    <span class="count-separator">·</span>
    <span>{counts.faces} F</span>
    <span class="count-separator">·</span>
    <span>{counts.triangles} T</span>
  </div>

  <div class="status-cell status-state" aria-label="Input and snapping">
    <button
      type="button"
      class="mode-status"
      class:is-active={session.pencilMode}
      aria-pressed={session.pencilMode}
      title={session.pencilMode
        ? 'Pencil mode: Pencil edits, finger navigates'
        : 'Touch mode: finger edits like a mouse'}
      onclick={() => session.setPencilMode(!session.pencilMode)}
    >
      <span class="mode-icon" aria-hidden="true">✎</span>
      Pencil
    </button>
    <button
      bind:this={snapButton}
      type="button"
      class="snap-status"
      class:is-active={session.snapshot.snapEnabled}
      aria-expanded={snapOpen}
      aria-haspopup="dialog"
      aria-keyshortcuts="Shift+Tab"
      title={`Grid snapping — ${shortcut('snap').display}`}
      onclick={() => (snapOpen = !snapOpen)}
    >
      <span class="snap-dot" aria-hidden="true"></span>
      {session.snapshot.snapEnabled
        ? `Snap ${session.snapshot.snapStep}`
        : 'Snap off'}
    </button>
  </div>
  {#if snapOpen}
    <SnapPopover
      {session}
      anchor={snapButton}
      onClose={() => (snapOpen = false)}
    />
  {/if}
</footer>

<style>
  .status-bar {
    position: fixed;
    z-index: var(--z-chrome);
    right: 0;
    bottom: 0;
    left: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    height: calc(var(--status-h) + var(--safe-bottom));
    padding:
      0 var(--app-inset-right)
      var(--safe-bottom) var(--app-inset-left);
    border-top: var(--hairline) solid var(--border-subtle);
    background: var(--bg-panel);
    -webkit-backdrop-filter: blur(var(--blur-panel));
    backdrop-filter: blur(var(--blur-panel));
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .status-cell {
    min-width: 0;
  }


  .status-counts {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-secondary);
  }

  .count-separator {
    color: var(--text-disabled);
  }

  .status-state {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    color: var(--text-tertiary);
  }

  .snap-status {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: var(--status-h);
    padding: 0 var(--space-1);
    gap: 5px;
    border: var(--hairline) solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .mode-status::before,
  .snap-status::before {
    content: '';
    position: absolute;
    inset: calc((var(--hit-min) - var(--status-h)) / -2) 0;
  }

  .mode-status:focus-visible,
  .snap-status:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: -1px;
  }

  .mode-status:hover,
  .snap-status:hover {
    border-color: var(--border-subtle);
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .mode-status.is-active,
  .snap-status.is-active {
    color: var(--accent-primary);
  }

  .mode-icon {
    font-size: 13px;
    line-height: 1;
  }

  .snap-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    opacity: .65;
  }


  @media (max-width: 1050px) {
    .status-counts {
      display: none;
    }

    .status-bar {
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }
</style>
