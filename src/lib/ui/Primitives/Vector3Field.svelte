<script lang="ts">
  /** One labeled XYZ numeric row for object transforms. */
  interface Props {
    label: string;
    values: readonly [number, number, number];
    step?: number;
    precision?: number;
    unit?: string;
    min?: number;
    onCommit: (values: [number, number, number]) => void;
  }

  let {
    label,
    values,
    step = 0.1,
    precision = 3,
    unit = '',
    min,
    onCommit
  }: Props = $props();

  const axes = ['x', 'y', 'z'] as const;

  function display(value: number): string {
    if (!Number.isFinite(value)) {
      return '0';
    }
    const normalized = Math.abs(value) < 0.5 * 10 ** -precision ? 0 : value;
    return normalized.toFixed(precision);
  }

  function commit(axis: number, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed) || (min !== undefined && parsed < min)) {
      input.value = display(values[axis]);
      return;
    }
    if (Math.abs(parsed - values[axis]) < 1e-9) {
      input.value = display(parsed);
      return;
    }
    const next: [number, number, number] = [values[0], values[1], values[2]];
    next[axis] = parsed;
    onCommit(next);
  }
</script>

<fieldset class="vector-field">
  <legend>{label}</legend>
  <div class="axis-grid">
    {#each axes as axis, index (axis)}
      <label class="axis-field axis-field--{axis}">
        <span class="axis-label" aria-hidden="true">{axis.toUpperCase()}</span>
        <input
          type="number"
          inputmode="decimal"
          value={display(values[index])}
          {step}
          min={min}
          aria-label={`${label} ${axis.toUpperCase()}`}
          onchange={(event) => commit(index, event)}
        />
        {#if unit}
          <span class="unit" aria-hidden="true">{unit}</span>
        {/if}
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .vector-field {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 5px;
    padding: 0;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: 1;
  }

  .axis-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    overflow: hidden;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--border-subtle);
  }

  .axis-field {
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: var(--hit-min);
    gap: 5px;
    padding: 0 7px;
    background: var(--bg-input);
  }

  .axis-label {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    line-height: 1;
  }

  .axis-field--x .axis-label {
    color: var(--axis-x);
  }

  .axis-field--y .axis-label {
    color: var(--axis-y);
  }

  .axis-field--z .axis-label {
    color: var(--axis-z);
  }

  input {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    appearance: textfield;
  }

  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    margin: 0;
    -webkit-appearance: none;
  }

  input:focus-visible {
    color: var(--accent-primary);
  }

  .unit {
    flex: 0 0 auto;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 9px;
  }
</style>
