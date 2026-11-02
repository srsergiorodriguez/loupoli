<script lang="ts">
  import Icon from '../Icons/Icon.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import Switch from '../Primitives/Switch.svelte';
  import Vector3Field from '../Primitives/Vector3Field.svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import {
    GRID_SNAP_STEPS,
    type AxisLock,
    type ModifierPatch
  } from '../../editor/types';
  import {
    MODIFIER_KINDS,
    MODIFIER_LABELS,
    type ModifierAxis,
    type ModifierKind
  } from '../../geometry/modifiers';
  import {
    PRIMITIVE_KINDS,
    PRIMITIVE_LABELS,
    type PrimitiveKind
  } from '../../geometry/primitives';

  /** Session projection used by the object and viewport inspector. */
  interface Props {
    session: EditorSession;
  }

  let { session }: Props = $props();

  const counts = $derived(
    session.snapshot.modifiersActive
      ? session.snapshot.evaluatedCounts
      : session.snapshot.counts
  );
  const selectedElements = $derived(session.snapshot.selectedElements);
  const selectionCount = $derived(selectedElements.length);
  const primarySelection = $derived(
    selectedElements.length > 0 ? selectedElements[0] : null
  );
  const selectedPosition = $derived(session.snapshot.selectedPosition);
  const activeTransform = $derived(session.snapshot.activeTransform);
  const nodes = $derived(session.snapshot.nodes);
  const selectedNodeIds = $derived(session.snapshot.selectedNodeIds);
  const activeNodeId = $derived(session.snapshot.activeNodeId);
  const activeGroupId = $derived(session.snapshot.activeGroupId);
  const groups = $derived(session.snapshot.groups);
  const modifiers = $derived(session.snapshot.modifiers);
  const modifiersActive = $derived(session.snapshot.modifiersActive);
  const modifierError = $derived(session.snapshot.modifierError);
  const boundaryEdges = $derived(session.snapshot.boundaryEdges);
  const modeLabel = $derived(
    session.snapshot.selectionMode === 'vertex'
      ? 'Vertex'
      : session.snapshot.selectionMode === 'edge'
        ? 'Edge'
        : 'Face'
  );
  const modePlural = $derived(
    session.snapshot.selectionMode === 'vertex'
      ? 'vertices'
      : session.snapshot.selectionMode === 'edge'
        ? 'edges'
        : 'faces'
  );

  let primitive = $state<PrimitiveKind>('quadsphere');
  let modifierKind = $state<ModifierKind>('mirror');

  function addPrimitive(): void {
    session.createPrimitive(primitive);
  }

  function deleteObject(): void {
    session.deleteActiveNode();
  }

  function rotationDegrees(): [number, number, number] {
    if (!activeTransform) {
      return [0, 0, 0];
    }
    const factor = 180 / Math.PI;
    return [
      activeTransform.rotation[0] * factor,
      activeTransform.rotation[1] * factor,
      activeTransform.rotation[2] * factor
    ];
  }

  function commitPosition(position: [number, number, number]): void {
    if (!activeTransform) {
      return;
    }
    session.setActiveTransform({ ...activeTransform, position });
  }

  function commitRotation(degrees: [number, number, number]): void {
    if (!activeTransform) {
      return;
    }
    const factor = Math.PI / 180;
    session.setActiveTransform({
      ...activeTransform,
      rotation: [
        degrees[0] * factor,
        degrees[1] * factor,
        degrees[2] * factor
      ]
    });
  }

  function commitScale(scale: [number, number, number]): void {
    if (!activeTransform) {
      return;
    }
    session.setActiveTransform({ ...activeTransform, scale });
  }

  function updateModifierAxis(modifierId: string, event: Event): void {
    const axis = (event.currentTarget as HTMLSelectElement)
      .value as ModifierAxis;
    session.updateModifier(modifierId, { axis });
  }

  function updateModifierNumber(
    modifierId: string,
    key: 'countX' | 'countY' | 'spacingX' | 'spacingY' | 'count',
    event: Event
  ): void {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(value)) {
      return;
    }
    session.updateModifier(modifierId, {
      [key]: value
    } as ModifierPatch);
  }

  function setSnapStep(event: Event): void {
    const value = Number((event.currentTarget as HTMLSelectElement).value);
    session.setSnapStep(value);
  }

  function toggleAxis(axis: Exclude<AxisLock, null>): void {
    session.setAxisLock(
      session.snapshot.axisLock === axis ? null : axis
    );
  }

  function formatCoordinate(value: number): string {
    const text = Math.abs(value) < 0.0005 ? '0.000' : value.toFixed(3);
    return text;
  }

  function close(): void {
    session.closeInspector();
  }
