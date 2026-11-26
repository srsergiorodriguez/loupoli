<script lang="ts">
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import type {
    AnimationModulatorKind,
    AnimationModulatorSnapshot,
    ModulatorAxis,
    ModulatorProperty,
    ModulatorTargetKind,
    ModulatorWaveform
  } from '../../scene/AnimationModulators';
  import CreateRow from '../Primitives/CreateRow.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import NumberField from '../Primitives/NumberField.svelte';

  interface Props {
    session: EditorSession;
    showHeader?: boolean;
  }

  let { session, showHeader = true }: Props = $props();

  const kindOptions = [
    { value: 'lfo', label: 'LFO' },
    { value: 'noise', label: 'Noise' },
    { value: 'audio-envelope', label: 'Audio envelope' },
    { value: 'orbit', label: 'Camera orbit' }
  ];
  let modulatorKind = $state<AnimationModulatorKind>('lfo');
  const kindHint = $derived(
    modulatorKind === 'lfo'
      ? 'Waves and BPM-synced pulses; target an object, camera, or light.'
      : modulatorKind === 'noise'
        ? 'Deterministic seeded drift; target an object, camera, or light.'
        : modulatorKind === 'audio-envelope'
          ? 'Follow the active audio peaks with attack and release.'
          : 'Move the active camera around a pivot and keep it aimed at the pivot.'
  );

  const modulators = $derived(session.snapshot.animationModulators);
  const targets = $derived.by(() => {
    const snapshot = session.snapshot;
    return [
      ...snapshot.nodes.map((node) => ({
        value: `node:${node.id}`,
        label: `Object · ${node.name}`,
        kind: 'node' as ModulatorTargetKind
      })),
      ...snapshot.cameras.map((camera) => ({
        value: `camera:${camera.id}`,
        label: `Camera · ${camera.name}`,
        kind: 'camera' as ModulatorTargetKind
      })),
      ...snapshot.lights.map((light) => ({
        value: `light:${light.id}`,
        label: `Light · ${light.name}`,
        kind: 'light' as ModulatorTargetKind
      }))
    ];
  });

  const audioOptions = $derived([
    { value: '', label: 'No audio' },
    ...session.snapshot.audioAssets.map((asset) => ({
      value: asset.id,
      label: asset.name
    }))
  ]);

  function kindLabel(kind: AnimationModulatorKind): string {
    return kindOptions.find((item) => item.value === kind)?.label ?? 'Modulator';
  }

  function targetValue(modulator: AnimationModulatorSnapshot): string {
    return `${modulator.targetKind}:${modulator.targetId}`;
  }

  function targetLabel(modulator: AnimationModulatorSnapshot): string {
    return (
      targets.find((target) => target.value === targetValue(modulator))?.label ??
      'Missing target'
    );
  }

  function targetOptions(modulator: AnimationModulatorSnapshot) {
    return modulator.kind === 'orbit'
      ? targets.filter((target) => target.kind === 'camera')
      : targets;
  }

  function propertyOptions(targetKind: ModulatorTargetKind) {
    if (targetKind === 'camera') {
      return [
        { value: 'position', label: 'Position' },
        { value: 'fov', label: 'Field of view' }
      ];
    }
    if (targetKind === 'light') {
      return [
        { value: 'position', label: 'Position' },
        { value: 'intensity', label: 'Intensity' }
      ];
    }
    return [
      { value: 'position', label: 'Position' },
      { value: 'rotation', label: 'Rotation' },
      { value: 'scale', label: 'Scale' }
    ];
  }

  function isVectorProperty(property: ModulatorProperty): boolean {
    return property === 'position' || property === 'rotation' || property === 'scale';
  }

  function amplitudeLabel(modulator: AnimationModulatorSnapshot): string {
    if (modulator.property === 'rotation' || modulator.property === 'fov') {
      return 'Amplitude (°)';
    }
    if (modulator.property === 'scale') {
      return 'Amplitude (×)';
    }
    return modulator.targetKind === 'light' && modulator.property === 'intensity'
      ? 'Amplitude'
      : 'Amplitude (units)';
  }

  function offsetLabel(modulator: AnimationModulatorSnapshot): string {
    return modulator.property === 'rotation' || modulator.property === 'fov'
      ? 'Offset (°)'
      : modulator.targetKind === 'light' && modulator.property === 'intensity'
        ? 'Offset'
        : 'Offset (units)';
  }

  function changeTarget(
    modulator: AnimationModulatorSnapshot,
    value: string
  ): void {
    const [kind, ...rest] = value.split(':');
    const targetKind = kind as ModulatorTargetKind;
    const targetId = rest.join(':');
    const allowed = propertyOptions(targetKind).map((option) => option.value);
    session.updateAnimationModulator(modulator.id, {
      targetKind,
      targetId,
      property: allowed.includes(modulator.property)
        ? modulator.property
        : 'position'
    });
  }

  function update(
    modulator: AnimationModulatorSnapshot,
    patch: Partial<AnimationModulatorSnapshot>
  ): void {
    session.updateAnimationModulator(modulator.id, patch);
  }
