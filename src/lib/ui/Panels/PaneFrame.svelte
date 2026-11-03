<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Shared workspace-pane frame: header, flexible body, optional footer. */
  interface Props {
    label: string;
    header?: Snippet;
    footer?: Snippet;
    children: Snippet;
  }

  let { label, header = undefined, footer = undefined, children }: Props =
    $props();
</script>

<section class="pane-frame loupoli-panel" aria-label={label}>
  {#if header}
    <header class="pane-frame-head">
      {@render header()}
    </header>
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
  .pane-frame-foot {
    flex: 0 0 auto;
    background: var(--bg-panel-strong);
  }

  .pane-frame-body {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
