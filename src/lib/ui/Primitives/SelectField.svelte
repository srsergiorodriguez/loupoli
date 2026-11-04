<script lang="ts">
  /** A labeled native select with the shared control shape. */
  interface Option {
    readonly value: string;
    readonly label: string;
  }

  interface Props {
    label: string;
    value: string;
    options: readonly Option[];
    disabled?: boolean;
    onChange: (value: string) => void;
  }

  let { label, value, options, disabled = false, onChange }: Props = $props();
</script>

<label class="select-field">
  <span>{label}</span>
  <select
    {disabled}
    {value}
    aria-label={label}
    onchange={(event) => onChange(event.currentTarget.value)}
  >
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</label>

<style>
  .select-field {
    display: grid;
    grid-template-columns: minmax(64px, auto) minmax(0, 1fr);
    align-items: center;
    min-height: var(--hit-min);
    gap: var(--space-2);
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
  }

  select {
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

  select:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 1px;
  }

  select:disabled {
    opacity: var(--opacity-disabled);
  }
</style>
