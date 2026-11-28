<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Icon from '../Icons/Icon.svelte';
  import type { IconName } from '../Icons/types';
  import IconButton from '../Primitives/IconButton.svelte';
  import Switch from '../Primitives/Switch.svelte';
  import { BRUSH_PRESETS } from '../../paint/presets';
  import Vector3Field from '../Primitives/Vector3Field.svelte';
  import SegmentedControl from '../Primitives/SegmentedControl.svelte';
  import NumberField from '../Primitives/NumberField.svelte';
  import SliderField from '../Primitives/SliderField.svelte';
  import SliderNumberField from '../Primitives/SliderNumberField.svelte';
  import {
    MAX_PAINT_SPACING,
    MIN_PAINT_SPACING
  } from '../../paint/types';
  import SelectField from '../Primitives/SelectField.svelte';
  import ColorField from '../Primitives/ColorField.svelte';
  import ActionButton from '../Primitives/ActionButton.svelte';
  import ActionRow from '../Primitives/ActionRow.svelte';
  import CreateRow from '../Primitives/CreateRow.svelte';
  import DangerAction from '../Primitives/DangerAction.svelte';
  import ActionMenu from '../Primitives/ActionMenu.svelte';
  import ExportModelDialog from './ExportModelDialog.svelte';
  import type { ModelExportFormat } from '../../io/exportOptions';
  import ExportObjFramesDialog from './ExportObjFramesDialog.svelte';
  import ModulatorPanel from '../Animation/ModulatorPanel.svelte';
  import RenderEffectsPanel from '../Render/RenderEffectsPanel.svelte';
  import NewTextureDialog from './NewTextureDialog.svelte';
  import ImageImportDialog from './ImageImportDialog.svelte';
  import type { ObjExportScope } from '../../io/obj';
  import InlineNameField from '../Primitives/InlineNameField.svelte';
  import OutlinerRow from '../Primitives/OutlinerRow.svelte';
  import {
    defaultInspectorOpen,
    inspectorSectionsFor,
    type InspectorSectionId
  } from './inspectorLayout';
  import InspectorSection from './InspectorSection.svelte';
  import type { EditorSession } from '../../editor/EditorSession.svelte';
  import type { TextureEffect } from '../../texture/effects';
  import {
    type AxisLock,
    type ModifierPatch
  } from '../../editor/types';
  import {
    MODIFIER_DEFINITIONS,
    MODIFIER_KINDS,
    MODIFIER_LABELS,
    type ModifierAxis,
    type ModifierKind,
    type OutlineUnits
  } from '../../geometry/modifiers';
  import {
    videoMimeFor
  } from '../../render/videoExport';
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

  const primitiveGlyph: Readonly<Record<PrimitiveKind, IconName>> = {
    quadsphere: 'sphere',
    cylinder: 'cylinder',
    grid: 'grid',
    cube: 'cube',
    imported: 'mesh',
    reference: 'image'
  };

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
  const transformValueSpace = $derived(
    session.snapshot.transformValueSpace
  );
  const gizmoOrientation = $derived(
    session.snapshot.transformOrientation
  );
  const transformPivotMode = $derived(session.snapshot.transformPivotMode);
  const useGlobalOrientation = $derived(
    transformValueSpace === 'global' && session.snapshot.activeGroupId === null
  );
  const displayTransform = $derived(
    useGlobalOrientation ? (globalTransform ?? activeTransform) : activeTransform
  );
  const nodes = $derived(session.snapshot.nodes);
  const sceneNodes = $derived(
    session.snapshot.workspace === 'model' ||
      session.snapshot.workspace === 'animation'
      ? nodes
      : nodes.filter((node) => !node.reference)
  );
  const selectedNodeIds = $derived(session.snapshot.selectedNodeIds);
  const activeNodeId = $derived(session.snapshot.activeNodeId);
  const activeGroupId = $derived(session.snapshot.activeGroupId);
  const groups = $derived(session.snapshot.groups);
  const activeNode = $derived(nodes.find((node) => node.id === activeNodeId) ?? null);
  const activeGroup = $derived(groups.find((group) => group.id === activeGroupId) ?? null);
  const lights = $derived(session.snapshot.lights);
  const cameras = $derived(session.snapshot.cameras);
  const activeCamera = $derived(
    cameras.find((camera) => camera.id === session.snapshot.activeCameraId) ?? null
  );
  const animationTracks = $derived(session.snapshot.animationTracks);
  const animationClips = $derived(session.snapshot.animationClips);
  const activeClip = $derived(
    animationClips.find(
      (clip) => clip.id === session.snapshot.animationClipId
    ) ??
      animationClips[0] ??
      null
  );
  const meshPoseEditing = $derived(session.snapshot.meshPoseEditing);
  const meshPoseFrame = $derived(session.snapshot.meshPoseFrame);
  const activeMeshTrack = $derived(
    animationTracks.find(
      (track) =>
        track.kind === 'mesh' && track.targetId === session.snapshot.activeNodeId
    ) ?? null
  );
  const activeReference = $derived(activeNode?.reference ?? null);
  const activeTextureTrack = $derived(
    animationTracks.find(
      (track) =>
        track.kind === 'texture' &&
        track.targetId === session.snapshot.activeNodeId &&
        track.hasTrack
    ) ?? null
  );
  const activeObjectTrackCount = $derived(
    animationTracks.filter(
      (track) =>
        track.targetId === session.snapshot.activeNodeId && track.hasTrack
    ).length
  );
  const renderKindOptions = $derived.by(() => {
    const options: { value: string; label: string }[] = [
      { value: 'still', label: 'Still PNG' },
      { value: 'sequence', label: 'PNG frame sequence' }
    ];
    if (videoMimeFor('webm')) options.push({ value: 'webm', label: 'WebM video' });
    if (
      session.snapshot.nativeMp4Available ||
      videoMimeFor('mp4')
    ) {
      options.push({ value: 'mp4', label: 'MP4 video' });
    }
    return options;
  });
  const shapeKeys = $derived(session.snapshot.shapeKeys);
  const shapeEditingId = $derived(session.snapshot.shapeEditingId);
  const editingShapeName = $derived(
    shapeKeys.find((key) => key.id === shapeEditingId)?.name ?? 'Shape'
  );
  const activeShapeKey = $derived(
    shapeKeys.find((key) => key.id === session.snapshot.activeShapeKeyId) ??
      shapeKeys[0] ??
      null
  );
  const activeShapeWeightTrack = $derived(
    activeShapeKey
      ? animationTracks.find(
          (track) =>
            track.kind === 'shape' &&
            track.targetId === session.snapshot.activeNodeId &&
            track.shapeKeyId === activeShapeKey.id &&
            track.hasTrack
        ) ?? null
      : null
  );
  const activeLight = $derived(
    lights.find((light) => light.id === session.snapshot.activeLightId) ?? null
  );
  function objectCount(count: number): string {
    return `${count} ${count === 1 ? 'object' : 'objects'}`;
  }

  const activeItemKind = $derived(
    activeGroup
      ? objectCount(nodes.filter((node) => node.parentId === activeGroup.id).length)
      : activeNode
        ? activeNode.primitive === 'reference'
          ? 'Reference'
          : activeNode.primitive === 'quadsphere'
            ? 'Sphere'
            : activeNode.primitive === 'cube'
              ? 'Cube'
              : activeNode.primitive === 'cylinder'
                ? 'Cylinder'
                : 'Grid'
        : ''
  );
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
  let pendingTextureFile = $state<File | null>(null);
  let referenceImportInput: HTMLInputElement;
  let referenceReplaceInput: HTMLInputElement;
  const textureLayers = $derived(session.snapshot.textureLayers);
  const activeTextureLayer = $derived(
    textureLayers.find((layer) => layer.id === session.snapshot.textureActiveId) ??
      textureLayers[textureLayers.length - 1] ??
      null
  );

  function importTextureImage(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      pendingTextureFile = file;
    }
  }
  const activeTextureEffect = $derived(
    activeTextureLayer?.kind === 'effect' ? activeTextureLayer.effect ?? null : null
  );

  function patchActiveEffect(patch: Record<string, unknown>): void {
    if (!activeTextureLayer?.effect) {
      return;
    }
    session.setTextureEffect(activeTextureLayer.id, {
      ...activeTextureLayer.effect,
      ...patch
    } as TextureEffect);
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
    `${sceneNodes.length} ${sceneNodes.length === 1 ? 'object' : 'objects'}${
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

  const selectionTitle = $derived(
    selectionCount === 1
      ? `${modeLabel} ${primarySelection === null ? '' : primarySelection + 1}`
      : `${modePlural.charAt(0).toUpperCase()}${modePlural.slice(1)}`
  );

  const selectionSubtitle = $derived.by(() => {
    const mode = session.snapshot.selectionMode;
    if (selectionCount === 1) {
      if (!session.can('edit3d')) {
        return 'Shared with the 3D viewport.';
      }
      if (mode === 'edge') {
        return session.snapshot.workspace === 'model'
          ? 'Use the Action Dock to bevel this edge.'
          : 'Bevel is available in the Model workspace.';
      }
      if (mode === 'face') {
        return 'Use Extrude or Inset below.';
      }
      return 'Drag the handle or edit its position below.';
    }
    if (!session.can('edit3d')) {
      return 'Shared with the 3D viewport.';
    }
    if (mode === 'edge') {
      return 'Select one edge to bevel; Bridge uses multiple edges.';
    }
    if (mode === 'vertex') {
      return 'Merge or transform the selected vertices.';
    }
    return 'Extrude or transform the selected faces.';
  });
  const transformMeta = $derived(
    activeNodeId === null
      ? 'Local'
      : session.snapshot.workspace === 'animation'
        ? transformValueSpace === 'local'
          ? 'Local (keyed)'
          : 'World (keyed)'
        : transformValueSpace === 'local'
          ? 'Local'
          : 'World'
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
    `${activeTextureAsset?.width ?? session.snapshot.textureSize} × ${activeTextureAsset?.height ?? session.snapshot.textureHeight} · ${textureLayers.length} layer${textureLayers.length === 1 ? '' : 's'}`
  );
  const pixelTexture = $derived(
    textureAssets.find((asset) => asset.id === activeNode?.textureId) ??
      activeTextureAsset
  );
  const visibleSections = $derived(
    inspectorSectionsFor(session.snapshot.workspace).filter(
      (section) =>
        (section !== 'pixel' || session.snapshot.pixelArtMode) &&
        (activeReference === null ||
          !['selection', 'mesh', 'modifiers', 'clip', 'animation', 'modulators', 'effects', 'brush', 'pixel', 'texture'].includes(
            section
          ))
    )
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

  const valueSpaceOptions = [
    { id: 'local', label: 'Local', title: 'Edit parent-local transform values' },
    { id: 'global', label: 'World', title: 'Edit world-space transform values' }
  ] as const;
  const gizmoOrientationOptions = [
    { id: 'global', label: 'World', title: 'Align gizmo axes to the world' },
    { id: 'local', label: 'Local', title: 'Align gizmo axes to the object' }
  ] as const;
  const transformPivotOptions = [
    {
      id: 'median',
      label: 'Median',
      title: 'Transform around the selection median'
    },
    {
      id: 'origin',
      label: 'Object',
      title: 'Transform around the active object origin'
    }
  ] as const;

  let primitive = $state<PrimitiveKind>('quadsphere');
  let modifierKind = $state<ModifierKind>('mirror');
  const primitiveOptions = PRIMITIVE_KINDS.map((kind) => ({
    value: kind,
    label: PRIMITIVE_LABELS[kind]
  }));
  const modifierOptions = MODIFIER_KINDS.map((kind) => ({
    value: kind,
    label: MODIFIER_LABELS[kind]
  }));
  let exportDialogFormat = $state<ModelExportFormat | null>(null);
  let objFramesOpen = $state(false);
  let newTextureOpen = $state(false);
  let objFramesScope = $state<ObjExportScope>('scene');
  let objFramesClipId = $state('');
  let objFramesMode = $state<'step' | 'keyed'>('step');
  let objFramesStart = $state(0);
  let objFramesEnd = $state(48);
  let objFramesStep = $state(1);
  let objFramesIncludeTexture = $state(true);
  let objFramesUnifyTextures = $state(false);
  let objFramesAtlasSize = $state<import('../../io/exportOptions').TextureAtlasSize>('auto');
  const objFramesHasTexture = $derived(
    objFramesScope === 'active'
      ? activeNode?.textureId != null
      : nodes.some((node) => node.textureId != null)
  );
  const objFramesCount = $derived.by(() => {
    if (objFramesMode === 'keyed') {
      return -1;
    }
    if (objFramesEnd < objFramesStart) {
      return 0;
    }
    return (
      Math.floor(
        (objFramesEnd - objFramesStart) / Math.max(1, objFramesStep)
      ) + 1
    );
  });

  function openObjFramesExport(): void {
    const clip =
      animationClips.find(
        (item) => item.id === session.snapshot.animationClipId
      ) ?? animationClips[0];
    if (!clip) {
      return;
    }
    objFramesScope = activeNode ? 'active' : 'scene';
    objFramesClipId = clip.id;
    objFramesStart = clip.startFrame;
    objFramesEnd = clip.endFrame;
    objFramesMode = 'step';
    objFramesStep = 1;
    objFramesIncludeTexture = true;
    objFramesUnifyTextures = false;
    objFramesAtlasSize = 'auto';
    objFramesOpen = true;
  }

  function changeObjFramesClip(clipId: string): void {
    objFramesClipId = clipId;
    const clip = animationClips.find((item) => item.id === clipId);
    if (clip) {
      objFramesStart = clip.startFrame;
      objFramesEnd = clip.endFrame;
    }
  }

  async function submitObjFramesExport(): Promise<void> {
    await session.exportObjFrames({
      clipId: objFramesClipId,
      scope: objFramesScope,
      startFrame: objFramesStart,
      endFrame: objFramesEnd,
      step: objFramesStep,
      keyedOnly: objFramesMode === 'keyed',
      includeTextures: objFramesIncludeTexture,
      unifyTextures: objFramesUnifyTextures,
      atlasSize: objFramesAtlasSize
    });
    objFramesOpen = false;
  }

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
  let draggedShapeKeyId = $state<string | null>(null);
  let shapeDropTargetId = $state<string | null>(null);
  let shapeDropAfter = $state(false);
  let shapeReorderPointerId: number | null = null;

  onDestroy(() => {
    cleanupReorder();
    cleanupLayerReorder();
    cleanupShapeReorder();
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

  function beginShapeReorder(event: PointerEvent, keyId: string): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    event.preventDefault();
    draggedShapeKeyId = keyId;
    shapeDropTargetId = null;
    shapeReorderPointerId = event.pointerId;
    window.addEventListener('pointermove', reorderShapeMove);
    window.addEventListener('pointerup', reorderShapeEnd);
    window.addEventListener('pointercancel', cleanupShapeReorder);
  }

  function reorderShapeMove(event: PointerEvent): void {
    if (event.pointerId !== shapeReorderPointerId || !draggedShapeKeyId) {
      return;
    }
    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-shape-key-id]');
    if (!target) {
      shapeDropTargetId = null;
      return;
    }
    const id = target.dataset.shapeKeyId ?? null;
    if (!id || id === draggedShapeKeyId) {
      shapeDropTargetId = null;
      return;
    }
    const rect = target.getBoundingClientRect();
    shapeDropTargetId = id;
    shapeDropAfter = event.clientY > rect.top + rect.height / 2;
  }

  function reorderShapeEnd(event: PointerEvent): void {
    if (event.pointerId !== shapeReorderPointerId) {
      return;
    }
    const source = draggedShapeKeyId;
    const target = shapeDropTargetId;
    const after = shapeDropAfter;
    cleanupShapeReorder();
    if (source && target) {
      session.reorderShapeKeys(source, target, after);
    }
  }

  function cleanupShapeReorder(): void {
    window.removeEventListener('pointermove', reorderShapeMove);
    window.removeEventListener('pointerup', reorderShapeEnd);
    window.removeEventListener('pointercancel', cleanupShapeReorder);
    shapeReorderPointerId = null;
    draggedShapeKeyId = null;
    shapeDropTargetId = null;
    shapeDropAfter = false;
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

  function addReferenceImage(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      void session.addReferenceImage(file);
    }
  }

  function replaceReferenceImage(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      void session.replaceActiveReferenceImage(file);
    }
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
    key:
      | 'countX'
      | 'countY'
      | 'spacingX'
      | 'spacingY'
      | 'count'
      | 'amount'
      | 'strength'
      | 'frequency'
      | 'seed'
      | 'threshold'
      | 'mergeThreshold'
      | 'thickness'
      | 'offset',
    value: number
  ): void {
    if (!Number.isFinite(value)) {
      return;
    }
    session.updateModifier(modifierId, {
      [key]: value
    } as ModifierPatch);
  }

  function updateModifierFlag(
    modifierId: string,
    key: 'flip' | 'clip' | 'merge' | 'mirrorUv',
    value: boolean
  ): void {
    session.updateModifier(modifierId, { [key]: value } as ModifierPatch);
  }

  function updateModifierColor(modifierId: string, value: string): void {
    session.updateModifier(modifierId, { color: value } as ModifierPatch);
  }

  function updateOutlineUnits(modifierId: string, event: Event): void {
    const units = (event.currentTarget as HTMLSelectElement)
      .value as OutlineUnits;
    session.updateModifier(modifierId, { units } as ModifierPatch);
  }

  function toggleAxis(axis: Exclude<AxisLock, null>): void {
    session.setAxisLock(
      session.snapshot.axisLock === axis ? null : axis
    );
  }

</script>

      {#snippet objectRow(node: (typeof nodes)[number], child: boolean)}
        <OutlinerRow
          active={node.id === activeNodeId}
          selected={selectedNodeIds.includes(node.id)}
          {child}
          hidden={!node.visible}
          dragging={draggedNodeId === node.id}
          dropTarget={dropTargetId === node.id}
          dropAfter={dropAfter}
          nodeId={node.id}
          dragLabel={`Drag to reorder ${node.name}`}
          dragTitle={canEdit3d ? 'Drag to reorder' : 'Reordering is available in Model'}
          dragDisabled={!canEdit3d}
          onDragStart={(event) => beginReorder(event, node.id)}
          visible={node.visible}
          visibilityLabel={node.visible ? `Hide ${node.name}` : `Show ${node.name}`}
          onToggleVisibility={(event) => toggleNodeVisibility(event, node.id, node.visible)}
          selectLabel={`Select ${node.name}`}
          onSelect={(event) =>
            session.selectNode(
              node.id,
              event.shiftKey || event.metaKey || event.ctrlKey
            )}
        >
          <span class="object-glyph">
            <Icon name={primitiveGlyph[node.primitive]} size={14} />
          </span>
          <span class="object-name">{node.name}</span>
          <span class="object-kind">
            {node.primitive === 'reference'
              ? 'Reference'
              : node.primitive === 'quadsphere'
                ? 'Sphere'
                : node.primitive === 'cube'
                  ? 'Cube'
                  : node.primitive === 'cylinder'
                    ? 'Cylinder'
                    : node.primitive === 'imported'
                      ? 'Mesh'
                      : 'Grid'}
          </span>
        </OutlinerRow>
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
      <input
        bind:this={referenceImportInput}
        class="visually-hidden"
        type="file"
        accept="image/*"
        aria-label="Add reference image"
        onchange={addReferenceImage}
      />
      <input
        bind:this={referenceReplaceInput}
        class="visually-hidden"
        type="file"
        accept="image/*"
        aria-label="Replace reference image"
        onchange={replaceReferenceImage}
      />
      <div class="object-list">
        {#each groups as group (group.id)}
          <OutlinerRow
            group
            active={group.id === activeGroupId}
            hidden={!group.visible}
            visible={group.visible}
            visibilityLabel={group.visible ? `Hide ${group.name}` : `Show ${group.name}`}
            onToggleVisibility={(event) =>
              toggleGroupVisibility(event, group.id, group.visible)}
            selectLabel={`Select ${group.name}`}
            onSelect={() => session.selectGroup(group.id)}
          >
            <span class="object-glyph"><Icon name="folder" size={14} /></span>
            <span class="object-name">{group.name}</span>
            <span class="object-kind">
              {objectCount(sceneNodes.filter((node) => node.parentId === group.id).length)}
            </span>
          </OutlinerRow>
          {#each sceneNodes.filter((node) => node.parentId === group.id) as node (node.id)}
            {@render objectRow(node, true)}
          {/each}
        {/each}
        {#each sceneNodes.filter((node) => node.parentId === null) as node (node.id)}
          {@render objectRow(node, false)}
        {/each}
      </div>

      {#if activeGroup || activeNode}
        <div class="selected-name-row">
          <InlineNameField
            label={activeGroup ? 'Group name' : 'Object name'}
            value={activeGroup?.name ?? activeNode?.name ?? ''}
            onCommit={(value) => session.renameActiveObject(value)}
          />
          <span class="texture-kind">{activeItemKind}</span>
        </div>
      {/if}

      {#if activeReference}
        <div class="texture-block">
          <div class="render-look-head">
            <span>Reference image</span>
            <span>{activeReference.inFront ? 'In front' : 'Behind model'}</span>
          </div>
          <SliderField
            label="Opacity"
            value={activeReference.opacity}
            min={0.05}
            max={1}
            step={0.01}
            precision={2}
            onChange={(value) => session.setReferenceOpacity(value)}
          />
          <Switch
            label="Draw in front"
            checked={activeReference.inFront}
            onChange={(value) => session.setReferenceInFront(value)}
          />
          <ActionRow>
            <ActionButton
              label="Match aspect"
              icon="frame"
              onActivate={() => session.matchReferenceAspect()}
            />
            <ActionButton
              label="Replace image…"
              icon="image"
              onActivate={() => referenceReplaceInput.click()}
            />
          </ActionRow>
          <p class="hint">Editor-only; excluded from renders and exports.</p>
        </div>
      {/if}

      {#if canEdit3d}
        <CreateRow
          label="Primitive type"
          value={primitive}
          options={primitiveOptions}
          onChange={(value) => (primitive = value as PrimitiveKind)}
          onAdd={addPrimitive}
        >
          <ActionButton
            label="Reference"
            icon="image"
            disabled={session.snapshot.fileBusy}
            onActivate={() => referenceImportInput.click()}
          />
        </CreateRow>
      {/if}

      <ActionRow>
        <ActionMenu
          label="Import / Export"
          icon="open"
          align="end"
          menuTitle="Model interchange"
          disabled={session.snapshot.fileBusy}
          options={[
            {
              label: 'Import OBJ',
              icon: 'open',
              disabled: session.snapshot.fileBusy,
              onSelect: () => void session.importObj()
            },
            {
              label: 'Import GLB',
              icon: 'open',
              disabled: session.snapshot.fileBusy,
              onSelect: () => void session.importGlb()
            },
            {
              label: 'Export OBJ…',
              icon: 'save',
              separatorBefore: true,
              disabled: session.snapshot.fileBusy || nodes.length === 0,
              onSelect: () => (exportDialogFormat = 'obj')
            },
            {
              label: 'Export OBJ frames…',
              icon: 'save',
              disabled: session.snapshot.fileBusy || nodes.length === 0,
              onSelect: openObjFramesExport
            },
            {
              label: 'Export GLB…',
              icon: 'save',
              disabled: session.snapshot.fileBusy || nodes.length === 0,
              onSelect: () => (exportDialogFormat = 'glb')
            }
          ]}
        />
      </ActionRow>


      {#if canEdit3d && (nodes.length > 0 || groups.length > 0)}
        <ActionRow>
          <ActionButton
            label="Multi"
            icon="plus"
            active={session.snapshot.additiveNodeSelection}
            onActivate={() =>
              session.setAdditiveNodeSelection(
                !session.snapshot.additiveNodeSelection
              )}
          />
          {#if selectedNodeIds.length > 0 && activeGroupId === null}
            <ActionButton
              label="Group"
              icon="folder"
              onActivate={() => session.groupSelectedNodes()}
            />
          {/if}
          {#if selectedNodeIds.length > 1 && activeGroupId === null}
            <ActionButton
              label="Merge textures"
              icon="stack"
              onActivate={() => void session.mergeSelectedTextures()}
            />
            <ActionButton
              label="Join"
              icon="merge"
              onActivate={() => session.joinSelectedNodes()}
            />
          {/if}
          {#if activeGroupId !== null}
            <ActionButton
              label="Ungroup"
              icon="folder"
              onActivate={() => session.ungroupActiveGroup()}
            />
          {:else if activeNodeId !== null}
            <ActionButton
              label="Duplicate"
              icon="copy"
              onActivate={() => session.duplicateActiveNode()}
            />
          {/if}
        </ActionRow>
        {#if activeGroupId === null && activeNodeId !== null}
          <DangerAction label="Delete object" onActivate={deleteObject} />
        {/if}
      {/if}
    </InspectorSection>
{/snippet}

    {#snippet clipSection()}
      <InspectorSection
        title="Clip"
        meta={`${activeClip?.name ?? 'Animation'} · ${session.snapshot.animationFps} fps`}
        open={sections.clip}
        onToggle={(open) => setSection('clip', open)}
      >
        <div class="module-body">
          <div class="selected-name-row">
            <InlineNameField
              label="Clip name"
              value={activeClip?.name ?? 'Animation 1'}
              onCommit={(value) => session.renameAnimationClip(value)}
            />
            <span class="texture-kind">
              {animationClips.length} clip{animationClips.length === 1 ? '' : 's'}
            </span>
          </div>
          <div class="render-field">
            <span>Frames per second</span>
            <NumberField
              label="Frames per second"
              value={session.snapshot.animationFps}
              step={1}
              precision={0}
              min={1}
              max={120}
              disabled={meshPoseEditing}
              onCommit={(value) => session.setAnimationSettings({ fps: value })}
            />
          </div>
          <div class="render-field">
            <span>Start frame</span>
            <NumberField
              label="Start frame"
              value={session.snapshot.animationStartFrame}
              step={1}
              precision={0}
              min={0}
              disabled={meshPoseEditing}
              onCommit={(value) =>
                session.setAnimationSettings({ startFrame: value })}
            />
          </div>
          <div class="render-field">
            <span>End frame</span>
            <NumberField
              label="End frame"
              value={session.snapshot.animationEndFrame}
              step={1}
              precision={0}
              min={1}
              disabled={meshPoseEditing}
              onCommit={(value) =>
                session.setAnimationSettings({ endFrame: value })}
            />
          </div>
          <Switch
            label="Loop playback"
            checked={session.snapshot.animationLoop}
            onChange={(value) => session.setAnimationLoop(value)}
          />
          <SelectField
            label="Interpolation"
            value={session.snapshot.animationInterpolation}
            options={[
              { value: 'linear', label: 'Linear' },
              { value: 'step', label: 'Step' }
            ]}
            onChange={(value) =>
              session.setAnimationInterpolation(value as 'linear' | 'step')}
          />
        </div>
      </InspectorSection>
    {/snippet}

    {#snippet shapeKeysBlock()}
      <div class="render-look shape-keys-block">
        <div class="render-look-head">
          <span>Shape keys</span>
          <span>
            {shapeKeys.length} key{shapeKeys.length === 1 ? '' : 's'}
            {#if activeShapeWeightTrack}
              · {activeShapeWeightTrack.keyframes.length} keyed
            {/if}
          </span>
        </div>
        {#if activeNode}
          {#if shapeEditingId}
            <div class="shape-edit-banner">
              <div>
                <span class="kicker">Editing {editingShapeName}</span>
                <span class="sub">Live target · one undo step</span>
              </div>
              <div class="shape-edit-actions">
                <ActionButton
                  label="Finish"
                  icon="checker"
                  variant="primary"
                  onActivate={() => session.finishShapeEdit()}
                />
                <ActionButton
                  label="Cancel"
                  icon="close"
                  onActivate={() => session.cancelShapeEdit()}
                />
              </div>
            </div>
          {:else}
            <ActionRow>
              <ActionButton
                label="Add shape key"
                icon="plus"
                onActivate={() => session.addShapeKey()}
              />
            </ActionRow>
          {/if}
          {#if shapeKeys.length === 0}
            <p class="hint">
              Add a key, edit its target, then key its weight in the timeline.
            </p>
          {:else}
            <div class="shape-key-list">
              {#each shapeKeys as key (key.id)}
                <div data-shape-key-id={key.id}>
                  <OutlinerRow
                    active={key.id === activeShapeKey?.id}
                    hidden={!key.visible}
                    dragging={draggedShapeKeyId === key.id}
                    dropTarget={shapeDropTargetId === key.id}
                    dropAfter={shapeDropAfter}
                    showVisibility
                    visible={key.visible}
                    visibilityLabel={key.visible
                      ? `Hide ${key.name}`
                      : `Show ${key.name}`}
                    dragLabel={`Reorder ${key.name}`}
                    dragTitle="Drag to reorder"
                    onDragStart={(event) => beginShapeReorder(event, key.id)}
                    onToggleVisibility={() =>
                      session.setShapeKeyVisible(key.id, !key.visible)}
                    selectLabel={`Select ${key.name}`}
                    onSelect={() => {
                      if (!shapeEditingId) session.selectShapeKey(key.id);
                    }}
                  >
                    <span class="object-glyph">
                      <Icon name="checker" size={13} />
                    </span>
                    <span class="object-name">{key.name}</span>
                    <span class="object-kind">{key.weight.toFixed(2)}</span>
                  </OutlinerRow>
                </div>
              {/each}
            </div>
            {#if activeShapeKey}
              <div class="shape-key-detail">
                <InlineNameField
                  label="Shape key name"
                  value={activeShapeKey.name}
                  onCommit={(value) =>
                    session.renameShapeKey(activeShapeKey.id, value)}
                />
                {#if shapeEditingId}
                  <p class="hint">Edit the target, then Finish.</p>
                {:else}
                  <SliderField
                    label="Weight"
                    value={activeShapeKey.weight}
                    min={0}
                    max={1}
                    step={0.01}
                    precision={2}
                    onChange={(value) =>
                      session.setShapeKeyWeight(activeShapeKey.id, value)}
                  />
                  <ActionRow>
                    <ActionButton
                      label="Key weight"
                      icon="plus"
                      onActivate={() =>
                        session.keyShapeWeight(activeShapeKey.id)}
                    />
                    <ActionButton
                      label="Edit target"
                      icon="cursor"
                      variant="primary"
                      onActivate={() =>
                        session.beginShapeEdit(activeShapeKey.id)}
                    />
                    <ActionButton
                      label="Capture current mesh"
                      icon="checker"
                      onActivate={() =>
                        session.captureShapeKeyFromMesh(activeShapeKey.id)}
                    />
                  </ActionRow>
                  <p class="hint">
                    {#if activeShapeWeightTrack}
                      {activeShapeWeightTrack.keyframes.length} weight
                      key{activeShapeWeightTrack.keyframes.length === 1 ? '' : 's'} in the timeline.
                    {:else}
                      No weight keys yet; Key weight writes one at the playhead.
                    {/if}
                  </p>
                  <DangerAction
                    label="Delete shape key"
                    onActivate={() => session.removeShapeKey(activeShapeKey.id)}
                  />
                {/if}
              </div>
            {/if}
          {/if}
        {:else}
          <p class="hint">Select an object to edit its shape keys.</p>
        {/if}
      </div>
    {/snippet}

    {#snippet animationSection()}
      <InspectorSection
        title="Object animation"
        meta={`${activeNode?.name ?? 'No object'} · ${activeObjectTrackCount} track${activeObjectTrackCount === 1 ? '' : 's'}`}
        open={sections.animation}
        onToggle={(open) => setSection('animation', open)}
      >
        <div class="module-body">
          <div class="render-look">
            <div class="render-look-head">
              <span>Mesh motion</span>
              <span>
                {activeMeshTrack
                  ? `${activeMeshTrack.keyframes.length} key${activeMeshTrack.keyframes.length === 1 ? '' : 's'}`
                  : 'No keys'}
              </span>
            </div>
            {#if meshPoseEditing}
              <div class="shape-edit-banner mesh-pose-banner">
                <div>
                  <span class="kicker">Editing mesh pose · frame {meshPoseFrame}</span>
                  <span class="sub">Temporary pose · shape keys paused.</span>
                </div>
                <div class="shape-edit-actions">
                  <ActionButton
                    label="Finish pose"
                    icon="checker"
                    variant="primary"
                    onActivate={() => session.finishMeshPoseEdit()}
                  />
                  <ActionButton
                    label="Cancel"
                    icon="close"
                    onActivate={() => session.cancelMeshPoseEdit()}
                  />
                </div>
              </div>
            {:else if activeNode}
              <ActionButton
                label="Edit mesh pose"
                icon="move"
                variant="primary"
                disabled={shapeEditingId !== null}
                onActivate={() => session.beginMeshPoseEdit()}
              />
              <p class="hint">
                Move elements, then Finish to store a key; Cancel discards it.
              </p>
              {#if activeMeshTrack && activeMeshTrack.keyframes.length > 0}
                <p class="hint">
                  Topology editing is locked while this object has Mesh Motion
                  keys.
                </p>
              {/if}
            {:else}
              <p class="hint">Select a mesh object to animate its shape.</p>
            {/if}
          </div>
          <div class="render-look">
            <div class="render-look-head">
              <span>Texture</span>
              <span>
                {activeTextureTrack
                  ? `${activeTextureTrack.keyframes.length} key${activeTextureTrack.keyframes.length === 1 ? '' : 's'}`
                  : 'No track'}
              </span>
            </div>
            {#if activeNode}
              {#if activeTextureTrack}
                <SelectField
                  label="Texture key"
                  value={session.snapshot.activeNodeTextureId ?? ''}
                  options={[
                    { value: '', label: 'No texture' },
                    ...textureAssets.map((asset) => ({
                      value: asset.id,
                      label: asset.name
                    }))
                  ]}
                  onChange={(value) =>
                    session.setActiveTextureKey(value === '' ? null : value)}
                />
                <ActionRow>
                  <ActionButton
                    label="Key current"
                    icon="image"
                    onActivate={() => session.keyActiveTexture()}
                  />
                </ActionRow>
              {:else}
                <ActionButton
                  label="Key texture"
                  icon="image"
                  onActivate={() => session.keyActiveTexture()}
                />
              {/if}
            {:else}
              <p class="hint">Select a mesh object to animate its texture.</p>
            {/if}
          </div>
          {@render shapeKeysBlock()}
        </div>
      </InspectorSection>
    {/snippet}

    {#snippet modulatorsSection()}
      <InspectorSection
        title="Modulators"
        meta={`${session.snapshot.animationModulators.length} modulator${session.snapshot.animationModulators.length === 1 ? '' : 's'}`}
        open={sections.modulators}
        onToggle={(open) => setSection('modulators', open)}
      >
        <div class="module-body">
          <ModulatorPanel {session} showHeader={false} />
        </div>
      </InspectorSection>
    {/snippet}

    {#snippet cameraSection()}
<InspectorSection
      title="Camera"
      meta={`${cameras.length} camera${cameras.length === 1 ? '' : 's'}`}
      open={sections.camera}
      onToggle={(open) => setSection('camera', open)}
    >
      <div class="module-body">
        <ActionRow>
          <ActionButton
            label="Add from view"
            icon="plus"
            onActivate={() => session.addCameraFromCurrentView()}
          />
        </ActionRow>
        {#if activeCamera && animationTracks.some((track) => track.kind === 'camera' && track.targetId === activeCamera.id)}
          <p class="hint">Camera edits auto-key on this track.</p>
        {/if}
        <div class="object-list">
          {#each cameras as camera (camera.id)}
            <OutlinerRow
              active={activeCamera?.id === camera.id}
              hidden={false}
              cameraId={camera.id}
              showVisibility={false}
              visible={true}
              visibilityLabel={`Camera ${camera.name}`}
              onToggleVisibility={() => session.selectCamera(camera.id)}
              selectLabel={`Select ${camera.name}`}
              onSelect={() => session.selectCamera(camera.id)}
            >
              <span class="object-glyph">
                <Icon name="camera" size={14} />
              </span>
              <span class="object-name">{camera.name}</span>
              <span class="object-kind">{camera.fov.toFixed(0)}°</span>
            </OutlinerRow>
          {/each}
        </div>
        {#if cameras.length === 0}
          <p class="hint">Add a camera from the current viewport view for rendering.</p>
        {/if}
        {#if activeCamera}
          <div class="selected-name-row">
            <InlineNameField
              label="Camera name"
              value={activeCamera.name}
              onCommit={(value) => session.updateActiveCamera({ name: value })}
            />
            <span class="texture-kind">perspective</span>
          </div>
          <Vector3Field
            label="Position"
            values={activeCamera.position}
            step={0.1}
            onCommit={(value) => session.updateActiveCamera({ position: value })}
          />
          <Vector3Field
            label="Target"
            values={activeCamera.target}
            step={0.1}
            onCommit={(value) => session.updateActiveCamera({ target: value })}
          />
          <SliderField
            label="Field of view"
            value={activeCamera.fov}
            min={5}
            max={160}
            step={1}
            precision={1}
            onChange={(value) => session.updateActiveCamera({ fov: value })}
          />
          <ActionRow>
            <ActionButton
              label="Frame"
              icon="frame"
              onActivate={() => session.frameActiveCamera()}
            />
            <ActionButton
              label="From view"
              icon="camera"
              onActivate={() => session.setActiveCameraFromView()}
            />
            <ActionButton
              label={session.snapshot.renderCameraView ? 'Exit' : 'Through'}
              icon="eye"
              active={session.snapshot.renderCameraView}
              onActivate={() => session.toggleCameraView()}
            />
          </ActionRow>
          <DangerAction
            label="Delete camera"
            onActivate={() => session.deleteActiveCamera()}
          />
        {/if}
      </div>
    </InspectorSection>
    {/snippet}

    {#snippet renderSection()}
<InspectorSection
      title="Render"
      meta={`${session.snapshot.renderVirtualWidth} × ${session.snapshot.renderVirtualHeight} → ${session.snapshot.renderOutputWidth} × ${session.snapshot.renderOutputHeight}`}
      open={sections.render}
      onToggle={(open) => setSection('render', open)}
    >
      <div class="module-body">
        <SelectField
          label="Output kind"
          value={session.snapshot.renderKind}
          options={renderKindOptions}
          onChange={(value) =>
            session.updateRenderSettings({
              renderKind: value as 'still' | 'sequence' | 'webm' | 'mp4'
            })}
        />
        <div class="render-field">
          <span>Virtual width</span>
          <NumberField
            label="Virtual width"
            value={session.snapshot.renderVirtualWidth}
            step={1}
            precision={0}
            min={1}
            max={4096}
            onCommit={(value) => session.updateRenderSettings({ renderVirtualWidth: value })}
          />
        </div>
        <div class="render-field">
          <span>Virtual height</span>
          <NumberField
            label="Virtual height"
            value={session.snapshot.renderVirtualHeight}
            step={1}
            precision={0}
            min={1}
            max={4096}
            onCommit={(value) => session.updateRenderSettings({ renderVirtualHeight: value })}
          />
        </div>
        <div class="render-field">
          <span>Output width</span>
          <NumberField
            label="Output width"
            value={session.snapshot.renderOutputWidth}
            step={1}
            precision={0}
            min={1}
            max={4096}
            onCommit={(value) => session.updateRenderSettings({ renderOutputWidth: value })}
          />
        </div>
        <div class="render-field">
          <span>Output height</span>
          <NumberField
            label="Output height"
            value={session.snapshot.renderOutputHeight}
            step={1}
            precision={0}
            min={1}
            max={4096}
            onCommit={(value) => session.updateRenderSettings({ renderOutputHeight: value })}
          />
        </div>
        {#if session.snapshot.renderKind !== 'still'}
          <div class="render-field">
            <span>Start frame</span>
            <NumberField
              label="Render start frame"
              value={session.snapshot.renderStartFrame}
              step={1}
              precision={0}
              min={0}
              onCommit={(value) =>
                session.updateRenderSettings({ renderStartFrame: value })}
            />
          </div>
          <div class="render-field">
            <span>End frame</span>
            <NumberField
              label="Render end frame"
              value={session.snapshot.renderEndFrame}
              step={1}
              precision={0}
              min={1}
              onCommit={(value) =>
                session.updateRenderSettings({ renderEndFrame: value })}
            />
          </div>
        {/if}
        <SelectField
          label="Upscale"
          value={session.snapshot.renderUpscale}
          options={[
            { value: 'nearest', label: 'Nearest' },
            { value: 'smooth', label: 'Smooth' }
          ]}
          onChange={(value) =>
            session.updateRenderSettings({
              renderUpscale: value as 'nearest' | 'smooth'
            })}
        />
        <SelectField
          label="Shading"
          value={session.snapshot.renderShading}
          options={[
            { value: 'lit', label: 'Lit + realtime shadows' },
            { value: 'texture', label: 'Texture / baked' },
            { value: 'solid', label: 'Solid' }
          ]}
          onChange={(value) =>
            session.updateRenderSettings({
              renderShading: value as 'lit' | 'texture' | 'solid'
            })}
        />
        <SelectField
          label="Final shadows"
          value={session.snapshot.renderShadowMode}
          options={[
            { value: 'pcf', label: 'PCF · fast preview quality' },
            { value: 'raytraced', label: 'Ray traced · all lights' },
            { value: 'baked', label: 'Baked · static lighting' }
          ]}
          onChange={(value) =>
            session.updateRenderSettings({
              renderShadowMode: value as 'pcf' | 'raytraced' | 'baked'
            })}
        />
        <p class="texture-note">
          The live preview always uses PCF; this setting applies to final render and export.
          {#if session.snapshot.renderShadowMode === 'raytraced'}
            Ray traced final is slower and supports animation and all lights.
          {:else if session.snapshot.renderShadowMode === 'baked'}
            Baked final uses existing baked lighting textures. Static objects and lights only; animated geometry or lights will be stale.
          {:else}
            PCF final uses the fast viewport shadow map.
          {/if}
        </p>
        <Switch
          label="Transparent background"
          checked={session.snapshot.renderTransparent}
          onChange={(value) =>
            session.updateRenderSettings({ renderTransparent: value })}
        />
        {#if !session.snapshot.renderTransparent}
          <ColorField
            label="Background"
            value={session.snapshot.renderBackground}
            onChange={(value) =>
              session.updateRenderSettings({ renderBackground: value })}
          />
        {/if}
        {#if activeCamera}
          <p class="texture-note">Rendering through {activeCamera.name}.</p>
        {:else}
          <p class="texture-note">Add a camera from the Camera section before rendering.</p>
        {/if}
        <ActionRow align="end">
          <ActionButton
            label={session.snapshot.renderBusy
              ? 'Rendering…'
              : session.snapshot.renderKind === 'sequence'
                ? 'Render frames'
                : session.snapshot.renderKind === 'webm' ||
                    session.snapshot.renderKind === 'mp4'
                  ? `Render ${session.snapshot.renderKind.toUpperCase()}`
                  : 'Render PNG'}
            icon="camera"
            disabled={activeCamera === null || session.snapshot.renderBusy}
            onActivate={() => {
              if (session.snapshot.renderKind === 'sequence') {
                void session.renderFrames();
              } else if (
                session.snapshot.renderKind === 'webm' ||
                session.snapshot.renderKind === 'mp4'
              ) {
                void session.renderVideo();
              } else {
                void session.renderStill();
              }
            }}
          />
        </ActionRow>
      </div>
    </InspectorSection>
    {/snippet}

    {#snippet lightSection()}
<InspectorSection
      title="Lighting"
      meta={`${lights.length} light${lights.length === 1 ? '' : 's'}`}
      open={sections.light}
      onToggle={(open) => setSection('light', open)}
    >
      <div class="module-body">
        <ActionRow align="between">
          <ActionMenu
            label="Add light"
            icon="plus"
            menuTitle="Add light"
            options={[
              {
                label: 'Directional light',
                icon: 'sun',
                onSelect: () => session.addLight('directional')
              },
              {
                label: 'Point light',
                icon: 'lamp',
                onSelect: () => session.addLight('point')
              }
            ]}
          />
          <span class="texture-note">{lights.length} {lights.length === 1 ? 'light' : 'lights'}</span>
        </ActionRow>
        {#if activeLight && animationTracks.some((track) => track.kind === 'light' && track.targetId === activeLight.id)}
          <p class="hint">
            Light position, direction, and intensity auto-key at the current
            frame while its animation track exists.
          </p>
        {/if}
        <div class="light-list">
          {#each lights as light (light.id)}
            <OutlinerRow
              active={activeLight?.id === light.id}
              hidden={!light.enabled}
              lightId={light.id}
              visible={light.enabled}
              visibilityLabel={light.enabled ? `Disable ${light.name}` : `Enable ${light.name}`}
              onToggleVisibility={() => session.setLightEnabled(light.id, !light.enabled)}
              selectLabel={`Select ${light.name}`}
              onSelect={() => session.selectLight(light.id)}
            >
              <span class="object-glyph">
                <Icon name={light.kind === 'directional' ? 'sun' : 'lamp'} size={14} />
              </span>
              <span class="object-name">{light.name}</span>
              <span class="object-kind">{light.kind}</span>
            </OutlinerRow>
          {/each}
        </div>
        {#if lights.length === 0}
          <p class="hint">Add a directional or point light to illuminate the model.</p>
        {/if}
        {#if activeLight}
          <div class="selected-name-row">
            <InlineNameField
              label="Light name"
              value={activeLight.name}
              onCommit={(value) => session.updateActiveLight({ name: value })}
            />
            <span class="texture-kind">{activeLight.kind}</span>
          </div>
          <ColorField
            label="Color"
            value={activeLight.color}
            onChange={(value) => session.updateActiveLight({ color: value })}
          />
          <SliderField
            label="Intensity"
            value={activeLight.intensity}
            min={0}
            max={10}
            step={0.01}
            onChange={(value) => session.updateActiveLight({ intensity: value })}
          />
          <Vector3Field
            label="Position"
            values={activeLight.position}
            step={0.1}
            onCommit={(value) => session.updateActiveLight({ position: value })}
          />
          {#if activeLight.kind === 'directional'}
            <Vector3Field
              label="Direction"
              values={activeLight.direction}
              step={0.01}
              onCommit={(value) => session.updateActiveLight({ direction: value })}
            />
          {/if}
          <Switch
            label="Cast shadows"
            description="Hard or soft shadow in Lit and baked lighting."
            checked={activeLight.castShadows}
            onChange={(value) => session.updateActiveLight({ castShadows: value })}
          />
          {#if activeLight.castShadows}
            <SliderField
              label="Shadow softness"
              value={activeLight.shadowSoftness}
              min={0}
              max={1}
              step={0.01}
              precision={2}
              onChange={(value) =>
                session.updateActiveLight({ shadowSoftness: value })}
            />
          {/if}
          <DangerAction
            label="Delete light"
            onActivate={() => session.deleteActiveLight()}
          />
        {/if}
        <div class="light-divider"></div>
        <div class="light-subhead">
          <span>Ambient</span>
          <span class="texture-note">{session.snapshot.ambientIntensity.toFixed(2)}</span>
        </div>
        <ColorField
          label="Color"
          value={session.snapshot.ambientColor}
          onChange={(value) => session.setAmbientColor(value)}
        />
        <SliderField
          label="Intensity"
          value={session.snapshot.ambientIntensity}
          min={0}
          max={2}
          step={0.01}
          precision={2}
          onChange={(value) => session.setAmbientIntensity(value)}
        />
        <div class="light-divider"></div>
        <div class="light-subhead">
          <span>Ambient occlusion</span>
          <span class="texture-note">
            {session.snapshot.ambientOcclusion.enabled ? 'Preview + bake' : 'Off'}
          </span>
        </div>
        <Switch
          label="Ambient occlusion"
          description="Preview crevice shading in Lit and include it in Bake lighting."
          checked={session.snapshot.ambientOcclusion.enabled}
          onChange={(value) => session.setAmbientOcclusion({ enabled: value })}
        />
        {#if session.snapshot.ambientOcclusion.enabled}
          <SliderField
            label="Strength"
            value={session.snapshot.ambientOcclusion.strength}
            min={0}
            max={1}
            step={0.01}
            precision={2}
            onChange={(value) =>
              session.setAmbientOcclusion({ strength: value })}
          />
          <div class="render-field">
            <span>Distance</span>
            <NumberField
              label="AO distance"
              value={session.snapshot.ambientOcclusion.distance}
              step={0.1}
              precision={2}
              min={0.01}
              max={20}
              onCommit={(value) =>
                session.setAmbientOcclusion({ distance: value })}
            />
          </div>
          <div class="render-field">
            <span>Bias</span>
            <NumberField
              label="AO bias"
              value={session.snapshot.ambientOcclusion.bias}
              step={0.001}
              precision={3}
              min={0}
              max={0.2}
              onCommit={(value) =>
                session.setAmbientOcclusion({ bias: value })}
            />
          </div>
          <SelectField
            label="Samples"
            value={String(session.snapshot.ambientOcclusion.samples)}
            options={[
              { value: '8', label: '8 rays' },
              { value: '16', label: '16 rays' },
              { value: '32', label: '32 rays' }
            ]}
            onChange={(value) =>
              session.setAmbientOcclusion({ samples: Number(value) })}
          />

        {/if}
        <div class="light-divider"></div>
        <div class="light-bake">
          <span>
            Bake active object lighting into a texture layer
            {#if activeNode}
              <strong>{activeNode.name}</strong>
            {:else}
              <strong>select an object first</strong>
            {/if}
          </span>
          <span class="texture-note">Direct light, shadows, and AO (when enabled). Overlapping UVs bake into a copy.</span>
          <ActionButton
            label={session.snapshot.bakeBusy ? 'Baking…' : 'Bake lighting'}
            icon="lit"
            disabled={activeNode === null || session.snapshot.bakeBusy}
            onActivate={() => void session.bakeLighting()}
          />
        </div>
      </div>
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
      <Switch
        label="Two-sided"
        description="Render backfaces. Use with transparent/Cutout textures for foliage cards and other billboard planes."
        checked={activeNode?.doubleSided ?? false}
        onChange={(value) => session.setActiveNodeDoubleSided(value)}
      />
      <ActionRow align="end">
        <ActionButton
          label="Apply all transforms"
          icon="merge"
          disabled={!session.snapshot.canApplyTransforms}
          onActivate={() => session.applyAllTransforms()}
        />
      </ActionRow>
      {#if session.snapshot.applyTransformsBlockedReason}
        <p class="hint">{session.snapshot.applyTransformsBlockedReason}</p>
      {:else}
        <p class="hint">
          Bakes object position, rotation, and scale into the mesh and shape
          keys. Group transforms remain.
        </p>
      {/if}
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
        <div class="selection-summary">
          <span class="selection-badge">G</span>
          <div class="selection-summary-text">
            <p class="selection-title">Group selected</p>
            <p class="selection-subtitle">Object transform only</p>
          </div>
        </div>

      {:else if modifiersActive}
        <div class="selection-summary">
          <span class="selection-badge">{selectionCount > 0 ? selectionCount : 'M'}</span>
          <div class="selection-summary-text">
            <p class="selection-title">
              {selectionCount > 0 ? `${selectionCount} ${modePlural} selected` : 'Modifiers active'}
            </p>
            <p class="selection-subtitle">Editing the base mesh</p>
          </div>
        </div>

      {:else if activeNodeId === null}
        <p class="empty-state">
          The scene is empty. Add a QuadSphere, Cylinder, or Grid above.
        </p>
      {:else if selectionCount === 0}
        <p class="empty-state">
          No {modeLabel.toLowerCase()} selected. Pick one in the viewport, or
          use the selection-mode icons.
        </p>
      {:else}
        <div class="selection-summary">
          <span class="selection-badge">{selectionCount}</span>
          <div class="selection-summary-text">
            <p class="selection-title">{selectionTitle}</p>
            <p class="selection-subtitle">{selectionSubtitle}</p>
          </div>
        </div>
      {/if}

      {#if canEdit3d && session.snapshot.selectionMode === 'vertex' && selectionCount === 1 && selectedPosition}
        <div class="selection-block">
          <span class="selection-group-label">Position (object)</span>
          <Vector3Field
            label="Position"
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
        </div>

      {/if}

      {#if selectionCount > 0}
        {#if canEdit3d &&
          ((session.snapshot.selectionMode === 'vertex' && selectionCount >= 2) ||
            (session.snapshot.selectionMode === 'face' && selectionCount > 0))}
          <div class="selection-group">
            <span class="selection-group-label">
              {session.snapshot.selectionMode === 'vertex' ? 'Vertices' : 'Faces'}
            </span>
            <ActionRow>
              {#if session.snapshot.selectionMode === 'vertex'}
                <ActionButton
                  label="Merge"
                  icon="merge"
                  onActivate={() => session.mergeSelectedVertices()}
                />
              {:else}
                <ActionButton
                  label="Extrude"
                  icon="extrude"
                  onActivate={() => session.extrudeSelectedFaces()}
                />
                {#if selectionCount === 1}
                  <ActionButton
                    label="Inset"
                    icon="inset"
                    onActivate={() => session.insetSelectedFace()}
                  />
                {/if}
              {/if}
            </ActionRow>
          </div>
        {/if}

        {#if canEdit3d && session.snapshot.selectionMode === 'edge'}
          <div class="selection-group">
            <span class="selection-group-label">Edges</span>
            <ActionRow>
              {#if selectionCount === 1}
                <ActionButton
                  label="Loop Cut"
                  icon="loop-cut"
                  onActivate={() => session.loopCut()}
                />
              {:else}
                <ActionButton
                  label="Bridge"
                  icon="bridge"
                  onActivate={() => session.bridgeSelectedEdges()}
                />
              {/if}
            </ActionRow>
            <p class="hint">Bevel: one edge at a time, from the Action Dock.</p>
          </div>
        {/if}

        {#if canSeam &&
          activeNodeId !== null &&
          ((session.snapshot.selectionMode === 'edge' && selectionCount > 0) ||
            session.snapshot.seamCount > 0)}
          <div class="selection-group">
            <span class="selection-group-label">UV seams</span>
            <ActionRow>
              {#if session.snapshot.selectionMode === 'edge' && selectionCount > 0}
                <ActionButton
                  label="Toggle seam"
                  icon="seam"
                  onActivate={() => session.toggleSelectedSeams()}
                />
              {/if}
              {#if session.snapshot.seamCount > 0}
                <ActionButton
                  label="Clear seams"
                  icon="seam"
                  onActivate={() => session.clearAllSeams()}
                />
              {/if}
            </ActionRow>
            {#if session.snapshot.seamCount > 0}
              <p class="hint">
                {session.snapshot.seamCount} seam{session.snapshot.seamCount === 1 ? '' : 's'} on this mesh.
              </p>
            {/if}
          </div>
        {/if}

        {#if canEdit3d}
          <DangerAction
            label={`Delete ${selectionCount === 1 ? modeLabel.toLowerCase() : modePlural}`}
            onActivate={() => session.deleteSelection()}
          />
        {/if}
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
          {#if session.snapshot.paintTool === 'brush' || session.snapshot.paintTool === 'eraser'}
            <div class="brush-group">
              <span class="brush-group-title">Presets</span>
              <div class="brush-presets" role="group" aria-label="Brush presets">
                {#each BRUSH_PRESETS as preset (preset.id)}
                  <ActionButton
                    label={preset.label}
                    active={session.snapshot.paintPreset === preset.id}
                    onActivate={() => session.applyBrushPreset(preset.id)}
                  />
                {/each}
              </div>
            </div>
          {/if}

          <div class="brush-group">
            <span class="brush-group-title">Tip</span>
            <SliderNumberField
              label="Size"
              value={session.snapshot.uvBrushSize}
              min={1}
              max={512}
              step={1}
              precision={0}
              unit="px"
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
              label="Spacing"
              value={session.snapshot.paintSpacing}
              min={MIN_PAINT_SPACING}
              max={MAX_PAINT_SPACING}
              step={0.01}
              percent
              onChange={(value) => session.setPaintSpacing(value)}
            />
          </div>

          <div class="brush-group">
            <span class="brush-group-title">Dynamics</span>
            <SliderField
              label="Pressure curve"
              value={session.snapshot.paintPressureCurve}
              min={0.2}
              max={4}
              step={0.05}
              precision={2}
              onChange={(value) => session.setPaintPressureCurve(value)}
            />
            <SliderField
              label="Min size"
              value={session.snapshot.paintPressureMin}
              min={0}
              max={0.95}
              step={0.01}
              percent
              onChange={(value) => session.setPaintPressureMin(value)}
            />
            <Switch
              label="Pressure affects opacity"
              description="Off keeps a 100% brush opaque at every pressure; size and tilt still respond."
              checked={session.snapshot.paintPressureOpacity}
              onChange={(value) => session.setPaintPressureOpacity(value)}
            />
            <Switch
              label="Tilt shapes stamp"
              description="Use Pencil tilt to flatten the brush into an ellipse."
              checked={session.snapshot.paintTiltEnabled}
              onChange={(value) => session.setPaintTiltEnabled(value)}
            />
          </div>

          <div class="brush-group">
            <span class="brush-group-title">Stroke</span>
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
            <SliderField
              label="Taper in (px)"
              value={session.snapshot.paintTaperIn}
              min={0}
              max={256}
              step={1}
              precision={0}
              onChange={(value) => session.setPaintTaperIn(value)}
            />
          </div>

          {#if session.snapshot.paintTool === 'gradient'}
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
          <div class="transform-spaces">
            <div class="space-row">
              <span class="space-label">Values</span>
              <SegmentedControl
                label="Transform values space"
                options={valueSpaceOptions}
                value={transformValueSpace}
                variant="workspace"
                onSelect={(id) =>
                  session.setTransformValueSpace(id === 'global' ? 'global' : 'local')}
              />
            </div>
            <div class="space-row">
              <span class="space-label">Gizmo</span>
              <SegmentedControl
                label="Gizmo axis orientation"
                options={gizmoOrientationOptions}
                value={gizmoOrientation}
                variant="workspace"
                onSelect={(id) =>
                  session.setTransformOrientation(id === 'local' ? 'local' : 'global')}
              />
            </div>
            {#if selectionCount > 0}
              <div class="space-row">
                <span class="space-label">Pivot</span>
                <SegmentedControl
                  label="Transform pivot"
                  options={transformPivotOptions}
                  value={transformPivotMode}
                  variant="workspace"
                  onSelect={(id) =>
                    session.setTransformPivotMode(id === 'origin' ? 'origin' : 'median')}
                />
              </div>
            {/if}
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
          <CreateRow
            label="Modifier type"
            value={modifierKind}
            options={modifierOptions}
            onChange={(value) => (modifierKind = value as ModifierKind)}
            onAdd={() => session.addModifier(modifierKind)}
          />

          {#if modifierError}
            <p class="modifier-error">{modifierError}</p>
          {/if}

          {#if modifiers.length > 0}
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
                      <div class="modifier-switch">
                        <Switch
                          label="Flip side"
                          description="Keep the negative local side."
                          checked={modifier.flip}
                          onChange={(value) =>
                            updateModifierFlag(modifier.id, 'flip', value)}
                        />
                      </div>
                      <div class="modifier-switch">
                        <Switch
                          label="Clip"
                          description="Remove geometry beyond the plane before reflecting."
                          checked={modifier.clip}
                          onChange={(value) =>
                            updateModifierFlag(modifier.id, 'clip', value)}
                        />
                      </div>
                      <div class="modifier-switch">
                        <Switch
                          label="Merge seam"
                          description="Snap near-plane vertices into one seam."
                          checked={modifier.merge}
                          onChange={(value) =>
                            updateModifierFlag(modifier.id, 'merge', value)}
                        />
                      </div>
                      <label class="modifier-field">
                        <span>Merge threshold</span>
                        <NumberField
                          value={modifier.mergeThreshold}
                          label="Mirror merge threshold"
                          step={0.001}
                          precision={4}
                          min={0.000001}
                          max={10}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(
                              modifier.id,
                              'mergeThreshold',
                              value
                            )}
                        />
                      </label>
                      <div class="modifier-switch">
                        <Switch
                          label="Mirror U"
                          description="Mirror the reflected texture coordinate."
                          checked={modifier.mirrorUv}
                          onChange={(value) =>
                            updateModifierFlag(modifier.id, 'mirrorUv', value)}
                        />
                      </div>
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
                    {:else if modifier.type === 'radial-array'}
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
                    {:else if modifier.type === 'deform'}
                      <label class="modifier-field">
                        <span>Mode</span>
                        <select
                          value={modifier.mode}
                          aria-label="Deform mode"
                          onchange={(event) => {
                            const mode = event.currentTarget.value as
                              | 'bend'
                              | 'twist'
                              | 'taper';
                            session.updateModifier(modifier.id, {
                              mode,
                              amount: mode === 'taper' ? 0.5 : 30
                            });
                          }}
                        >
                          <option value="twist">Twist</option>
                          <option value="bend">Bend</option>
                          <option value="taper">Taper</option>
                        </select>
                      </label>
                      <label class="modifier-field">
                        <span>{modifier.mode === 'bend' ? 'Plane axis' : 'Axis'}</span>
                        <select
                          value={modifier.axis}
                          aria-label="Deform axis"
                          onchange={(event) =>
                            updateModifierAxis(modifier.id, event)}
                        >
                          <option value="x">X</option>
                          <option value="y">Y</option>
                          <option value="z">Z</option>
                        </select>
                      </label>
                      <label class="modifier-field">
                        <span>{modifier.mode === 'taper' ? 'End scale' : 'Angle'}</span>
                        <NumberField
                          value={modifier.amount}
                          label={modifier.mode === 'taper'
                            ? 'Deform taper end scale'
                            : 'Deform angle in degrees'}
                          step={modifier.mode === 'taper' ? 0.05 : 1}
                          precision={modifier.mode === 'taper' ? 2 : 1}
                          min={modifier.mode === 'taper' ? 0.05 : -720}
                          max={modifier.mode === 'taper' ? 10 : 720}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'amount', value)}
                        />
                      </label>
                    {:else if modifier.type === 'noise-displace'}
                      <label class="modifier-field">
                        <span>Strength</span>
                        <NumberField
                          value={modifier.strength}
                          label="Noise displacement strength"
                          step={0.01}
                          precision={3}
                          min={-100}
                          max={100}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'strength', value)}
                        />
                      </label>
                      <label class="modifier-field">
                        <span>Frequency</span>
                        <NumberField
                          value={modifier.frequency}
                          label="Noise displacement frequency"
                          step={0.05}
                          precision={2}
                          min={0.001}
                          max={100}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'frequency', value)}
                        />
                      </label>
                      <label class="modifier-field">
                        <span>Seed</span>
                        <NumberField
                          value={modifier.seed}
                          label="Noise displacement seed"
                          step={1}
                          precision={0}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'seed', value)}
                        />
                      </label>
                    {:else if modifier.type === 'weld'}
                      <label class="modifier-field">
                        <span>Threshold</span>
                        <NumberField
                          value={modifier.threshold}
                          label="Weld distance threshold"
                          step={0.001}
                          precision={4}
                          min={0.00001}
                          max={10}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'threshold', value)}
                        />
                      </label>
                    {:else if modifier.type === 'outline'}
                      <label class="modifier-field">
                        <span>Units</span>
                        <select
                          value={modifier.units}
                          aria-label="Outline units"
                          onchange={(event) =>
                            updateOutlineUnits(modifier.id, event)}
                        >
                          <option value="screen">Screen</option>
                          <option value="world">World</option>
                        </select>
                      </label>
                      <label class="modifier-field">
                        <span>{modifier.units === 'screen' ? 'Width' : 'Thickness'}</span>
                        <NumberField
                          value={modifier.thickness}
                          label={modifier.units === 'screen'
                            ? 'Outline width in pixels'
                            : 'Outline thickness in world units'}
                          step={modifier.units === 'screen' ? 0.5 : 0.005}
                          precision={modifier.units === 'screen' ? 1 : 3}
                          min={modifier.units === 'screen' ? 0.5 : 0.001}
                          max={modifier.units === 'screen' ? 24 : 1}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'thickness', value)}
                        />
                      </label>
                      <div class="modifier-switch">
                        <ColorField
                          label="Color"
                          value={modifier.color}
                          onChange={(value) =>
                            updateModifierColor(modifier.id, value)}
                        />
                      </div>
                    {:else if modifier.type === 'solidify'}
                      <label class="modifier-field">
                        <span>Thickness</span>
                        <NumberField
                          value={modifier.thickness}
                          label="Solidify thickness"
                          step={0.01}
                          precision={3}
                          min={0.0001}
                          max={10}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'thickness', value)}
                        />
                      </label>
                      <label class="modifier-field">
                        <span>Offset</span>
                        <NumberField
                          value={modifier.offset}
                          label="Solidify offset"
                          step={0.05}
                          precision={2}
                          min={-1}
                          max={1}
                          framed
                          onCommit={(value) =>
                            updateModifierNumber(modifier.id, 'offset', value)}
                        />
                      </label>
                    {/if}
                  </div>
                  <DangerAction
                    label="Remove modifier"
                    onActivate={() => session.removeModifier(modifier.id)}
                  />
                  {#if MODIFIER_DEFINITIONS[modifier.type].category === 'geometry'}
                    <ActionRow align="end">
                      <span
                        class="modifier-apply"
                        title={modifiers
                          .slice(0, index)
                          .some((item) =>
                            item.enabled &&
                            MODIFIER_DEFINITIONS[item.type].category === 'geometry'
                          )
                          ? 'Applies this and earlier enabled geometry modifiers so the remaining stack is unchanged.'
                          : 'Bake this modifier into the editable base mesh.'}
                      >
                        <ActionButton
                          label={modifiers
                            .slice(0, index)
                            .some((item) =>
                              item.enabled &&
                              MODIFIER_DEFINITIONS[item.type].category === 'geometry'
                            )
                            ? 'Apply through'
                            : 'Apply modifier'}
                          icon="merge"
                          disabled={!modifier.enabled || !session.snapshot.canApplyModifiers}
                          onActivate={() => session.applyModifier(modifier.id)}
                        />
                      </span>
                    </ActionRow>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if modifiers.length > 0}
            <ActionRow align="end">
              <ActionButton
                label="Apply all"
                icon="merge"
                disabled={!session.snapshot.canApplyModifiers}
                onActivate={() => session.applyModifierStack()}
              />
            </ActionRow>
            {#if session.snapshot.modifierApplyBlockedReason}
              <p class="hint">{session.snapshot.modifierApplyBlockedReason}</p>
            {/if}
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
      <div class="module-body">
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
              label: asset.name
            }))}
            onChange={(value) => session.setActiveTextureAsset(value)}
          />
          <div class="selected-name-row">
            <InlineNameField
              label="Texture name"
              value={activeTextureAsset?.name ?? ''}
              onCommit={(value) => session.renameTextureAsset(value)}
            />
            <span class="texture-kind">
              {activeTextureAsset?.width ?? session.snapshot.textureSize} × {activeTextureAsset?.height ?? session.snapshot.textureHeight}
            </span>
          </div>
          <div class="texture-asset-meta">
            <span>{textureUsage} object{textureUsage === 1 ? '' : 's'}</span>
            <span>{activeTextureAsset?.filter ?? 'nearest'}</span>
          </div>
          <ActionRow>
            <ActionMenu
              label="New"
              icon="plus"
              menuTitle="New texture"
              options={[
                ...[64, 128, 256, 512, 1024, 2048, 4096].map((size) => ({
                  label: `${size}² texture`,
                  onSelect: () => session.createTextureAsset(size, size)
                })),
                {
                  label: 'Custom size…',
                  separatorBefore: true,
                  onSelect: () => (newTextureOpen = true)
                }
              ]}
            />
            <ActionButton
              label="Custom size"
              icon="grid"
              onActivate={() => (newTextureOpen = true)}
            />
            <ActionButton
              label="Duplicate"
              icon="copy"
              disabled={session.snapshot.fileBusy}
              onActivate={() => void session.duplicateActiveTextureAsset()}
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
          <DangerAction
            label="Delete texture"
            disabled={textureUsage > 0 || textureAssets.length <= 1}
            onActivate={() => session.deleteActiveTextureAsset()}
          />
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
                  label: 'Place image layer',
                  icon: 'image',
                  separatorBefore: true,
                  onSelect: () => textureImportInput?.click()
                },
                {
                  label: 'Tone effect',
                  icon: 'sliders',
                  separatorBefore: true,
                  onSelect: () => session.addTextureEffect('tone')
                },
                {
                  label: 'Posterize effect',
                  icon: 'checker',
                  onSelect: () => session.addTextureEffect('posterize')
                },
                {
                  label: 'Dither effect',
                  icon: 'rows',
                  onSelect: () => session.addTextureEffect('dither')
                }
              ]}
            />
            <span class="texture-note">{textureLayers.length}/8 layers</span>
          </ActionRow>
          <div class="texture-layer-list" role="list">
            {#each textureLayersTopFirst as { layer } (layer.id)}
              <OutlinerRow
                active={session.snapshot.textureActiveId === layer.id}
                hidden={!layer.visible}
                dragging={draggedLayerId === layer.id}
                dropTarget={layerDropTargetId === layer.id}
                dropAfter={layerDropAfter}
                textureLayerId={layer.id}
                dragLabel={`Drag to reorder ${layer.name}`}
                onDragStart={(event) => beginLayerReorder(event, layer.id)}
                visible={layer.visible}
                visibilityLabel={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                onToggleVisibility={() => session.toggleTextureLayer(layer.id)}
                selectLabel={`Select ${layer.name}`}
                onSelect={() => session.setActiveTextureLayer(layer.id)}
              >
                <span
                  class="texture-layer-swatch"
                  class:transparent={layer.pattern === 'transparent'}
                  class:checker={layer.pattern === 'checker'}
                  class:raster={layer.kind === 'raster'}
                  class:effect={layer.kind === 'effect'}
                  style:background={layer.pattern === 'solid' ? layer.color : undefined}
                ></span>
                <span class="texture-layer-name">{layer.name}</span>
                <span class="texture-layer-meta">
                  {layer.kind === 'effect'
                    ? `effect · ${layer.effect?.type ?? '—'}`
                    : `${layer.kind === 'raster' ? 'raster' : layer.pattern} · ${layer.role}`}
                </span>
              </OutlinerRow>
            {/each}
          </div>
          <DangerAction
            label="Delete layer"
            disabled={textureLayers.length <= 1}
            onActivate={() => session.removeTextureLayer(activeTextureLayer?.id ?? '')}
          />
        </div>

        {#if activeTextureLayer}
          <div class="texture-block">
            <div class="selected-name-row">
              <InlineNameField
                label={`${activeTextureLayer.name} layer name`}
                value={activeTextureLayer.name}
                onCommit={(value) =>
                  session.renameTextureLayer(activeTextureLayer.id, value)}
              />
              <span class="texture-kind">
                {activeTextureLayer.kind === 'effect'
                  ? `effect · ${activeTextureLayer.effect?.type ?? '—'}`
                  : activeTextureLayer.kind === 'raster'
                    ? 'raster'
                    : activeTextureLayer.pattern}
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
            {#if activeTextureLayer.kind === 'effect' && activeTextureEffect}
              {#if activeTextureEffect.type === 'tone'}
                <SliderField
                  label="Exposure"
                  value={activeTextureEffect.exposure}
                  min={-2}
                  max={2}
                  step={0.05}
                  precision={2}
                  onChange={(value) => patchActiveEffect({ exposure: value })}
                />
                <SliderField
                  label="Contrast"
                  value={activeTextureEffect.contrast}
                  min={-1}
                  max={1}
                  step={0.01}
                  precision={2}
                  onChange={(value) => patchActiveEffect({ contrast: value })}
                />
                <SliderField
                  label="Gamma"
                  value={activeTextureEffect.gamma}
                  min={0.2}
                  max={3}
                  step={0.05}
                  precision={2}
                  onChange={(value) => patchActiveEffect({ gamma: value })}
                />
              {:else if activeTextureEffect.type === 'posterize'}
                <SliderField
                  label="Levels"
                  value={activeTextureEffect.levels}
                  min={2}
                  max={32}
                  step={1}
                  precision={0}
                  onChange={(value) => patchActiveEffect({ levels: value })}
                />
              {:else}
                <SelectField
                  label="Method"
                  value={activeTextureEffect.mode}
                  options={[
                    { value: 'ordered', label: 'Ordered' },
                    { value: 'diffusion', label: 'Error diffusion' }
                  ]}
                  onChange={(value) => patchActiveEffect({ mode: value })}
                />
                {#if activeTextureEffect.mode === 'ordered'}
                  <SelectField
                    label="Matrix"
                    value={String(activeTextureEffect.matrix)}
                    options={[
                      { value: '2', label: '2 × 2' },
                      { value: '4', label: '4 × 4' },
                      { value: '8', label: '8 × 8' }
                    ]}
                    onChange={(value) =>
                      patchActiveEffect({ matrix: Number(value) })}
                  />
                {/if}
                <SliderField
                  label="Levels"
                  value={activeTextureEffect.levels}
                  min={2}
                  max={32}
                  step={1}
                  precision={0}
                  onChange={(value) => patchActiveEffect({ levels: value })}
                />
                <Switch
                  label="Monochrome"
                  description="Convert to a grayscale palette before dithering."
                  checked={activeTextureEffect.monochrome}
                  onChange={(value) => patchActiveEffect({ monochrome: value })}
                />
              {/if}

            {:else}
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
            {/if}
          </div>
        {/if}
      </div>
    </InspectorSection>
{/snippet}

    {#snippet pixelSection()}
      <InspectorSection
        title="Pixel art"
        meta={pixelTexture
          ? `${pixelTexture.width} × ${pixelTexture.height}`
          : 'No texture'}
        open={sections.pixel}
        onToggle={(open) => setSection('pixel', open)}
      >
        <div class="module-body">
          <p class="hint">
            Fixed one-texel grid with 1 px padding between islands. Islands keep
            their relative size; Relax and Pack apply to all seam islands.
          </p>
          {#if activeNode && pixelTexture}
            <dl class="stats">
              <div>
                <dt>Grid</dt>
                <dd class="text-mono">1 px</dd>
              </div>
              <div>
                <dt>Padding</dt>
                <dd class="text-mono">1 px</dd>
              </div>
            </dl>
            <ActionRow>
              <ActionButton
                label="Relax"
                onActivate={() => session.relaxPixelUv()}
              />
              <ActionButton
                label="Pack islands"
                icon="grid"
                variant="primary"
                onActivate={() => session.packPixelUv()}
              />
            </ActionRow>
            <p class="hint">
              Pack uses the current texture resolution; re-pack after resizing
              it. It expects a non-overlapping unwrap. Thin cuts stay unsnapped
              so they cannot close.
            </p>
          {:else if !activeNode}
            <p class="hint">Select a mesh object to use pixel cells.</p>
          {:else}
            <p class="hint">
              Assign a texture to this object in Paint to enable pixel cells.
            </p>
          {/if}
        </div>
      </InspectorSection>
    {/snippet}

    {#snippet effectsSection()}
      <InspectorSection
        title="Render effects"
        meta={`${session.snapshot.renderEffects.length} effect${session.snapshot.renderEffects.length === 1 ? '' : 's'} · project`}
        open={sections.effects}
        onToggle={(open) => setSection('effects', open)}
      >
        <div class="module-body">
          <RenderEffectsPanel {session} />
        </div>
      </InspectorSection>
    {/snippet}

      {#key session.snapshot.workspace}
        {#each visibleSections as section (section)}
          {#if section === 'scene'}{@render sceneSection()}
          {:else if section === 'clip'}{@render clipSection()}
          {:else if section === 'animation'}{@render animationSection()}
          {:else if section === 'modulators'}{@render modulatorsSection()}
          {:else if section === 'camera'}{@render cameraSection()}
          {:else if section === 'render'}{@render renderSection()}
          {:else if section === 'effects'}{@render effectsSection()}
          {:else if section === 'light'}{@render lightSection()}
          {:else if section === 'transform'}{@render transformSection()}
          {:else if section === 'selection'}{@render selectionSection()}
          {:else if section === 'mesh'}{@render meshSection()}
          {:else if section === 'modifiers'}{@render modifiersSection()}
          {:else if section === 'brush'}{@render brushSection()}
          {:else if section === 'pixel'}{@render pixelSection()}
          {:else if section === 'texture'}{@render textureSection()}
          {/if}
        {/each}
      {/key}
  </div>

  {#if newTextureOpen}
    <NewTextureDialog
      onCancel={() => (newTextureOpen = false)}
      onCreate={(width, height) => {
        newTextureOpen = false;
        session.createTextureAsset(width, height);
      }}
    />
  {/if}
  {#if pendingTextureFile}
    <ImageImportDialog
      file={pendingTextureFile}
      textureWidth={activeTextureAsset?.width ?? session.snapshot.textureSize}
      textureHeight={activeTextureAsset?.height ?? session.snapshot.textureHeight}
      onCancel={() => (pendingTextureFile = null)}
      onImport={(fit) => {
        const file = pendingTextureFile;
        pendingTextureFile = null;
        if (file) {
          void session.beginImagePlacement(
            file,
            file.name.replace(/\.[^.]+$/, ''),
            fit
          );
        }
      }}
    />
  {/if}
  {#if exportDialogFormat !== null}
    <ExportModelDialog
      initialFormat={exportDialogFormat}
      hasActive={activeNode !== null}
      selectedCount={selectedNodeIds.length}
      hasTexture={nodes.some((node) => node.textureId != null)}
      clips={animationClips}
      activeClipId={session.snapshot.animationClipId}
      projectFps={session.snapshot.animationFps}
      busy={session.snapshot.fileBusy}
      onClose={() => (exportDialogFormat = null)}
      onExport={(options) => {
        exportDialogFormat = null;
        void session.exportModel(options);
      }}
    />
  {/if}
  {#if objFramesOpen}
    <ExportObjFramesDialog
      scope={objFramesScope}
      clipId={objFramesClipId}
      clips={animationClips}
      mode={objFramesMode}
      startFrame={objFramesStart}
      endFrame={objFramesEnd}
      step={objFramesStep}
      frameCount={objFramesCount}
      includeTexture={objFramesIncludeTexture}
      unifyTextures={objFramesUnifyTextures}
      atlasSize={objFramesAtlasSize}
      hasTexture={objFramesHasTexture}
      hasActive={activeNode !== null}
      hasSelected={selectedNodeIds.length > 0}
      busy={session.snapshot.fileBusy}
      onScopeChange={(scope) => (objFramesScope = scope)}
      onClipChange={changeObjFramesClip}
      onModeChange={(mode) => (objFramesMode = mode)}
      onStartFrameChange={(frame) => (objFramesStart = frame)}
      onEndFrameChange={(frame) => (objFramesEnd = frame)}
      onStepChange={(step) => (objFramesStep = step)}
      onIncludeTextureChange={(value) => (objFramesIncludeTexture = value)}
      onUnifyTexturesChange={(value) => (objFramesUnifyTextures = value)}
      onAtlasSizeChange={(value) => (objFramesAtlasSize = value)}
      onCancel={() => (objFramesOpen = false)}
      onExport={() => void submitObjFramesExport()}
    />
  {/if}
</aside>

<style>
  .inspector {
    position: fixed;
    z-index: var(--z-panel);
    top: calc(var(--safe-top) + var(--topbar-h) + var(--space-3) * 2);
    right: var(--app-inset-right);
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
    gap: var(--inspector-row-gap);
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
    padding: var(--space-2) var(--space-3);
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
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .transform-spaces {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .space-row {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
  }

  .space-row :global(.segmented) {
    justify-self: end;
  }

  .brush-body {
    gap: var(--inspector-row-gap);
  }

  .brush-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .brush-group + .brush-group {
    padding-top: var(--space-2);
    border-top: var(--hairline) solid var(--border-subtle);
  }

  .brush-group-title {
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  .brush-presets {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-1);
  }

  .brush-presets :global(.action-button) {
    width: 100%;
    padding: 0 var(--space-1);
  }

  .space-label {
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-label);
    line-height: 1;
    text-align: right;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .axis-lock {
    display: flex;
    align-items: center;
    gap: var(--space-1);
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

  .modifier-error {
    margin: 0;
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
    gap: var(--inspector-row-gap);
  }

  .modifier-card {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
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
  }

  .modifier-field {
    display: flex;
    flex-direction: column;
    gap: var(--field-label-gap);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
  }

  .modifier-field select {
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

  .modifier-apply {
    display: inline-flex;
  }

  .modifier-switch {
    grid-column: 1 / -1;
  }

  .selection-summary {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
    padding-bottom: var(--space-2);
  }

  .selection-badge {
    display: inline-grid;
    place-items: center;
    min-width: 28px;
    height: 28px;
    padding: 0 6px;
    border: var(--hairline) solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--accent-primary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .selection-summary-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .selection-subtitle {
    margin: 0;
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-tight);
  }

  .selection-block,
  .selection-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .selection-block {
    gap: var(--inspector-row-gap);
  }

  .selection-group {
    padding-top: var(--space-2);
    border-top: var(--hairline) solid var(--border-subtle);
  }

  .selection-group-label {
    color: var(--text-tertiary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
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


  .texture-block {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
    border-bottom: var(--hairline) solid var(--border-subtle);
  }

  .texture-block:last-child {
    border-bottom: 0;
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
    gap: var(--inspector-row-gap);
  }

  .texture-usage {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .texture-note {
    margin: 0;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .texture-layer-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .light-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .light-divider {
    height: var(--hairline);
    background: var(--border-subtle);
  }

  .light-subhead {
    display: flex;
    justify-content: space-between;
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .light-bake {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--inspector-row-gap);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    line-height: var(--leading-ui);
  }

  .texture-layer-swatch {
    width: 16px;
    height: 16px;
    border: var(--hairline) solid var(--border-strong);
    border-radius: 2px;
    background: var(--bg-input);
  }

  .texture-layer-swatch.effect {
    border-color: var(--accent-primary);
    background: linear-gradient(
      135deg,
      var(--accent-primary) 0 48%,
      var(--bg-input) 52% 100%
    );
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
    flex: 1;
    min-width: 0;
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

  .selected-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .texture-kind {
    flex: 0 0 auto;
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    text-transform: uppercase;
  }

  .render-field {
    display: grid;
    grid-template-columns: var(--inspector-label-width) minmax(0, 1fr);
    align-items: center;
    gap: var(--inspector-row-gap);
    min-height: var(--control-h);
    color: var(--text-secondary);
    font-size: var(--text-xs);
  }

  .render-field > span {
    min-width: 0;
  }

  .render-look {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: var(--hairline) solid var(--border-subtle);
  }

  .render-look-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    color: var(--text-secondary);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
  }

  .render-look-head span:last-child {
    color: var(--text-tertiary);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
  }

  .render-field :global(.number-field) {
    max-width: 96px;
    justify-self: end;
  }

  .animation-track-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .animation-keys {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 112px;
    overflow-y: auto;
  }

  .shape-key-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .shape-key-detail {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
  }

  .shape-edit-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2);
    border: var(--hairline) solid var(--accent-primary);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
  }

  .shape-edit-banner .kicker {
    display: block;
    color: var(--text-primary);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .shape-edit-banner .sub {
    display: block;
    margin-top: 2px;
    color: var(--text-tertiary);
    font-size: 10px;
  }

  .shape-edit-actions {
    display: flex;
    gap: var(--space-1);
    flex: 0 0 auto;
  }

  .shape-edit-banner.mesh-pose-banner {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
  }

  .mesh-pose-banner .shape-edit-actions {
    justify-content: flex-end;
  }

  .module-body {
    display: flex;
    flex-direction: column;
    gap: var(--inspector-row-gap);
  }

  @media (max-width: 899px) {
    .inspector {
      top: auto;
      right: var(--app-inset-right);
      bottom: calc(var(--safe-bottom) + var(--status-h) + var(--space-3));
      left: var(--app-inset-left);
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
