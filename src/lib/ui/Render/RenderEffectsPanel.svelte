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
  import CreateRow from '../Primitives/CreateRow.svelte';
  import DangerAction from '../Primitives/DangerAction.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import NumberField from '../Primitives/NumberField.svelte';

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
    { value: 'vertex-snap', label: 'Vertex snap — material' },
    { value: 'affine-texture', label: 'Affine texture — material' },
    { value: 'color-depth', label: 'Color depth — post' },
    { value: 'dither', label: 'Dither — post' }
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

  <div class="effect-group-label">Material</div>
  {#if material.length === 0}
    <p class="hint">No material effects. PS1 adds vertex snap and affine UVs.</p>
  {:else}
    <div class="effect-list">
      {#each material as effect (effect.id)}
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
            {#if effect.kind === 'vertex-snap'}
              <label class="effect-field">
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
              </label>
              <label class="effect-field">
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
              </label>
            {:else if effect.kind === 'affine-texture'}
              <p class="effect-note">
                Affine UV interpolation; requires Texture shading.
              </p>
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

  <div class="effect-group-label">Post</div>
  {#if post.length === 0}
    <p class="hint">No post effects. Dither runs at virtual resolution.</p>
  {:else}
    <div class="effect-list">
      {#each post as effect (effect.id)}
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
            {#if effect.kind === 'color-depth'}
              <label class="effect-field">
                <span>Depth</span>
                <select
                  value={effect.depth ?? 'rgb555'}
                  aria-label="Color depth"
                  onchange={(event) =>
                    update(effect, {
                      depth: event.currentTarget.value as ColorDepthMode
                    })}
                >
                  {#each depthOptions as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
            {:else if effect.kind === 'dither'}
              <label class="effect-field">
                <span>Depth</span>
                <select
                  value={effect.depth ?? 'rgb555'}
                  aria-label="Dither depth"
                  onchange={(event) =>
                    update(effect, {
                      depth: event.currentTarget.value as ColorDepthMode
                    })}
                >
                  {#each depthOptions as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
              <label class="effect-field">
                <span>Pattern</span>
                <select
                  value={effect.pattern ?? 'bayer4'}
                  aria-label="Dither pattern"
                  onchange={(event) =>
                    update(effect, {
                      pattern: event.currentTarget.value as DitherPattern
                    })}
                >
                  {#each patternOptions as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
              <label class="effect-field">
                <span>Strength</span>
                <NumberField
                  label="Dither strength"
                  value={effect.strength ?? 1}
                  step={0.01}
                  precision={2}
                  min={0}
                  max={1}
                  framed
                  onCommit={(value) => update(effect, { strength: value })}
                />
              </label>
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

  <p class="hint">
    Post effects update the render preview, stills, frame sequences, and video.
    The interactive viewport keeps the material PS1 look.
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
