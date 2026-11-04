<script lang="ts">
  /** A labeled range control with a visible value. */
  interface Props {
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    percent?: boolean;
    precision?: number;
    disabled?: boolean;
    onChange: (value: number) => void;
  }

  let {
    label,
    value,
    min = 0,
    max = 1,
    step = 0.01,
    percent = false,
    precision = 2,
    disabled = false,
    onChange
  }: Props = $props();

  const display = $derived(
    percent ? `${Math.round(value * 100)}%` : value.toFixed(precision)
  );
</script>

<label class="slider-field" class:disabled>
  <span class="slider-label">{label}</span>
  <input
    type="range"
    {min}
    {max}
    {step}
    {disabled}
    {value}
    aria-label={label}
    oninput={(event) => onChange(Number(event.currentTarget.value))}
  />
  <output>{display}</output>
</label>

<style>
  .slider-field {
    display: grid;
    grid-template-columns: minmax(64px, auto) minmax(0, 1fr) 44px;
    align-items: center;
    min-height: var(--hit-min);
    gap: var(--space-2);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .slider-label {
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
  }

  input {
    width: 100%;
    accent-color: var(--accent-primary);
  }

  output {
    color: var(--text-secondary);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .disabled {
    opacity: var(--opacity-disabled);
  }
</style>
