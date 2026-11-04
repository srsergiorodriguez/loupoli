<script lang="ts">
  /** Shared inline rename field used by texture assets and layers. */
  interface Props {
    label: string;
    value: string;
    maxlength?: number;
    onCommit: (value: string) => void;
  }

  let { label, value, maxlength = 64, onCommit }: Props = $props();
</script>

<input
  class="inline-name"
  type="text"
  {value}
  {maxlength}
  aria-label={label}
  title={label}
  onchange={(event) => onCommit(event.currentTarget.value)}
  onkeydown={(event) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.currentTarget.value = value;
      event.currentTarget.blur();
    }
  }}
/>

<style>
  .inline-name {
    flex: 1;
    min-width: 0;
    min-height: var(--control-h);
    padding: 0 var(--space-1);
    border: 0;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: 1.2;
  }

  .inline-name:hover {
    background: var(--bg-hover);
  }

  .inline-name:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 1px;
  }
</style>
