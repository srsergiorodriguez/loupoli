<script lang="ts">
  import ModalDialog from '../Primitives/ModalDialog.svelte';
  import { DOCUMENTATION } from '../../help/documentation';
  import {
    commandShortcutReference,
    type CommandScope
  } from '../../input/commands';

  /** Full-screen tabbed reference for each workspace. */
  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();
  const shortcuts = commandShortcutReference();
  const tabs = [
    ...DOCUMENTATION.map((page) => ({ id: page.id, label: page.label })),
    { id: 'shortcuts', label: 'Shortcuts' }
  ] as const;
  let activeId = $state<string>(tabs[0].id);
  const active = $derived(
    DOCUMENTATION.find((page) => page.id === activeId) ?? null
  );
  const scopeLabels: Record<CommandScope, string> = {
    global: 'Global',
    shell: 'Application',
    active: 'Active editor',
    '3d': '3D viewport',
    uv: 'UV pane',
    paint: 'Paint pane'
  };
  const scopeOrder: readonly CommandScope[] = [
    'global',
    'shell',
    'active',
    '3d',
    'uv',
    'paint'
  ];
  const shortcutGroups = scopeOrder
    .map((scope) => ({
      scope,
      label: scopeLabels[scope],
      entries: shortcuts.filter((entry) => entry.scope === scope)
    }))
    .filter((group) => group.entries.length > 0);

  function moveTab(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const index = tabs.findIndex((tab) => tab.id === activeId);
    const next = (index + direction + tabs.length) % tabs.length;
    activeId = tabs[next].id;
    document
      .querySelector<HTMLButtonElement>(`[data-documentation-tab="${tabs[next].id}"]`)
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
      {#each tabs as tab (tab.id)}
        <button
          type="button"
          role="tab"
          id={`documentation-tab-${tab.id}`}
          aria-selected={tab.id === activeId}
          aria-controls={`documentation-panel-${tab.id}`}
          tabindex={tab.id === activeId ? 0 : -1}
          data-documentation-tab={tab.id}
          class:active={tab.id === activeId}
          onclick={() => (activeId = tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    {#if activeId === 'shortcuts'}
      <div
        class="shortcuts-page"
        id="documentation-panel-shortcuts"
        role="tabpanel"
        aria-labelledby="documentation-tab-shortcuts"
      >
        <header class="page-head">
          <div>
            <p class="eyebrow">Reference</p>
            <h3>Keyboard shortcuts</h3>
          </div>
          <p class="summary">
            Every binding comes from the shared command registry. Shortcuts are ignored while typing in a field.
          </p>
        </header>

        <div class="shortcut-groups">
          {#each shortcutGroups as group (group.scope)}
            <section class="shortcut-group">
              <h4>{group.label}</h4>
              <dl>
                {#each group.entries as entry (entry.id)}
                  <div class="shortcut-row">
                    <dt>{entry.label}</dt>
                    <dd><kbd>{entry.display}</kbd></dd>
                  </div>
                {/each}
              </dl>
            </section>
          {/each}
        </div>
      </div>
    {:else if active}
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
            <figcaption>{active.label} workspace.</figcaption>
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
          </article>
        </div>
      </div>
    {/if}
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

  .shortcuts-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-height: 0;
    overflow: auto;
  }

  .shortcut-groups {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
    padding-bottom: var(--space-3);
  }

  .shortcut-group {
    min-width: 0;
    padding: var(--space-3);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
  }

  .shortcut-group h4 {
    margin: 0 0 var(--space-2);
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .shortcut-group dl {
    margin: 0;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: var(--control-h);
    border-top: var(--hairline) solid var(--border-subtle);
  }

  .shortcut-row:first-child {
    border-top: 0;
  }

  .shortcut-row dt {
    min-width: 0;
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
  }

  .shortcut-row dd {
    flex: 0 0 auto;
    margin: 0;
  }

  kbd {
    display: inline-block;
    min-width: 24px;
    padding: 2px 6px;
    border: var(--hairline) solid var(--border-strong);
    border-radius: var(--radius-xs);
    background: var(--bg-raised);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    text-align: center;
  }

  @media (max-width: 760px) {
    .shortcut-groups {
      grid-template-columns: minmax(0, 1fr);
    }
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
