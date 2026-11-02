import { Euler, Plane, Quaternion, Vector3 } from 'three';
import { readTheme } from '../../design/theme';
import type { Vec3 } from '../geometry/HalfEdgeMesh';
import {
  cloneModifiers,
  createModifier,
  modifierLabel,
  validateModifier,
  validateModifiers,
  type Modifier,
  type ModifierKind
} from '../geometry/modifiers';
import {
  bridgeSelectedEdges,
  deleteSelectedElements,
  deletionLabel,
  extrudeSelectedFaces,
  insetSelectedFace,
  mergeSelectedVertices
} from '../geometry/topology';
import type { PrimitiveKind } from '../geometry/primitives';
import { InputRouter, type InputRouterHost, type PointerSample } from '../input/InputRouter';
import type { AxisName } from '../render/CameraRig';
import { ViewportRenderer } from '../render/ViewportRenderer';
import type { GizmoHit, GizmoMode } from '../render/ObjectGizmo';
import {
  GIZMO_AXIS_VECTORS,
  angleAroundAxis,
  closestAxisParameter,
  planeBasis,
  shortestAngleDelta,
  snapScalar,
  worldAxis,
  type GizmoAxis
} from '../render/gizmoMath';
import type { MeshNode, NodeTransform, SelectionMode } from '../scene/MeshNode';
import type { SceneGroup } from '../scene/SceneGroup';
import { SceneDocument } from '../scene/SceneDocument';
import { ElementSelection } from './ElementSelection';
import { History, type HistoryEvent } from './History';
import { CreateMeshNodeCommand } from './commands/CreateMeshNodeCommand';
import { DeleteMeshNodeCommand } from './commands/DeleteMeshNodeCommand';
import { ReplaceMeshCommand } from './commands/ReplaceMeshCommand';
import { SetModifiersCommand } from './commands/SetModifiersCommand';
import { JoinNodesCommand, type JoinedSource } from './commands/JoinNodesCommand';
import { joinMeshNodes } from './joinMeshes';
import {
  CreateGroupCommand,
  TransformGroupCommand,
  UngroupGroupCommand,
  type GroupChildChange
} from './commands/GroupCommands';
import { bakeGroupTransform, transformMatrix } from './groupTransforms';
import { MoveVertexCommand } from './commands/MoveVertexCommand';
import { TransformNodeCommand } from './commands/TransformNodeCommand';
import {
  AutosaveService,
  type AutosaveState,
  type AutosaveStatus,
  type RecoveryRecord
} from '../project/AutosaveService';
import { applyJournalPatch } from '../project/journal';
import {
  decodeLpoly,
  encodeLpoly,
  type DecodedProject,
  type ProjectSettings
} from '../project/lpoly';
import { openProjectFile, saveProjectFile } from '../platform/projectFiles';
import {
  DEFAULT_PS1_AFFINE,
  DEFAULT_PS1_SNAP,
  DEFAULT_SHADING,
  type EditorSnapshot,
  type MeshCounts,
  type ShadingMode,
  type TransformMode,
  type AxisLock,
  type ModifierPatch
} from './types';

/** State captured at pointer-down so a preview can be committed or cancelled. */
interface VertexDrag {
  readonly pointerId: number;
  readonly node: MeshNode;
  readonly vertex: number;
  readonly original: Vec3;
  readonly originalWorld: Vector3;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly plane: Plane;
  readonly offset: Vector3;
}

/** Active axis-constrained object gizmo drag. */
interface GizmoDrag {
  readonly pointerId: number;
  readonly mode: GizmoMode;
  readonly axis: GizmoAxis;
  readonly target: MeshNode | SceneGroup;
  readonly before: NodeTransform;
  readonly origin: Vector3;
  readonly axisWorld: Vector3;
  readonly size: number;
  readonly startParameter: number;
  readonly plane: Plane | null;
  readonly basis: { u: Vector3; v: Vector3 } | null;
  readonly startAngle: number;
}

/** Construction options for the editor runtime. */
interface EditorRuntimeOptions {
  /** Called whenever a small UI-facing snapshot should be refreshed. */
  readonly onSnapshot: (snapshot: EditorSnapshot) => void;
}

const EMPTY_COUNTS: MeshCounts = {
  vertices: 0,
  edges: 0,
  faces: 0,
  triangles: 0
};

/**
 * Plain-TypeScript editor runtime for the Phase 2 topology and selection kernel.
 *
 * It owns the scene document, active node, element selection, history, viewport,
 * and input routing. Svelte receives only the small immutable snapshot from
 * `types.ts`; DCEL columns and Three.js objects never enter reactive state.
 */
export class EditorRuntime {
  private readonly document: SceneDocument;
  private readonly history = new History();
  private readonly renderer: ViewportRenderer;
  private readonly input: InputRouter;
  private readonly onSnapshot: (snapshot: EditorSnapshot) => void;
  private readonly unsubscribeHistory: () => void;
  private readonly inputHost: InputRouterHost;
  private readonly autosave: AutosaveService;

  private shading: ShadingMode = DEFAULT_SHADING;
  private transformMode: TransformMode = 'select';
  private snapEnabled = false;
  private snapStep = 0.25;
  private axisLock: AxisLock = null;
  private ps1Snap = DEFAULT_PS1_SNAP;
  private ps1Affine = DEFAULT_PS1_AFFINE;
  private activeNodeId: string | null;
  private activeGroupId: string | null = null;
  private readonly selectedNodeIds = new Set<string>();
  private additiveNodeSelection = false;
  private readonly selection = new ElementSelection('vertex');
  private additiveSelection = false;
  private pointer: EditorSnapshot['pointer'] = null;
  private drag: VertexDrag | null = null;
  private gizmoDrag: GizmoDrag | null = null;
  private disposed = false;
  private projectName = 'Untitled';
  private autosaveStatus: AutosaveStatus = 'idle';
  private lastAutosavedAt: number | null = null;
  private autosaveError: string | null = null;
  private pendingRecovery: RecoveryRecord | null = null;
  private recoveryAvailable = false;
  private recoveryUpdatedAt: number | null = null;
  private recovered = false;
  private fileBusy = false;
  private projectError: string | null = null;

