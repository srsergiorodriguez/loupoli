<script lang="ts">
  import ModalDialog from '../Primitives/ModalDialog.svelte';
  import { TUTORIALS } from '../../help/tutorials';

  /** Full-screen tabbed tutorial with actual workspace screenshots. */
  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();
  let activeId = $state(TUTORIALS[0].id);
  const active = $derived(
    TUTORIALS.find((page) => page.id === activeId) ?? TUTORIALS[0]
  );

  function selectTab(id: string): void {
    activeId = id;
  }

  function moveTab(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const index = TUTORIALS.findIndex((page) => page.id === activeId);
    const next = (index + direction + TUTORIALS.length) % TUTORIALS.length;
    activeId = TUTORIALS[next].id;
    document
      .querySelector<HTMLButtonElement>(`[data-tutorial-tab="${TUTORIALS[next].id}"]`)
      ?.focus();
  }

  function plainStep(step: string): string {
    return step.replaceAll('**', '');
  }
</script>

<ModalDialog title="Tutorial" kicker="Learn loupoli" size="full" onClose={onClose}>
  <div class="tutorial">
    <div class="tabs" role="tablist" tabindex="0" aria-label="Tutorial workspace" onkeydown={moveTab}>
      {#each TUTORIALS as page (page.id)}
        <button
          type="button"
          role="tab"
          id={`tutorial-tab-${page.id}`}
          aria-selected={page.id === activeId}
          aria-controls={`tutorial-panel-${page.id}`}
          tabindex={page.id === activeId ? 0 : -1}
          data-tutorial-tab={page.id}
          class:active={page.id === activeId}
          onclick={() => selectTab(page.id)}
        >
          {page.label}
        </button>
      {/each}
    </div>

    <div
      class="page"
      id={`tutorial-panel-${active.id}`}
      role="tabpanel"
      aria-labelledby={`tutorial-tab-${active.id}`}
    >
      <header class="page-head">
        <div>
          <p class="eyebrow">{active.label} workspace</p>
          <h3>{active.title}</h3>
        </div>
        <p class="intro">{active.intro}</p>
      </header>

      <div class="page-grid">
        <figure>
          <img src={active.image} alt={active.alt} />
          <figcaption>{active.label} workspace with the tutorial gorilla, ground grid, and document sun.</figcaption>
        </figure>
        <div class="guide">
          <ol>
            {#each active.steps as step, index (index)}
              <li>{plainStep(step)}</li>
            {/each}
          </ol>
          <p class="note">{active.note}</p>
        </div>
      </div>
    </div>
  </div>
</ModalDialog>

<style>
  .tutorial {
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
    font-size: var(--text-xs);
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
    gap: var(--space-3);
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
    font-size: var(--text-2xs);
    letter-spacing: 0.08em;
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-lg);
    font-weight: var(--weight-medium);
    line-height: var(--leading-tight);
  }

  .intro {
    max-width: 56ch;
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: var(--leading-body);
  }

  .page-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
    gap: var(--space-4);
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
    max-height: min(58vh, 560px);
    object-fit: contain;
    background: var(--bg-canvas);
  }

  figcaption {
    padding: var(--space-2) var(--space-3);
    border-top: var(--hairline) solid var(--border-subtle);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }

  .guide {
    min-width: 0;
    overflow: auto;
  }

  ol {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: tutorial-step;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: var(--leading-body);
  }

  li {
    display: grid;
    grid-template-columns: 1.4rem minmax(0, 1fr);
    gap: var(--space-2);
    counter-increment: tutorial-step;
  }

  li::before {
    content: counter(tutorial-step);
    color: var(--accent-primary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: var(--leading-body);
    text-align: right;
  }

  .note {
    margin: var(--space-3) 0 0;
    padding-top: var(--space-2);
    border-top: var(--hairline) solid var(--border-subtle);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
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
      max-height: 42vh;
    }
  }
</style>
