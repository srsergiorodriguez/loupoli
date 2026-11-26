<script lang="ts">
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import {
    detectRenderEffectPreset,
    renderEffectDefinition,
    renderEffectStage,
    type ColorDepthMode,
    type DitherPattern,
    type RenderEffect,
    type RenderEffectKind
  } from '../../render/effects';
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionRow from '../Primitives/ActionRow.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import NumberField from '../Primitives/NumberField.svelte';
  import SelectField from '../Primitives/SelectField.svelte';
  import SliderField from '../Primitives/SliderField.svelte';
  import Switch from '../Primitives/Switch.svelte';

  /** Editable project-level material/post effect stack for render output. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  const effects = $derived(session.snapshot.renderEffects);
  const material = $derived(
    effects.filter((effect) => renderEffectStage(effect.kind) === 'material')
  );
  const post = $derived(
    effects.filter((effect) => renderEffectStage(effect.kind) === 'post')
  );
  const preset = $derived(detectRenderEffectPreset(effects));
  const kindOptions = [
    { value: 'vertex-snap', label: 'Material · Vertex snap' },
    { value: 'affine-texture', label: 'Material · Affine texture' },
    { value: 'color-depth', label: 'Post · Color depth' },
    { value: 'dither', label: 'Post · Dither' }
  ];
  const depthOptions = [
    { value: 'rgb555', label: 'RGB555 · 15-bit' },
    { value: 'rgb332', label: 'RGB332 · 8-bit' },
    { value: '1bit', label: '1-bit · black / white' }
  ];
  const patternOptions = [
    { value: 'bayer4', label: 'Bayer 4×4' },
    { value: 'bayer8', label: 'Bayer 8×8' }
  ];
  let newKind = $state<RenderEffectKind>('color-depth');

  function update(effect: RenderEffect, patch: Partial<RenderEffect>): void {
    session.updateRenderEffect(effect.id, patch);
  }

  function label(effect: RenderEffect): string {
    return renderEffectDefinition(effect.kind).label;
  }

  function indexOf(effect: RenderEffect): number {
    return effects.findIndex((item) => item.id === effect.id);
  }
</script>

<div class="effect-stack">
  <p class="hint">
    A project-wide render stack. Material effects feed the PS1 shader; post
    effects run on the virtual-resolution image before upscale.
  </p>

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
    {#if preset === 'custom'}
      <span class="preset-state">Custom</span>
    {/if}
  </ActionRow>

  <div class="stage-head">
    <span>Material</span>
    <span>{material.length} effect{material.length === 1 ? '' : 's'}</span>
  </div>
  {#if material.length === 0}
    <p class="hint">No material effects. PS1 adds vertex snap and affine UVs.</p>
  {:else}
    {#each material as effect (effect.id)}
      <div class="effect-card" class:is-disabled={!effect.enabled}>
        <div class="effect-head">
          <Switch
            label={label(effect)}
            checked={effect.enabled}
            onChange={(checked) => session.setRenderEffectEnabled(effect.id, checked)}
          />
          <span class="stage-tag">Material</span>
          <span class="effect-actions">
            <IconButton
              label={`Move ${label(effect)} up`}
              icon="chevron-up"
              tooltip="Move effect up"
              disabled={indexOf(effect) === 0}
              onActivate={() => session.moveRenderEffect(effect.id, -1)}
            />
            <IconButton
              label={`Move ${label(effect)} down`}
              icon="chevron-down"
              tooltip="Move effect down"
              disabled={indexOf(effect) === effects.length - 1}
              onActivate={() => session.moveRenderEffect(effect.id, 1)}
            />
            <IconButton
              label={`Remove ${label(effect)}`}
              icon="trash"
              tooltip="Remove effect"
              onActivate={() => session.removeRenderEffect(effect.id)}
            />
          </span>
        </div>
        {#if effect.kind === 'vertex-snap'}
          <div class="effect-fields">
            <div class="effect-field">
              <span>Width</span>
              <NumberField
                label="Vertex snap width"
                value={effect.width ?? 320}
                step={1}
                precision={0}
                min={1}
                max={4096}
                framed
                onCommit={(value) => update(effect, { width: value })}
              />
            </div>
            <div class="effect-field">
              <span>Height</span>
              <NumberField
                label="Vertex snap height"
                value={effect.height ?? 240}
                step={1}
                precision={0}
                min={1}
                max={4096}
                framed
                onCommit={(value) => update(effect, { height: value })}
              />
            </div>
          </div>
        {:else if effect.kind === 'affine-texture'}
          <p class="effect-note">Affine UV interpolation; use Texture shading to see it.</p>
        {/if}
      </div>
    {/each}
  {/if}

  <div class="stage-head">
    <span>Post</span>
    <span>{post.length} effect{post.length === 1 ? '' : 's'}</span>
  </div>
  {#if post.length === 0}
    <p class="hint">No post effects. Dither applies at virtual resolution.</p>
  {:else}
    {#each post as effect (effect.id)}
      <div class="effect-card" class:is-disabled={!effect.enabled}>
        <div class="effect-head">
          <Switch
            label={label(effect)}
            checked={effect.enabled}
            onChange={(checked) => session.setRenderEffectEnabled(effect.id, checked)}
          />
          <span class="stage-tag">Post</span>
          <span class="effect-actions">
            <IconButton
              label={`Move ${label(effect)} up`}
              icon="chevron-up"
              tooltip="Move effect up"
              disabled={indexOf(effect) === 0}
              onActivate={() => session.moveRenderEffect(effect.id, -1)}
            />
            <IconButton
              label={`Move ${label(effect)} down`}
              icon="chevron-down"
              tooltip="Move effect down"
              disabled={indexOf(effect) === effects.length - 1}
              onActivate={() => session.moveRenderEffect(effect.id, 1)}
            />
            <IconButton
              label={`Remove ${label(effect)}`}
              icon="trash"
              tooltip="Remove effect"
              onActivate={() => session.removeRenderEffect(effect.id)}
            />
          </span>
        </div>
        {#if effect.kind === 'color-depth'}
          <SelectField
            label="Depth"
            value={effect.depth ?? 'rgb555'}
            options={depthOptions}
            onChange={(value) => update(effect, { depth: value as ColorDepthMode })}
          />
        {:else if effect.kind === 'dither'}
          <SelectField
            label="Depth"
            value={effect.depth ?? 'rgb555'}
            options={depthOptions}
            onChange={(value) => update(effect, { depth: value as ColorDepthMode })}
          />
          <SelectField
            label="Pattern"
            value={effect.pattern ?? 'bayer4'}
            options={patternOptions}
            onChange={(value) =>
              update(effect, { pattern: value as DitherPattern })}
          />
          <SliderField
            label="Strength"
            value={effect.strength ?? 1}
            min={0}
            max={1}
            step={0.01}
            precision={2}
            onChange={(value) => update(effect, { strength: value })}
          />
        {/if}
      </div>
    {/each}
  {/if}

  <div class="add-effect">
    <SelectField
      label="Effect"
      value={newKind}
      options={kindOptions}
      onChange={(value) => (newKind = value as RenderEffectKind)}
    />
    <ActionButton
      label="Add effect"
      icon="plus"
      onActivate={() => session.addRenderEffect(newKind)}
    />
  </div>
  <p class="hint">
    Post effects update the render preview, PNG stills, frame sequences, and
    video. The interactive viewport keeps the material PS1 look only.
  </p>
</div>

<style>
  .effect-stack {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
  }

  .stage-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: var(--hairline) solid var(--border-subtle);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .stage-tag {
    margin-left: auto;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .preset-state {
    align-self: center;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
  }

  .effect-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
  }

  .effect-card.is-disabled {
    opacity: 0.62;
  }

  .effect-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .effect-head :global(.switch-row) {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0;
  }

  .effect-head :global(.switch-row .description) {
    display: none;
  }

  .effect-actions {
    display: flex;
    align-items: center;
    gap: 1px;
    flex: 0 0 auto;
  }

  .effect-fields {
    display: flex;
    gap: var(--space-2);
  }

  .effect-field {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  .effect-field > span {
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .effect-field :global(.number-field) {
    min-width: 0;
  }

  .effect-note {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }

  .add-effect {
    display: flex;
    align-items: end;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }

  .add-effect :global(.select-field) {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
