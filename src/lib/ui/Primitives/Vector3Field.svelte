<script lang="ts">
  import NumberField from './NumberField.svelte';

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

  function commit(axis: number, next: number): void {
    if (Math.abs(next - values[axis]) < 1e-9) {
      return;
    }
    const updated: [number, number, number] = [values[0], values[1], values[2]];
    updated[axis] = next;
    onCommit(updated);
  }
</script>

<fieldset class="vector-field">
  <legend>{label}</legend>
  <div class="axis-grid">
    {#each axes as axis, index (axis)}
      <label class="axis-field axis-field--{axis}">
        <NumberField
          value={values[index]}
          label={`${label} ${axis.toUpperCase()}`}
          prefix={axis.toUpperCase()}
          accent={`var(--axis-${axis})`}
          {step}
          {precision}
          {min}
          {unit}
          onCommit={(next) => commit(index, next)}
        />
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
    cursor: ew-resize;
  }

</style>
