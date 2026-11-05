<script lang="ts">
  import ModalDialog from '../Primitives/ModalDialog.svelte';
  import { DOCUMENTATION } from '../../help/documentation';

  /** Full-screen tabbed reference for each workspace. */
  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();
  let activeId = $state(DOCUMENTATION[0].id);
  const active = $derived(
    DOCUMENTATION.find((page) => page.id === activeId) ?? DOCUMENTATION[0]
  );

  function moveTab(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const index = DOCUMENTATION.findIndex((page) => page.id === activeId);
    const next = (index + direction + DOCUMENTATION.length) % DOCUMENTATION.length;
    activeId = DOCUMENTATION[next].id;
    document
      .querySelector<HTMLButtonElement>(`[data-documentation-tab="${DOCUMENTATION[next].id}"]`)
      ?.focus();
  }
</script>

<ModalDialog title="Documentation" kicker="Reference" size="full" onClose={onClose}>
  <div class="documentation">
    <div
      class="tabs"
      role="tablist"
      tabindex="0"
      aria-label="Workspace documentation"
      onkeydown={moveTab}
    >
      {#each DOCUMENTATION as page (page.id)}
        <button
          type="button"
          role="tab"
          id={`documentation-tab-${page.id}`}
          aria-selected={page.id === activeId}
          aria-controls={`documentation-panel-${page.id}`}
          tabindex={page.id === activeId ? 0 : -1}
          data-documentation-tab={page.id}
          class:active={page.id === activeId}
          onclick={() => (activeId = page.id)}
        >
          {page.label}
        </button>
      {/each}
    </div>

    <div
      class="page"
      id={`documentation-panel-${active.id}`}
      role="tabpanel"
      aria-labelledby={`documentation-tab-${active.id}`}
    >
      <header class="page-head">
        <div>
          <p class="eyebrow">{active.label} workspace</p>
          <h3>{active.title}</h3>
        </div>
        <p class="summary">{active.summary}</p>
      </header>

      <div class="page-grid">
        <figure>
          <img src={active.image} alt={active.alt} />
          <figcaption>{active.label} workspace with the gorilla example scene.</figcaption>
        </figure>

        <article class="guide">
          {#each active.sections as section (section.heading)}
            <section class="doc-section">
              <h4>{section.heading}</h4>
              {#each section.paragraphs as paragraph (paragraph)}
                <p>{paragraph}</p>
              {/each}
              {#if section.controls}
                <h5>Controls</h5>
                <ul>
                  {#each section.controls as control (control)}
                    <li>{control}</li>
                  {/each}
                </ul>
              {/if}
            </section>
          {/each}
          <p class="example">{active.example}</p>
        </article>
      </div>
    </div>
  </div>
</ModalDialog>

<style>
  .documentation {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    height: 100%;
    min-height: 0;
  }

  .tabs {
    display: flex;
    flex: 0 0 auto;
    gap: 2px;
    overflow-x: auto;
    padding-bottom: var(--space-1);
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .tabs button {
    min-height: var(--control-h);
    padding: 0 var(--space-3);
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-md);
    cursor: pointer;
    white-space: nowrap;
  }

  .tabs button:hover {
    color: var(--text-primary);
  }

  .tabs button.active {
    border-bottom-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .tabs button:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: -2px;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-height: 0;
  }

  .page-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-6);
  }

  .eyebrow {
    margin: 0 0 var(--space-1);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-2xl);
    font-weight: var(--weight-medium);
    line-height: var(--leading-tight);
  }

  .summary {
    max-width: 64ch;
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-xl);
    line-height: var(--leading-body);
  }

  .page-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
    gap: var(--space-5);
    min-height: 0;
  }

  figure {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
  }

  img {
    display: block;
    width: 100%;
    max-height: min(56vh, 540px);
    object-fit: contain;
    background: var(--bg-canvas);
  }

  figcaption {
    padding: var(--space-2) var(--space-3);
    border-top: var(--hairline) solid var(--border-subtle);
    color: var(--text-tertiary);
    font-size: var(--text-sm);
    line-height: var(--leading-ui);
  }

  .guide {
    min-width: 0;
    overflow: auto;
  }

  .doc-section + .doc-section {
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: var(--hairline) solid var(--border-subtle);
  }

  h4 {
    margin: 0 0 var(--space-1);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-xl);
    font-weight: var(--weight-medium);
  }

  h5 {
    margin: var(--space-3) 0 var(--space-1);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
  }

  p {
    margin: var(--space-1) 0 0;
    color: var(--text-secondary);
    font-size: var(--text-xl);
    line-height: var(--leading-body);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    position: relative;
    padding-left: var(--space-3);
    color: var(--text-secondary);
    font-size: var(--text-lg);
    line-height: var(--leading-body);
  }

  li::before {
    content: '·';
    position: absolute;
    left: 0;
    color: var(--accent-primary);
  }

  .example {
    margin-top: var(--space-4);
    padding: var(--space-2) var(--space-3);
    border-left: 2px solid var(--accent-primary);
    background: var(--accent-primary-muted);
    color: var(--text-secondary);
    font-size: var(--text-lg);
    line-height: var(--leading-body);
  }

  @media (max-width: 900px) {
    .page-head {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--space-2);
    }

    .page-grid {
      grid-template-columns: 1fr;
    }

    img {
      max-height: 40vh;
    }
  }
</style>
