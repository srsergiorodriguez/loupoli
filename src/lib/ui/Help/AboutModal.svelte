<script lang="ts">
  import BrandMark from '../Brand/BrandMark.svelte';
  import ModalDialog from '../Primitives/ModalDialog.svelte';
  import { APP_ABOUT } from '../../help/about';

  /** Full-screen application and dependency information. */
  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

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
        <h3>A pen-first low-poly modeler</h3>
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
        <p class="license-state">{APP_ABOUT.licenseStatus}</p>
        <p class="supporting">No license has been selected for loupoli yet. The project remains private until a license is chosen.</p>
      </section>
      <section>
        <h4>Built with</h4>
        <p>Svelte, Tauri, Three.js, and TypeScript.</p>
        <p class="supporting">These libraries remain under their own licenses. Their project pages contain the complete license texts.</p>
      </section>
    </div>

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
                  <a href={library.url} target="_blank" rel="noreferrer" title={library.url}>
                    <span>{library.name}</span>
                    <span class="license">{library.version} · {library.license}</span>
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
      <p class="fine-print">License names are listed for attribution. The corresponding license texts are available from each linked project.</p>
    </section>

    <footer class="about-footer">
      <p>Made by {APP_ABOUT.author}.</p>
      <p>The gorilla model and texture are used for the documentation scenes.</p>
    </footer>
  </div>
</ModalDialog>

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

  .license-state {
    color: var(--accent-warning) !important;
    font-family: var(--font-mono);
  }

  .supporting {
    color: var(--text-tertiary) !important;
    font-size: var(--text-2xs) !important;
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

  a {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    text-decoration: none;
  }

  a:hover {
    color: var(--accent-primary);
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
