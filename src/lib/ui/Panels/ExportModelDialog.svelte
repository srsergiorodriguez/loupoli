<script lang="ts">
  import { untrack } from 'svelte';
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ModalDialog from '../Primitives/ModalDialog.svelte';
  import NumberField from '../Primitives/NumberField.svelte';
  import SelectField from '../Primitives/SelectField.svelte';
  import Switch from '../Primitives/Switch.svelte';
  import type { AnimationClipSummary } from '../../editor/types';
  import {
    type ModelExportFormat,
    type ModelExportOptions,
    type ModelExportScope,
    type TextureAtlasSize
  } from '../../io/exportOptions';

  /** Options for the shared OBJ/GLB export dialog. */
  interface Props {
    initialFormat: ModelExportFormat;
    hasActive: boolean;
    selectedCount: number;
    hasTexture: boolean;
    clips: readonly AnimationClipSummary[];
    activeClipId: string;
    projectFps: number;
    busy: boolean;
    onClose: () => void;
    onExport: (options: ModelExportOptions) => void;
  }

  let {
    initialFormat,
    hasActive,
    selectedCount,
    hasTexture,
    clips,
    activeClipId,
    projectFps,
    busy,
    onClose,
    onExport
  }: Props = $props();

  let format = $state<ModelExportFormat>(untrack(() => initialFormat));
  let scope = $state<ModelExportScope>('scene');
  let includeTextures = $state(true);
  let unifyTextures = $state(false);
  let atlasSize = $state<TextureAtlasSize>('auto');
  let upAxis = $state<'y' | 'z'>('y');
  let scale = $state(1);
  let includeAnimation = $state(true);
  let clipMode = $state<'active' | 'all'>('all');
  let clipId = $state(untrack(() => activeClipId));
  let rangeMode = $state<'clip' | 'custom'>('clip');
  let startFrame = $state(0);
  let endFrame = $state(48);
  let sampleFps = $state(untrack(() => projectFps));
  let includeCameras = $state(true);
  let includeLights = $state(true);
  let bakeModulators = $state(true);

  const activeClip = $derived(
    clips.find((clip) => clip.id === clipId) ??
      clips.find((clip) => clip.id === activeClipId) ??
      clips[0] ??
      null
  );

  $effect(() => {
    if (activeClip && rangeMode === 'clip') {
      startFrame = activeClip.startFrame;
      endFrame = activeClip.endFrame;
    }
  });

  const scopeOptions = $derived([
    ...(hasActive ? [{ value: 'active', label: 'Active object' }] : []),
    ...(selectedCount > 0
      ? [{ value: 'selected', label: `Selected objects (${selectedCount})` }]
      : []),
    { value: 'scene', label: 'Whole scene' }
  ]);

  const canExport = $derived(
    !busy &&
      (format !== 'glb' || !includeAnimation || clips.length > 0) &&
      (format !== 'obj' ||
        !includeTextures ||
        !unifyTextures ||
        hasTexture) &&
      (format !== 'glb' ||
        !includeAnimation ||
        rangeMode === 'clip' ||
        endFrame >= startFrame)
  );

  const summary = $derived.by(() => {
    if (format === 'obj') {
      return `OBJ + MTL${includeTextures && hasTexture ? ' + PNG' : ''}`;
    }
    const parts = ['GLB'];
    if (includeTextures && hasTexture) {
      parts.push(unifyTextures ? 'one atlas' : 'textures');
    }
    if (includeAnimation && clips.length > 0) {
      parts.push(
        clipMode === 'all'
          ? `${clips.length} clip${clips.length === 1 ? '' : 's'}`
          : '1 clip'
      );
    }
    if (includeCameras) {
      parts.push('cameras');
    }
    if (includeLights) {
      parts.push('lights');
    }
    return parts.join(' · ');
  });

  function exportModel(): void {
    if (!canExport) {
      return;
    }
    onExport({
      format,
      scope,
      includeTextures: hasTexture && includeTextures,
      unifyTextures,
      atlasSize,
      upAxis,
      scale,
      includeAnimation,
      clipMode,
      clipId,
      rangeMode,
      startFrame,
      endFrame,
      sampleFps,
      includeCameras,
      includeLights,
      bakeModulators
    });
  }
</script>

<ModalDialog
  title={`Export ${format.toUpperCase()}`}
  kicker="Interchange"
  width="560px"
  scrollBody
  onClose={onClose}
