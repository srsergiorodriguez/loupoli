<script lang="ts">
  import IconButton from '../Primitives/IconButton.svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';

  /** Props for recovery and project-error notices. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  const recoveryTime = $derived(
    session.snapshot.recoveryUpdatedAt
      ? new Date(session.snapshot.recoveryUpdatedAt).toLocaleString()
      : 'a previous session'
  );
</script>

{#if session.snapshot.recoveryAvailable}
  <section class="project-banner loupoli-panel" aria-label="Recovered work">
    <div class="banner-copy">
      <p class="banner-kicker">Recovery available</p>
      <p class="banner-title">Unsaved work from {recoveryTime}</p>
      <p class="banner-hint">
        Recover it, or discard it and keep the current scene.
      </p>
    </div>
    <div class="banner-actions">
      <button
        type="button"
        class="banner-button banner-button--primary"
        disabled={session.snapshot.fileBusy}
        onclick={() => void session.recoverAutosave()}
      >
        {session.snapshot.fileBusy ? 'Recovering…' : 'Recover'}
      </button>
      <button
        type="button"
        class="banner-button"
        disabled={session.snapshot.fileBusy}
        onclick={() => void session.discardRecovery()}
      >
        Discard
      </button>
    </div>
  </section>
{/if}

{#if session.snapshot.projectError && !session.snapshot.toasts.some((toast) => toast.kind === 'error')}
  <div class="project-error loupoli-panel" role="alert">
    <p>{session.snapshot.projectError}</p>
    <IconButton
      label="Dismiss error"
      icon="close"
      onActivate={() => session.dismissProjectError()}
    />
  </div>
{/if}

<style>
  .project-banner {
    position: fixed;
    z-index: var(--z-popover);
    top: calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2);
    left: 50%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    width: min(560px, calc(100vw - 32px));
    padding: var(--space-3);
    border-color: var(--border-strong);
    border-radius: var(--radius-lg);
    transform: translateX(-50%);
  }

  .banner-copy {
    min-width: 0;
  }

  .banner-kicker {
    margin: 0 0 3px;
    color: var(--accent-primary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .banner-title {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .banner-hint {
    margin: 3px 0 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-body);
  }

  .banner-actions {
    display: flex;
    flex: 0 0 auto;
    gap: var(--space-1);
  }

  .banner-button {
    min-height: var(--hit-min);
    padding: 0 var(--space-3);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    cursor: pointer;
  }

  .banner-button--primary {
    border-color: var(--accent-primary);
    background: var(--accent-primary);
    color: var(--bg-canvas);
  }

  .banner-button:disabled {
    opacity: var(--opacity-disabled);
    cursor: default;
  }

  .project-error {
    position: fixed;
    z-index: var(--z-popover);
    right: calc(var(--safe-right) + var(--space-3));
    bottom: calc(var(--safe-bottom) + var(--status-h) + var(--space-3));
    display: flex;
    align-items: center;
    gap: var(--space-2);
    max-width: min(440px, calc(100vw - 32px));
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    border-color: var(--accent-warning);
    border-radius: var(--radius-md);
  }

  .project-error p {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: var(--leading-body);
  }

  @media (max-width: 640px) {
    .project-banner {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-2);
    }

    .banner-actions {
      justify-content: flex-end;
    }
  }
</style>