</script>

<aside
  id="inspector-panel"
  class="inspector loupoli-panel"
  data-open={session.inspectorOpen}
  aria-label="Inspector"
>
  <header class="panel-head">
    <div>
      <h2 class="section-label">Inspector</h2>
      <p class="panel-title">{session.snapshot.objectName}</p>
    </div>
    <span class="close-button">
      <IconButton label="Close inspector" icon="close" onActivate={close} />
    </span>
  </header>

  <div class="panel-body">
    <section class="section" aria-labelledby="scene-heading">
      <div class="section-head">
        <h2 id="scene-heading" class="section-label">Scene</h2>
        <span class="section-meta">
          {nodes.length} {nodes.length === 1 ? 'object' : 'objects'}
          {#if selectedNodeIds.length > 1}
            · {selectedNodeIds.length} selected
          {/if}
        </span>
      </div>

      <div class="object-list">
        {#each groups as group (group.id)}
          <button
            type="button"
            class="object-row group-row"
            class:active={group.id === activeGroupId}
            aria-current={group.id === activeGroupId ? 'true' : undefined}
            onclick={() => session.selectGroup(group.id)}
          >
            <span class="object-glyph"><Icon name="folder" size={14} /></span>
            <span class="object-name">{group.name}</span>
            <span class="object-kind">
              {nodes.filter((node) => node.parentId === group.id).length} objects
            </span>
          </button>
          {#each nodes.filter((node) => node.parentId === group.id) as node (node.id)}
            {@render objectRow(node, true)}
          {/each}
        {/each}
        {#each nodes.filter((node) => node.parentId === null) as node (node.id)}
          {@render objectRow(node, false)}
        {/each}
      </div>

      {#snippet objectRow(node: (typeof nodes)[number], child: boolean)}
        <button
          type="button"
          class="object-row"
          class:active={node.id === activeNodeId}
          class:selected={selectedNodeIds.includes(node.id)}
          class:child
          aria-pressed={selectedNodeIds.includes(node.id)}
          aria-current={node.id === activeNodeId ? 'true' : undefined}
          onclick={(event) =>
            session.selectNode(
              node.id,
              event.shiftKey || event.metaKey || event.ctrlKey
            )}
        >
          <span class="object-glyph"><Icon name="solid" size={14} /></span>
          <span class="object-name">{node.name}</span>
          <span class="object-kind">
            {node.primitive === 'quadsphere'
              ? 'Sphere'
              : node.primitive === 'cylinder'
                ? 'Cylinder'
                : 'Grid'}
          </span>
        </button>
      {/snippet}

      {#if nodes.length > 0}
        <button
          type="button"
          class="object-add-toggle"
          class:is-active={session.snapshot.additiveNodeSelection}
          aria-pressed={session.snapshot.additiveNodeSelection}
          onclick={() =>
            session.setAdditiveNodeSelection(
              !session.snapshot.additiveNodeSelection
            )}
        >
          <Icon name="plus" size={13} />
          <span>
            {session.snapshot.additiveNodeSelection
              ? 'Adding to selection'
              : 'Multi-select objects'}
          </span>
        </button>
      {/if}

      <div class="scene-actions">
        <select
          class="primitive-select"
          bind:value={primitive}
          aria-label="Primitive type"
        >
          {#each PRIMITIVE_KINDS as kind (kind)}
            <option value={kind}>{PRIMITIVE_LABELS[kind]}</option>
          {/each}
        </select>
        <button type="button" class="scene-button" onclick={addPrimitive}>
          <Icon name="plus" size={14} />
          <span>Add</span>
        </button>
      </div>

      {#if selectedNodeIds.length > 0 && activeGroupId === null}
        <button
          type="button"
          class="join-button group-button"
          onclick={() => session.groupSelectedNodes()}
        >
          <Icon name="folder" size={14} />
          <span>Group selected objects</span>
        </button>
      {/if}

      {#if selectedNodeIds.length > 1 && activeGroupId === null}
        <button
          type="button"
          class="join-button"
          onclick={() => session.joinSelectedNodes()}
        >
          <Icon name="merge" size={14} />
          <span>Join selected objects</span>
        </button>
      {/if}

      {#if activeGroupId !== null}
        <button
          type="button"
          class="join-button"
          onclick={() => session.ungroupActiveGroup()}
        >
          <Icon name="folder" size={14} />
          <span>Ungroup active group</span>
        </button>
      {:else if nodes.length > 0}
        <button
          type="button"
          class="delete-button"
          onclick={deleteObject}
        >
          <Icon name="trash" size={14} />
          <span>Delete active object</span>
        </button>
      {/if}
    </section>

    <section class="section" aria-labelledby="transform-heading">
      <div class="section-head">
        <h2 id="transform-heading" class="section-label">Transform</h2>
        <span class="section-meta">Local</span>
      </div>
      {#if activeTransform}
        <div class="transform-stack">
          <Vector3Field
            label="Position"
            values={activeTransform.position}
            step={0.1}
            precision={3}
            onCommit={commitPosition}
          />
          <Vector3Field
            label="Rotation"
            values={rotationDegrees()}
            step={1}
            precision={1}
            unit="°"
            onCommit={commitRotation}
          />
          <Vector3Field
            label="Scale"
            values={activeTransform.scale}
            step={0.05}
            precision={3}
            min={0.001}
            onCommit={commitScale}
          />
        </div>
        <div class="snap-line">
          <button
            type="button"
            class="snap-toggle"
            class:is-active={session.snapshot.snapEnabled}
            aria-pressed={session.snapshot.snapEnabled}
            onclick={() =>
              session.setSnapEnabled(!session.snapshot.snapEnabled)}
          >
            <span class="snap-dot" aria-hidden="true"></span>
            <span>Grid snap</span>
          </button>
          <select
            class="snap-step"
            aria-label="Grid snap step"
            value={String(session.snapshot.snapStep)}
            onchange={setSnapStep}
          >
            {#each GRID_SNAP_STEPS as step (step)}
              <option value={String(step)}>{step}</option>
            {/each}
          </select>
        </div>
      {:else}
        <p class="empty-state">No active object to transform.</p>
      {/if}
    </section>

    {#if activeGroupId === null}
      <section class="section" aria-labelledby="modifiers-heading">
        <div class="section-head">
          <h2 id="modifiers-heading" class="section-label">Modifiers</h2>
          <span class="section-meta">
            {#if activeNodeId === null}
              No object
            {:else if modifiers.length === 0}
              None
            {:else if modifiersActive}
              Evaluated
            {:else}
              Disabled
            {/if}
          </span>
        </div>

        {#if activeNodeId === null}
          <p class="empty-state">Select a mesh object to edit its stack.</p>
        {:else}
          <div class="modifier-add-row">
            <select
              class="modifier-select"
              bind:value={modifierKind}
              aria-label="Modifier type"
            >
              {#each MODIFIER_KINDS as kind (kind)}
                <option value={kind}>{MODIFIER_LABELS[kind]}</option>
              {/each}
            </select>
            <button
              type="button"
              class="scene-button"
              onclick={() => session.addModifier(modifierKind)}
            >
              <Icon name="plus" size={14} />
              <span>Add</span>
            </button>
          </div>

          {#if modifierError}
            <p class="modifier-error">{modifierError}</p>
          {/if}

          {#if modifiers.length === 0}
            <p class="hint">
              Non-destructive Mirror, Grid Array, and Radial Array evaluation.
            </p>
          {:else}
            <div class="modifier-list">
              {#each modifiers as modifier, index (modifier.id)}
                <div
                  class="modifier-card"
                  class:is-disabled={!modifier.enabled}
                >
                  <div class="modifier-head">
                    <button
                      type="button"
                      class="modifier-enabled"
                      class:is-active={modifier.enabled}
                      aria-pressed={modifier.enabled}
                      onclick={() => session.toggleModifier(modifier.id)}
                    >
                      <span class="modifier-dot" aria-hidden="true"></span>
                      {modifier.enabled ? 'On' : 'Off'}
                    </button>
                    <span class="modifier-name">
                      {MODIFIER_LABELS[modifier.type]}
                    </span>
                    <span class="modifier-index text-mono">
                      {index + 1}
                    </span>
                    <span class="modifier-actions">
                      <IconButton
                        label="Move modifier up"
                        icon="chevron-up"
                        disabled={index === 0}
                        onActivate={() => session.moveModifier(modifier.id, -1)}
                      />
                      <IconButton
                        label="Move modifier down"
                        icon="chevron-down"
                        disabled={index === modifiers.length - 1}
                        onActivate={() => session.moveModifier(modifier.id, 1)}
                      />
                      <IconButton
                        label="Remove modifier"
                        icon="trash"
                        onActivate={() => session.removeModifier(modifier.id)}
                      />
                    </span>
                  </div>

                  <div class="modifier-controls">
                    {#if modifier.type === 'mirror'}
                      <label class="modifier-field">
                        <span>Axis</span>
                        <select
                          value={modifier.axis}
                          aria-label="Mirror axis"
                          onchange={(event) =>
                            updateModifierAxis(modifier.id, event)}
                        >
                          <option value="x">X</option>
                          <option value="y">Y</option>
                          <option value="z">Z</option>
                        </select>
                      </label>
                    {:else if modifier.type === 'grid-array'}
                      <label class="modifier-field">
                        <span>X count</span>
                        <input
                          type="number"
                          min="1"
                          max="64"
                          step="1"
                          value={modifier.countX}
                          onchange={(event) =>
                            updateModifierNumber(
                              modifier.id,
                              'countX',
                              event
                            )}
                        />
                      </label>
                      <label class="modifier-field">
                        <span>Y count</span>
                        <input
                          type="number"
                          min="1"
                          max="64"
                          step="1"
                          value={modifier.countY}
                          onchange={(event) =>
                            updateModifierNumber(
                              modifier.id,
                              'countY',
                              event
                            )}
                        />
                      </label>
                      <label class="modifier-field">
                        <span>X spacing</span>
                        <input
                          type="number"
                          step="0.1"
                          value={modifier.spacingX}
                          onchange={(event) =>
                            updateModifierNumber(
                              modifier.id,
                              'spacingX',
                              event
                            )}
                        />
                      </label>
                      <label class="modifier-field">
                        <span>Y spacing</span>
                        <input
                          type="number"
                          step="0.1"
                          value={modifier.spacingY}
                          onchange={(event) =>
                            updateModifierNumber(
                              modifier.id,
                              'spacingY',
                              event
                            )}
                        />
                      </label>
                    {:else}
                      <label class="modifier-field">
                        <span>Axis</span>
                        <select
                          value={modifier.axis}
                          aria-label="Radial axis"
                          onchange={(event) =>
                            updateModifierAxis(modifier.id, event)}
                        >
                          <option value="x">X</option>
                          <option value="y">Y</option>
                          <option value="z">Z</option>
                        </select>
                      </label>
                      <label class="modifier-field">
                        <span>Count</span>
                        <input
                          type="number"
                          min="1"
                          max="128"
                          step="1"
                          value={modifier.count}
                          onchange={(event) =>
                            updateModifierNumber(
                              modifier.id,
                              'count',
                              event
                            )}
                        />
                      </label>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          {#if modifiersActive}
            <p class="hint">
              Modifiers are non-destructive. Picking maps through provenance to
              base elements; disable all modifiers to edit the source mesh.
            </p>
          {/if}
        {/if}
      </section>
    {/if}

    <section class="section" aria-labelledby="stats-heading">
      <div class="section-head">
        <h2 id="stats-heading" class="section-label">Mesh</h2>
        <span class="section-meta">
          {#if activeGroupId !== null}
            Group · {nodes.filter((node) => node.parentId === activeGroupId).length} objects
          {:else if activeNodeId === null}
            No object
          {:else if modifiersActive}
            Evaluated
          {:else if boundaryEdges === 0}
            Closed manifold
          {:else}
            {boundaryEdges} boundary edges
          {/if}
        </span>
      </div>
      {#if activeGroupId !== null}
        <p class="empty-state">
          Group transform only. Select a child object to edit its mesh.
        </p>
      {:else}
      <dl class="stats">
        <div>
          <dt>Vertices</dt>
          <dd class="text-mono">{counts.vertices}</dd>
        </div>
        <div>
          <dt>Edges</dt>
          <dd class="text-mono">{counts.edges}</dd>
        </div>
        <div>
          <dt>Faces</dt>
          <dd class="text-mono">{counts.faces}</dd>
        </div>
        <div>
          <dt>Triangles</dt>
          <dd class="text-mono">{counts.triangles}</dd>
        </div>
      </dl>
      {/if}
    </section>

    <section class="section" aria-labelledby="selection-heading">
      <div class="section-head">
        <h2 id="selection-heading" class="section-label">Selection</h2>
        <span class="section-meta">
          {selectionCount > 0 ? `${selectionCount} selected` : modeLabel}
        </span>
      </div>
      {#if activeGroupId !== null}
        <p class="selection-title">Group selected</p>
        <p class="hint">
          Move, rotate, or scale the group in the Inspector or with the object
          gizmo. Select a child object above to edit its mesh.
        </p>
      {:else if modifiersActive}
        <p class="selection-title">
          {selectionCount > 0 ? `${selectionCount} ${modePlural} selected` : 'Modifiers active'}
        </p>
        <p class="hint">
          Picking is mapped back to base elements, and every evaluated copy is
          highlighted. Disable modifiers to edit the source topology.
        </p>
      {:else if activeNodeId === null}
        <p class="empty-state">
          The scene is empty. Add a QuadSphere, Cylinder, or Grid above.
        </p>
      {:else if session.snapshot.selectionMode === 'vertex' && selectionCount === 1 && selectedPosition}
        <p class="selection-title">
          Vertex <span class="text-mono">{primarySelection! + 1}</span>
        </p>
        <div class="coordinates" aria-label="Selected vertex position in object space">
          <div class="coordinate coordinate--x">
            <span class="axis-label">X</span>
            <span class="text-mono value">{formatCoordinate(selectedPosition[0])}</span>
          </div>
          <div class="coordinate coordinate--y">
            <span class="axis-label">Y</span>
            <span class="text-mono value">{formatCoordinate(selectedPosition[1])}</span>
          </div>
          <div class="coordinate coordinate--z">
            <span class="axis-label">Z</span>
            <span class="text-mono value">{formatCoordinate(selectedPosition[2])}</span>
          </div>
        </div>
        <div class="axis-lock" role="group" aria-label="Vertex move axis lock">
          <span class="axis-lock-label">Move axis</span>
          {#each ['x', 'y', 'z'] as const as axis (axis)}
            <button
              type="button"
              class="axis-chip axis-chip--{axis}"
              class:is-active={session.snapshot.axisLock === axis}
              aria-pressed={session.snapshot.axisLock === axis}
              onclick={() => toggleAxis(axis)}
            >
              {axis.toUpperCase()}
            </button>
          {/each}
        </div>
        <p class="hint">
          Drag the selected handle in the viewport. Axis chips or the X/Y/Z keys
          constrain the move; Grid snap rounds committed coordinates.
        </p>
      {:else if selectionCount === 1}
        <p class="selection-title">
          {modeLabel} <span class="text-mono">{primarySelection! + 1}</span>
        </p>
        <p class="hint">
          {session.snapshot.selectionMode === 'edge'
            ? 'The selected topological edge is highlighted in the viewport.'
            : 'The selected face is highlighted in the viewport.'}
        </p>
      {:else if selectionCount > 1}
        <p class="selection-title">
          <span class="text-mono">{selectionCount}</span>
          {modePlural} selected
        </p>
        <p class="hint">
          Every selected {modeLabel.toLowerCase()} is highlighted in the
          viewport. Use Add mode or Shift/Cmd-click to adjust the set.
        </p>
      {:else}
        <p class="empty-state">
          No {modeLabel.toLowerCase()} selected. Click an element in the
          viewport, or turn on Add to build a multi-selection.
        </p>
      {/if}

      {#if selectionCount > 0 && !modifiersActive}
        <div class="selection-actions">
          {#if session.snapshot.selectionMode === 'vertex' && selectionCount >= 2}
            <button
              type="button"
              class="topology-action"
              onclick={() => session.mergeSelectedVertices()}
            >
              <Icon name="merge" size={14} />
              <span>Merge selected vertices</span>
            </button>
          {/if}
          {#if session.snapshot.selectionMode === 'face' && selectionCount > 0}
            <button
              type="button"
              class="topology-action"
              onclick={() => session.extrudeSelectedFaces()}
            >
              <Icon name="extrude" size={14} />
              <span>Extrude selected faces</span>
            </button>
          {/if}
          {#if session.snapshot.selectionMode === 'face' && selectionCount === 1}
            <button
              type="button"
              class="topology-action"
              onclick={() => session.insetSelectedFace()}
            >
              <Icon name="inset" size={14} />
              <span>Inset face</span>
            </button>
          {/if}
          {#if session.snapshot.selectionMode === 'edge' && selectionCount === 2}
            <button
              type="button"
              class="topology-action"
              onclick={() => session.bridgeSelectedEdges()}
            >
              <Icon name="bridge" size={14} />
              <span>Bridge selected edges</span>
            </button>
          {/if}
          <button
            type="button"
            class="delete-selection"
            onclick={() => session.deleteSelection()}
          >
            <Icon name="trash" size={14} />
            <span>Delete selected {modePlural}</span>
          </button>
        </div>
      {/if}
    </section>

    <details class="section module-section">
      <summary class="module-summary">
        <span class="module-title">
          <span id="ps1-heading" class="section-label">PS1 look</span>
          <span class="section-meta">Render effect · Opt-in</span>
        </span>
        <span class="module-chevron" aria-hidden="true"></span>
      </summary>
      <div class="module-body">
        <Switch
          label="Vertex snapping"
          description="Snap vertices to a 320 × 240 grid for PS1 wobble."
          checked={session.snapshot.ps1Snap}
          onChange={(value) => session.setPs1Snap(value)}
        />
        <Switch
          label="PS1 affine"
          description="On: PS1 UV swim. Off: perspective-correct mapping."
          checked={session.snapshot.ps1Affine}
          onChange={(value) => session.setPs1Affine(value)}
        />
        <p class="hint">
          Unlit only. Both effects are off by default, so correct perspective
          mapping is the default view.
        </p>
      </div>
    </details>

    <section class="section section--last" aria-labelledby="controls-heading">
      <div class="section-head">
        <h2 id="controls-heading" class="section-label">Controls</h2>
      </div>
      <dl class="controls">
        <div>
          <dt>Pen</dt>
          <dd>
            {session.snapshot.selectionMode === 'vertex'
              ? 'Select and drag a vertex'
              : `Select an ${modeLabel.toLowerCase()}`}
          </dd>
        </div>
        <div>
          <dt>Touch</dt>
          <dd>1-finger tap select; drag orbit · 2-finger pinch/pan · 2/3-finger tap undo/redo</dd>
        </div>
        <div>
          <dt>Mouse</dt>
          <dd>Drag background/face, Alt, or MMB to orbit · Click to select · Shift+MMB pan · wheel zoom</dd>
        </div>
      </dl>
    </section>
  </div>
</aside>

<style>
  .inspector {
    position: fixed;
    z-index: var(--z-panel);
    top: calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2);
    right: calc(var(--safe-right) + var(--space-3));
    bottom: calc(var(--safe-bottom) + var(--status-h) + var(--space-3));
    display: flex;
    flex-direction: column;
    width: var(--inspector-w);
    overflow: hidden;
    border-radius: var(--radius-lg);
    pointer-events: auto;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 0 0 auto;
    padding: var(--space-3) var(--space-3) var(--space-2);
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .panel-title {
    margin: 2px 0 0;
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    line-height: var(--leading-tight);
  }

  .close-button {
    display: none;
  }

  .panel-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 var(--space-3);
  }

  .section {
    padding: var(--space-4) 0;
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .section--last {
    border-bottom: none;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .section-meta {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: 1;
    white-space: nowrap;
  }

  .object-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .object-row {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: var(--hit-min);
    gap: var(--space-2);
    padding: 0 var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .object-row:hover {
    background: var(--bg-hover);
  }

  .object-row.active {
    border-color: var(--border-strong);
    background: var(--bg-selected);
  }

  .object-row.active .object-glyph {
    color: var(--accent-primary);
    background: var(--bg-selected);
  }

  .object-row.selected {
    border-color: var(--accent-primary);
  }

  .object-row.child {
    padding-left: calc(var(--space-2) + 14px);
  }

  .object-row.group-row {
    color: var(--text-primary);
  }

  .object-row.group-row .object-glyph {
    color: var(--accent-primary);
  }

  .object-row.selected::after {
    content: '';
    width: 5px;
    height: 5px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--accent-primary);
  }

  .object-add-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: var(--hit-min);
    margin-top: var(--space-2);
    gap: 6px;
    border: var(--hairline) dashed var(--border-subtle);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-tertiary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .object-add-toggle:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .object-add-toggle.is-active {
    border-style: solid;
    border-color: var(--border-strong);
    color: var(--accent-primary);
    background: var(--bg-selected);
  }

  .scene-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .primitive-select,
  .scene-button,
  .join-button,
  .delete-button {
    min-height: var(--hit-min);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
  }

  .primitive-select {
    min-width: 0;
    padding: 0 var(--space-2);
  }

  .join-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin-top: var(--space-2);
    gap: 6px;
  }

  .group-button {
    color: var(--accent-primary);
  }

  .scene-button,
  .delete-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 var(--space-3);
    cursor: pointer;
  }

  .scene-button {
    color: var(--text-primary);
  }

  .scene-button:hover,
  .primitive-select:hover {
    background: var(--bg-hover);
  }

  .delete-button {
    width: 100%;
    margin-top: var(--space-1);
    color: var(--text-tertiary);
  }

  .delete-button:hover {
    color: var(--accent-warning);
    background: var(--bg-hover);
  }

  .object-glyph {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-xs);
    background: var(--bg-selected);
    color: var(--accent-primary);
  }

  .object-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .object-kind {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .transform-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    margin: 0;
    overflow: hidden;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--border-subtle);
  }

  .stats div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 8px 10px;
    background: var(--bg-input);
  }

  .stats dt {
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .stats dd {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--text-xs);
  }

  .selection-title {
    margin: 0 0 var(--space-2);
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .selection-title span {
    color: var(--text-primary);
  }

  .coordinates {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    overflow: hidden;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--border-subtle);
  }

  .coordinate {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    padding: 8px 8px;
    background: var(--bg-input);
  }

  .axis-label {
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    line-height: 1;
  }

  .coordinate--x .axis-label {
    color: var(--axis-x);
  }

  .coordinate--y .axis-label {
    color: var(--axis-y);
  }

  .coordinate--z .axis-label {
    color: var(--axis-z);
  }

  .value {
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--text-2xs);
    line-height: 1;
    text-overflow: ellipsis;
  }

  .snap-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 82px;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .snap-toggle,
  .snap-step {
    min-height: var(--hit-min);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-tertiary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
  }

  .snap-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    padding: 0 var(--space-2);
    cursor: pointer;
  }

  .snap-toggle.is-active {
    border-color: var(--border-strong);
    color: var(--accent-primary);
    background: var(--bg-selected);
  }

  .snap-dot {
    width: 7px;
    height: 7px;
    border: 1px solid currentColor;
    border-radius: 2px;
    background: transparent;
  }

  .snap-toggle.is-active .snap-dot {
    background: currentColor;
  }

  .snap-step {
    padding: 0 var(--space-1);
  }

  .axis-lock {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .axis-lock-label {
    flex: 1;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .axis-chip {
    width: var(--hit-min);
    height: var(--hit-min);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .axis-chip--x {
    color: var(--axis-x);
  }

  .axis-chip--y {
    color: var(--axis-y);
  }

  .axis-chip--z {
    color: var(--axis-z);
  }

  .axis-chip.is-active {
    border-color: currentColor;
    background: var(--bg-selected);
    box-shadow: inset 0 0 0 1px currentColor;
  }

  .modifier-add-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-1);
  }

  .modifier-select,
  .modifier-field select,
  .modifier-field input {
    min-height: var(--hit-min);
    min-width: 0;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
  }

  .modifier-select {
    padding: 0 var(--space-2);
  }

  .modifier-error {
    margin: var(--space-2) 0 0;
    padding: var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--accent-warning);
    font-size: var(--text-2xs);
    line-height: var(--leading-normal);
  }

  .modifier-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .modifier-card {
    padding: var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
  }

  .modifier-card.is-disabled {
    opacity: 0.7;
  }

  .modifier-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .modifier-enabled {
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

  .modifier-enabled.is-active {
    color: var(--accent-primary);
  }

  .modifier-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  .modifier-name {
    flex: 1;
    min-width: 0;
    color: var(--text-primary);
    font-size: var(--text-xs);
  }

  .modifier-index {
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .modifier-actions {
    display: flex;
    align-items: center;
  }

  .modifier-actions :global(.icon-button) {
    width: var(--control-h);
    height: var(--control-h);
  }

  .modifier-controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-1);
    margin-top: var(--space-1);
  }

  .modifier-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .modifier-field select,
  .modifier-field input {
    width: 100%;
    padding: 0 var(--space-2);
  }

  .selection-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .topology-action,
  .delete-selection {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: var(--hit-min);
    gap: 6px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-tertiary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .topology-action:hover {
    color: var(--accent-primary);
    background: var(--bg-hover);
  }

  .delete-selection {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: var(--hit-min);
    gap: 6px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-tertiary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .delete-selection:hover {
    color: var(--accent-warning);
    background: var(--bg-hover);
  }

  .empty-state,
  .hint {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-body);
  }

  .empty-state {
    padding: var(--space-3);
    border: 1px dashed var(--border-subtle);
    border-radius: var(--radius-md);
  }

  .hint {
    margin-top: var(--space-2);
  }

  .module-section {
    padding: 0;
  }

  .module-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: var(--hit-min);
    padding: var(--space-4) 0;
    list-style: none;
    cursor: pointer;
  }

  .module-summary::-webkit-details-marker {
    display: none;
  }

  .module-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 1;
    gap: var(--space-3);
  }

  .module-chevron {
    width: 7px;
    height: 7px;
    border-right: 1.5px solid var(--text-tertiary);
    border-bottom: 1.5px solid var(--text-tertiary);
    transform: rotate(45deg) translateY(-2px);
    transition: transform var(--motion-fast) var(--ease-out);
  }

  .module-section[open] .module-chevron {
    transform: rotate(225deg) translate(-2px, -1px);
  }

  .module-body {
    padding-bottom: var(--space-4);
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
  }

  .controls div {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    gap: var(--space-2);
  }

  .controls dt {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    line-height: var(--leading-body);
  }

  .controls dd {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-2xs);
    line-height: var(--leading-body);
  }

  @media (max-width: 899px) {
    .inspector {
      top: auto;
      right: calc(var(--safe-right) + var(--space-3));
      bottom: calc(var(--safe-bottom) + var(--status-h) + var(--space-3));
      left: calc(var(--safe-left) + var(--space-3));
      width: auto;
      max-height: min(55dvh, 560px);
      background: var(--bg-panel-strong);
      opacity: 0;
      visibility: hidden;
      transform: translateY(calc(100% + var(--space-6)));
      transition:
        transform var(--motion-panel) var(--ease-out),
        opacity var(--motion-panel) var(--ease-out),
        visibility 0s linear var(--motion-panel);
    }

    .inspector[data-open='true'] {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
      transition:
        transform var(--motion-panel) var(--ease-out),
        opacity var(--motion-panel) var(--ease-out),
        visibility 0s linear 0s;
    }

    .close-button {
      display: inline-flex;
    }

    .inspector .panel-body {
      padding-bottom: var(--safe-bottom);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .inspector {
      transition: none;
    }
  }
</style>
