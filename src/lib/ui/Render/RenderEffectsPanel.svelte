<script lang="ts">
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import {
    detectRenderEffectPreset,
    RENDER_EFFECT_DEFINITIONS,
    renderEffectDefinition,
    renderEffectStage,
    type RenderEffect,
    type RenderEffectKind
  } from '../../render/effects';
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionRow from '../Primitives/ActionRow.svelte';
  import CreateRow from '../Primitives/CreateRow.svelte';
  import DangerAction from '../Primitives/DangerAction.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import NumberField from '../Primitives/NumberField.svelte';

  /** Editable project-level material/post effect stack for render output. */
  interface Props {
    session: EditorSession;
  }

  interface EffectField {
    readonly key: keyof RenderEffect;
    readonly label: string;
    readonly type: 'number' | 'select';
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    readonly precision?: number;
    readonly options?: readonly { value: string; label: string }[];
  }

  const DEPTH_OPTIONS = [
    { value: 'rgb555', label: 'RGB555 · 15-bit' },
    { value: 'rgb332', label: 'RGB332 · 8-bit' },
    { value: '1bit', label: '1-bit · black / white' }
  ];
  const PATTERN_OPTIONS = [
    { value: 'bayer4', label: 'Bayer 4×4' },
    { value: 'bayer8', label: 'Bayer 8×8' }
  ];
  const GRADE_OPTIONS = [
    { value: 'normal', label: 'Normal' },
    { value: 'monochrome', label: 'Monochrome' },
    { value: 'sepia', label: 'Sepia' },
    { value: 'invert', label: 'Invert' }
  ];
  const CHROMATIC_OPTIONS = [
    { value: 'horizontal', label: 'Horizontal' },
    { value: 'radial', label: 'Radial' }
  ];
  const kindOptions = RENDER_EFFECT_DEFINITIONS.map((definition) => ({
    value: definition.kind,
    label: `${definition.label} — ${definition.stage}`
  }));

  let { session }: Props = $props();

  const effects = $derived(session.snapshot.renderEffects);
  const material = $derived(
    effects.filter((effect) => renderEffectStage(effect.kind) === 'material')
  );
  const post = $derived(
    effects.filter((effect) => renderEffectStage(effect.kind) === 'post')
  );
  const preset = $derived(detectRenderEffectPreset(effects));
  let newKind = $state<RenderEffectKind>('color-depth');

  function numberField(
    key: keyof RenderEffect,
    label: string,
    min: number,
    max: number,
    step: number,
    precision: number
  ): EffectField {
    return { key, label, type: 'number', min, max, step, precision };
  }

  function fieldsFor(effect: RenderEffect): EffectField[] {
    switch (effect.kind) {
      case 'vertex-snap':
        return [
          numberField('width', 'Width', 1, 4096, 1, 0),
          numberField('height', 'Height', 1, 4096, 1, 0)
        ];
      case 'affine-texture':
        return [];
      case 'color-grade':
        return [
          {
            key: 'mode',
            label: 'Mode',
            type: 'select',
            options: GRADE_OPTIONS
          },
          numberField('saturation', 'Saturation', 0, 2, 0.01, 2),
          numberField('contrast', 'Contrast', 0, 2, 0.01, 2)
        ];
      case 'posterize':
        return [numberField('levels', 'Levels', 2, 64, 1, 0)];
      case 'pixelate':
        return [numberField('blockSize', 'Block', 1, 64, 1, 0)];
      case 'scanlines':
        return [
          numberField('strength', 'Strength', 0, 1, 0.01, 2),
          numberField('spacing', 'Spacing', 1, 16, 1, 0)
        ];
      case 'vignette':
        return [
          numberField('strength', 'Strength', 0, 1, 0.01, 2),
          numberField('radius', 'Radius', 0, 2, 0.01, 2)
        ];
      case 'grain':
        return [numberField('strength', 'Strength', 0, 1, 0.01, 2)];
      case 'chroma-bleed':
        return [numberField('amount', 'Amount', 0, 8, 1, 0)];
      case 'chromatic-aberration':
        return [
          numberField('amount', 'Amount', 0, 8, 0.1, 1),
          { key: 'mode', label: 'Mode', type: 'select', options: CHROMATIC_OPTIONS }
        ];
      case 'vhs-tracking':
        return [
          numberField('amount', 'Amount', 0, 16, 0.1, 1),
          numberField('frequency', 'Frequency', 0.001, 1, 0.001, 3),
          numberField('speed', 'Speed', 0, 4, 0.05, 2)
        ];
      case 'crt-curvature':
        return [numberField('amount', 'Amount', 0, 0.5, 0.01, 2)];
      case 'bloom':
        return [
          numberField('threshold', 'Threshold', 0, 1, 0.01, 2),
          numberField('strength', 'Strength', 0, 2, 0.01, 2),
          numberField('radius', 'Radius', 1, 32, 1, 0)
        ];
      case 'aperture-grille':
        return [
          numberField('strength', 'Strength', 0, 1, 0.01, 2),
          numberField('spacing', 'Spacing', 2, 12, 1, 0)
        ];
      case 'interlace':
        return [numberField('strength', 'Strength', 0, 1, 0.01, 2)];
      case 'dropout':
        return [
          numberField('strength', 'Strength', 0, 1, 0.01, 2),
          numberField('count', 'Bands', 1, 32, 1, 0)
        ];
      case 'ghost-trails':
        return [numberField('mix', 'Mix', 0, 1, 0.01, 2)];
      case 'motion-blur':
        return [
          numberField('amount', 'Amount', 0, 32, 0.5, 1),
          numberField('angle', 'Angle°', -180, 180, 1, 0)
        ];
      case 'compression':
        return [
          numberField('blockSize', 'Block', 1, 32, 1, 0),
          numberField('strength', 'Strength', 0, 1, 0.01, 2)
        ];
      case 'film-damage':
        return [
          numberField('strength', 'Strength', 0, 1, 0.01, 2),
          numberField('count', 'Dust', 1, 32, 1, 0)
        ];
      case 'head-switching':
        return [
          numberField('strength', 'Strength', 0, 1, 0.01, 2),
          numberField('height', 'Band px', 1, 64, 1, 0)
        ];
      case 'color-depth':
        return [{ key: 'depth', label: 'Depth', type: 'select', options: DEPTH_OPTIONS }];
      case 'dither':
        return [
          { key: 'depth', label: 'Depth', type: 'select', options: DEPTH_OPTIONS },
          { key: 'pattern', label: 'Pattern', type: 'select', options: PATTERN_OPTIONS },
          numberField('strength', 'Strength', 0, 1, 0.01, 2)
        ];
      default:
        return [];
    }
  }

  function fieldValue(effect: RenderEffect, field: EffectField): string | number {
    const value = effect[field.key];
    if (field.type === 'select') {
      return typeof value === 'string'
        ? value
        : (field.options?.[0]?.value ?? '');
    }
    return typeof value === 'number' ? value : (field.min ?? 0);
  }

  function updateField(
    effect: RenderEffect,
    field: EffectField,
    value: string | number
  ): void {
    session.updateRenderEffect(effect.id, {
      [field.key]: value
    } as Partial<RenderEffect>);
  }

  function label(effect: RenderEffect): string {
    return renderEffectDefinition(effect.kind).label;
  }

  function cardIndex(effect: RenderEffect): number {
    return effects.findIndex((item) => item.id === effect.id) + 1;
  }
