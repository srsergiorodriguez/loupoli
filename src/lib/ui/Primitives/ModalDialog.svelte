<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import IconButton from './IconButton.svelte';

  /** Shared native dialog shell for focused options and confirmations. */
  interface Props {
    title: string;
    kicker?: string;
    width?: string;
    children: Snippet;
    actions?: Snippet;
    onClose: () => void;
  }

  let {
    title,
    kicker = '',
    width = '440px',
    children,
    actions,
    onClose
  }: Props = $props();

  const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;
  let dialog: HTMLDialogElement;

  onMount(() => {
    dialog?.showModal();
  });

  function close(event?: Event): void {
    event?.preventDefault();
    onClose();
  }
</script>

<dialog
  bind:this={dialog}
  class="modal-dialog loupoli-panel"
  style={`--modal-width:${width}`}
  aria-labelledby={titleId}
  oncancel={close}
  onclick={(event) => {
    if (event.target === event.currentTarget) close();
  }}
>
  <header>
    <div>
      {#if kicker}<span class="kicker">{kicker}</span>{/if}
      <h2 id={titleId}>{title}</h2>
    </div>
    <IconButton
      label="Close dialog"
      icon="close"
      tooltip="Close"
      onActivate={() => close()}
    />
  </header>

  <div class="modal-body">
    {@render children()}
  </div>

  {#if actions}
    <footer>
      {@render actions()}
    </footer>
  {/if}
</dialog>

<style>
  .modal-dialog {
    width: min(var(--modal-width), calc(100vw - 32px));
    max-width: var(--modal-width);
    max-height: calc(100vh - 32px);
    overflow: auto;
    padding: 0;
    border: var(--hairline) solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-panel);
    color: var(--text-primary);
    box-shadow: var(--shadow-panel);
  }

  .modal-dialog::backdrop {
    background: var(--bg-scrim);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-3) var(--space-2);
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .kicker {
    display: block;
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h2 {
    margin: 2px 0 0;
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
  }

  footer {
    padding: var(--space-2) var(--space-3) var(--space-3);
    border-top: var(--hairline) solid var(--border-subtle);
  }
</style>
