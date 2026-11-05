<script lang="ts">
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionRow from '../Primitives/ActionRow.svelte';
  import ModalDialog from '../Primitives/ModalDialog.svelte';
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
</script>

<ModalDialog
  title="Export OBJ"
  kicker="Interchange"
  onClose={onCancel}
>
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

  {#snippet actions()}
    <ActionRow align="end">
      <ActionButton label="Cancel" onActivate={() => onCancel()} />
      <ActionButton
        label={busy ? 'Exporting…' : 'Export OBJ'}
        icon="save"
        disabled={busy}
        onActivate={onExport}
      />
    </ActionRow>
  {/snippet}
</ModalDialog>

<style>
  .hint {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }
</style>