>
  <SelectField
    label="Format"
    value={format}
    options={[
      { value: 'obj', label: 'OBJ + MTL' },
      { value: 'glb', label: 'GLB' }
    ]}
    onChange={(value) => (format = value as ModelExportFormat)}
  />

  <SelectField
    label="Source"
    value={scope}
    options={scopeOptions}
    onChange={(value) => (scope = value as ModelExportScope)}
  />

  {#if format === 'obj'}
    <div class="export-grid">
      <SelectField
        label="Up axis"
        value={upAxis}
        options={[
          { value: 'y', label: 'Y up' },
          { value: 'z', label: 'Z up' }
        ]}
        onChange={(value) => (upAxis = value === 'z' ? 'z' : 'y')}
      />
      <label class="export-field">
        <span>Scale</span>
        <NumberField
          label="Export scale"
          value={scale}
          step={0.1}
          precision={3}
          min={0.001}
          framed
          onCommit={(value) => (scale = value)}
        />
      </label>
    </div>
  {/if}

  {#if hasTexture}
    <Switch
      label="Include textures"
      description={format === 'glb'
        ? 'Embed composited textures in the GLB.'
        : 'Write composited texture PNGs beside the MTL.'}
      checked={includeTextures}
      onChange={(value) => (includeTextures = value)}
    />
    {#if includeTextures}
      <Switch
        label="Unify textures into one atlas"
        description="Pack textured objects into one PNG; the project is unchanged."
        checked={unifyTextures}
        onChange={(value) => (unifyTextures = value)}
      />
      {#if unifyTextures}
        <SelectField
          label="Atlas size"
          value={atlasSize}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: '1024', label: '1024 × 1024' },
            { value: '2048', label: '2048 × 2048' },
            { value: '4096', label: '4096 × 4096' }
          ]}
          onChange={(value) => (atlasSize = value as TextureAtlasSize)}
        />
      {/if}
    {/if}
  {:else}
    <p class="hint">No assigned model textures; export will use material colors.</p>
  {/if}

  {#if format === 'glb'}
    <div class="export-section">
      <span class="export-section-title">Animation</span>
      {#if clips.length > 0}
        <Switch
          label="Include animation"
          description="Clips, morphs, and camera/light motion."
          checked={includeAnimation}
          onChange={(value) => (includeAnimation = value)}
        />
        {#if includeAnimation}
          <SelectField
            label="Clips"
            value={clipMode}
            options={[
              { value: 'all', label: `All clips (${clips.length})` },
              { value: 'active', label: 'Active clip only' }
            ]}
            onChange={(value) => (clipMode = value === 'active' ? 'active' : 'all')}
          />
          {#if clipMode === 'active'}
            <SelectField
              label="Active clip"
              value={clipId}
              options={clips.map((clip) => ({
                value: clip.id,
                label: clip.name
              }))}
              onChange={(value) => (clipId = value)}
            />
          {/if}
          <SelectField
            label="Range"
            value={rangeMode}
            options={[
              { value: 'clip', label: 'Each clip range' },
              ...(clipMode === 'active'
                ? [{ value: 'custom', label: 'Custom range' }]
                : [])
            ]}
            onChange={(value) =>
              (rangeMode = value === 'custom' ? 'custom' : 'clip')}
          />
          {#if rangeMode === 'custom'}
            <div class="export-grid">
              <label class="export-field">
                <span>Start frame</span>
                <NumberField
                  label="Start frame"
                  value={startFrame}
                  step={1}
                  precision={0}
                  min={0}
                  framed
                  onCommit={(value) => (startFrame = value)}
                />
              </label>
              <label class="export-field">
                <span>End frame</span>
                <NumberField
                  label="End frame"
                  value={endFrame}
                  step={1}
                  precision={0}
                  min={startFrame}
                  framed
                  onCommit={(value) => (endFrame = value)}
                />
              </label>
            </div>
          {/if}
          <label class="export-field">
            <span>Sample FPS</span>
            <NumberField
              label="Animation sample FPS"
              value={sampleFps}
              step={1}
              precision={0}
              min={1}
              max={120}
              framed
              onCommit={(value) => (sampleFps = value)}
            />
          </label>
          <Switch
            label="Bake procedural modulators"
            description="Sample LFOs, noise, orbit, BPM, and audio envelopes into GLB tracks."
            checked={bakeModulators}
            onChange={(value) => (bakeModulators = value)}
          />
        {/if}
      {:else}
        <p class="hint">No animation clips in this project.</p>
      {/if}
      <Switch
        label="Include cameras"
        checked={includeCameras}
        onChange={(value) => (includeCameras = value)}
      />
      <Switch
        label="Include lights"
        checked={includeLights}
        onChange={(value) => (includeLights = value)}
      />
    </div>
  {/if}

  <div class="export-summary">
    <span>{summary}</span>
    <span>{busy ? 'Exporting…' : 'Ready'}</span>
  </div>

  {#if format === 'obj' && includeTextures && unifyTextures && !hasTexture}
    <p class="warning">Texture unification requires at least one textured object.</p>
  {/if}

  {#snippet actions()}
    <ActionButton label="Cancel" onActivate={onClose} />
    <ActionButton
      label={busy ? 'Exporting…' : `Export ${format.toUpperCase()}`}
      variant="primary"
      icon="save"
      disabled={!canExport}
      onActivate={exportModel}
    />
  {/snippet}
</ModalDialog>

<style>
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

  .export-field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: var(--field-label-gap);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .export-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .export-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-2);
    border-top: var(--hairline) solid var(--border-subtle);
  }

  .export-section-title {
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .export-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding-top: var(--space-2);
    border-top: var(--hairline) solid var(--border-subtle);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .export-summary span:first-child {
    color: var(--text-secondary);
  }
</style>
