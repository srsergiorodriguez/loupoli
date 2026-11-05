<script lang="ts">
  import { onMount } from 'svelte';
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionRow from '../Primitives/ActionRow.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import SelectField from '../Primitives/SelectField.svelte';
  import Switch from '../Primitives/Switch.svelte';
  import type { ObjExportScope } from '../../io/obj';

  /** Options for the OBJ export dialog. */
  interface Props {
    scope: ObjExportScope;
    includeTexture: boolean;
    hasTexture: boolean;
    hasActive: boolean;
    busy: boolean;
    onScopeChange: (scope: ObjExportScope) => void;
    onIncludeTextureChange: (include: boolean) => void;
    onCancel: () => void;
    onExport: () => void;
  }

  let {
    scope,
    includeTexture,
    hasTexture,
    hasActive,
    busy,
    onScopeChange,
    onIncludeTextureChange,
    onCancel,
    onExport
  }: Props = $props();

  let dialog: HTMLDialogElement;

  onMount(() => {
    dialog?.showModal();
  });

  function cancel(event?: Event): void {
    event?.preventDefault();
    onCancel();
  }
</script>

<dialog
  bind:this={dialog}
  class="export-dialog loupoli-panel"
  aria-labelledby="export-dialog-title"
  oncancel={cancel}
  onclick={(event) => {
    if (event.target === event.currentTarget) cancel();
  }}
>
  <header>
    <div>
      <span class="kicker">Interchange</span>
      <h2 id="export-dialog-title">Export OBJ</h2>
    </div>
    <IconButton
      label="Close export options"
      icon="close"
      tooltip="Close"
      onActivate={() => cancel()}
    />
  </header>

  <div class="dialog-body">
    <SelectField
      label="Source"
      value={scope}
      options={[
        ...(hasActive
          ? [{ value: 'active', label: 'Active object' }]
          : []),
        { value: 'scene', label: 'Whole scene' }
      ]}
      onChange={(value) => onScopeChange(value as ObjExportScope)}
    />
    <p class="hint">
      {scope === 'active'
        ? 'Exports the active object with its transform.'
        : 'Exports every visible object in the scene.'}
    </p>

    {#if hasTexture}
      <Switch
        label="Include texture PNG"
        description="Exports the assigned composite texture beside the MTL."
        checked={includeTexture}
        onChange={onIncludeTextureChange}
      />
    {:else}
      <p class="hint">
        No assigned texture. The export will contain OBJ and MTL only.
      </p>
    {/if}
  </div>

  <footer>
    <ActionRow align="end">
      <ActionButton label="Cancel" onActivate={() => cancel()} />
      <ActionButton
        label={busy ? 'Exporting…' : 'Export OBJ'}
        icon="save"
        disabled={busy}
        onActivate={onExport}
      />
    </ActionRow>
  </footer>
</dialog>

<style>
  .export-dialog {
    width: min(440px, calc(100vw - 32px));
    max-width: 440px;
    padding: 0;
    border: var(--hairline) solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-panel);
    color: var(--text-primary);
    box-shadow: var(--shadow-panel);
  }

  .export-dialog::backdrop {
    background: var(--bg-scrim);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-3) var(--space-2);
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .kicker {
    display: block;
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h2 {
    margin: 2px 0 0;
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .dialog-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
  }

  footer {
    padding: var(--space-2) var(--space-3) var(--space-3);
    border-top: var(--hairline) solid var(--border-subtle);
  }

  .hint {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }
</style>
