<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    align?: 'start' | 'between';
  }

  let { children, align = 'start' }: Props = $props();
</script>

<div class="action-row" class:between={align === 'between'}>
  {@render children()}
</div>

<style>
  .action-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }

  .between {
    justify-content: space-between;
  }
</style>
