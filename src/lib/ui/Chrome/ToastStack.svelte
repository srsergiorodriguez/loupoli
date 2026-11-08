<script lang="ts">
  import IconButton from '../Primitives/IconButton.svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';

  /** Operation notifications and persistent project errors above the status bar. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();
  const toasts = $derived(session.snapshot.toasts);
  const persistentError = $derived(
    session.snapshot.projectError !== null &&
      !toasts.some((toast) => toast.kind === 'error')
  );
</script>

<section class="toast-stack" aria-label="Notifications" aria-live="polite" aria-atomic="false">
    {#if persistentError}
      <article class="toast toast--error toast--persistent" role="alert">
        <div class="toast-copy">
          <span class="toast-kind">Error</span>
          <p class="toast-message">{session.snapshot.projectError}</p>
        </div>
        <IconButton
          label="Dismiss error"
          icon="close"
          tooltip="Dismiss"
          onActivate={() => session.dismissProjectError()}
        />
      </article>
    {/if}
    {#each toasts as toast (toast.id)}
      <article class="toast toast--{toast.kind}" role={toast.kind === 'error' ? 'alert' : 'status'}>
        <div class="toast-copy">
          <span class="toast-kind">{toast.kind}</span>
          <p class="toast-message">{toast.message}</p>
          {#if toast.detail}
            <p class="toast-detail">{toast.detail}</p>
          {/if}
        </div>
        <IconButton
          label="Dismiss notification"
          icon="close"
          tooltip="Dismiss"
          onActivate={() => session.dismissToast(toast.id)}
        />
      </article>
    {/each}
</section>

<style>
  .toast-stack {
    position: fixed;
    z-index: var(--z-toast);
    right: 50%;
    bottom: calc(var(--safe-bottom) + var(--status-h) + var(--space-3));
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: min(420px, calc(100vw - 32px));
    gap: var(--space-2);
    transform: translateX(50%);
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    border: var(--hairline) solid var(--border-subtle);
    border-left: 2px solid var(--text-tertiary);
    border-radius: var(--radius-md);
    background: var(--bg-panel);
    box-shadow: var(--shadow-panel);
    -webkit-backdrop-filter: blur(var(--blur-panel));
    backdrop-filter: blur(var(--blur-panel));
    pointer-events: auto;
  }

  .toast--success {
    border-left-color: var(--accent-primary);
  }

  .toast--warning {
    border-left-color: var(--accent-warning);
  }

  .toast--error {
    border-left-color: var(--accent-danger);
  }

  .toast--persistent {
    border-left-width: 3px;
  }

  .toast-copy {
    min-width: 0;
  }

  .toast-kind {
    display: block;
    margin-bottom: 2px;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .toast--success .toast-kind {
    color: var(--accent-primary);
  }

  .toast--warning .toast-kind {
    color: var(--accent-warning);
  }

  .toast--error .toast-kind {
    color: var(--accent-danger);
  }

  .toast-message {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--text-xs);
    line-height: var(--leading-ui);
  }

  .toast-detail {
    margin: 2px 0 0;
    overflow-wrap: anywhere;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }
</style>
