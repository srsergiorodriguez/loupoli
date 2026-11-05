<script lang="ts">
  import ModalDialog from '../Primitives/ModalDialog.svelte';
  import ExternalLink from '../Primitives/ExternalLink.svelte';
  import { APP_ABOUT } from '../../help/about';
  import licenseText from '../../../../LICENSE?raw';
  import commercialText from '../../../../COMMERCIAL.md?raw';
  import assetsText from '../../../../ASSETS.md?raw';

  export type LicenseKind = 'source' | 'commercial' | 'sample';

  /** In-app license detail, with a browser link as a secondary action. */
  interface Props {
    kind: LicenseKind;
    onClose: () => void;
  }

  let { kind, onClose }: Props = $props();

  const details = $derived.by(() => {
    switch (kind) {
      case 'commercial':
        return {
          title: 'Commercial licensing',
          kicker: 'License',
          body: commercialText,
          href: APP_ABOUT.commercialUrl,
          linkLabel: 'Contact on GitHub'
        };
      case 'sample':
        return {
          title: 'Sample gorilla license',
          kicker: 'Asset license',
          body: assetsText,
          href: APP_ABOUT.sampleLicenseUrl,
          linkLabel: 'Open CC BY 4.0 online'
        };
      default:
        return {
          title: APP_ABOUT.licenseName,
          kicker: 'Source license',
          body: licenseText,
          href: APP_ABOUT.licenseUrl,
          linkLabel: 'Open license online'
        };
    }
  });
</script>

<ModalDialog title={details.title} kicker={details.kicker} size="full" onClose={onClose}>
  <div class="license-detail">
    <header>
      <p>{details.kicker}</p>
      <h3>{details.title}</h3>
    </header>
    <pre>{details.body}</pre>
    <footer>
      <ExternalLink href={details.href}>{details.linkLabel}</ExternalLink>
    </footer>
  </div>
</ModalDialog>

<style>
  .license-detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 980px;
    height: 100%;
    min-height: 0;
    margin: 0 auto;
  }

  header {
    flex: 0 0 auto;
    padding-bottom: var(--space-3);
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  header p {
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

  pre {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: var(--space-3);
    overflow: auto;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: var(--leading-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  footer {
    flex: 0 0 auto;
    padding-top: var(--space-2);
    border-top: var(--hairline) solid var(--border-subtle);
  }

  footer :global(a) {
    color: var(--accent-primary);
    font-size: var(--text-sm);
    text-decoration: none;
  }

  footer :global(a:hover) {
    text-decoration: underline;
  }
</style>
