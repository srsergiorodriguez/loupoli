<script lang="ts">
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionRow from '../Primitives/ActionRow.svelte';
  import ModalDialog from '../Primitives/ModalDialog.svelte';
  import NumberField from '../Primitives/NumberField.svelte';
  import {
    MAX_TEXTURE_DIMENSION,
    textureSizeError
  } from '../../texture/size';

  /** Free-form texture creation dialog. */
  interface Props {
    onCancel: () => void;
    onCreate: (width: number, height: number) => void;
  }

  let { onCancel, onCreate }: Props = $props();
  let width = $state(1024);
  let height = $state(1024);
  const error = $derived(textureSizeError(width, height));
  const megabytes = $derived(
    Math.max(1, Math.round((width * height * 4) / 1_000_000))
  );

  function create(): void {
    if (error) {
      return;
    }
    onCreate(width, height);
  }
</script>

<ModalDialog title="New texture" kicker="Texture" onClose={onCancel}>
  <p class="hint">
    Choose any size up to {MAX_TEXTURE_DIMENSION} px. Aspect ratio is free.
    Memory is estimated for one RGBA layer.
  </p>
  <div class="size-fields">
    <label>
      <span>Width</span>
      <NumberField
        label="Texture width"
        value={width}
        step={1}
        precision={0}
        min={1}
        max={MAX_TEXTURE_DIMENSION}
        framed
        onCommit={(value) => (width = Math.round(value))}
      />
    </label>
    <span class="times">×</span>
    <label>
      <span>Height</span>
      <NumberField
        label="Texture height"
        value={height}
        step={1}
        precision={0}
        min={1}
        max={MAX_TEXTURE_DIMENSION}
        framed
        onCommit={(value) => (height = Math.round(value))}
      />
    </label>
  </div>
  <p class="memory">One layer at this size: about {megabytes} MB.</p>
  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#snippet actions()}
    <ActionRow align="end">
      <ActionButton label="Cancel" onActivate={onCancel} />
      <ActionButton
        label="Create texture"
        icon="plus"
        disabled={error !== null}
        onActivate={create}
      />
    </ActionRow>
  {/snippet}
</ModalDialog>

<style>
  .hint,
  .memory,
  .error {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }

  .size-fields {
    display: flex;
    align-items: end;
    gap: var(--space-2);
    margin: var(--space-3) 0 var(--space-2);
  }

  label {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--field-label-gap);
    color: var(--text-secondary);
    font-size: var(--text-2xs);
  }

  .times {
    padding-bottom: 8px;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
  }

  .error {
    color: var(--accent-warning);
  }
</style>
