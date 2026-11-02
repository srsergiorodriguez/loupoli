<script lang="ts">
  /** Props for a controlled, accessible on/off setting row. */
  interface Props {
    label: string;
    description?: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
  }

  let { label, description, checked, disabled = false, onChange }: Props = $props();
</script>

<label class="switch-row" class:is-disabled={disabled}>
  <span class="copy">
    <span class="label">{label}</span>
    {#if description}
      <span class="description">{description}</span>
    {/if}
  </span>
  <span class="control">
    <input
      type="checkbox"
      {checked}
      {disabled}
      onchange={(event) => onChange(event.currentTarget.checked)}
    />
    <span class="track" aria-hidden="true"><span class="thumb"></span></span>
  </span>
</label>

<style>
  .switch-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: var(--hit-min);
    padding: var(--space-1) 0;
    cursor: pointer;
  }

  .copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 5px;
  }

  .label {
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    line-height: var(--leading-ui);
  }

  .description {
    max-width: 21ch;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }

  .control {
    position: relative;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: var(--hit-min);
    height: var(--hit-min);
    margin: -6px -8px 0 0;
  }

  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
    z-index: 1;
  }

  .track {
    display: block;
    width: 32px;
    height: 18px;
    border: var(--hairline) solid var(--border-strong);
    border-radius: var(--radius-pill);
    background: var(--bg-input);
    transition:
      background-color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out);
  }

  .thumb {
    display: block;
    width: 12px;
    height: 12px;
    margin: 2px;
    border-radius: 50%;
    background: var(--text-secondary);
    transition:
      transform var(--motion-fast) var(--ease-out),
      background-color var(--motion-fast) var(--ease-out);
  }

  input:checked + .track {
    border-color: transparent;
    background: var(--accent-primary);
  }

  input:checked + .track .thumb {
    background: var(--text-inverse);
    transform: translateX(14px);
  }

  input:focus-visible + .track {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: var(--focus-ring-offset);
  }

  .switch-row:hover:not(.is-disabled) .track {
    border-color: var(--border-strong);
  }

  .is-disabled {
    cursor: default;
    opacity: var(--opacity-disabled);
  }

  .is-disabled input {
    cursor: default;
  }
</style>
