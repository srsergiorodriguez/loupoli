<script lang="ts">
  /** A labeled text input with the shared inspector control shape. */
  interface Props {
    label: string;
    value: string;
    maxlength?: number;
    placeholder?: string;
    onCommit: (value: string) => void;
  }

  let {
    label,
    value,
    maxlength = 64,
    placeholder = '',
    onCommit
  }: Props = $props();
</script>

<label class="text-field">
  <span>{label}</span>
  <input
    type="text"
    {value}
    {maxlength}
    {placeholder}
    aria-label={label}
    onchange={(event) => onCommit(event.currentTarget.value)}
    onkeydown={(event) => {
      if (event.key === 'Enter') {
        event.currentTarget.blur();
      }
    }}
  />
</label>

<style>
  .text-field {
    display: grid;
    grid-template-columns: minmax(64px, auto) minmax(0, 1fr);
    align-items: center;
    min-height: var(--hit-min);
    gap: var(--space-2);
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
  }

  input {
    width: 100%;
    min-height: var(--control-h);
    padding: 0 var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
  }

  input:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 1px;
  }
</style>