</script>

<div class="effect-stack">
  <p class="hint">
    Project render stack. Material effects run in the PS1 shader; post effects
    run on the virtual-resolution frame before upscale.
  </p>

  <div class="effect-preset-row">
    <span class="effect-group-label">Preset</span>
    <ActionRow>
      <ActionButton
        label="Clean"
        active={preset === 'clean'}
        onActivate={() => session.applyRenderEffectPreset('clean')}
      />
      <ActionButton
        label="PS1"
        active={preset === 'ps1'}
        onActivate={() => session.applyRenderEffectPreset('ps1')}
      />
      <ActionButton
        label="Dither"
        active={preset === 'dither'}
        onActivate={() => session.applyRenderEffectPreset('dither')}
      />
      <ActionButton
        label="VHS"
        active={preset === 'vhs'}
        onActivate={() => session.applyRenderEffectPreset('vhs')}
      />
      <ActionButton
        label="CRT"
        active={preset === 'crt'}
        onActivate={() => session.applyRenderEffectPreset('crt')}
      />
      <ActionButton
        label="Film"
        active={preset === 'film'}
        onActivate={() => session.applyRenderEffectPreset('film')}
      />
      {#if preset === 'custom'}
        <span class="preset-state">Custom</span>
      {/if}
    </ActionRow>
  </div>

  <CreateRow
    label="Effect type"
    value={newKind}
    options={kindOptions}
    onAdd={() => session.addRenderEffect(newKind)}
    onChange={(value) => (newKind = value as RenderEffectKind)}
  />

  {#each [
    { title: 'Material', effects: material },
    { title: 'Post', effects: post }
  ] as group (group.title)}
    <div class="effect-group-label">{group.title}</div>
    {#if group.effects.length === 0}
      <p class="hint">
        {group.title === 'Material'
          ? 'No material effects. PS1 adds vertex snap and affine UVs.'
          : 'No post effects. Dither is a good starting point.'}
      </p>
    {:else}
      <div class="effect-list">
        {#each group.effects as effect (effect.id)}
          <div class="effect-card" class:is-disabled={!effect.enabled}>
            <div class="effect-head">
              <button
                type="button"
                class="effect-enabled"
                class:is-active={effect.enabled}
                aria-pressed={effect.enabled}
                aria-label={effect.enabled ? 'Disable effect' : 'Enable effect'}
                onclick={() =>
                  session.setRenderEffectEnabled(effect.id, !effect.enabled)}
              >
                <span class="effect-dot" aria-hidden="true"></span>
                {effect.enabled ? 'On' : 'Off'}
              </button>
              <span class="effect-name">{label(effect)}</span>
              <span class="effect-index text-mono">{cardIndex(effect)}</span>
              <span class="effect-actions">
                <IconButton
                  label={`Move ${label(effect)} up`}
                  icon="chevron-up"
                  tooltip="Move effect up"
                  disabled={effects.indexOf(effect) === 0}
                  onActivate={() => session.moveRenderEffect(effect.id, -1)}
                />
                <IconButton
                  label={`Move ${label(effect)} down`}
                  icon="chevron-down"
                  tooltip="Move effect down"
                  disabled={effects.indexOf(effect) === effects.length - 1}
                  onActivate={() => session.moveRenderEffect(effect.id, 1)}
                />
              </span>
            </div>
            <div class="effect-controls">
              {#if effect.kind === 'affine-texture'}
                <p class="effect-note">
                  Affine UV interpolation; requires Texture shading.
                </p>
              {:else}
                {#each fieldsFor(effect) as field (field.key)}
                  <label class="effect-field">
                    <span>{field.label}</span>
                    {#if field.type === 'select'}
                      <select
                        value={fieldValue(effect, field)}
                        aria-label={`${label(effect)} ${field.label}`}
                        onchange={(event) =>
                          updateField(effect, field, event.currentTarget.value)}
                      >
                        {#each field.options ?? [] as option (option.value)}
                          <option value={option.value}>{option.label}</option>
                        {/each}
                      </select>
                    {:else}
                      <NumberField
                        label={`${label(effect)} ${field.label}`}
                        value={Number(fieldValue(effect, field))}
                        step={field.step ?? 1}
                        precision={field.precision ?? 0}
                        min={field.min}
                        max={field.max}
                        framed
                        onCommit={(value) => updateField(effect, field, value)}
                      />
                    {/if}
                  </label>
                {/each}
              {/if}
            </div>
            <DangerAction
              label="Remove effect"
              onActivate={() => session.removeRenderEffect(effect.id)}
            />
          </div>
        {/each}
      </div>
    {/if}
  {/each}

  <p class="hint">
    Post effects update the render preview, stills, frame sequences, and video.
    Ghost trails and animated grain use the current animation frame; exports
    reset trail history at their first frame. The interactive viewport keeps
    the material PS1 look.
  </p>
</div>

<style>
  .effect-stack {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
  }

  .effect-preset-row {
    display: flex;
    flex-direction: column;
    gap: var(--field-label-gap);
  }

  .effect-group-label {
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .preset-state {
    align-self: center;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
  }

  .effect-list {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
  }

  .effect-card {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
    padding: var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
  }

  .effect-card.is-disabled {
    opacity: 0.7;
  }

  .effect-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .effect-enabled {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--control-h);
    min-width: var(--control-h);
    gap: 5px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .effect-enabled.is-active {
    color: var(--accent-primary);
  }

  .effect-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  .effect-name {
    flex: 1;
    min-width: 0;
    color: var(--text-primary);
    font-size: var(--text-xs);
  }

  .effect-index {
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .effect-actions {
    display: flex;
    align-items: center;
  }

  .effect-actions :global(.icon-button) {
    width: var(--control-h);
    height: var(--control-h);
  }

  .effect-controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-1);
  }

  .effect-field {
    display: flex;
    flex-direction: column;
    gap: var(--field-label-gap);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .effect-field select {
    box-sizing: border-box;
    width: 100%;
    height: var(--control-h);
    min-height: var(--control-h);
    padding: 0 var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    line-height: normal;
  }

  .effect-note {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }
</style>
