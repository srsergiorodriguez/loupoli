<script lang="ts">
  import Icon from '../Icons/Icon.svelte';

  /** Shared right-aligned visibility toggle for outliner rows. */
  interface Props {
    label: string;
    visible: boolean;
    onToggle: (event: MouseEvent) => void;
  }

  let { label, visible, onToggle }: Props = $props();
</script>

<button
  type="button"
  class="outliner-visibility"
  aria-label={label}
  aria-pressed={visible}
  title={label}
  onclick={(event) => onToggle(event)}
>
  <Icon name={visible ? 'eye' : 'eye-off'} size={14} />
</button>

<style>
  .outliner-visibility {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: var(--control-h);
    min-height: var(--control-h);
    border: 0;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
  }

  .outliner-visibility:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
</style>