  constructor(canvas: HTMLCanvasElement, options: EditorRuntimeOptions) {
    this.onSnapshot = options.onSnapshot;
    this.document = SceneDocument.createDefault();
    this.activeNodeId = this.document.nodes[0]?.id ?? null;
    if (this.activeNodeId) {
      this.selectedNodeIds.add(this.activeNodeId);
    }
    this.selection.setContext(this.activeNodeId, 'vertex');

    this.renderer = new ViewportRenderer(canvas, readTheme(), {
      onViewChanged: () => {
        this.publish();
      }
    });

    this.inputHost = {
      orbit: (dx, dy) => this.renderer.orbit(dx, dy),
      pan: (dx, dy) => this.renderer.pan(dx, dy),
      zoom: (factor) => this.renderer.zoom(factor),
      beginToolPointer: (sample) => this.beginToolPointer(sample),
      moveToolPointer: (sample) => this.moveToolPointer(sample),
      endToolPointer: (sample) => this.endToolPointer(sample),
      cancelToolPointer: () => this.cancelToolPointer(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      frameSelection: () => this.frameSelection(),
      deleteSelection: () => this.deleteSelection(),
      toggleAxisLock: (axis) => this.toggleAxisLock(axis),
      tapSelect: (x, y) => this.tapSelect(x, y),
      setPointerReading: (sample) => this.setPointerReading(sample)
    };

    this.input = new InputRouter(canvas, this.inputHost);
    this.unsubscribeHistory = this.history.subscribe((_state, event) => {
      this.afterDocumentChanged(event);
    });
    this.autosave = new AutosaveService(
      () => this.makeCheckpoint(),
      (state) => this.receiveAutosaveState(state)
    );

    this.renderer.setShadingMode(this.shading);
    this.renderer.setPs1Options(this.ps1Snap, this.ps1Affine);
    this.syncScene();
    this.publish();
    void this.initializePersistence();
  }

  /** Build the current small snapshot for the reactive UI layer. */
  getSnapshot(): EditorSnapshot {
    const historyState = this.history.getState();
    const activeGroup = this.getActiveGroup();
    const active = this.getActiveNode();
    const mesh = active?.mesh ?? null;
    const evaluated = active?.getEvaluatedMesh() ?? null;
    const selectedElements = this.selection.values();
    const selectedPosition =
      this.selection.mode === 'vertex' &&
      mesh !== null &&
      selectedElements.length === 1 &&
      selectedElements[0] < mesh.vertexCount
        ? mesh.getVertexPosition(selectedElements[0])
        : null;

    return {
      shading: this.shading,
      transformMode: this.transformMode,
      snapEnabled: this.snapEnabled,
      snapStep: this.snapStep,
      axisLock: this.axisLock,
      ps1Snap: this.ps1Snap,
      ps1Affine: this.ps1Affine,
      selectedElements,
      additiveSelection: this.additiveSelection,
      selectionMode: this.selection.mode,
      selectedPosition,
      modifiers: active ? active.modifiers.map((modifier) => ({ ...modifier })) : [],
      modifiersActive: evaluated?.modifiersActive ?? false,
      modifierError: evaluated?.error ?? null,
      evaluatedCounts: evaluated
        ? {
            vertices: evaluated.mesh.vertexCount,
            edges: evaluated.mesh.edgeCount,
            faces: evaluated.mesh.faceCount,
            triangles: evaluated.mesh.topologyTriangleCount
          }
        : EMPTY_COUNTS,
      activeTransform: activeGroup
        ? this.cloneTransform(activeGroup.transform)
        : active
          ? this.cloneTransform(active.transform)
          : null,
      boundaryEdges: mesh?.boundaryEdgeCount ?? 0,
      counts: mesh
        ? {
            vertices: mesh.vertexCount,
            edges: mesh.edgeCount,
            faces: mesh.faceCount,
            triangles: mesh.topologyTriangleCount
          }
        : EMPTY_COUNTS,
      canUndo: historyState.canUndo,
      canRedo: historyState.canRedo,
      undoLabel: historyState.undoLabel,
      redoLabel: historyState.redoLabel,
      orientation: this.renderer.getOrientation(),
      pointer: this.pointer,
      objectName: activeGroup?.name ?? active?.name ?? 'Scene',
      activeNodeId: this.activeNodeId,
      activeGroupId: this.activeGroupId,
      groups: this.document.groupSummaries(),
      selectedNodeIds: [...this.selectedNodeIds],
      additiveNodeSelection: this.additiveNodeSelection,
      nodes: this.document.summaries(),
      projectName: this.projectName,
      autosaveStatus: this.autosaveStatus,
      lastAutosavedAt: this.lastAutosavedAt,
      autosaveError: this.autosaveError,
      recoveryAvailable: this.recoveryAvailable,
      recoveryUpdatedAt: this.recoveryUpdatedAt,
      recovered: this.recovered,
      fileBusy: this.fileBusy,
      projectError: this.projectError,
      renderCount: this.renderer.getRenderCount()
    };
  }

  setShadingMode(mode: ShadingMode): void {
    if (this.shading === mode) {
      return;
    }
    this.shading = mode;
    this.renderer.setShadingMode(mode);
    this.publish();
  }

  setPs1Snap(enabled: boolean): void {
    this.ps1Snap = enabled;
    this.renderer.setPs1Options(this.ps1Snap, this.ps1Affine);
    this.publish();
  }

  setPs1Affine(enabled: boolean): void {
    this.ps1Affine = enabled;
    this.renderer.setPs1Options(this.ps1Snap, this.ps1Affine);
    this.publish();
  }

  setSnapEnabled(enabled: boolean): void {
    if (this.snapEnabled === enabled) {
      return;
    }
    this.snapEnabled = enabled;
    this.publish();
  }

  setSnapStep(step: number): void {
    if (!Number.isFinite(step) || step <= 0 || step === this.snapStep) {
      return;
    }
    this.snapStep = step;
    this.publish();
  }

  setAxisLock(axis: AxisLock): void {
    if (this.selection.mode !== 'vertex' || this.selection.count !== 1) {
      return;
    }
    if (this.axisLock === axis) {
      return;
    }
    this.axisLock = axis;
    this.publish();
  }

  private toggleAxisLock(axis: 'x' | 'y' | 'z'): void {
    this.setAxisLock(this.axisLock === axis ? null : axis);
  }

  setTransformMode(mode: TransformMode): void {
    if (this.transformMode === mode) {
      return;
    }
    if (this.gizmoDrag) {
      this.cancelToolPointer();
    }
    this.transformMode = mode;
    this.syncScene();
    this.publish();
  }

  setSelectionMode(mode: SelectionMode): void {
    if (this.selection.mode === mode) {
      return;
    }
    if (this.drag) {
      this.cancelToolPointer();
    }
    this.selection.setMode(mode);
    if (mode !== 'vertex') {
      this.axisLock = null;
    }
    this.syncScene();
    this.publish();
  }

  /** Toggle sticky additive selection for pen and touch input. */
  setAdditiveSelection(enabled: boolean): void {
    if (this.additiveSelection === enabled) {
      return;
    }
    this.additiveSelection = enabled;
    this.publish();
  }

  /** Orbit the viewport camera by a CSS-pixel delta from an overlay gizmo. */
  orbitView(dx: number, dy: number): void {
    this.renderer.orbit(dx, dy);
  }

  /** Add a default modifier to the active node's stack. */
  addModifier(kind: ModifierKind): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    if (node.modifiers.length >= 12) {
      this.projectError = 'A node can have at most 12 modifiers.';
      this.publish();
      return;
    }
    const modifier = createModifier(kind);
    this.applyModifiers(
      node,
      [...node.modifiers, modifier],
      `Add ${modifierLabel(modifier)}`
    );
  }

