<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Icon from '../Icons/Icon.svelte';
  import IconButton from '../Primitives/IconButton.svelte';
  import Switch from '../Primitives/Switch.svelte';
  import Vector3Field from '../Primitives/Vector3Field.svelte';
  import NumberField from '../Primitives/NumberField.svelte';
  import SliderField from '../Primitives/SliderField.svelte';
  import SelectField from '../Primitives/SelectField.svelte';
  import ColorField from '../Primitives/ColorField.svelte';
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionRow from '../Primitives/ActionRow.svelte';
  import ActionMenu from '../Primitives/ActionMenu.svelte';
  import ThreeDotMenu from '../Primitives/ThreeDotMenu.svelte';
  import TextField from '../Primitives/TextField.svelte';
  import OutlinerDragHandle from '../Primitives/OutlinerDragHandle.svelte';
  import OutlinerVisibility from '../Primitives/OutlinerVisibility.svelte';
  import {
    defaultInspectorOpen,
    inspectorSectionsFor,
    type InspectorSectionId
  } from './inspectorLayout';
  import InspectorSection from './InspectorSection.svelte';
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
  const globalTransform = $derived(session.snapshot.globalTransform);
  const transformOrientation = $derived(
    session.snapshot.transformOrientation
  );
  const useGlobalOrientation = $derived(
    transformOrientation === 'global' && session.snapshot.activeGroupId === null
  );
  const displayTransform = $derived(
    useGlobalOrientation ? (globalTransform ?? activeTransform) : activeTransform
  );
  const nodes = $derived(session.snapshot.nodes);
  const selectedNodeIds = $derived(session.snapshot.selectedNodeIds);
  const activeNodeId = $derived(session.snapshot.activeNodeId);
  const activeGroupId = $derived(session.snapshot.activeGroupId);
  const groups = $derived(session.snapshot.groups);
  const modifiers = $derived(session.snapshot.modifiers);
  const modifiersActive = $derived(session.snapshot.modifiersActive);
  const modifierError = $derived(session.snapshot.modifierError);
  const boundaryEdges = $derived(session.snapshot.boundaryEdges);
  const textureAssets = $derived(session.snapshot.textureAssets);
  const activeTextureAsset = $derived(
    textureAssets.find((asset) => asset.id === session.snapshot.textureAssetId) ??
      null
  );
  const selectionUsesActiveTexture = $derived(
    selectedNodeIds.length > 0 &&
      nodes
        .filter((node) => selectedNodeIds.includes(node.id))
        .every((node) => node.textureId === session.snapshot.textureAssetId)
  );
  const textureUsage = $derived(
    nodes.filter((node) => node.textureId === session.snapshot.textureAssetId).length
  );
  let textureImportInput: HTMLInputElement;
  const textureLayers = $derived(session.snapshot.textureLayers);
  const activeTextureLayer = $derived(
    textureLayers.find((layer) => layer.id === session.snapshot.textureActiveId) ??
      textureLayers[textureLayers.length - 1] ??
      null
  );

  async function importTextureImage(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    await session.importTextureImage(file, file.name.replace(/\.[^.]+$/, ''));
    input.value = '';
  }
  const textureLayersTopFirst = $derived(
    textureLayers
      .map((layer, index) => ({ layer, index }))
      .reverse()
  );
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

  const sceneMeta = $derived(
    `${nodes.length} ${nodes.length === 1 ? 'object' : 'objects'}${
      selectedNodeIds.length > 1 ? ` · ${selectedNodeIds.length} selected` : ''
    }`
  );
  const meshMeta = $derived(
    activeGroupId !== null
      ? `Group · ${nodes.filter((node) => node.parentId === activeGroupId).length} objects`
      : activeNodeId === null
        ? 'No object'
        : modifiersActive
          ? 'Evaluated'
          : boundaryEdges === 0
            ? 'Closed manifold'
            : `${boundaryEdges} boundary edges`
  );
  const selectionMeta = $derived(
    selectionCount > 0 ? `${selectionCount} selected` : modeLabel
  );
  const transformMeta = $derived(
    activeNodeId === null
      ? 'Local'
      : transformOrientation === 'local'
        ? 'Local'
        : 'Global'
  );
  const modifiersMeta = $derived(
    activeNodeId === null
      ? 'No object'
      : modifiers.length === 0
        ? 'None'
        : modifiersActive
          ? 'Evaluated'
          : 'Disabled'
  );
  const textureMeta = $derived(
    `${activeTextureAsset?.width ?? session.snapshot.textureSize}² · ${textureLayers.length} layer${textureLayers.length === 1 ? '' : 's'}`
  );
  const visibleSections = $derived(
    inspectorSectionsFor(session.snapshot.workspace)
  );
  const canEdit3d = $derived(session.can('edit3d'));
  const canSeam = $derived(session.can('seamAuthoring'));

  const paintToolLabel = $derived(
    session.snapshot.paintTool === 'brush'
      ? 'Brush'
      : session.snapshot.paintTool === 'eraser'
        ? 'Eraser'
        : session.snapshot.paintTool === 'rectangle'
          ? 'Rectangle'
          : session.snapshot.paintTool === 'ellipse'
            ? 'Ellipse'
            : session.snapshot.paintTool[0].toUpperCase() +
              session.snapshot.paintTool.slice(1)
  );

  type SectionKey = InspectorSectionId;

  const SECTION_DEFAULTS: Record<SectionKey, boolean> = defaultInspectorOpen();

  let primitive = $state<PrimitiveKind>('quadsphere');
  let modifierKind = $state<ModifierKind>('mirror');

  const SECTION_STORAGE_KEY = 'loupoli:inspector:sections:v4';
  let sections = $state<Record<SectionKey, boolean>>({ ...SECTION_DEFAULTS });
  let draggedNodeId = $state<string | null>(null);
  let dropTargetId = $state<string | null>(null);
  let dropAfter = $state(false);
  let reorderPointerId: number | null = null;
  let draggedLayerId = $state<string | null>(null);
  let layerDropTargetId = $state<string | null>(null);
  let layerDropAfter = $state(false);
  let layerReorderPointerId: number | null = null;

  onDestroy(() => {
    cleanupReorder();
    cleanupLayerReorder();
  });

  function beginReorder(event: PointerEvent, nodeId: string): void {
    if (!canEdit3d || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    event.preventDefault();
    draggedNodeId = nodeId;
    dropTargetId = null;
    reorderPointerId = event.pointerId;
    window.addEventListener('pointermove', reorderMove);
    window.addEventListener('pointerup', reorderEnd);
    window.addEventListener('pointercancel', cleanupReorder);
  }

  function reorderMove(event: PointerEvent): void {
    if (event.pointerId !== reorderPointerId || !draggedNodeId) {
      return;
    }
    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-node-id]');
    if (!target) {
      dropTargetId = null;
      return;
    }
    const id = target.dataset.nodeId ?? null;
    if (!id || id === draggedNodeId) {
      dropTargetId = null;
      return;
    }
    const rect = target.getBoundingClientRect();
    dropTargetId = id;
    dropAfter = event.clientY > rect.top + rect.height / 2;
  }

  function reorderEnd(event: PointerEvent): void {
    if (event.pointerId !== reorderPointerId) {
      return;
    }
    const source = draggedNodeId;
    const target = dropTargetId;
    const after = dropAfter;
    cleanupReorder();
    if (source && target) {
      session.reorderNode(source, target, after);
    }
  }

  function cleanupReorder(): void {
    window.removeEventListener('pointermove', reorderMove);
    window.removeEventListener('pointerup', reorderEnd);
    window.removeEventListener('pointercancel', cleanupReorder);
    reorderPointerId = null;
    draggedNodeId = null;
    dropTargetId = null;
    dropAfter = false;
  }

  function beginLayerReorder(event: PointerEvent, layerId: string): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    event.preventDefault();
    draggedLayerId = layerId;
    layerDropTargetId = null;
    layerReorderPointerId = event.pointerId;
    window.addEventListener('pointermove', reorderLayerMove);
    window.addEventListener('pointerup', reorderLayerEnd);
    window.addEventListener('pointercancel', cleanupLayerReorder);
  }

  function reorderLayerMove(event: PointerEvent): void {
    if (event.pointerId !== layerReorderPointerId || !draggedLayerId) {
      return;
    }
    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-texture-layer-id]');
    if (!target) {
      layerDropTargetId = null;
      return;
    }
    const id = target.dataset.textureLayerId ?? null;
    if (!id || id === draggedLayerId) {
      layerDropTargetId = null;
      return;
    }
    const rect = target.getBoundingClientRect();
    layerDropTargetId = id;
    layerDropAfter = event.clientY > rect.top + rect.height / 2;
  }

  function reorderLayerEnd(event: PointerEvent): void {
    if (event.pointerId !== layerReorderPointerId) {
      return;
    }
    const source = draggedLayerId;
    const target = layerDropTargetId;
    const after = layerDropAfter;
    cleanupLayerReorder();
    if (source && target) {
      session.reorderTextureLayer(source, target, after);
    }
  }

  function cleanupLayerReorder(): void {
    window.removeEventListener('pointermove', reorderLayerMove);
    window.removeEventListener('pointerup', reorderLayerEnd);
    window.removeEventListener('pointercancel', cleanupLayerReorder);
    layerReorderPointerId = null;
    draggedLayerId = null;
    layerDropTargetId = null;
    layerDropAfter = false;
  }

  function toggleNodeVisibility(
    event: MouseEvent,
    nodeId: string,
    visible: boolean
  ): void {
    event.stopPropagation();
    session.setNodeVisibility(nodeId, !visible);
  }

  function toggleGroupVisibility(
    event: MouseEvent,
    groupId: string,
    visible: boolean
  ): void {
    event.stopPropagation();
    session.setGroupVisibility(groupId, !visible);
  }

  onMount(() => {
    try {
      const stored = localStorage.getItem(SECTION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Record<SectionKey, boolean>>;
        sections = { ...SECTION_DEFAULTS, ...parsed };
      }
    } catch {
      // Corrupt or unavailable storage falls back to open sections.
    }
  });

  function setSection(key: SectionKey, open: boolean): void {
    if (sections[key] === open) {
      return;
    }
    sections = { ...sections, [key]: open };
    try {
      localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(sections));
    } catch {
      // Persistence is best-effort.
    }
  }

  function addPrimitive(): void {
    session.createPrimitive(primitive);
  }

  function deleteObject(): void {
    session.deleteActiveNode();
  }

  function rotationDegrees(): [number, number, number] {
    if (!displayTransform) {
      return [0, 0, 0];
    }
    const factor = 180 / Math.PI;
    return [
      displayTransform.rotation[0] * factor,
      displayTransform.rotation[1] * factor,
      displayTransform.rotation[2] * factor
    ];
  }

  function commitPosition(position: [number, number, number]): void {
    if (!activeTransform || !displayTransform) {
      return;
    }
    session.setActiveTransform(
      {
        position,
        rotation: [...displayTransform.rotation],
        scale: [...activeTransform.scale]
      },
      useGlobalOrientation ? 'global' : 'local'
    );
  }

  function commitRotation(degrees: [number, number, number]): void {
    if (!activeTransform || !displayTransform) {
      return;
    }
    const factor = Math.PI / 180;
    session.setActiveTransform(
      {
        position: [...displayTransform.position],
        rotation: [
          degrees[0] * factor,
          degrees[1] * factor,
          degrees[2] * factor
        ],
        scale: [...activeTransform.scale]
      },
      useGlobalOrientation ? 'global' : 'local'
    );
  }

  function commitScale(scale: [number, number, number]): void {
    if (!activeTransform) {
      return;
    }
    session.setActiveTransform({ ...activeTransform, scale }, 'local');
  }

  function updateModifierAxis(modifierId: string, event: Event): void {
    const axis = (event.currentTarget as HTMLSelectElement)
      .value as ModifierAxis;
    session.updateModifier(modifierId, { axis });
  }

  function updateModifierNumber(
    modifierId: string,
    key: 'countX' | 'countY' | 'spacingX' | 'spacingY' | 'count',
    value: number
  ): void {
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

</script>

      {#snippet objectRow(node: (typeof nodes)[number], child: boolean)}
        <div
          class="object-row"
          class:active={node.id === activeNodeId}
          class:selected={selectedNodeIds.includes(node.id)}
          class:child
          class:is-hidden={!node.visible}
          class:dragging={draggedNodeId === node.id}
          class:drop-target={dropTargetId === node.id}
          class:drop-after={dropTargetId === node.id && dropAfter}
          data-node-id={node.id}
          aria-current={node.id === activeNodeId ? 'true' : undefined}
        >
          <OutlinerDragHandle
            label={`Drag to reorder ${node.name}`}
            title={canEdit3d ? 'Drag to reorder' : 'Reordering is available in Model'}
            disabled={!canEdit3d}
            onDragStart={(event) => beginReorder(event, node.id)}
          />
          <button
            type="button"
            class="object-select"
            aria-pressed={selectedNodeIds.includes(node.id)}
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
                : node.primitive === 'cube'
                  ? 'Cube'
                  : node.primitive === 'cylinder'
                    ? 'Cylinder'
                    : 'Grid'}
            </span>
          </button>
          <OutlinerVisibility
            label={node.visible ? `Hide ${node.name}` : `Show ${node.name}`}
            visible={node.visible}
            onToggle={(event) => toggleNodeVisibility(event, node.id, node.visible)}
          />
        </div>
      {/snippet}

<aside
  id="inspector-panel"
  class="inspector loupoli-panel"
  data-open={session.inspectorOpen}
  data-sidebar-open={session.sidebarOpen}
  aria-label="Inspector"
>
  <header class="panel-head">
    <div>
      <h2 class="section-label">Inspector</h2>
      <p class="panel-title">{session.snapshot.objectName}</p>
    </div>
  </header>

  <div class="panel-body">
    {#snippet sceneSection()}
<InspectorSection
      title="Scene"
      meta={sceneMeta}
      open={sections.scene}
      onToggle={(open) => setSection('scene', open)}
    >

      <div class="object-list">
        {#each groups as group (group.id)}
          <div
            class="object-row group-row"
            class:active={group.id === activeGroupId}
            class:is-hidden={!group.visible}
            aria-current={group.id === activeGroupId ? 'true' : undefined}
          >
            <button
              type="button"
              class="object-select"
              onclick={() => session.selectGroup(group.id)}
            >
              <span class="object-glyph"><Icon name="folder" size={14} /></span>
              <span class="object-name">{group.name}</span>
              <span class="object-kind">
                {nodes.filter((node) => node.parentId === group.id).length} objects
              </span>
            </button>
            <button
              type="button"
              class="object-visibility"
              aria-label={group.visible ? `Hide ${group.name}` : `Show ${group.name}`}
              aria-pressed={group.visible}
              title={group.visible ? `Hide ${group.name}` : `Show ${group.name}`}
              onclick={(event) => toggleGroupVisibility(event, group.id, group.visible)}
            >
              <Icon name={group.visible ? 'eye' : 'eye-off'} size={14} />
            </button>
          </div>
          {#each nodes.filter((node) => node.parentId === group.id) as node (node.id)}
            {@render objectRow(node, true)}
          {/each}
        {/each}
        {#each nodes.filter((node) => node.parentId === null) as node (node.id)}
          {@render objectRow(node, false)}
        {/each}
      </div>



      {#if canEdit3d}
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
      {/if}

      {#if canEdit3d && (nodes.length > 0 || groups.length > 0)}
        <div class="scene-action-row">
          <button
            type="button"
            class="compact-action"
            class:is-active={session.snapshot.additiveNodeSelection}
            aria-pressed={session.snapshot.additiveNodeSelection}
            aria-label="Multi-select objects"
            title="Add to object selection"
            onclick={() =>
              session.setAdditiveNodeSelection(
                !session.snapshot.additiveNodeSelection
              )}
          >
            <Icon name="plus" size={13} />
            <span>Multi</span>
          </button>
          {#if selectedNodeIds.length > 0 && activeGroupId === null}
            <button
              type="button"
              class="compact-action"
              aria-label="Group selected objects"
              onclick={() => session.groupSelectedNodes()}
            >
              <Icon name="folder" size={13} />
              <span>Group</span>
            </button>
          {/if}
          {#if selectedNodeIds.length > 1 && activeGroupId === null}
            <button
              type="button"
              class="compact-action"
              aria-label="Join selected objects"
              onclick={() => session.joinSelectedNodes()}
            >
              <Icon name="merge" size={13} />
              <span>Join</span>
            </button>
          {/if}
          {#if activeGroupId !== null}
            <button
              type="button"
              class="compact-action"
              aria-label="Ungroup active group"
              onclick={() => session.ungroupActiveGroup()}
            >
              <Icon name="folder" size={13} />
              <span>Ungroup</span>
            </button>
          {:else if activeNodeId !== null}
            <button
              type="button"
              class="compact-action compact-action--danger"
              aria-label="Delete active object"
              onclick={deleteObject}
            >
              <Icon name="trash" size={13} />
              <span>Delete</span>
            </button>
          {/if}
        </div>
      {/if}
    </InspectorSection>
{/snippet}

    {#snippet meshSection()}
<InspectorSection
      title="Mesh"
      meta={meshMeta}
      open={sections.mesh}
      onToggle={(open) => setSection('mesh', open)}
    >
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
    </InspectorSection>
{/snippet}

    {#snippet selectionSection()}
<InspectorSection
      title="Selection"
      meta={selectionMeta}
      open={sections.selection}
      onToggle={(open) => setSection('selection', open)}
    >
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
          Picking maps through provenance. Vertex dragging and topology actions
          edit the base mesh, and the stack re-evaluates automatically.
        </p>
      {:else if activeNodeId === null}
        <p class="empty-state">
          The scene is empty. Add a QuadSphere, Cylinder, or Grid above.
        </p>
      {:else if canEdit3d && session.snapshot.selectionMode === 'vertex' && selectionCount === 1 && selectedPosition}
        <p class="selection-title">
          Vertex <span class="text-mono">{primarySelection! + 1}</span>
        </p>
        <Vector3Field
          label="Position (object)"
          values={selectedPosition}
          step={0.1}
          precision={3}
          onCommit={(position) => session.setSelectedVertexPosition(position)}
        />
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

      {#if selectionCount > 0}
        <div class="selection-actions">
          {#if canEdit3d && (session.snapshot.selectionMode === 'vertex' && selectionCount >= 2)}
            <button
              type="button"
              class="topology-action"
              aria-label="Merge selected vertices"
              onclick={() => session.mergeSelectedVertices()}
            >
              <Icon name="merge" size={14} />
              <span>Merge</span>
            </button>
          {/if}
          {#if canEdit3d && (session.snapshot.selectionMode === 'face' && selectionCount > 0)}
            <button
              type="button"
              class="topology-action"
              aria-label="Extrude selected faces"
              onclick={() => session.extrudeSelectedFaces()}
            >
              <Icon name="extrude" size={14} />
              <span>Extrude</span>
            </button>
          {/if}
          {#if canEdit3d && (session.snapshot.selectionMode === 'face' && selectionCount === 1)}
            <button
              type="button"
              class="topology-action"
              aria-label="Inset selected face"
              onclick={() => session.insetSelectedFace()}
            >
              <Icon name="inset" size={14} />
              <span>Inset</span>
            </button>
          {/if}
          {#if canSeam && session.snapshot.selectionMode === 'edge' && selectionCount > 0}
            <button
              type="button"
              class="topology-action"
              aria-label="Toggle UV seam on selected edges"
              onclick={() => session.toggleSelectedSeams()}
            >
              <Icon name="seam" size={14} />
              <span>Seam</span>
            </button>
          {/if}
          {#if canEdit3d && (session.snapshot.selectionMode === 'edge' && selectionCount === 1)}
            <button
              type="button"
              class="topology-action"
              aria-label="Loop cut selected edge"
              onclick={() => session.loopCut()}
            >
              <Icon name="loop-cut" size={14} />
              <span>Loop cut</span>
            </button>
          {/if}
          {#if canEdit3d && (session.snapshot.selectionMode === 'edge' && selectionCount >= 2)}
            <button
              type="button"
              class="topology-action"
              aria-label="Bridge selected edges"
              onclick={() => session.bridgeSelectedEdges()}
            >
              <Icon name="bridge" size={14} />
              <span>Bridge</span>
            </button>
          {/if}
          {#if canEdit3d}
            <button
              type="button"
              class="delete-selection"
              aria-label="Delete selected {modePlural}"
              onclick={() => session.deleteSelection()}
            >
              <Icon name="trash" size={14} />
              <span>Delete</span>
            </button>
          {/if}
        </div>
      {/if}

      {#if canSeam && activeNodeId !== null && session.snapshot.seamCount > 0}
        <div class="selection-actions">
          <button
            type="button"
            class="topology-action"
            aria-label="Remove all UV seams from the active mesh"
            title={`Clear ${session.snapshot.seamCount} UV seam${session.snapshot.seamCount === 1 ? '' : 's'}`}
            onclick={() => session.clearAllSeams()}
          >
            <Icon name="seam" size={14} />
            <span>Clear seams</span>
          </button>
        </div>
      {/if}
    </InspectorSection>
{/snippet}

    
      {#snippet brushSection()}
<InspectorSection
        title="Brush"
        meta={paintToolLabel}
        open={sections.brush}
        onToggle={(open) => setSection('brush', open)}
      >
        <div class="module-body brush-body">
          <SliderField
            label="Size"
            value={session.snapshot.uvBrushSize}
            min={2}
            max={128}
            step={1}
            precision={0}
            onChange={(value) => session.setUvBrushSize(value)}
          />
          <SliderField
            label="Opacity"
            value={session.snapshot.uvBrushOpacity}
            percent
            onChange={(value) => session.setUvBrushOpacity(value)}
          />
          <SliderField
            label="Hardness"
            value={session.snapshot.paintHardness}
            onChange={(value) => session.setPaintHardness(value)}
          />
          <SliderField
            label="Smoothing"
            value={session.snapshot.paintSmoothing}
            onChange={(value) => session.setPaintSmoothing(value)}
          />
          <SliderField
            label="Noise"
            value={session.snapshot.paintNoise}
            onChange={(value) => session.setPaintNoise(value)}
          />
          {#if session.snapshot.paintTool === 'gradient'}
            <ColorField
              label="To"
              value={session.snapshot.paintSecondaryColor}
              onChange={(value) => session.setPaintSecondaryColor(value)}
            />
            <SelectField
              label="Type"
              value={session.snapshot.paintGradient}
              options={[
                { value: 'linear', label: 'Linear' },
                { value: 'radial', label: 'Radial' }
              ]}
              onChange={(value) =>
                session.setPaintGradient(value as 'linear' | 'radial')}
            />
          {/if}
          {#if session.snapshot.paintTool === 'rectangle' || session.snapshot.paintTool === 'ellipse'}
            <ActionButton
              label={session.snapshot.paintShapeFilled ? 'Filled shape' : 'Outline shape'}
              icon="rectangle"
              active={session.snapshot.paintShapeFilled}
              onActivate={() =>
                session.setPaintShapeFilled(!session.snapshot.paintShapeFilled)}
            />
          {/if}
        </div>
      </InspectorSection>
{/snippet}
    

    {#snippet transformSection()}
<InspectorSection
      title="Transform"
      meta={transformMeta}
      open={sections.transform}
      onToggle={(open) => setSection('transform', open)}
    >
      <div id="transform-body" class="module-body">
        {#if activeNodeId !== null}
          <div class="transform-orientation">
            <div class="orientation-toggle" role="group" aria-label="Transform orientation">
              <button
                type="button"
                class:active={transformOrientation === 'local'}
                aria-pressed={transformOrientation === 'local'}
                onclick={() => session.setTransformOrientation('local')}
              >
                Local
              </button>
              <button
                type="button"
                class:active={transformOrientation === 'global'}
                aria-pressed={transformOrientation === 'global'}
                onclick={() => session.setTransformOrientation('global')}
              >
                Global
              </button>
            </div>
          </div>
        {/if}
        {#if activeTransform}
          <div class="transform-stack">
            <Vector3Field
              label="Position"
              values={displayTransform?.position ?? activeTransform.position}
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
              label={useGlobalOrientation ? 'Scale (local)' : 'Scale'}
              values={activeTransform.scale}
              step={0.05}
              precision={3}
              min={0.001}
              onCommit={commitScale}
            />
          </div>
          {#if useGlobalOrientation}
            <p class="hint">
              Position and rotation are world-space. Scale remains object-local.
            </p>
          {/if}
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
      </div>
    </InspectorSection>
{/snippet}

    {#snippet modifiersSection()}
<InspectorSection
        title="Modifiers"
        meta={modifiersMeta}
        open={sections.modifiers}
        onToggle={(open) => setSection('modifiers', open)}
      >
        <div id="modifiers-body" class="module-body">
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
                        tooltip="Move modifier up"
                        disabled={index === 0}
                        onActivate={() => session.moveModifier(modifier.id, -1)}
                      />
                      <IconButton
                        label="Move modifier down"
                        icon="chevron-down"
                        tooltip="Move modifier down"
                        disabled={index === modifiers.length - 1}
                        onActivate={() => session.moveModifier(modifier.id, 1)}
                      />
                      <button
                        type="button"
                        class="modifier-remove"
                        aria-label="Remove modifier"
                        title="Remove modifier"
                        onclick={() => session.removeModifier(modifier.id)}
                      >
                        <Icon name="trash" size={13} />
                        <span>Remove</span>
                      </button>
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
                        <NumberField
                          value={modifier.countX}
                          label="Grid array X count"
                          step={1}
                          precision={0}
                          min={1}
                          max={64}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'countX', value)}
                        />
                      </label>
                      <label class="modifier-field">
                        <span>Y count</span>
                        <NumberField
                          value={modifier.countY}
                          label="Grid array Y count"
                          step={1}
                          precision={0}
                          min={1}
                          max={64}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'countY', value)}
                        />
                      </label>
                      <label class="modifier-field">
                        <span>X spacing</span>
                        <NumberField
                          value={modifier.spacingX}
                          label="Grid array X spacing"
                          step={0.1}
                          precision={3}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'spacingX', value)}
                        />
                      </label>
                      <label class="modifier-field">
                        <span>Y spacing</span>
                        <NumberField
                          value={modifier.spacingY}
                          label="Grid array Y spacing"
                          step={0.1}
                          precision={3}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'spacingY', value)}
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
                        <NumberField
                          value={modifier.count}
                          label="Radial array count"
                          step={1}
                          precision={0}
                          min={1}
                          max={128}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'count', value)}
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
              Modifiers are non-destructive. Picking maps through provenance;
              dragging a vertex or running a topology action edits the base
              mesh and re-evaluates the stack.
            </p>
          {/if}
        {/if}
        </div>
            </InspectorSection>
{/snippet}

    {#snippet textureSection()}
<InspectorSection
      title="Texture"
      meta={textureMeta}
      open={sections.texture}
      onToggle={(open) => setSection('texture', open)}
    >
      <div class="module-body texture-body">
        <input
          bind:this={textureImportInput}
          class="visually-hidden"
          type="file"
          accept="image/*"
          aria-label="Import image as a texture layer"
          onchange={importTextureImage}
        />
        <div class="texture-block">
          <SelectField
            label="Asset"
            value={session.snapshot.textureAssetId ?? ''}
            options={textureAssets.map((asset) => ({
              value: asset.id,
              label: `${asset.name} · ${asset.width}²`
            }))}
            onChange={(value) => session.setActiveTextureAsset(value)}
          />
          <TextField
            label="Name"
            value={activeTextureAsset?.name ?? ''}
            onCommit={(value) => session.renameTextureAsset(value)}
          />
          <div class="texture-asset-meta">
            <span>{textureUsage} object{textureUsage === 1 ? '' : 's'}</span>
            <span>{activeTextureAsset?.width ?? session.snapshot.textureSize}²</span>
            <span>{activeTextureAsset?.filter ?? 'nearest'}</span>
          </div>
          <ActionRow>
            <ActionMenu
              label="New"
              icon="plus"
              menuTitle="New texture"
              options={[64, 128, 256, 512, 1024, 2048].map((size) => ({
                label: `${size}² texture`,
                onSelect: () => session.createTextureAsset(size, size)
              }))}
            />
            <ThreeDotMenu
              menuTitle="Texture actions"
              options={[
                {
                  label: 'Duplicate',
                  icon: 'open',
                  onSelect: () => session.duplicateActiveTextureAsset()
                },
                {
                  label: 'Import image',
                  icon: 'image',
                  onSelect: () => textureImportInput?.click()
                },
                {
                  label: 'Delete asset',
                  icon: 'trash',
                  destructive: true,
                  separatorBefore: true,
                  disabled: textureUsage > 0 || textureAssets.length <= 1,
                  onSelect: () => session.deleteActiveTextureAsset()
                }
              ]}
            />
            <ActionButton
              label={selectionUsesActiveTexture ? 'Unassign' : 'Assign'}
              icon={selectionUsesActiveTexture ? 'close' : 'texture-wire'}
              onActivate={() =>
                session.assignTextureToSelection(
                  selectionUsesActiveTexture
                    ? null
                    : session.snapshot.textureAssetId
                )}
            />
          </ActionRow>
          <div class="texture-property-pair">
            <SelectField
              label="Filter"
              value={activeTextureAsset?.filter ?? 'nearest'}
              options={[
                { value: 'nearest', label: 'Nearest' },
                { value: 'linear', label: 'Linear' }
              ]}
              onChange={(value) =>
                session.setTextureAssetFilter(value as 'nearest' | 'linear')}
            />
            <SelectField
              label="Alpha"
              value={activeTextureAsset?.alphaMode ?? 'opaque'}
              options={[
                { value: 'opaque', label: 'Opaque' },
                { value: 'cutout', label: 'Cutout' },
                { value: 'blend', label: 'Blend' }
              ]}
              onChange={(value) =>
                session.setTextureAlphaMode(
                  value as 'opaque' | 'cutout' | 'blend'
                )}
            />
          </div>
        </div>

        <div class="texture-block">
          <ActionRow align="between">
            <ActionMenu
              label="Add layer"
              icon="plus"
              menuTitle="Add layer"
              options={[
                {
                  label: 'Solid layer',
                  icon: 'solid',
                  onSelect: () => session.addTextureLayer('solid')
                },
                {
                  label: 'Checker layer',
                  icon: 'checker',
                  onSelect: () => session.addTextureLayer('checker')
                },
                {
                  label: 'Transparent layer',
                  icon: 'transparent',
                  onSelect: () => session.addTextureLayer('transparent')
                },
                {
                  label: 'Import image layer',
                  icon: 'image',
                  separatorBefore: true,
                  onSelect: () => textureImportInput?.click()
                }
              ]}
            />
            <span class="texture-note">{textureLayers.length}/8 layers</span>
          </ActionRow>
          <div class="texture-layer-list" role="list">
            {#each textureLayersTopFirst as { layer } (layer.id)}
              <div
                class="texture-layer-row"
                class:active={session.snapshot.textureActiveId === layer.id}
                class:is-hidden={!layer.visible}
                class:dragging={draggedLayerId === layer.id}
                class:drop-target={layerDropTargetId === layer.id}
                class:drop-after={layerDropTargetId === layer.id && layerDropAfter}
                data-texture-layer-id={layer.id}
              >
                <OutlinerDragHandle
                  label={`Drag to reorder ${layer.name}`}
                  onDragStart={(event) => beginLayerReorder(event, layer.id)}
                />
                <button
                  type="button"
                  class="texture-layer-select"
                  aria-pressed={session.snapshot.textureActiveId === layer.id}
                  onclick={() => session.setActiveTextureLayer(layer.id)}
                >
                  <span
                    class="texture-layer-swatch"
                    class:transparent={layer.pattern === 'transparent'}
                    class:checker={layer.pattern === 'checker'}
                    class:raster={layer.kind === 'raster'}
                    style:background={layer.pattern === 'solid' ? layer.color : undefined}
                  ></span>
                  <span class="texture-layer-name">{layer.name}</span>
                  <span class="texture-layer-meta">
                    {layer.kind === 'raster' ? 'raster' : layer.pattern} · {layer.role}
                  </span>
                </button>
                <OutlinerVisibility
                  label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  visible={layer.visible}
                  onToggle={() => session.toggleTextureLayer(layer.id)}
                />
              </div>
            {/each}
          </div>
        </div>

        {#if activeTextureLayer}
          <div class="texture-block">
            <div class="texture-selected-head">
              <input
                class="texture-name-input"
                value={activeTextureLayer.name}
                maxlength="64"
                aria-label={`${activeTextureLayer.name} layer name`}
                onchange={(event) =>
                  session.renameTextureLayer(
                    activeTextureLayer.id,
                    event.currentTarget.value
                  )}
              />
              <span class="texture-kind">
                {activeTextureLayer.kind === 'raster' ? 'raster' : activeTextureLayer.pattern}
              </span>

            </div>
            {#if activeTextureLayer.kind === 'fill'}
              <SelectField
                label="Type"
                value={activeTextureLayer.pattern}
                options={[
                  { value: 'solid', label: 'Solid' },
                  { value: 'checker', label: 'Checker' },
                  { value: 'transparent', label: 'Transparent' }
                ]}
                onChange={(value) =>
                  session.setTextureLayerPattern(
                    activeTextureLayer.id,
                    value as 'solid' | 'checker' | 'transparent'
                  )}
              />
            {/if}
            <SliderField
              label="Opacity"
              value={activeTextureLayer.opacity}
              percent
              onChange={(value) =>
                session.setTextureLayerOpacity(activeTextureLayer.id, value)}
            />
            <div class="texture-property-pair">
              <SelectField
                label="Blend"
                value={activeTextureLayer.blendMode}
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'multiply', label: 'Multiply' },
                  { value: 'screen', label: 'Screen' }
                ]}
                onChange={(value) =>
                  session.setTextureLayerBlendMode(
                    activeTextureLayer.id,
                    value as 'normal' | 'multiply' | 'screen'
                  )}
              />
              <SelectField
                label="Role"
                value={activeTextureLayer.role}
                options={[
                  { value: 'color', label: 'Color' },
                  { value: 'detail', label: 'Detail' },
                  { value: 'lighting', label: 'Lighting' }
                ]}
                onChange={(value) =>
                  session.setTextureLayerRole(
                    activeTextureLayer.id,
                    value as 'color' | 'detail' | 'lighting'
                  )}
              />
            </div>
            {#if activeTextureLayer.kind === 'fill' && activeTextureLayer.pattern === 'solid'}
              <ColorField
                label="Color"
                value={activeTextureLayer.color}
                onChange={(value) =>
                  session.setTextureLayerColor(activeTextureLayer.id, value)}
              />
            {/if}
            <ActionRow>
              <ActionButton
                label="Delete layer"
                icon="trash"
                variant="danger"
                disabled={textureLayers.length <= 1}
                onActivate={() => session.removeTextureLayer(activeTextureLayer.id)}
              />
            </ActionRow>
          </div>
        {/if}
      </div>
    </InspectorSection>
{/snippet}

    {#snippet ps1Section()}
<InspectorSection
      title="PS1 look"
      meta="Render effect · Opt-in"
      open={sections.ps1}
      onToggle={(open) => setSection('ps1', open)}
    >
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
    </InspectorSection>
{/snippet}

    {#snippet controlsSection()}
<InspectorSection
      title="Controls"
      open={sections.controls}
      onToggle={(open) => setSection('controls', open)}
    >
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
    </InspectorSection>
{/snippet}

      {#each visibleSections as section (section)}
        {#if section === 'scene'}{@render sceneSection()}
        {:else if section === 'transform'}{@render transformSection()}
        {:else if section === 'selection'}{@render selectionSection()}
        {:else if section === 'mesh'}{@render meshSection()}
        {:else if section === 'modifiers'}{@render modifiersSection()}
        {:else if section === 'ps1'}{@render ps1Section()}
        {:else if section === 'brush'}{@render brushSection()}
        {:else if section === 'texture'}{@render textureSection()}
        {:else if section === 'controls'}{@render controlsSection()}
        {/if}
      {/each}
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

  @media (min-width: 900px) {
    .inspector[data-sidebar-open='false'] {
      display: none;
    }
  }

  .panel-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .object-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .object-row {
    display: flex;
    align-items: stretch;
    width: 100%;
    min-height: var(--control-h);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    overflow: hidden;
  }

  .object-select {
    display: flex;
    flex: 1;
    align-items: center;
    min-width: 0;
    min-height: var(--control-h);
    gap: var(--space-2);
    padding: 0 var(--space-2);
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .object-row:hover {
    background: var(--bg-hover);
  }

  .object-row.is-hidden {
    opacity: 0.52;
  }

  .object-row.dragging {
    opacity: 0.4;
  }

  .object-row.drop-target {
    box-shadow: inset 0 2px 0 var(--accent-primary);
  }

  .object-row.drop-target.drop-after {
    box-shadow: inset 0 -2px 0 var(--accent-primary);
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

  .object-row.child .object-select {
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

  .scene-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .primitive-select,
  .scene-button {
    min-height: var(--control-h);
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

  .scene-action-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .compact-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--control-h);
    gap: 5px;
    padding: 0 var(--space-2);
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .compact-action.is-active {
    border-color: var(--accent-primary);
    background: var(--bg-selected);
    color: var(--accent-primary);
  }

  .compact-action:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  .compact-action--danger {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--text-tertiary);
  }

  .compact-action--danger:hover {
    color: var(--accent-warning);
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

  .orientation-toggle {
    display: inline-flex;
    flex: 0 0 auto;
    gap: 2px;
    padding: 2px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
  }

  .orientation-toggle button {
    min-height: var(--control-h-sm);
    padding: 0 var(--space-2);
    border-radius: var(--radius-xs);
    color: var(--text-tertiary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .orientation-toggle button.active {
    color: var(--accent-primary);
    background: var(--bg-selected);
  }

  :global(:root[data-density='touch']) .orientation-toggle button {
    min-width: var(--hit-min);
    min-height: var(--hit-min);
    padding: 0 var(--space-2);
  }

  .transform-orientation {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--space-2);
  }

  .snap-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 82px;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .snap-toggle,
  .snap-step {
    min-height: var(--control-h);
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
  .modifier-field select {
    min-height: var(--control-h);
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

  .modifier-remove {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: var(--control-h);
    padding: 0 var(--space-1);
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .modifier-remove:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
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

  .modifier-field select {
    width: 100%;
    padding: 0 var(--space-2);
  }

  .selection-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .topology-action,
  .delete-selection {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: auto;
    flex: 1 1 auto;
    min-height: var(--control-h);
    padding: 0 var(--space-2);
    gap: 5px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-tertiary);
    font-family: var(--font-body);
    font-size: var(--text-2xs);
    cursor: pointer;
  }

  .delete-selection {
    flex: 0 0 auto;
    margin-left: auto;
  }

  .topology-action:hover {
    color: var(--accent-primary);
    background: var(--bg-hover);
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

  .texture-body {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .brush-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .texture-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-1) 0;
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .texture-block:first-child {
    padding-top: 0;
  }

  .texture-block:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .texture-asset-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .texture-property-pair {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .texture-usage {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .texture-note {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .texture-layer-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .texture-layer-row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: var(--control-h);
    border: var(--hairline) solid transparent;
    border-radius: var(--radius-sm);
    background: var(--bg-input);
  }

  .texture-layer-row.active {
    border-color: var(--accent-primary);
    background: var(--bg-selected);
  }

  .texture-layer-row.is-hidden {
    opacity: 0.52;
  }

  .texture-layer-row.dragging {
    opacity: 0.4;
  }

  .texture-layer-row.drop-target {
    box-shadow: inset 0 2px 0 var(--accent-primary);
  }

  .texture-layer-row.drop-target.drop-after {
    box-shadow: inset 0 -2px 0 var(--accent-primary);
  }

  .texture-layer-select {
    display: grid;
    flex: 1;
    grid-template-columns: 16px minmax(0, 1fr) auto auto;
    align-items: center;
    min-width: 0;
    min-height: var(--control-h);
    gap: var(--space-1);
    padding: 0 var(--space-1);
    border: 0;
    background: transparent;
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
  }

  .texture-layer-swatch {
    width: 16px;
    height: 16px;
    border: var(--hairline) solid var(--border-strong);
    border-radius: 2px;
    background: var(--bg-input);
  }

  .texture-layer-swatch.checker,
  .texture-layer-swatch.transparent {
    background:
      linear-gradient(45deg, var(--bg-raised) 25%, transparent 25%) 0 0 / 8px 8px,
      linear-gradient(-45deg, var(--bg-raised) 25%, transparent 25%) 0 4px / 8px 8px,
      linear-gradient(45deg, transparent 75%, var(--bg-raised) 75%) 4px -4px / 8px 8px,
      linear-gradient(-45deg, transparent 75%, var(--bg-raised) 75%) -4px 0 / 8px 8px,
      var(--bg-input);
  }

  .texture-layer-name {
    overflow: hidden;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .texture-layer-meta {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    white-space: nowrap;
  }

  .texture-selected-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .texture-name-input {
    flex: 1;
    min-width: 0;
    min-height: var(--control-h);
    padding: 0 var(--space-1);
    border: 0;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: 1.2;
  }

  .texture-name-input:focus-visible {
    outline: var(--focus-ring-width) solid var(--border-focus);
    outline-offset: 1px;
  }

  .texture-kind {
    flex: 0 0 auto;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    text-transform: uppercase;
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
