<script lang="ts">
  import type { Snippet } from 'svelte';
  import { openExternalUrl } from '../../platform/externalLinks';

  /** Anchor that hands external navigation to the browser or Tauri opener. */
  interface Props {
    href: string;
    title?: string;
    children: Snippet;
  }

  let { href, title, children }: Props = $props();
</script>

<a
  {href}
  {title}
  target="_blank"
  rel="noreferrer"
  onclick={(event) => {
    event.preventDefault();
    void openExternalUrl(href);
  }}
>
  {@render children()}
</a>