  /** Enable or disable one modifier. */
  toggleModifier(id: string): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const target = node.modifiers.find((modifier) => modifier.id === id);
    if (!target) {
      return;
    }
    this.applyModifiers(
      node,
      node.modifiers.map((modifier) =>
        modifier.id === id
          ? validateModifier({ ...modifier, enabled: !modifier.enabled })
          : modifier
      ),
      target.enabled
        ? `Disable ${modifierLabel(target)}`
        : `Enable ${modifierLabel(target)}`
    );
  }

  /** Remove one modifier from the stack. */
  removeModifier(id: string): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const target = node.modifiers.find((modifier) => modifier.id === id);
    if (!target) {
      return;
    }
    this.applyModifiers(
      node,
      node.modifiers.filter((modifier) => modifier.id !== id),
      `Remove ${modifierLabel(target)}`
    );
  }

  /** Move a modifier one position up or down in evaluation order. */
  moveModifier(id: string, direction: -1 | 1): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const index = node.modifiers.findIndex((modifier) => modifier.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= node.modifiers.length) {
      return;
    }
    const next = [...node.modifiers];
    const [modifier] = next.splice(index, 1);
    next.splice(nextIndex, 0, modifier);
    this.applyModifiers(node, next, `Reorder ${modifierLabel(modifier)}`);
  }

  /** Edit safe parameters of one modifier. */
  updateModifier(id: string, patch: ModifierPatch): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const target = node.modifiers.find((modifier) => modifier.id === id);
    if (!target) {
      return;
    }
    this.applyModifiers(
      node,
      node.modifiers.map((modifier) =>
        modifier.id === id
          ? validateModifier({ ...modifier, ...patch })
          : modifier
      ),
      `Edit ${modifierLabel(target)}`
    );
  }

  private applyModifiers(
    node: MeshNode,
    next: readonly Modifier[],
    label: string
  ): void {
    try {
      const validated = validateModifiers(next);
      const before = cloneModifiers(node.modifiers);
      const unchanged =
        before.length === validated.length &&
        before.every(
          (modifier, index) =>
            JSON.stringify(modifier) === JSON.stringify(validated[index])
        );
      if (unchanged) {
        return;
      }
      if (this.drag || this.gizmoDrag) {
        this.cancelToolPointer();
      }
      this.history.execute(
        new SetModifiersCommand(node, before, validated, label)
      );
    } catch (error) {
      this.projectError = this.errorMessage(error);
      this.publish();
    }
  }

  /**
   * Commit an object-level transform through the command layer.
   *
   * Scale is kept positive to avoid mirrored winding until explicit mirroring
   * tools land; near-zero values are clamped to a safe minimum.
   */
  setActiveTransform(transform: NodeTransform): void {
    const group = this.getActiveGroup();
    if (group) {
      const values = [
        ...transform.position,
        ...transform.rotation,
        ...transform.scale
      ];
      if (!values.every(Number.isFinite)) {
        return;
      }
      const next: NodeTransform = {
        position: [...transform.position],
        rotation: [...transform.rotation],
        scale: [
          Math.max(0.001, transform.scale[0]),
          Math.max(0.001, transform.scale[1]),
          Math.max(0.001, transform.scale[2])
        ]
      };
      const before = this.cloneTransform(group.transform);
      const unchanged =
        before.position.every(
          (value, i) => Math.abs(value - next.position[i]) < 1e-7
        ) &&
        before.rotation.every(
          (value, i) => Math.abs(value - next.rotation[i]) < 1e-7
        ) &&
        before.scale.every(
          (value, i) => Math.abs(value - next.scale[i]) < 1e-7
        );
      if (!unchanged) {
        this.history.execute(new TransformGroupCommand(group, before, next));
      }
      return;
    }
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const values = [
      ...transform.position,
      ...transform.rotation,
      ...transform.scale
    ];
    if (!values.every(Number.isFinite)) {
      return;
    }
    const next: NodeTransform = {
      position: [...transform.position],
      rotation: [...transform.rotation],
      scale: [
        Math.max(0.001, transform.scale[0]),
        Math.max(0.001, transform.scale[1]),
        Math.max(0.001, transform.scale[2])
      ]
    };
    const before = this.cloneTransform(node.transform);
    const unchanged =
      before.position.every((value, i) => Math.abs(value - next.position[i]) < 1e-7) &&
      before.rotation.every((value, i) => Math.abs(value - next.rotation[i]) < 1e-7) &&
      before.scale.every((value, i) => Math.abs(value - next.scale[i]) < 1e-7);
    if (unchanged) {
      return;
    }
    this.history.execute(new TransformNodeCommand(node, before, next));
  }

  /** Select a group as the active transform target. */
  selectGroup(groupId: string): void {
    const group = this.document.getGroup(groupId);
    if (!group) {
      return;
    }
    if (this.drag || this.gizmoDrag) {
      this.cancelToolPointer();
    }
    this.activeGroupId = group.id;
    this.activeNodeId = null;
    this.selectedNodeIds.clear();
    this.selection.clear();
    this.selection.setContext(null, this.selection.mode);
    this.axisLock = null;
    this.syncScene();
    this.publish();
  }

  /** Group all object-selected ungrouped mesh nodes under one transform. */
  groupSelectedNodes(): void {
    const selected = this.document.nodes.filter((node) =>
      this.selectedNodeIds.has(node.id)
    );
    if (selected.length === 0) {
      return;
    }
    if (selected.some((node) => node.parentId !== null)) {
      this.projectError =
        'Ungroup the selected objects before grouping them again.';
      this.publish();
      return;
    }
    const group = this.document.createGroup();
    const pivot = selected.reduce(
      (sum, node) => {
        sum[0] += node.transform.position[0];
        sum[1] += node.transform.position[1];
        sum[2] += node.transform.position[2];
        return sum;
      },
      [0, 0, 0] as [number, number, number]
    );
    pivot[0] /= selected.length;
    pivot[1] /= selected.length;
    pivot[2] /= selected.length;
    group.setTransform({
      position: pivot,
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });

    const children: GroupChildChange[] = selected.map((node) => {
      const beforeTransform = this.cloneTransform(node.transform);
      const afterTransform = this.cloneTransform(node.transform);
      afterTransform.position = [
        beforeTransform.position[0] - pivot[0],
        beforeTransform.position[1] - pivot[1],
        beforeTransform.position[2] - pivot[2]
      ];
      return {
        node,
        beforeParentId: node.parentId,
        beforeTransform,
        afterParentId: group.id,
        afterTransform
      };
    });

    this.activeGroupId = group.id;
    this.activeNodeId = null;
    this.selectedNodeIds.clear();
    this.selection.clear();
    this.selection.setContext(null, this.selection.mode);
    this.axisLock = null;
    this.history.execute(
      new CreateGroupCommand(
        this.document,
        group,
        this.document.groups.length,
        children
      )
    );
    this.publish();
  }

  /** Dissolve the active group, baking its transform into every child. */
  ungroupActiveGroup(): void {
    const group = this.getActiveGroup();
    if (!group) {
      return;
    }
    const children = this.document.nodes
      .filter((node) => node.parentId === group.id)
      .map((node) => {
        const beforeTransform = this.cloneTransform(node.transform);
        return {
          node,
          beforeParentId: group.id,
          beforeTransform,
          afterParentId: null,
          afterTransform: bakeGroupTransform(
            group.transform,
            beforeTransform
          )
        };
      });
    const index = this.document.groups.indexOf(group);
    const first = children[0]?.node ?? null;
    this.activeGroupId = null;
    this.activeNodeId = first?.id ?? null;
    this.selectedNodeIds.clear();
    if (first) {
      this.selectedNodeIds.add(first.id);
    }
    this.selection.clear();
    this.selection.setContext(first?.id ?? null, this.selection.mode);
    this.history.execute(
      new UngroupGroupCommand(this.document, group, index, children)
    );
    this.publish();
  }

  setAdditiveNodeSelection(enabled: boolean): void {
    if (this.additiveNodeSelection === enabled) {
      return;
    }
    this.additiveNodeSelection = enabled;
    this.publish();
  }

  selectNode(nodeId: string, additive = false): void {
    if (!this.document.getNode(nodeId)) {
      return;
    }
    this.activeGroupId = null;

    if (additive || this.additiveNodeSelection) {
      if (this.selectedNodeIds.has(nodeId)) {
        this.selectedNodeIds.delete(nodeId);
      } else {
        this.selectedNodeIds.add(nodeId);
      }
      if (!this.selectedNodeIds.has(nodeId) && this.activeNodeId === nodeId) {
        this.activeNodeId =
          this.selectedNodeIds.values().next().value ?? null;
      } else {
        this.activeNodeId = nodeId;
      }
    } else {
      this.selectedNodeIds.clear();
      this.selectedNodeIds.add(nodeId);
      this.activeNodeId = nodeId;
    }

    this.selection.setContext(this.activeNodeId, this.selection.mode);
    this.syncScene();
    this.publish();
  }

  /** Create a new primitive, place it beside the scene, and select it. */
  createPrimitive(kind: PrimitiveKind): void {
    const node = this.document.createNode(kind);
    node.setPosition(this.document.placementFor(node));
    const index = this.document.nodes.length;

    // Set the session target before the command reaches history so the
    // synchronous history listener can render the new active node.
    this.activeGroupId = null;
    this.activeNodeId = node.id;
    this.selectedNodeIds.clear();
    this.selectedNodeIds.add(node.id);
    this.selection.setContext(node.id, 'vertex');
    this.history.execute(new CreateMeshNodeCommand(this.document, node, index));
    this.renderer.frameActiveNode();
    this.publish();
  }

  /** Delete the active node while keeping its restoration state in history. */
  deleteActiveNode(): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const index = this.document.nodes.indexOf(node);
    const fallback =
      this.document.nodes[index + 1] ??
      this.document.nodes[index - 1] ??
      null;
    this.activeNodeId = fallback?.id ?? null;
    this.selectedNodeIds.clear();
    if (fallback) {
      this.selectedNodeIds.add(fallback.id);
    }
    this.selection.setContext(fallback?.id ?? null, this.selection.mode);
    this.history.execute(new DeleteMeshNodeCommand(this.document, node, index));
    this.renderer.frameActiveNode();
    this.publish();
  }

  /** Delete the selected faces, or all faces incident to selected edges/vertices. */
  deleteSelection(): void {
    if (this.drag || this.gizmoDrag) {
      this.cancelToolPointer();
    }
    const node = this.getActiveNode();
    if (!node || this.selection.count === 0) {
      return;
    }
    const mode = this.selection.mode;
    const indices = this.selection.values();
    try {
      const after = deleteSelectedElements(node.mesh, mode, indices);
      const command = new ReplaceMeshCommand(
        node,
        node.mesh,
        after,
        deletionLabel(mode, indices.length)
      );
      this.selection.clear();
      this.history.execute(command);
    } catch (error) {
      this.projectError = this.errorMessage(error);
      this.publish();
    }
  }

  /** Join all object-selected mesh nodes into the active target object. */
  joinSelectedNodes(): void {
    const selected = this.document.nodes.filter((node) =>
      this.selectedNodeIds.has(node.id)
    );
    if (selected.length < 2) {
      return;
    }
    if (selected.some((node) => node.parentId !== null)) {
      this.projectError = 'Ungroup objects before joining them.';
      this.publish();
      return;
    }
    if (
      selected.some((node) => node.getEvaluatedMesh().modifiersActive)
    ) {
      this.projectError = 'Disable modifiers before joining objects.';
      this.publish();
      return;
    }
    const active = this.getActiveNode();
    const target =
      active && selected.includes(active) ? active : selected[0];
    try {
      const after = joinMeshNodes(selected, target);
      const sources: JoinedSource[] = selected
        .filter((node) => node !== target)
        .map((node) => ({
          node,
          index: this.document.nodes.indexOf(node)
        }));
      const command = new JoinNodesCommand(
        this.document,
        target,
        target.mesh,
        after,
        sources
      );
      this.activeNodeId = target.id;
      this.selectedNodeIds.clear();
      this.selectedNodeIds.add(target.id);
      this.selection.clear();
      this.selection.setContext(target.id, this.selection.mode);
      this.history.execute(command);
      this.renderer.frameActiveNode();
      this.publish();
    } catch (error) {
      this.projectError = this.errorMessage(error);
      this.publish();
    }
  }

  /** Extrude the selected face region along its average normal. */
  extrudeSelectedFaces(): void {
    const node = this.getActiveNode();
    if (
      !node ||
      this.selection.mode !== 'face' ||
      this.selection.count === 0
    ) {
      return;
    }
    const indices = this.selection.values();
    try {
      const after = extrudeSelectedFaces(node.mesh, indices);
      const command = new ReplaceMeshCommand(
        node,
        node.mesh,
        after,
        `Extrude ${indices.length} face${indices.length === 1 ? '' : 's'}`
      );
      this.selection.clear();
      this.history.execute(command);
    } catch (error) {
      this.projectError = this.errorMessage(error);
      this.publish();
    }
  }

  /** Inset the single selected face toward its centroid. */
  insetSelectedFace(): void {
    const node = this.getActiveNode();
    if (
      !node ||
      this.selection.mode !== 'face' ||
      this.selection.count !== 1
    ) {
      return;
    }
    const [face] = this.selection.values();
    try {
      const after = insetSelectedFace(node.mesh, face);
      const command = new ReplaceMeshCommand(
        node,
        node.mesh,
        after,
        'Inset face'
      );
      this.selection.clear();
      this.history.execute(command);
    } catch (error) {
      this.projectError = this.errorMessage(error);
      this.publish();
    }
  }

  /** Weld the selected vertices to their centroid. */
  mergeSelectedVertices(): void {
    const node = this.getActiveNode();
    if (
      !node ||
      this.selection.mode !== 'vertex' ||
      this.selection.count < 2
    ) {
      return;
    }
    const indices = this.selection.values();
    try {
      const after = mergeSelectedVertices(node.mesh, indices);
      const command = new ReplaceMeshCommand(
        node,
        node.mesh,
        after,
        `Merge ${indices.length} vertices`
      );
      this.selection.clear();
      this.history.execute(command);
    } catch (error) {
      this.projectError = this.errorMessage(error);
      this.publish();
    }
  }

  /** Bridge two selected boundary edges with one new quad. */
  bridgeSelectedEdges(): void {
    const node = this.getActiveNode();
    if (
      !node ||
      this.selection.mode !== 'edge' ||
      this.selection.count < 2
    ) {
      return;
    }
    const indices = this.selection.values();
    try {
      const after = bridgeSelectedEdges(node.mesh, indices);
      const command = new ReplaceMeshCommand(
        node,
        node.mesh,
        after,
        'Bridge 2 edges'
      );
      this.selection.clear();
      this.history.execute(command);
    } catch (error) {
      this.projectError = this.errorMessage(error);
      this.publish();
    }
  }

  snapView(axis: AxisName, sign: 1 | -1): void {
    this.renderer.viewAxis(axis, sign);
  }

  frameSelection(): void {
    this.renderer.frameActiveNode();
  }

  undo(): void {
    if (this.drag || this.gizmoDrag) {
      this.cancelToolPointer();
      return;
    }
    this.history.undo();
  }

  redo(): void {
    if (this.drag || this.gizmoDrag) {
      this.cancelToolPointer();
      return;
    }
    this.history.redo();
  }

  /** Load the autosave checkpoint plus its deltas. */
  async recoverAutosave(): Promise<void> {
    if (!this.pendingRecovery || this.fileBusy) {
      return;
    }
    this.fileBusy = true;
    this.projectError = null;
    this.publish();
    try {
      const decoded = decodeLpoly(this.pendingRecovery.checkpoint);
      for (const patch of this.pendingRecovery.deltas) {
        applyJournalPatch(decoded.document, patch);
      }
      this.applyLoadedDocument(decoded, 'Recovered project');
      this.recovered = true;
      this.recoveryAvailable = false;
      this.recoveryUpdatedAt = null;
      this.pendingRecovery = null;
      const checkpoint = this.makeCheckpoint();
      await this.autosave.start(checkpoint.bytes, checkpoint.settings, true);
    } catch (error) {
      this.projectError = this.errorMessage(error);
    } finally {
      this.fileBusy = false;
      this.publish();
    }
  }

  /** Discard autosaved work and begin a fresh autosave baseline. */
  async discardRecovery(): Promise<void> {
    if (this.fileBusy) {
      return;
    }
    this.fileBusy = true;
    this.projectError = null;
    this.publish();
    try {
      this.pendingRecovery = null;
      this.recoveryAvailable = false;
      this.recoveryUpdatedAt = null;
      this.recovered = false;
      await this.autosave.clear();
      const checkpoint = this.makeCheckpoint();
      await this.autosave.start(checkpoint.bytes, checkpoint.settings);
    } catch (error) {
      this.projectError = this.errorMessage(error);
    } finally {
      this.fileBusy = false;
      this.publish();
    }
  }

  /** Encode and save the current project through the platform adapter. */
  async saveProject(): Promise<void> {
    if (this.fileBusy) {
      return;
    }
    if (this.recoveryAvailable) {
      this.projectError = 'Recover or discard the available autosave before saving.';
      this.publish();
      return;
    }
    this.fileBusy = true;
    this.projectError = null;
    this.publish();
    try {
      const bytes = encodeLpoly(this.document, this.getSettings());
      const saved = await saveProjectFile(bytes, `${this.projectName}.lpoly`);
      if (saved) {
        this.recovered = false;
        this.projectName = this.projectName || 'Untitled';
        await this.autosave.clear();
        const checkpoint = this.makeCheckpoint();
        await this.autosave.start(checkpoint.bytes, checkpoint.settings);
      }
    } catch (error) {
      this.projectError = this.errorMessage(error);
    } finally {
      this.fileBusy = false;
      this.publish();
    }
  }

  /** Open a project through the platform adapter, replacing the scene on success. */
  async openProject(): Promise<void> {
    if (this.fileBusy) {
      return;
    }
    if (this.recoveryAvailable) {
      this.projectError = 'Recover or discard the available autosave before opening another project.';
      this.publish();
      return;
    }
    this.fileBusy = true;
    this.projectError = null;
    this.publish();
    try {
      const file = await openProjectFile();
      if (!file) {
        return;
      }
      const decoded = decodeLpoly(file.bytes);
      const name = file.name.replace(/\.lpoly$/i, '') || 'Untitled';
      this.applyLoadedDocument(decoded, name);
      this.recovered = false;
      this.recoveryAvailable = false;
      this.recoveryUpdatedAt = null;
      this.pendingRecovery = null;
      await this.autosave.clear();
      const checkpoint = this.makeCheckpoint();
      await this.autosave.start(checkpoint.bytes, checkpoint.settings);
    } catch (error) {
      this.projectError = this.errorMessage(error);
    } finally {
      this.fileBusy = false;
      this.publish();
    }
  }

  /** Dismiss the last project-level error shown in the UI. */
  dismissProjectError(): void {
    this.projectError = null;
    this.publish();
  }

  /** Return the viewport render count for development idle-loop checks. */
  getRenderCount(): number {
    return this.renderer.getRenderCount();
  }

  /** Remove all listeners and GPU resources. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubscribeHistory();
    this.input.dispose();
    this.history.dispose();
    this.autosave.dispose();
    this.renderer.dispose();
  }

  private getActiveNode(): MeshNode | null {
    return this.document.getNode(this.activeNodeId) ?? null;
  }

  private getActiveGroup(): SceneGroup | null {
    return this.document.getGroup(this.activeGroupId) ?? null;
  }

  private tapSelect(clientX: number, clientY: number): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    this.selectEvaluatedElementAt(
      clientX,
      clientY,
      this.additiveSelection,
      node
    );
  }

  private selectEvaluatedElementAt(
    clientX: number,
    clientY: number,
    additive: boolean,
    node: MeshNode
  ): void {
    const evaluated = node.getEvaluatedMesh();
    let evaluatedIndex: number | null;
    let baseIndex: number;

    if (this.selection.mode === 'edge') {
      evaluatedIndex = this.renderer.pickEdge(clientX, clientY);
      baseIndex =
        evaluatedIndex === null
          ? -1
          : (evaluated.provenance?.edgeBase[evaluatedIndex] ?? evaluatedIndex);
    } else if (this.selection.mode === 'face') {
      evaluatedIndex = this.renderer.pickFace(clientX, clientY);
      baseIndex =
        evaluatedIndex === null
          ? -1
          : (evaluated.provenance?.faceBase[evaluatedIndex] ?? evaluatedIndex);
    } else {
      evaluatedIndex = this.renderer.pickVertex(clientX, clientY);
      baseIndex =
        evaluatedIndex === null
          ? -1
          : (evaluated.provenance?.vertexBase[evaluatedIndex] ??
            evaluatedIndex);
    }

    if (evaluatedIndex === null) {
      if (!additive) {
        this.selection.clear();
      }
    } else if (baseIndex >= 0) {
      this.selection.pick(baseIndex, additive);
    }
    this.syncScene();
    this.publish();
  }

  private evaluatedSelectionValues(): readonly number[] {
    const node = this.getActiveNode();
    const values = this.selection.values();
    if (!node) {
      return values;
    }
    const provenance = node.getEvaluatedMesh().provenance;
    if (!provenance) {
      return values;
    }
    const source =
      this.selection.mode === 'vertex'
        ? provenance.vertexBase
        : this.selection.mode === 'edge'
          ? provenance.edgeBase
          : provenance.faceBase;
    const selected = new Set(values);
    const result: number[] = [];
    for (let index = 0; index < source.length; index += 1) {
      if (selected.has(source[index])) {
        result.push(index);
      }
    }
    return result;
  }

  private beginToolPointer(sample: PointerSample): boolean {
    if (this.drag || this.gizmoDrag) {
      this.cancelToolPointer();
    }

    const node = this.getActiveNode();
    const group = this.getActiveGroup();
    const target = group ?? node;
    if (!target) {
      return false;
    }

    if (this.transformMode !== 'select') {
      const gizmoHit = this.renderer.pickGizmo(
        sample.clientX,
        sample.clientY
      );
      if (gizmoHit && this.beginGizmoDrag(gizmoHit, sample, target)) {
        return true;
      }
    }

    if (!node) {
      return false;
    }

    const additive =
      this.additiveSelection ||
      sample.shiftKey ||
      sample.metaKey ||
      sample.ctrlKey;

    if (node.getEvaluatedMesh().modifiersActive) {
      this.selectEvaluatedElementAt(
        sample.clientX,
        sample.clientY,
        additive,
        node
      );
      return false;
    }

    if (this.selection.mode === 'edge') {
      const edge = this.renderer.pickEdge(sample.clientX, sample.clientY);
      if (edge === null) {
        if (!additive) {
          this.selection.clear();
        }
      } else {
        this.selection.pick(edge, additive);
      }
      this.syncScene();
      this.publish();
      return false;
    }

    if (this.selection.mode === 'face') {
      const face = this.renderer.pickFace(sample.clientX, sample.clientY);
      if (face === null) {
        if (!additive) {
          this.selection.clear();
        }
      } else {
        this.selection.pick(face, additive);
      }
      this.syncScene();
      this.publish();
      return false;
    }

    const vertex = this.renderer.pickVertex(sample.clientX, sample.clientY);
    if (vertex === null) {
      if (!additive) {
        this.selection.clear();
      }
      this.syncScene();
      this.publish();
      return false;
    }

    if (additive) {
      this.selection.pick(vertex, true);
      this.syncScene();
      this.publish();
      return false;
    }

    this.selection.pick(vertex, false);
    const original = node.mesh.getVertexPosition(vertex);
    const world = this.renderer.getVertexWorldPosition(vertex);
    const plane = this.renderer.createCameraFacingPlane(world);
    const grabPoint = this.renderer.intersectPointerPlane(
      sample.clientX,
      sample.clientY,
      plane
    );
    const offset = grabPoint ? world.clone().sub(grabPoint) : new Vector3();

    this.syncScene();
    this.drag = {
      pointerId: sample.pointerId,
      node,
      vertex,
      original,
      originalWorld: world.clone(),
      startClientX: sample.clientX,
      startClientY: sample.clientY,
      plane,
      offset
    };
    this.publish();
    return true;
  }

  private moveToolPointer(sample: PointerSample): void {
    if (this.gizmoDrag && this.gizmoDrag.pointerId === sample.pointerId) {
      this.updateGizmoDrag(sample);
      return;
    }

    if (!this.drag || this.drag.pointerId !== sample.pointerId) {
      return;
    }

    let world: Vector3;
    if (this.axisLock) {
      const ray = this.renderer.getPointerRay(sample.clientX, sample.clientY);
      const startRay = this.renderer.getPointerRay(
        this.drag.startClientX,
        this.drag.startClientY
      );
      if (!ray || !startRay) {
        return;
      }
      const direction = worldAxis(this.axisLock, new Quaternion());
      const start = closestAxisParameter(
        startRay,
        this.drag.originalWorld,
        direction
      );
      const current = closestAxisParameter(
        ray,
        this.drag.originalWorld,
        direction
      );
      if (start === null || current === null) {
        return;
      }
      world = this.drag.originalWorld
        .clone()
        .addScaledVector(direction, current - start);
      if (this.snapEnabled) {
        const index = this.axisLock === 'x' ? 0 : this.axisLock === 'y' ? 1 : 2;
        const value = snapScalar(world.getComponent(index), this.snapStep);
        world.setComponent(index, value);
      }
    } else {
      const hit = this.renderer.intersectPointerPlane(
        sample.clientX,
        sample.clientY,
        this.drag.plane
      );
      if (!hit) {
        return;
      }
      world = hit.add(this.drag.offset);
      if (this.snapEnabled) {
        world.set(
          snapScalar(world.x, this.snapStep),
          snapScalar(world.y, this.snapStep),
          snapScalar(world.z, this.snapStep)
        );
      }
    }
    const local = this.renderer.worldToActiveNodeLocal(world);
    if (!local) {
      return;
    }

    const current = this.drag.node.mesh.getVertexPosition(this.drag.vertex);
    if (
      Math.abs(local.x - current[0]) < 1e-7 &&
      Math.abs(local.y - current[1]) < 1e-7 &&
      Math.abs(local.z - current[2]) < 1e-7
    ) {
      return;
    }

    this.drag.node.mesh.setVertexPosition(this.drag.vertex, [
      local.x,
      local.y,
      local.z
    ]);
    this.renderer.refreshNode(this.drag.node.id);
    this.publish();
  }

  private endToolPointer(sample: PointerSample): void {
    if (this.gizmoDrag && this.gizmoDrag.pointerId === sample.pointerId) {
      this.finishGizmoDrag();
      return;
    }

    if (!this.drag || this.drag.pointerId !== sample.pointerId) {
      return;
    }

    const drag = this.drag;
    this.drag = null;
    const after = drag.node.mesh.getVertexPosition(drag.vertex);
    const changed =
      Math.abs(after[0] - drag.original[0]) > 1e-7 ||
      Math.abs(after[1] - drag.original[1]) > 1e-7 ||
      Math.abs(after[2] - drag.original[2]) > 1e-7;

    if (changed) {
      this.history.execute(
        new MoveVertexCommand(
          drag.node.mesh,
          drag.vertex,
          drag.original,
          after,
          drag.node.id
        )
      );
    } else {
      this.publish();
    }
  }

  private cancelToolPointer(): void {
    if (this.gizmoDrag) {
      const drag = this.gizmoDrag;
      this.gizmoDrag = null;
      drag.target.setTransform(drag.before);
      this.syncScene();
      this.publish();
      return;
    }

    if (!this.drag) {
      return;
    }
    const drag = this.drag;
    this.drag = null;
    drag.node.mesh.setVertexPosition(drag.vertex, drag.original);
    this.renderer.refreshNode(drag.node.id);
    this.syncScene();
    this.publish();
  }

  private beginGizmoDrag(
    hit: GizmoHit,
    sample: PointerSample,
    target: MeshNode | SceneGroup
  ): boolean {
    const frame = this.renderer.getGizmoFrame();
    const ray = this.renderer.getPointerRay(sample.clientX, sample.clientY);
    if (!frame || !ray) {
      return false;
    }
    const axisWorld = worldAxis(hit.axis, frame.quaternion).normalize();
    let startParameter = 0;
    let plane: Plane | null = null;
    let basis: { u: Vector3; v: Vector3 } | null = null;
    let startAngle = 0;

    if (hit.mode === 'rotate') {
      plane = new Plane().setFromNormalAndCoplanarPoint(axisWorld, frame.origin);
      const point = ray.intersectPlane(plane, new Vector3());
      if (!point) {
        return false;
      }
      basis = planeBasis(axisWorld);
      startAngle = angleAroundAxis(point, frame.origin, basis);
    } else {
      const parameter = closestAxisParameter(ray, frame.origin, axisWorld);
      if (parameter === null) {
        return false;
      }
      startParameter = parameter;
    }

    this.gizmoDrag = {
      pointerId: sample.pointerId,
      mode: hit.mode,
      axis: hit.axis,
      target,
      before: this.cloneTransform(target.transform),
      origin: frame.origin,
      axisWorld,
      size: frame.size,
      startParameter,
      plane,
      basis,
      startAngle
    };
    this.publish();
    return true;
  }

  private updateGizmoDrag(sample: PointerSample): void {
    const drag = this.gizmoDrag;
    if (!drag) {
      return;
    }
    const ray = this.renderer.getPointerRay(sample.clientX, sample.clientY);
    if (!ray) {
      return;
    }
    const next = this.cloneTransform(drag.before);

    if (drag.mode === 'translate') {
      const parameter = closestAxisParameter(ray, drag.origin, drag.axisWorld);
      if (parameter === null) {
        return;
      }
      let delta = parameter - drag.startParameter;
      let worldDelta = drag.axisWorld.clone().multiplyScalar(delta);
      if (this.snapEnabled) {
        const components = [
          Math.abs(drag.axisWorld.x),
          Math.abs(drag.axisWorld.y),
          Math.abs(drag.axisWorld.z)
        ];
        const dominant = components.indexOf(Math.max(...components));
        if (components[dominant] > 0.999) {
          const targetWorld = drag.origin.clone().add(worldDelta);
          const snapped = snapScalar(
            targetWorld.getComponent(dominant),
            this.snapStep
          );
          targetWorld.setComponent(dominant, snapped);
          worldDelta = targetWorld.sub(drag.origin);
        } else {
          delta = snapScalar(delta, this.snapStep);
          worldDelta = drag.axisWorld.clone().multiplyScalar(delta);
        }
      }

      if ('primitive' in drag.target && drag.target.parentId !== null) {
        const parent = this.document.getGroup(drag.target.parentId);
        if (parent) {
          worldDelta.transformDirection(transformMatrix(parent.transform).invert());
        }
      }
      next.position = [
        drag.before.position[0] + worldDelta.x,
        drag.before.position[1] + worldDelta.y,
        drag.before.position[2] + worldDelta.z
      ];
    } else if (drag.mode === 'scale') {
      const parameter = closestAxisParameter(ray, drag.origin, drag.axisWorld);
      if (parameter === null) {
        return;
      }
      const delta = parameter - drag.startParameter;
      const factor = Math.max(0.001, 1 + delta / (drag.size * 0.9));
      const axisIndex = drag.axis === 'x' ? 0 : drag.axis === 'y' ? 1 : 2;
      next.scale = [...drag.before.scale];
      next.scale[axisIndex] = Math.max(
        0.001,
        drag.before.scale[axisIndex] * factor
      );
    } else {
      if (!drag.plane || !drag.basis) {
        return;
      }
      const point = ray.intersectPlane(drag.plane, new Vector3());
      if (!point) {
        return;
      }
      const angle = angleAroundAxis(point, drag.origin, drag.basis);
      const delta = shortestAngleDelta(drag.startAngle, angle);
      const start = new Quaternion().setFromEuler(
        new Euler(
          drag.before.rotation[0],
          drag.before.rotation[1],
          drag.before.rotation[2],
          'XYZ'
        )
      );
      const local = GIZMO_AXIS_VECTORS[drag.axis];
      const deltaQuaternion = new Quaternion().setFromAxisAngle(local, delta);
      const rotated = start.multiply(deltaQuaternion);
      const euler = new Euler().setFromQuaternion(rotated, 'XYZ');
      next.rotation = [euler.x, euler.y, euler.z];
    }

    drag.target.setTransform(next);
    this.syncScene();
    this.publish();
  }

  private finishGizmoDrag(): void {
    const drag = this.gizmoDrag;
    if (!drag) {
      return;
    }
    this.gizmoDrag = null;
    const after = this.cloneTransform(drag.target.transform);
    const changed =
      after.position.some(
        (value, i) => Math.abs(value - drag.before.position[i]) > 1e-7
      ) ||
      after.rotation.some(
        (value, i) => Math.abs(value - drag.before.rotation[i]) > 1e-7
      ) ||
      after.scale.some(
        (value, i) => Math.abs(value - drag.before.scale[i]) > 1e-7
      );
    if (changed) {
      this.history.execute(
        'primitive' in drag.target
          ? new TransformNodeCommand(drag.target, drag.before, after)
          : new TransformGroupCommand(drag.target, drag.before, after)
      );
    } else {
      this.publish();
    }
  }

  private setPointerReading(sample: PointerSample | null): void {
    this.pointer = sample
      ? {
          type: sample.pointerType,
          pressure: sample.pressure,
          tiltX: sample.tiltX,
          tiltY: sample.tiltY
        }
      : null;

    // A drag move will publish with fresh position data immediately after this
    // diagnostic update; avoid a redundant reactive pass in that path.
    if (!this.drag) {
      this.publish();
    }
  }

  private afterDocumentChanged(event: HistoryEvent): void {
    if (this.activeGroupId !== null && !this.document.getGroup(this.activeGroupId)) {
      this.activeGroupId = null;
    }
    if (this.activeGroupId !== null) {
      this.activeNodeId = null;
      this.selectedNodeIds.clear();
      this.selection.clear();
      this.selection.setContext(null, this.selection.mode);
    } else {
      const liveIds = new Set(this.document.nodes.map((node) => node.id));
      for (const id of [...this.selectedNodeIds]) {
        if (!liveIds.has(id)) {
          this.selectedNodeIds.delete(id);
        }
      }
      if (this.activeNodeId === null || !liveIds.has(this.activeNodeId)) {
        this.activeNodeId =
          [...this.selectedNodeIds][0] ?? this.document.nodes[0]?.id ?? null;
      }
      if (this.activeNodeId === null) {
        this.selectedNodeIds.clear();
      } else if (!this.selectedNodeIds.has(this.activeNodeId)) {
        this.selectedNodeIds.add(this.activeNodeId);
      }
    }

    if (
      this.activeNodeId === null ||
      (this.activeNodeId !== null && !this.document.getNode(this.activeNodeId))
    ) {
      this.selection.setContext(this.activeNodeId, this.selection.mode);
    }

    const active = this.getActiveNode();
    if (active) {
      if (this.selection.nodeId !== active.id) {
        this.selection.setContext(active.id, this.selection.mode);
      }
      const limit =
        this.selection.mode === 'vertex'
          ? active.mesh.vertexCount
          : this.selection.mode === 'edge'
            ? active.mesh.edgeCount
            : active.mesh.faceCount;
      this.selection.prune(limit);
    } else {
      this.selection.setContext(null, this.selection.mode);
    }

    if (event.command.journalPatch) {
      try {
        const direction = event.action === 'undo' ? 'backward' : 'forward';
        const patch = event.command.journalPatch(direction);
        if (patch) {
          if (Array.isArray(patch)) {
            for (const item of patch as readonly import('../project/journal').JournalPatch[]) {
              this.autosave.record(item);
            }
          } else {
            this.autosave.record(patch as import('../project/journal').JournalPatch);
          }
        }
      } catch (error) {
        // Autosave is safety infrastructure; a journal failure must not break
        // undo or leave the viewport out of sync with the document.
        this.autosaveError = this.errorMessage(error);
      }
    }

    this.syncScene();
    this.publish();
  }

  private syncScene(): void {
    this.renderer.syncScene(
      this.document.nodes,
      this.document.groups,
      this.activeNodeId,
      this.activeGroupId,
      this.selection.mode,
      this.evaluatedSelectionValues(),
      this.transformMode
    );
  }

  private cloneTransform(transform: NodeTransform): NodeTransform {
    return {
      position: [...transform.position],
      rotation: [...transform.rotation],
      scale: [...transform.scale]
    };
  }

  private getSettings(): ProjectSettings {
    return {
      shading: this.shading,
      ps1Snap: this.ps1Snap,
      ps1Affine: this.ps1Affine
    };
  }

  private makeCheckpoint(): { bytes: Uint8Array; settings: ProjectSettings } {
    const settings = this.getSettings();
    return { bytes: encodeLpoly(this.document, settings), settings };
  }

  private async initializePersistence(): Promise<void> {
    const recovery = await this.autosave.findRecovery();
    if (this.disposed) {
      return;
    }
    if (recovery) {
      this.pendingRecovery = recovery;
      this.recoveryAvailable = true;
      this.recoveryUpdatedAt = recovery.updatedAt;
      this.publish();
      return;
    }
    const checkpoint = this.makeCheckpoint();
    await this.autosave.start(checkpoint.bytes, checkpoint.settings);
    this.publish();
  }

  private receiveAutosaveState(state: AutosaveState): void {
    this.autosaveStatus = state.status;
    this.lastAutosavedAt = state.lastSavedAt;
    this.autosaveError = state.error;
    this.publish();
  }

  private applyLoadedDocument(decoded: DecodedProject, name: string): void {
    this.document.replaceNodes(decoded.document.nodes);
    this.document.replaceGroups(decoded.document.groups);
    this.projectName = name;
    this.activeGroupId = null;
    this.activeNodeId = this.document.nodes[0]?.id ?? null;
    this.selectedNodeIds.clear();
    if (this.activeNodeId) {
      this.selectedNodeIds.add(this.activeNodeId);
    }
    this.selection.setContext(this.activeNodeId, 'vertex');
    this.selectedVertexDragClear();
    this.history.clear();
    this.shading = decoded.settings.shading;
    this.ps1Snap = decoded.settings.ps1Snap;
    this.ps1Affine = decoded.settings.ps1Affine;
    this.renderer.setShadingMode(this.shading);
    this.renderer.setPs1Options(this.ps1Snap, this.ps1Affine);
    this.syncScene();
    this.renderer.frameActiveNode();
  }

  private selectedVertexDragClear(): void {
    if (this.drag) {
      this.drag = null;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private publish(): void {
    if (!this.disposed) {
      this.onSnapshot(this.getSnapshot());
    }
  }
}
