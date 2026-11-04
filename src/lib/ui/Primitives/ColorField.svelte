<script lang="ts">
  /** A labeled color input with the shared inspector control shape. */
  interface Props {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }

  let { label, value, onChange }: Props = $props();
</script>

<label class="color-field">
  <span>{label}</span>
  <input
    type="color"
    {value}
    aria-label={label}
    onchange={(event) => onChange(event.currentTarget.value)}
  />
</label>

<style>
  .color-field {
    display: grid;
    grid-template-columns: minmax(64px, auto) minmax(0, 1fr);
    align-items: center;
    min-height: var(--control-h);
    gap: var(--space-2);
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
  }

  input {
    width: 100%;
    height: var(--control-h);
    padding: 4px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    cursor: pointer;
  }
</style>
