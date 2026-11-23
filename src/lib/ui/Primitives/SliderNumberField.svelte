<script lang="ts">
  import SliderField from './SliderField.svelte';
  import NumberField from './NumberField.svelte';

  /** A slider plus an exact numeric entry for fine-grained settings. */
  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    precision?: number;
    unit?: string;
    disabled?: boolean;
    onChange: (value: number) => void;
  }

  let {
    label,
    value,
    min,
    max,
    step = 1,
    precision = 0,
    unit = '',
    disabled = false,
    onChange
  }: Props = $props();
</script>

<div class="slider-number-field" class:disabled>
  <SliderField
    {label}
    {value}
    {min}
    {max}
    {step}
    {precision}
    {disabled}
    {onChange}
  />
  <div class="exact-value">
    <NumberField
      {value}
      {label}
      {step}
      {precision}
      {min}
      {max}
      {unit}
      {disabled}
      framed
      onCommit={onChange}
    />
  </div>
</div>

<style>
  .slider-number-field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 74px;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .slider-number-field :global(.slider-field) {
    grid-template-columns: var(--inspector-label-width) minmax(0, 1fr);
  }

  .slider-number-field :global(.slider-field output) {
    display: none;
  }

  .exact-value {
    min-width: 0;
  }

  .disabled {
    opacity: var(--opacity-disabled);
  }

  @media (pointer: coarse) {
    .slider-number-field {
      grid-template-columns: minmax(0, 1fr) 86px;
    }
  }
</style>
