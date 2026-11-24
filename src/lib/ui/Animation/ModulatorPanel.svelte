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
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionRow from '../Primitives/ActionRow.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import NumberField from '../Primitives/NumberField.svelte';
  import SelectField from '../Primitives/SelectField.svelte';
  import Switch from '../Primitives/Switch.svelte';

  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  const kinds: ReadonlyArray<{
    kind: AnimationModulatorKind;
    label: string;
    icon: 'sync' | 'checker' | 'volume' | 'rotate';
    hint: string;
  }> = [
    { kind: 'lfo', label: 'LFO', icon: 'sync', hint: 'Waves and BPM pulses' },
    { kind: 'noise', label: 'Noise', icon: 'checker', hint: 'Deterministic drift' },
    { kind: 'audio-envelope', label: 'Audio', icon: 'volume', hint: 'Follow peaks' },
    { kind: 'orbit', label: 'Orbit', icon: 'rotate', hint: 'Camera around a pivot' }
  ];

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
    return kinds.find((item) => item.kind === kind)?.label ?? 'Modulator';
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
  <div class="modulators-head">
    <span>Modulators</span>
    <span>{modulators.length} active</span>
  </div>
  <ActionRow>
    {#each kinds as item (item.kind)}
      <ActionButton
        label={item.label}
        icon={item.icon}
        onActivate={() =>
          session.addAnimationModulator(item.kind)}
      />
    {/each}
  </ActionRow>
  {#if modulators.length === 0}
    <p class="mod-hint">
      LFO for waves and BPM pulses, Noise for drift, Audio for envelope
      following, Orbit for a camera circle.
    </p>
  {:else}
    <div class="mod-list">
      {#each modulators as modulator (modulator.id)}
        <div class="mod-card" class:enabled={modulator.enabled}>
          <div class="mod-card-head">
            <div class="mod-title">
              <strong>{kindLabel(modulator.kind)}</strong>
              <span>{targetLabel(modulator)}</span>
            </div>
            <Switch
              label="Enabled"
              checked={modulator.enabled}
              onChange={(value) => update(modulator, { enabled: value })}
            />
            <IconButton
              label="Remove modulator"
              icon="trash"
              onActivate={() =>
                session.removeAnimationModulator(modulator.id)}
            />
          </div>

          <SelectField
            label="Target"
            value={targetValue(modulator)}
            options={targetOptions(modulator)}
            onChange={(value) => changeTarget(modulator, value)}
          />

          {#if modulator.kind !== 'orbit'}
            <div class="mod-grid">
              <SelectField
                label="Property"
                value={modulator.property}
                options={propertyOptions(modulator.targetKind)}
                onChange={(value) =>
                  update(modulator, {
                    property: value as ModulatorProperty
                  })}
              />
              {#if modulator.property === 'position' || modulator.property === 'rotation' || modulator.property === 'scale'}
                <SelectField
                  label="Axis"
                  value={modulator.axis}
                  options={[
                    { value: 'x', label: 'X' },
                    { value: 'y', label: 'Y' },
                    { value: 'z', label: 'Z' }
                  ]}
                  onChange={(value) =>
                    update(modulator, { axis: value as ModulatorAxis })}
                />
              {/if}
            </div>
          {/if}

          {#if modulator.kind === 'lfo'}
            <div class="mod-grid">
              <SelectField
                label="Wave"
                value={modulator.waveform}
                options={[
                  { value: 'sine', label: 'Sine' },
                  { value: 'triangle', label: 'Triangle' },
                  { value: 'square', label: 'Square' },
                  { value: 'saw', label: 'Saw' }
                ]}
                onChange={(value) =>
                  update(modulator, {
                    waveform: value as ModulatorWaveform
                  })}
              />
              <SelectField
                label="Sync"
                value={modulator.sync}
                options={[
                  { value: 'hz', label: 'Hz' },
                  { value: 'bpm', label: 'BPM' }
                ]}
                onChange={(value) =>
                  update(modulator, {
                    sync: value === 'bpm' ? 'bpm' : 'hz'
                  })}
              />
              <NumberField
                label="Rate"
                value={modulator.rate}
                step={0.05}
                precision={2}
                min={0.001}
                onCommit={(value) => update(modulator, { rate: value })}
              />
              {#if modulator.sync === 'bpm'}
                <NumberField
                  label="BPM"
                  value={modulator.bpm}
                  step={1}
                  precision={0}
                  min={1}
                  max={400}
                  onCommit={(value) => update(modulator, { bpm: value })}
                />
              {/if}
              <NumberField
                label="Amplitude"
                value={modulator.amplitude}
                step={0.05}
                precision={3}
                onCommit={(value) => update(modulator, { amplitude: value })}
              />
              <NumberField
                label="Offset"
                value={modulator.offset}
                step={0.05}
                precision={3}
                onCommit={(value) => update(modulator, { offset: value })}
              />
              <NumberField
                label="Phase"
                value={modulator.phase}
                step={0.05}
                precision={2}
                onCommit={(value) => update(modulator, { phase: value })}
              />
            </div>
          {:else if modulator.kind === 'noise'}
            <div class="mod-grid">
              <NumberField
                label="Frequency"
                value={modulator.frequency}
                step={0.05}
                precision={2}
                min={0.001}
                onCommit={(value) => update(modulator, { frequency: value })}
              />
              <NumberField
                label="Seed"
                value={modulator.seed}
                step={1}
                precision={0}
                onCommit={(value) => update(modulator, { seed: value })}
              />
              <NumberField
                label="Amplitude"
                value={modulator.amplitude}
                step={0.05}
                precision={3}
                onCommit={(value) => update(modulator, { amplitude: value })}
              />
              <NumberField
                label="Offset"
                value={modulator.offset}
                step={0.05}
                precision={3}
                onCommit={(value) => update(modulator, { offset: value })}
              />
            </div>
          {:else if modulator.kind === 'audio-envelope'}
            <SelectField
              label="Audio"
              value={modulator.audioAssetId}
              options={audioOptions}
              onChange={(value) =>
                update(modulator, { audioAssetId: value })}
            />
            <div class="mod-grid">
              <NumberField
                label="Gain"
                value={modulator.gain}
                step={0.05}
                precision={2}
                min={0}
                onCommit={(value) => update(modulator, { gain: value })}
              />
              <NumberField
                label="Attack"
                value={modulator.attack}
                step={0.01}
                precision={2}
                min={0.001}
                onCommit={(value) => update(modulator, { attack: value })}
              />
              <NumberField
                label="Release"
                value={modulator.release}
                step={0.01}
                precision={2}
                min={0.001}
                onCommit={(value) => update(modulator, { release: value })}
              />
              <NumberField
                label="Amplitude"
                value={modulator.amplitude}
                step={0.05}
                precision={3}
                onCommit={(value) => update(modulator, { amplitude: value })}
              />
              <NumberField
                label="Offset"
                value={modulator.offset}
                step={0.05}
                precision={3}
                onCommit={(value) => update(modulator, { offset: value })}
              />
            </div>
          {:else if modulator.kind === 'orbit'}
            <p class="mod-hint">
              Camera position follows the pivot circle and looks at the pivot.
            </p>
            <div class="mod-grid">
              <NumberField
                label="Pivot X"
                value={modulator.pivot[0]}
                step={0.1}
                precision={2}
                onCommit={(value) =>
                  update(modulator, {
                    pivot: [value, modulator.pivot[1], modulator.pivot[2]]
                  })}
              />
              <NumberField
                label="Pivot Y"
                value={modulator.pivot[1]}
                step={0.1}
                precision={2}
                onCommit={(value) =>
                  update(modulator, {
                    pivot: [modulator.pivot[0], value, modulator.pivot[2]]
                  })}
              />
              <NumberField
                label="Pivot Z"
                value={modulator.pivot[2]}
                step={0.1}
                precision={2}
                onCommit={(value) =>
                  update(modulator, {
                    pivot: [modulator.pivot[0], modulator.pivot[1], value]
                  })}
              />
              <NumberField
                label="Radius"
                value={modulator.radius}
                step={0.1}
                precision={2}
                min={0}
                onCommit={(value) => update(modulator, { radius: value })}
              />
              <NumberField
                label="Height"
                value={modulator.height}
                step={0.1}
                precision={2}
                onCommit={(value) => update(modulator, { height: value })}
              />
              <NumberField
                label="Angular rate"
                value={modulator.angularRate}
                step={0.01}
                precision={3}
                onCommit={(value) => update(modulator, { angularRate: value })}
              />
              <NumberField
                label="Phase"
                value={modulator.phase}
                step={0.05}
                precision={2}
                onCommit={(value) => update(modulator, { phase: value })}
              />
            </div>
          {/if}

          {#if modulator.kind !== 'orbit'}
            <SelectField
              label="Blend"
              value={modulator.blend}
              options={[
                { value: 'add', label: 'Add to keyed/rest value' },
                { value: 'replace', label: 'Replace value' }
              ]}
              onChange={(value) =>
                update(modulator, {
                  blend: value === 'replace' ? 'replace' : 'add'
                })}
            />
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
    gap: var(--space-2);
    padding-bottom: var(--space-2);
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .modulators-head,
  .mod-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .modulators-head {
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .mod-title {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1px;
  }

  .mod-title strong {
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
  }

  .mod-title span {
    overflow: hidden;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mod-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .mod-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    opacity: 0.65;
  }

  .mod-card.enabled {
    opacity: 1;
    border-color: var(--border-strong);
  }

  .mod-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .mod-hint {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: 1.4;
  }
</style>
