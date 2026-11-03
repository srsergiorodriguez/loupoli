<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Shared workspace-pane frame: header, flexible body, optional footer. */
  interface Props {
    label: string;
    header?: Snippet;
    toolbar?: Snippet;
    footer?: Snippet;
    children: Snippet;
  }

  let {
    label,
    header = undefined,
    toolbar = undefined,
    footer = undefined,
    children
  }: Props = $props();
</script>

<section
  class="pane-frame loupoli-panel"
  class:has-toolbar={toolbar !== undefined}
  aria-label={label}
>
  {#if header}
    <header class="pane-frame-head">
      {@render header()}
    </header>
  {/if}
  {#if toolbar}
    <div class="pane-frame-toolbar">
      {@render toolbar()}
    </div>
  {/if}
  <div class="pane-frame-body">
    {@render children()}
  </div>
  {#if footer}
    <footer class="pane-frame-foot">
      {@render footer()}
    </footer>
  {/if}
</section>

<style>
  .pane-frame {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--bg-panel-strong);
    box-shadow: var(--shadow-panel);
  }

  .pane-frame-head,
  .pane-frame-toolbar,
  .pane-frame-foot {
    flex: 0 0 auto;
    background: var(--bg-panel-strong);
  }

  .pane-frame-head {
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .pane-frame.has-toolbar .pane-frame-head {
    border-bottom: 0;
  }

  .pane-frame-toolbar {
    min-height: var(--hit-min);
    padding: 0 var(--space-2);
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .pane-frame-foot {
    border-top: var(--hairline) solid var(--border-subtle);
  }

  .pane-frame-body {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
