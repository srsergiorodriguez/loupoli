<script lang="ts">
  import BrandMark from '../Brand/BrandMark.svelte';
  import ModalDialog from '../Primitives/ModalDialog.svelte';
  import DependencyDetailsModal from './DependencyDetailsModal.svelte';
  import Icon from '../Icons/Icon.svelte';
  import type { AboutLibrary } from '../../help/about';
  import LicenseDetailsModal, { type LicenseKind } from './LicenseDetailsModal.svelte';
  import { APP_ABOUT } from '../../help/about';

  /** Full-screen application and dependency information. */
  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();
  let licenseView = $state<LicenseKind | null>(null);
  let selectedLibrary = $state<AboutLibrary | null>(null);

  const groups = [
    { title: 'Runtime libraries', items: APP_ABOUT.runtimeLibraries },
    { title: 'Build tools', items: APP_ABOUT.buildLibraries }
  ] as const;
</script>

<ModalDialog title="About loupoli" kicker="Application" size="full" onClose={onClose}>
  <div class="about">
    <header class="hero">
      <div class="hero-mark"><BrandMark size={44} /></div>
      <div>
        <p class="eyebrow">loupoli</p>
        <h3>{APP_ABOUT.tagline}</h3>
        <p class="version">Version {APP_ABOUT.version}</p>
      </div>
    </header>

    <div class="facts">
      <section>
        <h4>Author</h4>
        <p>{APP_ABOUT.author}</p>
      </section>
      <section>
        <h4>License</h4>
        <p class="license-state">{APP_ABOUT.licenseName}</p>
        <p class="supporting">{APP_ABOUT.licenseStatus} for noncommercial use. Commercial use requires a separate license.</p>
      </section>
      <section>
        <h4>Built with</h4>
        <p>Svelte, Tauri, Three.js, and TypeScript.</p>
        <p class="supporting">These libraries remain under their own licenses. Select a library below to read its license terms in the dialog.</p>
      </section>
    </div>

    <section class="licensing" aria-labelledby="licensing-heading">
      <div class="section-heading">
        <h3 id="licensing-heading">Licenses</h3>
        <p>Source and sample-asset terms.</p>
      </div>
      <div class="license-grid">
        <article class="license-card">
          <h4>Source code</h4>
          <p class="license-name">{APP_ABOUT.licenseName}</p>
          <p>Personal, educational, research, and other noncommercial use is permitted. Commercial use and commercial derivatives require a separate written license.</p>
          <p class="license-links">
            <button type="button" class="license-link" onclick={() => (licenseView = 'source')}>License text</button>
            <button type="button" class="license-link" onclick={() => (licenseView = 'commercial')}>Commercial licensing</button>
          </p>
        </article>
        <article class="license-card">
          <h4>Sample gorilla</h4>
          <p class="license-name">{APP_ABOUT.sampleLicenseName}</p>
          <p>The sample model and texture used in the documentation screenshots are by {APP_ABOUT.author}. Credit the author when reusing them.</p>
          <p class="license-links">
            <button type="button" class="license-link" onclick={() => (licenseView = 'sample')}>Creative Commons license</button>
          </p>
        </article>
      </div>
    </section>

    <section class="software" aria-labelledby="open-source-heading">
      <div class="section-heading">
        <h3 id="open-source-heading">Open-source software</h3>
        <p>Direct libraries used to build and run this version.</p>
      </div>
      <div class="groups">
        {#each groups as group (group.title)}
          <div class="library-group">
            <h4>{group.title}</h4>
            <ul>
              {#each group.items as library (library.name)}
                <li>
                  <button
                    type="button"
                    class="library-button"
                    title={library.url}
                    onclick={() => (selectedLibrary = library)}
                  >
                    <span>{library.name}</span>
                    <span class="library-meta">
                      <span class="license">{library.version} · {library.license}</span>
                      <Icon name="info" size={14} />
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
      <p class="fine-print">Select a library to read its license terms. Project URLs are shown in each detail view.</p>
    </section>

    <footer class="about-footer">
      <p>Made by {APP_ABOUT.author}.</p>
    </footer>
  </div>
</ModalDialog>

{#if licenseView}
  <LicenseDetailsModal kind={licenseView} onClose={() => (licenseView = null)} />
{/if}
{#if selectedLibrary}
  <DependencyDetailsModal
    library={selectedLibrary}
    onClose={() => (selectedLibrary = null)}
  />
{/if}

<style>
  .about {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    max-width: 1040px;
    margin: 0 auto;
    padding: var(--space-2) 0 var(--space-4);
  }

  .hero {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .hero-mark {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    border: var(--hairline) solid var(--accent-primary);
    border-radius: var(--radius-lg);
    background: var(--accent-primary-muted);
  }

  .eyebrow {
    margin: 0;
    color: var(--accent-primary);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    line-height: var(--leading-tight);
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-lg);
    font-weight: var(--weight-medium);
    line-height: var(--leading-ui);
  }

  h4 {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
  }

  .version {
    margin: var(--space-1) 0 0;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .facts section {
    padding: var(--space-3);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
  }

  .facts p {
    margin: var(--space-1) 0 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: var(--leading-body);
  }

  .supporting {
    color: var(--text-tertiary) !important;
    font-size: var(--text-2xs) !important;
  }

  .license-state {
    color: var(--accent-primary) !important;
    font-family: var(--font-mono);
  }

  .license-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .license-card {
    padding: var(--space-3);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
  }

  .license-card h4 {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-regular);
  }

  .license-card .license-name {
    margin-top: var(--space-1);
    color: var(--accent-primary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .license-card p:not(.license-name):not(.license-links) {
    margin-top: var(--space-1);
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: var(--leading-body);
  }

  .license-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .license-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent-primary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    text-decoration: none;
    cursor: pointer;
  }

  .license-link:hover {
    text-decoration: underline;
  }

  .license-link:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 2px;
  }

  .section-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }

  .section-heading p {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .groups {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
  }

  .library-group h4 {
    margin-bottom: var(--space-1);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-regular);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: var(--hairline) solid var(--border-subtle);
  }

  li {
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .library-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) 0;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    text-align: left;
    cursor: pointer;
  }

  .library-button:hover {
    color: var(--accent-primary);
  }

  .library-button:hover .library-meta {
    color: var(--accent-primary);
  }

  .library-button:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 2px;
  }

  .library-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-tertiary);
  }

  .license {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    text-align: right;
  }

  .fine-print,
  .about-footer p {
    margin: var(--space-2) 0 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-body);
  }

  .about-footer {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    padding-top: var(--space-3);
    border-top: var(--hairline) solid var(--border-subtle);
  }

  .about-footer p {
    margin: 0;
  }

  @media (max-width: 760px) {
    .facts,
    .license-grid,
    .groups {
      grid-template-columns: 1fr;
    }

    .section-heading,
    .about-footer {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--space-1);
    }
  }
</style>
