<script lang="ts">
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionRow from '../Primitives/ActionRow.svelte';
  import ModalDialog from '../Primitives/ModalDialog.svelte';
  import NumberField from '../Primitives/NumberField.svelte';
  import SelectField from '../Primitives/SelectField.svelte';
  import Switch from '../Primitives/Switch.svelte';
  import type { ObjExportScope } from '../../io/obj';
  import type { AnimationClipSummary } from '../../editor/types';
  import { MAX_OBJ_FRAME_EXPORT } from '../../editor/animationFrameExport';

  /** Options for the animated OBJ frame-sequence dialog. */
  interface Props {
    scope: ObjExportScope;
    clipId: string;
    clips: readonly AnimationClipSummary[];
    mode: 'step' | 'keyed';
    startFrame: number;
    endFrame: number;
    step: number;
    frameCount: number;
    includeTexture: boolean;
    hasTexture: boolean;
    hasActive: boolean;
    busy: boolean;
    onScopeChange: (scope: ObjExportScope) => void;
    onClipChange: (clipId: string) => void;
    onModeChange: (mode: 'step' | 'keyed') => void;
    onStartFrameChange: (frame: number) => void;
    onEndFrameChange: (frame: number) => void;
    onStepChange: (step: number) => void;
    onIncludeTextureChange: (include: boolean) => void;
    onCancel: () => void;
    onExport: () => void;
  }

  let {
    scope,
    clipId,
    clips,
    mode,
    startFrame,
    endFrame,
    step,
    frameCount,
    includeTexture,
    hasTexture,
    hasActive,
    busy,
    onScopeChange,
    onClipChange,
    onModeChange,
    onStartFrameChange,
    onEndFrameChange,
    onStepChange,
    onIncludeTextureChange,
    onCancel,
    onExport
  }: Props = $props();

  const tooMany = $derived(frameCount > MAX_OBJ_FRAME_EXPORT);
  const canExport = $derived(
    !busy &&
      clips.length > 0 &&
      frameCount !== 0 &&
      !tooMany &&
      endFrame >= startFrame
  );
</script>

<ModalDialog
  title="Export OBJ frames"
  kicker="Animation"
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

  <SelectField
    label="Clip"
    value={clipId}
    options={clips.map((clip) => ({
      value: clip.id,
      label: clip.name
    }))}
    onChange={onClipChange}
  />

  <SelectField
    label="Frames"
    value={mode}
    options={[
      { value: 'step', label: 'Every N frames' },
      { value: 'keyed', label: 'Keyed frames only' }
    ]}
    onChange={(value) => onModeChange(value as 'step' | 'keyed')}
  />

  <div class="frame-row">
    <label class="frame-field">
      <span>Start frame</span>
      <NumberField
        label="Start frame"
        value={startFrame}
        step={1}
        precision={0}
        min={0}
        onCommit={onStartFrameChange}
      />
    </label>
    <label class="frame-field">
      <span>End frame</span>
      <NumberField
        label="End frame"
        value={endFrame}
        step={1}
        precision={0}
        min={0}
        onCommit={onEndFrameChange}
      />
    </label>
  </div>

  <div class="frame-row">
    <label class="frame-field">
      <span>Step</span>
      <NumberField
        label="Step"
        value={step}
        step={1}
        precision={0}
        min={1}
        max={120}
        disabled={mode === 'keyed'}
        onCommit={onStepChange}
      />
    </label>
    <span class="frame-summary">
      {mode === 'keyed'
        ? 'Keyed frames in range'
        : `${frameCount} frame${frameCount === 1 ? '' : 's'}`}
    </span>
  </div>

  {#if hasTexture}
    <Switch
      label="Include texture PNG"
      description="Shared MTL and PNG(s) are referenced by every OBJ frame."
      checked={includeTexture}
      onChange={onIncludeTextureChange}
    />
  {:else}
    <p class="hint">No assigned texture. The sequence will contain OBJ and MTL only.</p>
  {/if}

  {#if tooMany}
    <p class="warning">
      The sequence is limited to {MAX_OBJ_FRAME_EXPORT} frames. Reduce the range or increase the
      step.
    </p>
  {:else if mode === 'step' && frameCount === 0}
    <p class="warning">Choose a valid frame range.</p>
  {/if}

  <p class="hint">
    Every OBJ frame shares one MTL{hasTexture && includeTexture ? ' and one texture PNG' : ''}.
  </p>

  {#snippet actions()}
    <ActionRow align="end">
      <ActionButton label="Cancel" onActivate={() => onCancel()} />
      <ActionButton
        label={busy ? 'Exporting…' : 'Export frames'}
        icon="save"
        disabled={!canExport}
        onActivate={onExport}
      />
    </ActionRow>
  {/snippet}
</ModalDialog>

<style>
  .frame-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
    gap: var(--space-2);
  }

  .frame-field {
    display: flex;
    flex-direction: column;
    gap: var(--field-label-gap);
    min-width: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .frame-summary {
    align-self: center;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .hint {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }

  .warning {
    margin: 0;
    color: var(--accent-warning);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }
</style>