</script>

<div class="modulators">
  {#if showHeader}
    <div class="modulators-head">
      <span>Modulators</span>
      <span>{modulators.length} modulator{modulators.length === 1 ? '' : 's'}</span>
    </div>
  {/if}
  <CreateRow
    label="Modulator type"
    value={modulatorKind}
    options={kindOptions}
    addLabel="Add"
    onAdd={() => session.addAnimationModulator(modulatorKind)}
    onChange={(value) => (modulatorKind = value as AnimationModulatorKind)}
  />
  <p class="mod-hint">{kindHint}</p>

  {#if modulators.length > 0}
    <div class="mod-list">
      {#each modulators as modulator, index (modulator.id)}
        <div class="mod-card" class:is-disabled={!modulator.enabled}>
          <div class="mod-head">
            <button
              type="button"
              class="mod-enabled"
              class:is-active={modulator.enabled}
              aria-pressed={modulator.enabled}
              aria-label={modulator.enabled ? 'Disable modulator' : 'Enable modulator'}
              onclick={() => update(modulator, { enabled: !modulator.enabled })}
            >
              <span class="mod-dot" aria-hidden="true"></span>
              {modulator.enabled ? 'On' : 'Off'}
            </button>
            <span class="mod-name">{kindLabel(modulator.kind)}</span>
            <span class="mod-summary" title={targetLabel(modulator)}>
              {targetLabel(modulator)}
            </span>
            <span class="mod-index text-mono">{index + 1}</span>
            <span class="mod-actions">
              <IconButton
                label="Move modulator up"
                icon="chevron-up"
                tooltip="Move modulator up"
                disabled={index === 0}
                onActivate={() => session.moveAnimationModulator(modulator.id, -1)}
              />
              <IconButton
                label="Move modulator down"
                icon="chevron-down"
                tooltip="Move modulator down"
                disabled={index === modulators.length - 1}
                onActivate={() => session.moveAnimationModulator(modulator.id, 1)}
              />
              <IconButton
                label="Remove modulator"
                icon="trash"
                tooltip="Remove modulator"
                onActivate={() =>
                  session.removeAnimationModulator(modulator.id)}
              />
            </span>
          </div>

          <div class="mod-controls">
            <label class="mod-field">
              <span>Target</span>
              <select
                value={targetValue(modulator)}
                aria-label="Modulator target"
                onchange={(event) =>
                  changeTarget(modulator, event.currentTarget.value)}
              >
                {#each targetOptions(modulator) as target (target.value)}
                  <option value={target.value}>{target.label}</option>
                {/each}
              </select>
            </label>

            {#if modulator.kind !== 'orbit'}
              <div class="mod-field-row">
                <label class="mod-field">
                  <span>Property</span>
                  <select
                    value={modulator.property}
                    aria-label="Modulator property"
                    onchange={(event) =>
                      update(modulator, {
                        property: event.currentTarget.value as ModulatorProperty
                      })}
                  >
                    {#each propertyOptions(modulator.targetKind) as property (property.value)}
                      <option value={property.value}>{property.label}</option>
                    {/each}
                  </select>
                </label>
                {#if isVectorProperty(modulator.property)}
                  <label class="mod-field mod-axis-field">
                    <span>Axis</span>
                    <select
                      value={modulator.axis}
                      aria-label="Modulator axis"
                      onchange={(event) =>
                        update(modulator, {
                          axis: event.currentTarget.value as ModulatorAxis
                        })}
                    >
                      <option value="x">X</option>
                      <option value="y">Y</option>
                      <option value="z">Z</option>
                    </select>
                  </label>
                {/if}
              </div>
            {/if}
          </div>

          {#if modulator.kind === 'lfo'}
            <div class="mod-field-row">
              <label class="mod-field">
                <span>Wave</span>
                <select
                  value={modulator.waveform}
                  aria-label="LFO waveform"
                  onchange={(event) =>
                    update(modulator, {
                      waveform: event.currentTarget.value as ModulatorWaveform
                    })}
                >
                  <option value="sine">Sine</option>
                  <option value="triangle">Triangle</option>
                  <option value="square">Square</option>
                  <option value="saw">Saw</option>
                </select>
              </label>
              <label class="mod-field">
                <span>Sync</span>
                <select
                  value={modulator.sync}
                  aria-label="LFO rate sync"
                  onchange={(event) =>
                    update(modulator, {
                      sync: event.currentTarget.value === 'bpm' ? 'bpm' : 'hz'
                    })}
                >
                  <option value="hz">Hz</option>
                  <option value="bpm">BPM</option>
                </select>
              </label>
            </div>
            <div class="mod-number-grid">
              <label class="mod-number">
                <span>{modulator.sync === 'bpm' ? 'Rate (beats/cycle)' : 'Rate (Hz)'}</span>
                <NumberField
                  label="LFO rate"
                  value={modulator.rate}
                  step={0.05}
                  precision={3}
                  min={0.001}
                  framed
                  onCommit={(value) => update(modulator, { rate: value })}
                />
              </label>
              {#if modulator.sync === 'bpm'}
                <label class="mod-number">
                  <span>BPM</span>
                  <NumberField
                    label="LFO BPM"
                    value={modulator.bpm}
                    step={1}
                    precision={0}
                    min={1}
                    max={400}
                    framed
                    onCommit={(value) => update(modulator, { bpm: value })}
                  />
                </label>
              {/if}
              <label class="mod-number">
                <span>{amplitudeLabel(modulator)}</span>
                <NumberField
                  label="LFO amplitude"
                  value={modulator.amplitude}
                  step={0.05}
                  precision={3}
                  framed
                  onCommit={(value) => update(modulator, { amplitude: value })}
                />
              </label>
              <label class="mod-number">
                <span>{offsetLabel(modulator)}</span>
                <NumberField
                  label="LFO offset"
                  value={modulator.offset}
                  step={0.05}
                  precision={3}
                  framed
                  onCommit={(value) => update(modulator, { offset: value })}
                />
              </label>
              <label class="mod-number">
                <span>Phase (cycles)</span>
                <NumberField
                  label="LFO phase"
                  value={modulator.phase}
                  step={0.05}
                  precision={2}
                  framed
                  onCommit={(value) => update(modulator, { phase: value })}
                />
              </label>
            </div>
          {:else if modulator.kind === 'noise'}
            <div class="mod-number-grid">
              <label class="mod-number">
                <span>Frequency (Hz)</span>
                <NumberField
                  label="Noise frequency"
                  value={modulator.frequency}
                  step={0.05}
                  precision={2}
                  min={0.001}
                  framed
                  onCommit={(value) => update(modulator, { frequency: value })}
                />
              </label>
              <label class="mod-number">
                <span>Seed</span>
                <NumberField
                  label="Noise seed"
                  value={modulator.seed}
                  step={1}
                  precision={0}
                  framed
                  onCommit={(value) => update(modulator, { seed: value })}
                />
              </label>
              <label class="mod-number">
                <span>{amplitudeLabel(modulator)}</span>
                <NumberField
                  label="Noise amplitude"
                  value={modulator.amplitude}
                  step={0.05}
                  precision={3}
                  framed
                  onCommit={(value) => update(modulator, { amplitude: value })}
                />
              </label>
              <label class="mod-number">
                <span>{offsetLabel(modulator)}</span>
                <NumberField
                  label="Noise offset"
                  value={modulator.offset}
                  step={0.05}
                  precision={3}
                  framed
                  onCommit={(value) => update(modulator, { offset: value })}
                />
              </label>
            </div>
          {:else if modulator.kind === 'audio-envelope'}
            <label class="mod-field">
              <span>Audio asset</span>
              <select
                value={modulator.audioAssetId}
                aria-label="Envelope audio asset"
                onchange={(event) =>
                  update(modulator, {
                    audioAssetId: event.currentTarget.value
                  })}
              >
                {#each audioOptions as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>
            <div class="mod-number-grid">
              <label class="mod-number">
                <span>Gain</span>
                <NumberField
                  label="Envelope gain"
                  value={modulator.gain}
                  step={0.05}
                  precision={2}
                  min={0}
                  framed
                  onCommit={(value) => update(modulator, { gain: value })}
                />
              </label>
              <label class="mod-number">
                <span>Attack (s)</span>
                <NumberField
                  label="Envelope attack"
                  value={modulator.attack}
                  step={0.01}
                  precision={2}
                  min={0.001}
                  framed
                  onCommit={(value) => update(modulator, { attack: value })}
                />
              </label>
              <label class="mod-number">
                <span>Release (s)</span>
                <NumberField
                  label="Envelope release"
                  value={modulator.release}
                  step={0.01}
                  precision={2}
                  min={0.001}
                  framed
                  onCommit={(value) => update(modulator, { release: value })}
                />
              </label>
              <label class="mod-number">
                <span>{amplitudeLabel(modulator)}</span>
                <NumberField
                  label="Envelope amplitude"
                  value={modulator.amplitude}
                  step={0.05}
                  precision={3}
                  framed
                  onCommit={(value) => update(modulator, { amplitude: value })}
                />
              </label>
              <label class="mod-number">
                <span>{offsetLabel(modulator)}</span>
                <NumberField
                  label="Envelope offset"
                  value={modulator.offset}
                  step={0.05}
                  precision={3}
                  framed
                  onCommit={(value) => update(modulator, { offset: value })}
                />
              </label>
            </div>
          {:else if modulator.kind === 'orbit'}
            <div class="mod-number-grid">
              <label class="mod-number">
                <span>Pivot X</span>
                <NumberField
                  label="Orbit pivot X"
                  value={modulator.pivot[0]}
                  step={0.1}
                  precision={2}
                  framed
                  onCommit={(value) =>
                    update(modulator, {
                      pivot: [value, modulator.pivot[1], modulator.pivot[2]]
                    })}
                />
              </label>
              <label class="mod-number">
                <span>Pivot Y</span>
                <NumberField
                  label="Orbit pivot Y"
                  value={modulator.pivot[1]}
                  step={0.1}
                  precision={2}
                  framed
                  onCommit={(value) =>
                    update(modulator, {
                      pivot: [modulator.pivot[0], value, modulator.pivot[2]]
                    })}
                />
              </label>
              <label class="mod-number">
                <span>Pivot Z</span>
                <NumberField
                  label="Orbit pivot Z"
                  value={modulator.pivot[2]}
                  step={0.1}
                  precision={2}
                  framed
                  onCommit={(value) =>
                    update(modulator, {
                      pivot: [modulator.pivot[0], modulator.pivot[1], value]
                    })}
                />
              </label>
              <label class="mod-number">
                <span>Radius (units)</span>
                <NumberField
                  label="Orbit radius"
                  value={modulator.radius}
                  step={0.1}
                  precision={2}
                  min={0}
                  framed
                  onCommit={(value) => update(modulator, { radius: value })}
                />
              </label>
              <label class="mod-number">
                <span>Height (units)</span>
                <NumberField
                  label="Orbit height"
                  value={modulator.height}
                  step={0.1}
                  precision={2}
                  framed
                  onCommit={(value) => update(modulator, { height: value })}
                />
              </label>
              <label class="mod-number">
                <span>Angular rate (Hz)</span>
                <NumberField
                  label="Orbit angular rate"
                  value={modulator.angularRate}
                  step={0.01}
                  precision={3}
                  framed
                  onCommit={(value) => update(modulator, { angularRate: value })}
                />
              </label>
              <label class="mod-number">
                <span>Phase (cycles)</span>
                <NumberField
                  label="Orbit phase"
                  value={modulator.phase}
                  step={0.05}
                  precision={2}
                  framed
                  onCommit={(value) => update(modulator, { phase: value })}
                />
              </label>
            </div>
            <p class="mod-hint">The camera looks at the pivot while orbiting.</p>
          {/if}

          {#if modulator.kind !== 'orbit'}
            <label class="mod-field">
              <span>Blend</span>
              <select
                value={modulator.blend}
                aria-label="Modulator blend"
                onchange={(event) =>
                  update(modulator, {
                    blend: event.currentTarget.value === 'replace'
                      ? 'replace'
                      : 'add'
                  })}
              >
                <option value="add">Add to keyed/rest value</option>
                <option value="replace">Replace keyed/rest value</option>
              </select>
            </label>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .modulators {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
    padding-bottom: var(--inspector-section-pad);
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .modulators-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .mod-list {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
  }

  .mod-card {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
    padding: var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
  }

  .mod-card.is-disabled {
    opacity: 0.7;
  }

  .mod-head {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: var(--space-1);
  }

  .mod-enabled {
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

  .mod-enabled.is-active {
    color: var(--accent-primary);
  }

  .mod-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .mod-name {
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    white-space: nowrap;
  }

  .mod-summary {
    overflow: hidden;
    flex: 1 1 auto;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mod-index {
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .mod-actions {
    display: flex;
    flex: 0 0 auto;
  }

  .mod-actions :global(.icon-button) {
    width: var(--control-h);
    height: var(--control-h);
  }

  .mod-controls {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
  }

  .mod-field-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 64px;
    gap: var(--space-1);
  }

  .mod-field,
  .mod-number {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: var(--field-label-gap);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .mod-field select {
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

  .mod-field select:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 1px;
  }

  .mod-number-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-1);
  }

  .mod-hint {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: 1.4;
  }
</style>
