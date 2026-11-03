<script lang="ts">
  import type { Snippet } from 'svelte';

  /** One collapsible Inspector section with the shared disclosure pattern. */
  interface Props {
    title: string;
    meta?: string;
    open: boolean;
    onToggle: (open: boolean) => void;
    children: Snippet;
  }

  let { title, meta = '', open, onToggle, children }: Props = $props();
</script>

<details
  class="inspector-section"
  {open}
  ontoggle={(event) => onToggle(event.currentTarget.open)}
>
  <summary class="section-summary">
    <span class="section-title">{title}</span>
    {#if meta}
      <span class="section-meta">{meta}</span>
    {/if}
    <span class="section-chevron" aria-hidden="true"></span>
  </summary>
  <div class="section-body">
    {@render children()}
  </div>
</details>

<style>
  .inspector-section {
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .section-summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--hit-min);
    padding: 0 var(--space-4);
    color: var(--text-primary);
    cursor: pointer;
    list-style: none;
  }

  .section-summary::-webkit-details-marker {
    display: none;
  }

  .section-summary:hover {
    background: var(--bg-hover);
  }

  .section-summary:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }

  .section-title {
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .section-meta {
    min-width: 0;
    margin-left: auto;
    overflow: hidden;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .section-chevron {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    margin-left: var(--space-1);
    border-right: var(--hairline) solid var(--text-tertiary);
    border-bottom: var(--hairline) solid var(--text-tertiary);
    transform: rotate(45deg) translateY(-2px);
    transition: transform var(--motion-fast) var(--ease-out);
  }

  .inspector-section[open] .section-chevron {
    transform: rotate(225deg) translate(-1px, 1px);
  }

  .section-body {
    padding: 0 var(--space-4) var(--space-4);
  }
</style>
