<script lang="ts">
  import ModalDialog from '../Primitives/ModalDialog.svelte';
  import type { AboutLibrary } from '../../help/about';
  import { dependencyLicenseTexts } from '../../help/dependencyLicenses';

  /** In-app license detail for one direct dependency. */
  interface Props {
    library: AboutLibrary;
    onClose: () => void;
  }

  let { library, onClose }: Props = $props();
  const licenses = $derived(dependencyLicenseTexts(library));
</script>

<ModalDialog title={library.name} kicker="Dependency license" size="full" onClose={onClose}>
  <div class="dependency-detail">
    <header>
      <div>
        <p class="eyebrow">Dependency license</p>
        <h3>{library.name}</h3>
      </div>
      <p class="meta">{library.version} · {library.license}</p>
    </header>
    <p class="project-url"><span>Project</span> <code>{library.url}</code></p>
    <p class="license-note">Standard license text. Copyright remains with the project authors and contributors named by the project.</p>
    <div class="license-texts">
      {#each licenses as license (license.name)}
        <section>
          <h4>{license.name}</h4>
          <pre>{license.text}</pre>
        </section>
      {:else}
        <p>The license identifier is {library.license}. Refer to the project page for the complete terms.</p>
      {/each}
    </div>
  </div>
</ModalDialog>

<style>
  .dependency-detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    max-width: 1040px;
    height: 100%;
    min-height: 0;
    margin: 0 auto;
  }

  header {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
    padding-bottom: var(--space-3);
    border-bottom: var(--hairline) solid var(--border-subtle);
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
  }

  .meta {
    margin: 0;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .project-url {
    flex: 0 0 auto;
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-sm);
    line-height: var(--leading-body);
  }

  .project-url span {
    margin-right: var(--space-2);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .license-note {
    flex: 0 0 auto;
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-sm);
    line-height: var(--leading-body);
  }

  code {
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    overflow-wrap: anywhere;
  }

  .license-texts {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
    overflow: auto;
  }

  .license-texts section {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
  }

  h4 {
    flex: 0 0 auto;
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--hairline) solid var(--border-subtle);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  pre {
    margin: 0;
    padding: var(--space-3);
    overflow: auto;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: var(--leading-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .license-texts > p {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  @media (max-width: 760px) {
    header {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--space-1);
    }
  }
</style>
