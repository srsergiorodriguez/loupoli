import {
  Euler,
  Matrix3,
  Matrix4,
  Plane,
  Quaternion,
  Vector3
} from 'three';
import { readTheme } from '../../design/theme';
import type { HalfEdgeMesh, Vec2, Vec3 } from '../geometry/HalfEdgeMesh';
import {
  applyLinearTransform,
  cloneModifiers,
  createModifier,
  invertLinearTransform,
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
  collectEdgeLoop,
  insetSelectedFace,
  loopCutFromEdge,
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
  type GizmoAxis,
  type GizmoHandle
} from '../render/gizmoMath';
import type { MeshNode, NodeTransform, SelectionMode } from '../scene/MeshNode';
import type { SceneGroup } from '../scene/SceneGroup';
import { SceneDocument } from '../scene/SceneDocument';
import { workspaceCan } from './workspaces';
import {
  applyUvView,
  fitUvProjection,
  pickUvCorner as pickNearestUvCorner,
  uvToCanvas,
  uvClickMoved,
  type UvProjection,
  type UvProjectionBase
} from '../uv/uvView';
import { drawUvCanvas } from '../uv/uvCanvas';
import { extractUvCharts } from '../geometry/uvCharts';
import { LscmError, unwrapUvCharts } from '../geometry/lscm';
import { ReplaceUvCommand } from './commands/ReplaceUvCommand';
import {
  TextureAsset,
  TextureAssetCommand,
  textureAssetStatesEqual,
  type TextureAlphaMode,
  type TextureLayerPattern
} from '../texture/TextureAsset';
import { TextureLibrary } from '../texture/TextureLibrary';
import { rotateUv, scaleUv, uvMedian, uvScaleFactor } from '../uv/uvTransform';
import { PaintEngine } from '../paint/PaintEngine';
import {
  drawTextureChecker,
  drawTextureSurface,
  prepareTextureSurface
} from '../texture/TextureSurface';
import type { PaintGradient, PaintTool } from '../paint/types';
import { brushTextureRadius, uvCanvasToTexture } from '../uv/uvPaint';
import {
  paintBounds,
  paintPointToTexture,
  paintTextureRadius
} from '../texture/paintView';
import {
  buildUvTopology,
  pickUvElement as pickUvEntity,
  selectUvCornersInPolygon,
  type UvSelectionMode
} from '../uv/uvElements';
import { copyUvChart, sameUvTopology } from '../uv/uvStack';
import { PaintTextureCommand } from './commands/PaintTextureCommand';
import {
  SelectionCommand,
  selectionSnapshotsEqual,
  type SelectionSnapshot
} from './commands/SelectionCommand';
import { ElementSelection } from './ElementSelection';
import { History, type HistoryEvent } from './History';
import { CreateMeshNodeCommand } from './commands/CreateMeshNodeCommand';
import { DeleteMeshNodeCommand } from './commands/DeleteMeshNodeCommand';
import {
  ReorderNodeCommand,
  SetGroupVisibilityCommand,
  SetNodeVisibilityCommand
} from './commands/SceneOrderCommands';
import { SetEdgeSeamsCommand } from './commands/SetEdgeSeamsCommand';
import { AssignTextureCommand } from './commands/AssignTextureCommand';
import {
  CreateTextureAssetCommand,
  DeleteTextureAssetCommand,
  SetTextureAlphaModeCommand,
  RenameTextureAssetCommand,
  SetTextureFilterCommand
} from './commands/TextureAssetCommands';
import { MoveUvCornersCommand } from './commands/MoveUvCornersCommand';
import {
  ReplaceMeshCommand,
  type ReplaceMeshLoopTransition
} from './commands/ReplaceMeshCommand';
import { SetModifiersCommand } from './commands/SetModifiersCommand';
import { RenameGroupCommand, RenameNodeCommand } from './commands/RenameCommands';
import { JoinNodesCommand, type JoinedSource } from './commands/JoinNodesCommand';
import { joinMeshNodes } from './joinMeshes';
import {
  CreateGroupCommand,
  TransformGroupCommand,
  UngroupGroupCommand,
  type GroupChildChange
} from './commands/GroupCommands';
import {
  bakeGroupTransform,
  localPositionFromWorld,
  localRotationFromWorld,
  transformMatrix,
  worldTransformForNode
} from './groupTransforms';
import { MoveVertexCommand } from './commands/MoveVertexCommand';
import { TransformVerticesCommand } from './commands/TransformVerticesCommand';
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
  type EditorPane,
  type SelectionCombineMode,
  type MeshCounts,
  type ShadingMode,
  type TransformMode,
  type TransformOrientation,
  type Workspace,
  type ProjectionPreview,
  type ModalTransformKind,
  type ModalTransformSnapshot,
  type MeshActionKind,
  type MeshActionSnapshot,
  type UvAxisLock,
  type UvTransformMode,
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
  readonly evaluatedVertex: number;
  readonly evaluatedOriginal: Vec3;
  readonly inverseLinear: number[] | null;
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
  readonly orientation: TransformOrientation;
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

/** Active selection-median transform gizmo drag. */
interface SelectionGizmoDrag {
  readonly pointerId: number;
  readonly mode: GizmoMode;
  readonly axis: GizmoHandle;
  readonly orientation: TransformOrientation;
  readonly node: MeshNode;
  readonly vertices: readonly number[];
  readonly before: readonly Vec3[];
  readonly pivot: Vec3;
  readonly worldMatrix: Matrix4;
  readonly inverseWorld: Matrix4;
  readonly inverseWorldLinear: Matrix3;
  readonly selectionMode: SelectionMode;
  readonly selectionCount: number;
  readonly origin: Vector3;
  readonly axisWorld: Vector3 | null;
  readonly size: number;
  readonly startParameter: number;
  readonly startX: number;
  readonly startY: number;
  readonly startHit: Vector3 | null;
  readonly plane: Plane | null;
  readonly basis: { u: Vector3; v: Vector3 } | null;
  readonly startAngle: number;
}

/** Selected mesh elements captured for a context-sensitive G/R/S transform. */
interface ElementTransform {
  readonly node: MeshNode;
  readonly vertices: readonly number[];
  readonly before: readonly Vec3[];
  readonly pivot: Vec3;
  readonly worldMatrix: Matrix4;
  readonly inverseWorld: Matrix4;
  readonly inverseWorldLinear: Matrix3;
  readonly selectionMode: SelectionMode;
  readonly selectionCount: number;
  readonly modifiersActive: boolean;
}

/** Active keyboard-driven G/R/S modal transform. */
interface ModalTransform {
  readonly kind: ModalTransformKind;
  readonly target: MeshNode | SceneGroup;
  readonly element: ElementTransform | null;
  readonly targetLabel: string;
  readonly before: NodeTransform;
  readonly orientation: TransformOrientation;
  axis: GizmoAxis | null;
  readonly startX: number;
  readonly startY: number;
  lastX: number;
  lastY: number;
  readonly origin: Vector3;
  readonly plane: Plane;
  readonly startHit: Vector3;
  readonly parentQuaternion: Quaternion;
  readonly localQuaternion: Quaternion;
  readonly worldQuaternion: Quaternion;
  readonly viewAxis: Vector3;
  numeric: string;
  value: number;
}

/** One-shot action drag armed from the touch ActionDock. */
interface ActionDrag {
  readonly kind: MeshActionKind;
  readonly node: MeshNode;
  readonly pointerId: number | null;
  readonly before: HalfEdgeMesh;
  readonly selection: readonly number[];
  readonly selectionMode: SelectionMode;
  readonly startX: number;
  readonly startY: number;
  readonly startValue: number;
  readonly faceIndex: number | null;
  readonly edgeIndex: number | null;
  readonly loopBase: HalfEdgeMesh | null;
  numeric: string;
  value: number;
}

/** A live raster paint stroke over the active texture layer. */
interface UvPaintStroke {
  readonly layerId: string;
  lastX: number;
  lastY: number;
}

/** A localized UV-corner drag with its pre-drag values. */
interface UvDrag {
  readonly node: MeshNode;
  readonly mode: UvTransformMode;
  readonly corners: readonly number[];
  readonly before: readonly Vec2[];
  readonly pivot: Vec2;
  readonly startUv: Vec2;
  readonly startAngle: number;
  readonly startDistance: number;
}

/** Most recent loop cut, used by the separate Loop Slide action. */
interface LastLoopCut {
  readonly node: MeshNode;
  readonly edge: number;
  readonly baseMesh: HalfEdgeMesh;
  readonly t: number;
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
  private lassoMode = false;
  private lassoPath: [number, number][] = [];
  private transformOrientation: TransformOrientation = 'local';
  private modalTransform: ModalTransform | null = null;
  private armedAction: MeshActionKind | null = null;
  private actionDrag: ActionDrag | null = null;
  private lastLoopCut: LastLoopCut | null = null;
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
  private selectionCombineMode: SelectionCombineMode = 'replace';
  private loopSelect = false;
  private activeEditor: EditorPane = '3d';
  private workspace: Workspace = 'model';
  private uvOpen = false;
  private uvSplit = 0.38;
  private uvLayout: 'bottom' | 'side' = 'bottom';
  private uvZoom = 1;
  private uvPanX = 0;
  private uvPanY = 0;
  private uvBaseProjection: UvProjectionBase | null = null;
  private uvBaseNodeId: string | null = null;
  private uvCanvasWidth = 0;
  private uvCanvasHeight = 0;
  private uvAxisLock: UvAxisLock = null;
  private uvFineMode = false;
  private uvTransformMode: UvTransformMode = 'move';
  private uvDragScale: number | null = null;
  private uvSelectionMode: UvSelectionMode = 'vertex';
  private uvClampMode = false;
  private uvActiveChart: number | null = null;
  private readonly uvSelection = new Set<number>();
  private lassoSelectionBefore: SelectionSnapshot | null = null;
  private readonly uvPins = new Set<number>();
  private uvPaint: UvPaintStroke | null = null;
  private paintEngine: PaintEngine | null = null;
  private projectedPaint: {
    engine: PaintEngine;
    asset: TextureAsset;
    nodeId: string;
    pointerId: number;
    lastFace: number | null;
  } | null = null;
  private uvPaintMode = false;
  private uvBrushColor = '#f2ffe0';
  private uvBrushSize = 36;
  private uvBrushOpacity = 0.9;
  private paintTool: PaintTool = 'brush';
  private paintSecondaryColor = '#1a1a1f';
  private paintHardness = 0.7;
  private paintSmoothing = 0.25;
  private paintNoise = 0;
  private paintShapeFilled = true;
  private paintGradient: PaintGradient = 'linear';
  private paintZoom = 1;
  private paintPanX = 0;
  private paintPanY = 0;
  private paintViewportWidth = 0;
  private paintViewportHeight = 0;
  private surfaceCursor: { x: number; y: number; size: number } | null = null;
  private projectionPreview: ProjectionPreview | null = null;
  private projectedShape: {
    tool: 'line' | 'rectangle' | 'ellipse' | 'gradient';
    asset: TextureAsset;
    nodeId: string;
    pointerId: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    pressure: number;
    pointerType: PointerSample['pointerType'];
  } | null = null;
  private uvDrag: UvDrag | null = null;
  private pointerSelectionHit = false;
  private uvPendingClick: {
    corners: number[];
    before: SelectionSnapshot | null;
    startX: number;
    startY: number;
    chart: number;
  } | null = null;
  private uvRevision = 0;
  private uvError: string | null = null;
  private readonly textureLibrary: TextureLibrary;
  private lastUvSourceSignature = '';
  private pointer: EditorSnapshot['pointer'] = null;
  private drag: VertexDrag | null = null;
  private gizmoDrag: GizmoDrag | null = null;
  private selectionGizmoDrag: SelectionGizmoDrag | null = null;
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

  /** Active texture asset used by texture and paint tools. */
  private get textureStack(): TextureAsset {
    const asset = this.textureLibrary.active;
    if (!asset) {
      throw new Error('The texture library has no active asset.');
    }
    return asset;
  }

  constructor(canvas: HTMLCanvasElement, options: EditorRuntimeOptions) {
    this.onSnapshot = options.onSnapshot;
    const theme = readTheme();
    this.textureLibrary = new TextureLibrary(
      512,
      'nearest',
      theme.textureA.css,
      theme.textureB.css
    );
    this.document = SceneDocument.createDefault(
      'cube',
      this.textureLibrary.activeAssetId
    );
    this.activeNodeId = this.document.nodes[0]?.id ?? null;
    if (this.activeNodeId) {
      this.selectedNodeIds.add(this.activeNodeId);
    }
    this.selection.setContext(this.activeNodeId, 'vertex');

    this.renderer = new ViewportRenderer(canvas, theme, {
      onViewChanged: () => {
        this.publish();
      },
      resolveNodeTexture: (node) =>
        this.textureLibrary.get(node.textureId)?.texture ?? null,
      resolveNodeAlphaMode: (node) =>
        this.textureLibrary.get(node.textureId)?.textureAlphaMode ?? 'opaque'
    });

    this.inputHost = {
      activateEditor: (editor) => this.setActiveEditor(editor),
      isUvActive: () => this.activeEditor !== '3d',
      orbit: (dx, dy) => this.renderer.orbit(dx, dy),
      pan: (dx, dy) => this.renderer.pan(dx, dy),
      zoom: (factor) => this.renderer.zoom(factor),
      beginToolPointer: (sample) => this.beginToolPointer(sample),
      hoverToolPointer: (sample) => this.hoverToolPointer(sample),
      moveToolPointer: (sample) => this.moveToolPointer(sample),
      endToolPointer: (sample) => this.endToolPointer(sample),
      cancelToolPointer: () => this.cancelToolPointer(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      frameSelection: () => this.frameSelection(),
      deleteSelection: () => this.deleteSelection(),
      toggleAxisLock: (axis) => this.toggleAxisLock(axis),
      tapSelect: (x, y, additive) => this.tapSelect(x, y, additive),
      finishOrbitClick: (moved, additive) => this.finishOrbitClick(moved, additive),
      setPointerReading: (sample) => this.setPointerReading(sample),
      isModalTransformActive: () => this.modalTransform !== null,
      beginModalTransform: (kind, clientX, clientY) =>
        this.beginModalTransform(kind, clientX, clientY),
      modalPointerMove: (sample) => this.moveModalTransform(sample),
      modalTransformKey: (key) => this.handleModalTransformKey(key),
      commitModalTransform: () => this.commitModalTransform(),
      armAction: (kind) => this.armAction(kind),
      hasActiveAction: () => this.hasActiveAction(),
      isActionAdjusting: () =>
        this.actionDrag !== null && this.actionDrag.pointerId === null,
      actionKey: (key) => this.handleActionKey(key),
      isLassoMode: () => this.lassoMode,
      resetView: () => this.resetView(),
      selectAll: () => this.selectAll(),
      beginLasso: (x, y) => this.beginLasso(x, y),
      moveLasso: (x, y) => this.moveLasso(x, y),
      endLasso: (x, y) => this.endLasso(x, y),
      cancelLasso: () => this.cancelLasso()
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
    const parentTransform = active
      ? (this.document.getGroup(active.parentId)?.transform ?? null)
      : null;
    const globalTransform = activeGroup
      ? this.cloneTransform(activeGroup.transform)
      : active
        ? worldTransformForNode(active.transform, parentTransform)
        : null;
    const selectedElements = this.selection.values();
    let seamCount = 0;
    if (mesh) {
      for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
        if (mesh.isEdgeSeam(edge)) {
          seamCount += 1;
        }
      }
    }
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
      lassoMode: this.lassoMode,
      lassoPath: this.lassoPath.map((point) => [point[0], point[1]] as const),
      snapEnabled: this.snapEnabled,
      snapStep: this.snapStep,
      axisLock: this.axisLock,
      ps1Snap: this.ps1Snap,
      ps1Affine: this.ps1Affine,
      selectedElements,
      selectionCombineMode: this.selectionCombineMode,
      activeEditor: this.activeEditor,
      workspace: this.workspace,
      selectionMode: this.selection.mode,
      loopSelect: this.loopSelect,
      selectedPosition,
      uvOpen: this.uvOpen,
      uvSplit: this.uvSplit,
      uvLayout: this.uvLayout,
      uvZoom: this.uvZoom,
      uvPanX: this.uvPanX,
      uvPanY: this.uvPanY,
      uvAxisLock: this.uvAxisLock,
      uvFineMode: this.uvFineMode,
      uvTransformMode: this.uvTransformMode,
      uvDragScale: this.uvDragScale,
      uvSelectionMode: this.uvSelectionMode,
      uvClampMode: this.uvClampMode,
      uvSelectedCorners: Array.from(this.uvSelection).sort((a, b) => a - b),
      uvPinnedCorners: Array.from(this.uvPins).sort((a, b) => a - b),
      uvPaintMode: this.uvPaintMode,
      uvBrushColor: this.uvBrushColor,
      uvBrushSize: this.uvBrushSize,
      uvBrushOpacity: this.uvBrushOpacity,
      paintTool: this.paintTool,
      paintSecondaryColor: this.paintSecondaryColor,
      paintHardness: this.paintHardness,
      paintSmoothing: this.paintSmoothing,
      paintNoise: this.paintNoise,
      paintShapeFilled: this.paintShapeFilled,
      paintGradient: this.paintGradient,
      paintZoom: this.paintZoom,
      paintPanX: this.paintPanX,
      paintPanY: this.paintPanY,
      surfaceCursor: this.surfaceCursor,
      projectionPreview: this.projectionPreview,
      uvRevision: this.uvRevision,
      uvError: this.uvError,
      textureAssets: this.textureLibrary.summaries(),
      textureAssetId: this.textureLibrary.activeAssetId,
      textureLayers: this.textureStack.summaries(),
      textureActiveId: this.textureStack.activeLayerId,
      textureSize: this.textureStack.width,
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
      globalTransform,
      transformOrientation: this.transformOrientation,
      modalTransform: this.modalSnapshot(),
      actionState: this.actionSnapshot(),
      loopSlideAvailable:
        this.lastLoopCut !== null &&
        this.lastLoopCut.node === this.getActiveNode(),
      boundaryEdges: mesh?.boundaryEdgeCount ?? 0,
      seamCount,
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

  /** Select the active texture asset for the inspector and paint tools. */
  setActiveTextureAsset(id: string): void {
    if (!this.textureLibrary.setActive(id)) {
      return;
    }
    this.publish();
  }

  /** Create an empty texture asset and make it the active one. */
  createTextureAsset(width: number, height: number): void {
    const asset = this.textureLibrary.build(width, height);
    this.history.execute(new CreateTextureAssetCommand(this.textureLibrary, asset));
    this.autosave.markTextureDirty();
    this.publish();
  }

  /** Import an image as a new raster layer on the active texture asset. */
  async importTextureImage(blob: Blob, name: string): Promise<void> {
    const asset = this.textureLibrary.active;
    if (!asset) {
      return;
    }
    const before = asset.snapshot();
    if (!(await asset.importImageLayer(blob, name))) {
      return;
    }
    const after = asset.snapshot();
    this.history.execute(
      new TextureAssetCommand(asset, before, after, 'Import image layer')
    );
    this.autosave.markTextureDirty();
    this.publish();
  }

  /** Assign the active texture asset to the object selection. */
  assignTextureToSelection(textureId: string | null): void {
    const nodes = this.document.nodes.filter((node) =>
      this.selectedNodeIds.has(node.id)
    );
    const active = this.getActiveNode();
    const targets = nodes.length > 0 ? nodes : active ? [active] : [];
    if (targets.length === 0) {
      return;
    }
    this.history.execute(new AssignTextureCommand(targets, textureId));
    this.syncScene();
    this.publish();
  }

  /** Delete the active asset when no nodes reference it. */
  deleteActiveTextureAsset(): void {
    const asset = this.textureLibrary.active;
    if (!asset || this.textureLibrary.list().length <= 1) {
      return;
    }
    if (this.document.nodes.some((node) => node.textureId === asset.id)) {
      this.projectError = 'Unassign this texture before deleting it.';
      this.publish();
      return;
    }
    this.history.execute(new DeleteTextureAssetCommand(this.textureLibrary, asset));
    this.renderer.clearTextureMaterials(asset.id);
    this.autosave.markTextureDirty();
    this.publish();
  }

  /** Duplicate the active texture asset with its layer content. */
  async duplicateActiveTextureAsset(): Promise<void> {
    const source = this.textureLibrary.active;
    if (!source) {
      return;
    }
    const copy = this.textureLibrary.build(
      source.width,
      source.height,
      `${source.name} Copy`,
      source.textureFilter
    );
    await copy.importData(await source.exportData());
    this.history.execute(new CreateTextureAssetCommand(this.textureLibrary, copy));
    this.autosave.markTextureDirty();
    this.publish();
  }

  /** Change the active asset's sampling filter. */
  setTextureAssetFilter(filter: 'nearest' | 'linear'): void {
    const asset = this.textureLibrary.active;
    if (!asset || asset.textureFilter === filter) {
      return;
    }
    this.history.execute(
      new SetTextureFilterCommand(asset, asset.textureFilter, filter)
    );
    this.autosave.markTextureDirty();
    this.renderer.refreshTexture();
    this.publish();
  }

  /** Activate a texture layer without adding an undo step. */
  setActiveTextureLayer(id: string): void {
    this.textureStack.setActive(id);
    this.publish();
  }

  /** Add a typed texture layer at the top, capped at eight layers. */
  addTextureLayer(pattern: TextureLayerPattern = 'solid'): void {
    this.commitTextureMutation('Add texture layer', () => {
      this.textureStack.addLayer(undefined, pattern);
    });
  }

  setTextureLayerPattern(id: string, pattern: TextureLayerPattern): void {
    this.commitTextureMutation('Change layer type', () => {
      this.textureStack.setPattern(id, pattern);
    });
  }

  renameTextureAsset(name: string): void {
    const asset = this.textureStack;
    const before = asset.name;
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 64 || trimmed === before) {
      return;
    }
    this.history.execute(new RenameTextureAssetCommand(asset, before, trimmed));
    this.autosave.markTextureDirty();
    this.publish();
  }

  setTextureAlphaMode(mode: TextureAlphaMode): void {
    const asset = this.textureStack;
    const before = asset.textureAlphaMode;
    if (before === mode) {
      return;
    }
    this.history.execute(new SetTextureAlphaModeCommand(asset, before, mode));
    this.renderer.clearTextureMaterials(asset.id);
    this.autosave.markTextureDirty();
    this.renderer.refreshTexture();
    this.publish();
  }

  renameTextureLayer(id: string, name: string): void {
    this.commitTextureMutation('Rename texture layer', () => {
      this.textureStack.setName(id, name);
    });
  }

  setTextureLayerBlendMode(id: string, mode: 'normal' | 'multiply' | 'screen'): void {
    this.commitTextureMutation('Change layer blend mode', () => {
      this.textureStack.setBlendMode(id, mode);
    });
  }

  setTextureLayerRole(
    id: string,
    role: 'color' | 'detail' | 'lighting'
  ): void {
    this.commitTextureMutation('Change layer role', () => {
      this.textureStack.setRole(id, role);
    });
  }

  removeTextureLayer(id: string): void {
    this.commitTextureMutation('Remove texture layer', () => {
      this.textureStack.removeLayer(id);
    });
  }

  toggleTextureLayer(id: string): void {
    const layer = this.textureStack
      .summaries()
      .find((summary) => summary.id === id);
    if (!layer) {
      return;
    }
    this.commitTextureMutation(
      layer.visible ? 'Hide texture layer' : 'Show texture layer',
      () => {
        this.textureStack.setVisible(id, !layer.visible);
      }
    );
  }

  reorderTextureLayer(id: string, targetId: string, after: boolean): void {
    this.commitTextureMutation('Reorder texture layer', () => {
      this.textureStack.moveLayerTo(id, targetId, after);
    });
  }

  setTextureLayerOpacity(id: string, opacity: number): void {
    this.commitTextureMutation('Change layer opacity', () => {
      this.textureStack.setOpacity(id, opacity);
    });
  }

  setTextureLayerColor(id: string, color: string): void {
    this.commitTextureMutation('Fill texture layer', () => {
      this.textureStack.setColor(id, color);
    });
  }

  private commitTextureMutation(label: string, mutate: () => void): void {
    const before = this.textureStack.snapshot();
    mutate();
    const after = this.textureStack.snapshot();
    if (textureAssetStatesEqual(before, after)) {
      return;
    }
    this.history.execute(
      new TextureAssetCommand(this.textureStack, before, after, label)
    );
    this.renderer.refreshTexture();
    this.publish();
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

  setTransformOrientation(orientation: TransformOrientation): void {
    if (this.transformOrientation === orientation) {
      return;
    }
    this.transformOrientation = orientation;
    this.syncScene();
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

  /** Enable the explicit screen-space lasso selection tool. */
  setLassoMode(enabled: boolean): void {
    if (this.lassoMode === enabled) {
      return;
    }
    this.lassoMode = enabled;
    this.lassoPath = [];
    if (enabled && this.transformMode !== 'select') {
      this.transformMode = 'select';
      this.syncScene();
    }
    this.publish();
  }

  private beginLasso(x: number, y: number): boolean {
    if (!this.lassoMode || !this.getActiveNode()) {
      return false;
    }
    this.lassoSelectionBefore = this.captureSelection();
    this.lassoPath = [[x, y]];
    this.publish();
    return true;
  }

  private moveLasso(x: number, y: number): void {
    if (this.lassoPath.length === 0 || this.lassoPath.length > 512) {
      return;
    }
    const previous = this.lassoPath[this.lassoPath.length - 1];
    if (Math.hypot(x - previous[0], y - previous[1]) >= 1) {
      this.lassoPath.push([x, y]);
      this.publish();
    }
  }

  private endLasso(x: number, y: number): void {
    if (this.lassoPath.length === 0) {
      return;
    }
    const path = this.lassoPath;
    this.lassoPath = [];
    if (path.length < 3) {
      const node = this.getActiveNode();
      if (node) {
        this.selectEvaluatedElementAt(
          x,
          y,
          this.selectionCombineMode,
          node
        );
      }
      this.recordSelection(this.lassoSelectionBefore, 'Select element');
      this.lassoSelectionBefore = null;
      this.publish();
      return;
    }
    const selected = this.renderer.lassoSelect(
      this.selection.mode,
      path.map(([x, y]) => ({ x, y }))
    );
    if (this.selectionCombineMode === 'subtract') {
      const remaining = new Set(this.selection.values());
      for (const index of selected) {
        remaining.delete(index);
      }
      this.selection.setValues(Array.from(remaining));
    } else if (this.selectionCombineMode === 'add') {
      const union = new Set(this.selection.values());
      for (const index of selected) {
        union.add(index);
      }
      this.selection.setValues(Array.from(union));
    } else {
      this.selection.setValues(selected);
    }
    this.syncScene();
    this.publish();
    this.recordSelection(this.lassoSelectionBefore, 'Select lasso');
    this.lassoSelectionBefore = null;
  }

  private cancelLasso(): void {
    if (this.lassoPath.length === 0) {
      return;
    }
    this.lassoPath = [];
    this.lassoSelectionBefore = null;
    this.publish();
  }

  private captureSelection(): SelectionSnapshot | null {
    const node = this.getActiveNode();
    if (!node) {
      return null;
    }
    return {
      nodeId: node.id,
      mode: this.selection.mode,
      values: [...this.selection.values()],
      uvMode: this.uvSelectionMode,
      uvValues: [...this.uvSelection].sort((a, b) => a - b)
    };
  }

  private recordSelection(
    before: SelectionSnapshot | null,
    label: string
  ): void {
    const after = this.captureSelection();
    if (!before || !after || selectionSnapshotsEqual(before, after)) {
      return;
    }
    this.history.execute(
      new SelectionCommand(
        (snapshot) => this.restoreSelection(snapshot),
        before,
        after,
        label
      )
    );
  }

  private restoreSelection(snapshot: SelectionSnapshot): void {
    const node = this.document.getNode(snapshot.nodeId);
    if (!node) {
      return;
    }
    this.activeGroupId = null;
    this.activeNodeId = node.id;
    this.selectedNodeIds.clear();
    this.selectedNodeIds.add(node.id);
    this.selection.setContext(node.id, snapshot.mode);
    this.selection.setValues(snapshot.values);
    this.uvSelectionMode = snapshot.uvMode;
    this.uvSelection.clear();
    for (const corner of snapshot.uvValues) {
      this.uvSelection.add(corner);
    }
    this.uvActiveChart = null;
    this.lastUvSourceSignature = this.uvSourceSignature();
    this.syncScene();
    this.publish();
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

  /** Reset to a new Untitled document with a default cube. */
  newProject(): void {
    if (this.fileBusy) {
      return;
    }
    if (this.modalTransform) {
      this.cancelModalTransform();
    }
    this.cancelToolPointer();
    this.cancelUvPaint();
    this.cancelTexturePaint();
    this.cancelProjectionPaint();
    this.surfaceCursor = null;
    this.projectionPreview = null;
    this.armedAction = null;
    this.renderer.setActionPreviewLine(null);
    this.cancelLasso();
    this.lassoMode = false;
    this.transformMode = 'select';
    this.axisLock = null;
    this.renderer.clearAllTextureMaterials();
    this.textureLibrary.reset(512);
    const fresh = SceneDocument.createDefault(
      'cube',
      this.textureLibrary.activeAssetId
    );
    this.document.replaceNodes(fresh.nodes);
    this.document.replaceGroups([]);
    this.projectName = 'Untitled';
    this.activeGroupId = null;
    this.activeNodeId = this.document.nodes[0]?.id ?? null;
    this.selectedNodeIds.clear();
    if (this.activeNodeId) {
      this.selectedNodeIds.add(this.activeNodeId);
    }
    this.selection.clear();
    this.selection.setContext(this.activeNodeId, 'vertex');
    this.uvOpen = false;
    this.uvPaintMode = false;
    this.activeEditor = '3d';
    this.workspace = 'model';
    this.renderer.setSeamOverlayVisible(false);
    this.uvSelection.clear();
    this.uvPins.clear();
    this.uvActiveChart = null;
    this.uvSelectionMode = 'vertex';
    this.uvTransformMode = 'move';
    this.uvZoom = 1;
    this.uvPanX = 0;
    this.uvPanY = 0;
    this.uvError = null;
    this.uvRevision += 1;
    this.pendingRecovery = null;
    this.recoveryAvailable = false;
    this.recoveryUpdatedAt = null;
    this.recovered = false;
    this.projectError = null;
    this.history.clear();
    this.syncScene();
    this.renderer.refreshTexture();
    this.renderer.frameActiveNode();
    this.publish();
    void this.autosave.clear().then(() => this.initializePersistence());
  }

  /** Open or close the UV editing split. */
  toggleUvView(): void {
    if (this.uvOpen) {
      this.closeUvView();
    } else {
      this.openUvView();
    }
  }

  /** Switch Model, UV, and Paint without duplicating open/close logic. */
  setWorkspace(workspace: 'model' | 'uv' | 'paint'): void {
    if (workspace !== 'paint') {
      this.cancelProjectionPaint();
      this.surfaceCursor = null;
      this.projectionPreview = null;
    }
    this.workspace = workspace;
    if (workspace === 'model') {
      this.activeEditor = '3d';
      if (this.uvOpen) {
        this.closeUvView();
      } else if (this.uvPaintMode) {
        this.uvPaintMode = false;
        this.renderer.setSeamOverlayVisible(false);
        this.syncScene();
        this.publish();
      }
      return;
    }
    if (!this.uvOpen) {
      this.openUvView();
    }
    this.workspace = workspace;
    const paint = workspace === 'paint';
    if (!paint && this.uvPaintMode) {
      this.cancelTexturePaint();
    }
    this.activeEditor = paint ? 'paint' : 'uv';
    if (paint) {
      this.lassoMode = false;
    }
    if (this.uvPaintMode !== paint) {
      this.uvPaintMode = paint;
      this.uvRevision += 1;
      this.publish();
    }
    this.renderer.setSeamOverlayVisible(!paint);
    this.syncScene();
    this.publish();
  }

  private openUvView(): void {
    if (this.modalTransform) {
      this.cancelModalTransform();
    }
    if (this.actionDrag) {
      this.cancelActionGesture();
    } else {
      this.armedAction = null;
      this.renderer.setActionPreviewLine(null);
    }
    this.uvOpen = true;
    this.workspace = 'uv';
    this.activeEditor = 'uv';
    this.uvZoom = 1;
    this.uvPanX = 0;
    this.uvPanY = 0;
    this.uvBaseProjection = null;
    this.uvBaseNodeId = null;
    this.uvError = null;
    this.uvSelection.clear();
    this.uvPins.clear();
    this.uvActiveChart = null;
    this.lastUvSourceSignature = '';
    this.uvRevision += 1;
    this.renderer.setSeamOverlayVisible(true);
    this.syncUvSelectionIfChanged();
    this.syncScene();
    this.publish();
  }

  private closeUvView(): void {
    this.cancelUvDrag();
    this.cancelTexturePaint();
    this.uvOpen = false;
    this.workspace = 'model';
    this.activeEditor = '3d';
    this.uvPaintMode = false;
    this.uvActiveChart = null;
    this.uvBaseProjection = null;
    this.uvBaseNodeId = null;
    this.renderer.setSeamOverlayVisible(false);
    this.uvRevision += 1;
    this.syncScene();
    this.publish();
  }

  /** Change the UV pane between the bottom split and the side-by-side layout. */
  setUvLayout(layout: 'bottom' | 'side'): void {
    if (this.uvLayout === layout) {
      return;
    }
    this.uvLayout = layout;
    this.uvRevision += 1;
    this.publish();
  }

  toggleUvLayout(): void {
    this.setUvLayout(this.uvLayout === 'bottom' ? 'side' : 'bottom');
  }

  /** Zoom the UV canvas around a canvas-local anchor. */
  zoomUv(
    factor: number,
    width: number,
    height: number,
    anchorX = width / 2,
    anchorY = height / 2
  ): void {
    const node = this.getActiveNode();
    if (!node || !this.uvOpen || width <= 0 || height <= 0) {
      return;
    }
    const nextZoom = Math.min(16, Math.max(0.25, this.uvZoom * factor));
    const current = this.uvProjection(node.mesh, width, height);
    const base = this.ensureUvProjectionBase(node.mesh, width, height);
    const u = (anchorX - current.offsetX) / current.scale;
    const v =
      (height - current.offsetY - anchorY) / current.scale;
    const nextScale = base.scale * nextZoom;
    this.uvZoom = nextZoom;
    this.uvPanX = anchorX - u * nextScale - base.offsetX;
    this.uvPanY = height - anchorY - v * nextScale - base.offsetY;
    this.uvRevision += 1;
    this.publish();
  }

  /** Pan the UV view in canvas pixels. */
  panUv(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      return;
    }
    this.uvPanX += dx;
    this.uvPanY -= dy;
    this.uvRevision += 1;
    this.publish();
  }

  /** Fit the complete UV layout again. */
  resetUvView(): void {
    const node = this.getActiveNode();
    this.uvZoom = 1;
    this.uvPanX = 0;
    this.uvPanY = 0;
    this.uvBaseProjection =
      node && this.uvCanvasWidth > 0 && this.uvCanvasHeight > 0
        ? fitUvProjection(
            node.mesh,
            this.uvCanvasWidth,
            this.uvCanvasHeight,
            24
          )
        : null;
    this.uvBaseNodeId = node?.id ?? null;
    this.uvRevision += 1;
    this.publish();
  }

  private uvViewState(): { zoom: number; panX: number; panY: number } {
    return {
      zoom: this.uvZoom,
      panX: this.uvPanX,
      panY: this.uvPanY
    };
  }

  private ensureUvProjectionBase(
    mesh: HalfEdgeMesh,
    width: number,
    height: number
  ): UvProjectionBase {
    const nodeId = this.getActiveNode()?.id ?? null;
    let base = this.uvBaseProjection;
    if (
      !base ||
      base.width !== width ||
      base.height !== height ||
      this.uvBaseNodeId !== nodeId
    ) {
      base = fitUvProjection(mesh, width, height, 24);
      this.uvBaseProjection = base;
      this.uvBaseNodeId = nodeId;
    }
    this.uvCanvasWidth = width;
    this.uvCanvasHeight = height;
    return base;
  }

  private uvProjection(
    mesh: HalfEdgeMesh,
    width: number,
    height: number
  ): UvProjection {
    return applyUvView(
      this.ensureUvProjectionBase(mesh, width, height),
      this.uvViewState()
    );
  }

  /** Set the fraction of the viewport occupied by the UV pane. */
  setUvSplit(fraction: number): void {
    const clamped = Math.min(0.65, Math.max(0.25, fraction));
    if (Math.abs(clamped - this.uvSplit) < 1e-4) {
      return;
    }
    this.uvSplit = clamped;
    this.publish();
  }

  /** Toggle fine UV pointer transforms for touch and precise dragging. */
  setUvFineMode(enabled: boolean): void {
    if (this.uvFineMode === enabled) {
      return;
    }
    this.uvFineMode = enabled;
    this.publish();
  }

  /** Toggle the U/V constraint used by UV drags. */
  setUvAxisLock(axis: 'u' | 'v'): void {
    this.uvAxisLock = this.uvAxisLock === axis ? null : axis;
    this.publish();
  }

  /** Switch direct UV transforms between move, rotate, and scale. */
  setUvTransformMode(mode: UvTransformMode): void {
    this.uvTransformMode = mode;
    this.publish();
  }

  /** Change the UV selection granularity without discarding selected corners. */
  setUvSelectionMode(mode: UvSelectionMode): void {
    this.uvPendingClick = null;
    if (this.uvSelectionMode === mode) {
      return;
    }
    this.uvSelectionMode = mode;
    this.uvRevision += 1;
    this.publish();
  }

  /** Keep direct UV transforms inside the 0–1 texture square. */
  setUvClampMode(enabled: boolean): void {
    if (this.uvClampMode === enabled) {
      return;
    }
    this.uvClampMode = enabled;
    this.publish();
  }

  /** Apply a UV lasso to the current entity mode. */
  selectUvLasso(
    points: readonly { x: number; y: number }[],
    additive: boolean,
    width: number,
    height: number
  ): void {
    const before = this.captureSelection();
    const node = this.getActiveNode();
    if (!node || !this.uvOpen || points.length < 3 || width <= 0 || height <= 0) {
      return;
    }
    const actualProjection = this.uvProjection(node.mesh, width, height);
    const topology = buildUvTopology(node.mesh);
    const selected = selectUvCornersInPolygon(
      node.mesh,
      topology,
      this.uvSelectionMode,
      points,
      actualProjection
    );
    const combine: SelectionCombineMode = additive
      ? 'add'
      : this.selectionCombineMode;
    if (combine === 'subtract') {
      for (const corner of selected) {
        this.uvSelection.delete(corner);
      }
    } else if (combine === 'add') {
      for (const corner of selected) {
        this.uvSelection.add(corner);
      }
    } else {
      this.uvSelection.clear();
      for (const corner of selected) {
        this.uvSelection.add(corner);
      }
    }
    this.uvRevision += 1;
    this.linkUvSelectionTo3d();
    this.publish();
    this.recordSelection(before, 'Select UV lasso');
  }

  /**
   * Pick the current UV entity mode at panel-local coordinates.
   *
   * A click on an already-selected entity preserves that selection so the same
   * pointer gesture can begin a move. Additive picks toggle the whole entity.
   */
  pickUvElement(
    x: number,
    y: number,
    width: number,
    height: number,
    additive: boolean
  ): boolean {
    const before = this.captureSelection();
    this.uvPendingClick = null;
    const result = this.pickUvElementInternal(
      x,
      y,
      width,
      height,
      additive,
      before
    );
    this.recordSelection(before, 'Select UV element');
    return result;
  }

  private pickUvElementInternal(
    x: number,
    y: number,
    width: number,
    height: number,
    additive: boolean,
    before: SelectionSnapshot | null
  ): boolean {
    const node = this.getActiveNode();
    if (!node) {
      return false;
    }
    const projection = this.uvProjection(node.mesh, width, height);
    const topology = buildUvTopology(node.mesh);
    const hit = pickUvEntity(
      node.mesh,
      topology,
      this.uvSelectionMode,
      x,
      y,
      projection
    );
    if (!hit) {
      this.uvPendingClick = null;
      return false;
    }
    this.uvActiveChart = hit.chart;
    const allSelected = hit.corners.every((corner) =>
      this.uvSelection.has(corner)
    );
    const combine: SelectionCombineMode = additive
      ? 'add'
      : this.selectionCombineMode;
    const exactMode =
      this.uvSelectionMode === 'vertex' || this.uvSelectionMode === 'edge';
    if (combine === 'subtract') {
      for (const corner of hit.corners) {
        this.uvSelection.delete(corner);
      }
    } else if (combine === 'add') {
      if (allSelected) {
        for (const corner of hit.corners) {
          this.uvSelection.delete(corner);
        }
      } else {
        for (const corner of hit.corners) {
          this.uvSelection.add(corner);
        }
      }
    } else if (!allSelected || exactMode) {
      this.uvSelection.clear();
      for (const corner of hit.corners) {
        this.uvSelection.add(corner);
      }
    } else if (this.uvSelection.size > hit.corners.length) {
      this.uvPendingClick = {
        corners: [...hit.corners],
        before,
        startX: x,
        startY: y,
        chart: hit.chart
      };
    }
    this.uvRevision += 1;
    this.linkUvSelectionTo3d();
    this.publish();
    return true;
  }

  /** Move the one selected vertex to an exact object-space position. */
  setSelectedVertexPosition(position: Vec3): void {
    const node = this.getActiveNode();
    if (!node || this.selection.mode !== 'vertex') {
      return;
    }
    const values = this.selection.values();
    if (values.length !== 1) {
      return;
    }
    const vertex = values[0];
    const before = node.mesh.getVertexPosition(vertex);
    if (
      Math.abs(before[0] - position[0]) < 1e-9 &&
      Math.abs(before[1] - position[1]) < 1e-9 &&
      Math.abs(before[2] - position[2]) < 1e-9
    ) {
      return;
    }
    this.history.execute(
      new MoveVertexCommand(node.mesh, vertex, before, position, node.id)
    );
  }

  /** Select every element in the current 3D mode on the active node. */
  selectAll3d(): void {
    const before = this.captureSelection();
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const count =
      this.selection.mode === 'vertex'
        ? node.mesh.vertexCount
        : this.selection.mode === 'edge'
          ? node.mesh.edgeCount
          : node.mesh.faceCount;
    const values = Array.from({ length: count }, (_, index) => index);
    this.selection.setValues(values);
    this.syncScene();
    this.publish();
    this.recordSelection(before, 'Select all elements');
  }

  /** Clear UV selection for a crisp empty-space click, not a pan. */
  clearUvSelectionOnClick(): void {
    if (this.uvSelection.size === 0) {
      return;
    }
    const before = this.captureSelection();
    this.uvSelection.clear();
    this.uvActiveChart = null;
    this.uvRevision += 1;
    this.publish();
    this.recordSelection(before, 'Clear UV selection');
  }

  /** Select every UV corner on the active node. */
  selectAllUv(): void {
    this.uvPendingClick = null;
    const before = this.captureSelection();
    const node = this.getActiveNode();
    if (!node || !this.uvOpen) {
      return;
    }
    for (let corner = 0; corner < node.mesh.halfEdgeCount; corner += 1) {
      this.uvSelection.add(corner);
    }
    this.uvRevision += 1;
    this.linkUvSelectionTo3d();
    this.publish();
    this.recordSelection(before, 'Select all UV corners');
  }

  /** Cmd/Ctrl+A selects in the active workspace. */
  selectAll(): void {
    this.selectAllActive();
  }

  /**
   * Similarity-stack two fully selected UV islands.
   *
   * The active (last picked) island is the reference and stays put; the other
   * island is translated, rotated, and uniformly scaled onto it. Both charts
   * must pass the topology signature check first.
   */
  stackUvIslands(): void {
    const node = this.getActiveNode();
    if (!node || !this.uvOpen) {
      return;
    }
    const topology = buildUvTopology(node.mesh);
    const selectedCharts = topology.charts
      .map((_, index) => index)
      .filter((index) => {
        const corners = topology.chartCorners[index];
        return (
          corners.length > 0 &&
          corners.every((corner) => this.uvSelection.has(corner))
        );
      });
    if (selectedCharts.length !== 2) {
      this.uvError =
        'Select exactly two complete UV islands with Island mode and Add.';
      this.uvRevision += 1;
      this.publish();
      return;
    }
    const reference =
      this.uvActiveChart !== null &&
      selectedCharts.includes(this.uvActiveChart)
        ? this.uvActiveChart
        : selectedCharts[1];
    const moving =
      selectedCharts[0] === reference
        ? selectedCharts[1]
        : selectedCharts[0];
    if (!sameUvTopology(topology, reference, moving)) {
      this.uvError =
        'The selected UV islands do not share the same topology.';
      this.uvRevision += 1;
      this.publish();
      return;
    }
    const alignment = copyUvChart(
      node.mesh,
      topology,
      reference,
      moving
    );
    if (!alignment) {
      this.uvError =
        'The selected UV islands could not be mapped one-to-one.';
      this.uvRevision += 1;
      this.publish();
      return;
    }
    this.history.execute(
      new MoveUvCornersCommand(
        node.mesh,
        node.id,
        alignment.corners,
        alignment.before,
        alignment.after,
        'Stack UV island'
      )
    );
    this.uvError = null;
    this.uvRevision += 1;
    this.publish();
  }

  /** Pin two selected UV corners, or clear existing pins. */
  toggleUvPins(): void {
    if (this.uvPins.size === 2) {
      this.uvPins.clear();
      this.uvRevision += 1;
      this.publish();
      return;
    }
    if (this.uvSelection.size !== 2) {
      return;
    }
    this.uvPins.clear();
    for (const corner of this.uvSelection) {
      this.uvPins.add(corner);
    }
    this.uvRevision += 1;
    this.publish();
  }

  /** Toggle the UV raster brush. */
  setUvPaintMode(enabled: boolean): void {
    this.uvPaintMode = enabled;
    this.publish();
  }

  setUvBrushColor(color: string): void {
    this.uvBrushColor = color;
    this.publish();
  }

  setUvBrushSize(size: number): void {
    this.uvBrushSize = Math.min(128, Math.max(2, size));
    this.publish();
  }

  setUvBrushOpacity(opacity: number): void {
    this.uvBrushOpacity = Math.min(1, Math.max(0.01, opacity));
    this.publish();
  }

  setPaintTool(tool: PaintTool): void {
    this.paintTool = tool;
    this.publish();
  }

  setPaintSecondaryColor(color: string): void {
    this.paintSecondaryColor = color;
    this.publish();
  }

  setPaintHardness(value: number): void {
    this.paintHardness = Math.min(1, Math.max(0.01, value));
    this.publish();
  }

  setPaintSmoothing(value: number): void {
    this.paintSmoothing = Math.min(1, Math.max(0, value));
    this.publish();
  }

  setPaintNoise(value: number): void {
    this.paintNoise = Math.min(1, Math.max(0, value));
    this.publish();
  }

  setPaintShapeFilled(value: boolean): void {
    this.paintShapeFilled = value;
    this.publish();
  }

  setPaintGradient(value: PaintGradient): void {
    this.paintGradient = value;
    this.publish();
  }

  zoomPaint(
    factor: number,
    anchorX: number,
    anchorY: number,
    width: number,
    height: number
  ): void {
    const next = Math.min(8, Math.max(0.5, this.paintZoom * factor));
    if (next === this.paintZoom) {
      return;
    }
    const current = paintBounds(width, height, 24, this.paintViewState());
    const u = (anchorX - current.x) / current.size;
    const v = (anchorY - current.y) / current.size;
    const baseSize = Math.max(1, Math.min(width, height) - 48);
    this.paintZoom = next;
    const size = baseSize * next;
    this.paintPanX = anchorX - u * size - (width - size) / 2;
    this.paintPanY = anchorY - v * size - (height - size) / 2;
    this.uvRevision += 1;
    this.publish();
  }

  panPaint(dx: number, dy: number): void {
    this.paintPanX += dx;
    this.paintPanY += dy;
    this.uvRevision += 1;
    this.publish();
  }

  /** Zoom around the center of the last painted viewport. */
  zoomPaintCenter(factor: number): void {
    if (this.paintViewportWidth <= 0 || this.paintViewportHeight <= 0) {
      return;
    }
    this.zoomPaint(
      factor,
      this.paintViewportWidth / 2,
      this.paintViewportHeight / 2,
      this.paintViewportWidth,
      this.paintViewportHeight
    );
  }

  resetPaintView(): void {
    this.paintZoom = 1;
    this.paintPanX = 0;
    this.paintPanY = 0;
    this.uvRevision += 1;
    this.publish();
  }

  private paintViewState(): { zoom: number; panX: number; panY: number } {
    return {
      zoom: this.paintZoom,
      panX: this.paintPanX,
      panY: this.paintPanY
    };
  }

  /** Start painting on the active layer at panel-local coordinates. */
  beginUvPaint(
    x: number,
    y: number,
    width: number,
    height: number,
    pressure: number
  ): boolean {
    if (!this.uvOpen || !this.uvPaintMode) {
      return false;
    }
    const node = this.getActiveNode();
    const layerId = this.textureStack.activeLayerId;
    if (!node || !layerId || !this.textureStack.beginPaint(layerId)) {
      return false;
    }
    const projection = this.uvProjection(node.mesh, width, height);
    const [tx, ty] = uvCanvasToTexture(
      x,
      y,
      projection,
      this.textureStack.width,
      this.textureStack.height
    );
    const radius =
      brushTextureRadius(
        this.uvBrushSize,
        projection,
        this.textureStack.width
      ) * Math.min(1, Math.max(0.2, pressure || 1));
    this.textureStack.paintSegment(
      layerId,
      tx,
      ty,
      tx,
      ty,
      radius,
      this.uvBrushColor,
      this.uvBrushOpacity
    );
    this.uvPaint = { layerId, lastX: tx, lastY: ty };
    this.uvRevision += 1;
    this.renderer.refreshTexture();
    this.publish();
    return true;
  }

  /** Continue a paint stroke; missing pointer samples interpolate. */
  updateUvPaint(
    x: number,
    y: number,
    width: number,
    height: number,
    pressure: number
  ): void {
    if (!this.uvPaint) {
      return;
    }
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const projection = this.uvProjection(node.mesh, width, height);
    const [tx, ty] = uvCanvasToTexture(
      x,
      y,
      projection,
      this.textureStack.width,
      this.textureStack.height
    );
    const radius =
      brushTextureRadius(
        this.uvBrushSize,
        projection,
        this.textureStack.width
      ) * Math.min(1, Math.max(0.2, pressure || 1));
    this.textureStack.paintSegment(
      this.uvPaint.layerId,
      this.uvPaint.lastX,
      this.uvPaint.lastY,
      tx,
      ty,
      radius,
      this.uvBrushColor,
      this.uvBrushOpacity
    );
    this.uvPaint.lastX = tx;
    this.uvPaint.lastY = ty;
    this.uvRevision += 1;
    this.renderer.refreshTexture();
    this.publish();
  }

  /** Commit the current paint stroke as one localized pixel patch. */
  finishUvPaint(): void {
    if (!this.uvPaint) {
      return;
    }
    this.uvPaint = null;
    const patch = this.textureStack.endPaint();
    if (patch) {
      this.history.execute(new PaintTextureCommand(this.textureStack, patch));
    }
    this.renderer.refreshTexture();
  }

  /** Discard the live stroke and restore pre-stroke pixels. */
  cancelUvPaint(): void {
    if (!this.uvPaint) {
      return;
    }
    this.uvPaint = null;
    this.textureStack.cancelPaint();
    this.renderer.refreshTexture();
  }

  /** Rebuild the UV corner set from the active 3D element selection. */
  syncUvFrom3d(): void {
    this.rebuildUvSelection();
    this.lastUvSourceSignature = this.uvSourceSignature();
    this.publish();
  }

  /**
   * Extract seam charts and run the bespoke LSCM unwrap.
   *
   * UVs are replaced in one localized command. Solver failures are surfaced in
   * the UV pane and never write partial or non-finite coordinates.
   */
  unwrapUv(): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    try {
      const before = node.mesh.heUv.slice();
      const charts = extractUvCharts(node.mesh);
      const pinnedCorners = [...this.uvPins].filter(
        (corner) => corner >= 0 && corner < node.mesh.halfEdgeCount
      );
      const after = unwrapUvCharts(
        node.mesh,
        charts,
        pinnedCorners.length === 2 ? pinnedCorners : null
      );
      const command = new ReplaceUvCommand(
        node.mesh,
        node.id,
        before,
        after
      );
      this.uvError = null;
      this.history.execute(command);
      this.uvBaseProjection = null;
      this.uvRevision += 1;
      this.publish();
    } catch (error) {
      this.uvError =
        error instanceof LscmError
          ? error.message
          : this.errorMessage(error);
      this.publish();
    }
  }

  /** Draw the UV layout into the panel canvas. */
  drawUvView(canvas: HTMLCanvasElement, width: number, height: number): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const projection = this.uvProjection(node.mesh, width, height);
    drawUvCanvas(
      canvas,
      node.mesh,
      this.uvSelection,
      this.uvPins,
      width,
      height,
      this.textureStack,
      this.uvViewState(),
      this.uvSelectionMode,
      projection
    );
  }

  /** Draw the composited texture as the Paint workspace surface. */
  drawPaintView(
    canvas: HTMLCanvasElement,
    width: number,
    height: number
  ): void {
    this.paintViewportWidth = width;
    this.paintViewportHeight = height;
    const prepared = prepareTextureSurface(canvas, width, height);
    if (!prepared) {
      return;
    }
    const { context } = prepared;
    const bounds = paintBounds(width, height, 24, this.paintViewState());
    const textureRect = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.size,
      height: bounds.size
    };
    drawTextureChecker(context, textureRect);
    drawTextureSurface(context, this.textureStack, textureRect);
    context.strokeStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--border-subtle')
        .trim() || 'rgba(255,255,255,.12)';
    context.lineWidth = 1;
    context.strokeRect(bounds.x, bounds.y, bounds.size, bounds.size);
  }

  /** Update the 3D surface brush cursor during hover. */
  private hoverToolPointer(sample: PointerSample | null): void {
    if (this.workspace !== 'paint' || !sample || sample.pointerType !== 'mouse') {
      if (this.surfaceCursor !== null) {
        this.surfaceCursor = null;
        this.publish();
      }
      return;
    }
    const node = this.getActiveNode();
    const supported =
      this.paintTool === 'brush' ||
      this.paintTool === 'eraser' ||
      this.paintTool === 'line' ||
      this.paintTool === 'rectangle' ||
      this.paintTool === 'ellipse' ||
      this.paintTool === 'gradient' ||
      this.paintTool === 'fill';
    const hasTexture =
      node !== null && this.textureLibrary.get(node.textureId) !== null;
    const hit =
      supported && hasTexture
        ? this.renderer.pickSurface(sample.clientX, sample.clientY)
        : null;
    const next = hit
      ? {
          x: sample.clientX,
          y: sample.clientY,
          size: this.uvBrushSize
        }
      : null;
    const current = this.surfaceCursor;
    if (
      current?.x === next?.x &&
      current?.y === next?.y &&
      current?.size === next?.size
    ) {
      return;
    }
    this.surfaceCursor = next;
    this.publish();
  }

  /** Commit the screen-space projected shape or gradient on release. */
  private commitProjectedShape(): void {
    const shape = this.projectedShape;
    if (!shape) {
      return;
    }
    this.projectedShape = null;
    this.projectionPreview = null;
    const asset = shape.asset;
    const startHit = this.renderer.pickSurface(shape.startX, shape.startY);
    if (!startHit || startHit.nodeId !== shape.nodeId || !asset.activeLayerId) {
      this.surfaceCursor = null;
      this.publish();
      return;
    }
    const strokePressure =
      shape.pointerType === 'pen' ? shape.pressure : 1;
    const engine = new PaintEngine(
      asset,
      asset.activeLayerId,
      this.paintSettings(1)
    );
    if (!engine.beginProjected({
      x: startHit.uv[0] * asset.width,
      y: (1 - startHit.uv[1]) * asset.height,
      pressure: strokePressure
    })) {
      this.surfaceCursor = null;
      this.publish();
      return;
    }
    const nodeId = shape.nodeId;
    const stamp = (
      x: number,
      y: number,
      color?: string,
      pressure = strokePressure
    ): boolean => {
      const hit = this.renderer.pickSurface(x, y);
      if (!hit || hit.nodeId !== nodeId) {
        return false;
      }
      engine.stampProjected(
        hit.uv[0] * asset.width,
        (1 - hit.uv[1]) * asset.height,
        this.projectionRadius(hit, asset),
        pressure,
        color
      );
      return true;
    };

    if (shape.tool === 'line') {
      const distance = Math.hypot(
        shape.endX - shape.startX,
        shape.endY - shape.startY
      );
      const step = Math.max(1.5, this.uvBrushSize * 0.1);
      const steps = Math.max(1, Math.ceil(distance / step));
      for (let index = 0; index <= steps; index += 1) {
        const t = index / steps;
        stamp(
          shape.startX + (shape.endX - shape.startX) * t,
          shape.startY + (shape.endY - shape.startY) * t
        );
      }
    } else if (shape.tool === 'gradient') {
      this.sampleScreenGradient(engine, asset, shape, stamp);
    } else {
      this.sampleScreenShape(engine, asset, shape, stamp);
    }

    engine.finish();
    const patch = asset.endPaint();
    if (patch) {
      this.history.execute(new PaintTextureCommand(asset, patch));
    }
    this.surfaceCursor = null;
    this.renderer.refreshTexture();
    this.publish();
  }

  /** Sample the visible surface inside a screen-space rectangle or ellipse. */
  private sampleScreenShape(
    _engine: PaintEngine,
    _asset: TextureAsset,
    shape: NonNullable<typeof this.projectedShape>,
    stamp: (x: number, y: number, color?: string, pressure?: number) => boolean
  ): void {
    const minX = Math.min(shape.startX, shape.endX);
    const maxX = Math.max(shape.startX, shape.endX);
    const minY = Math.min(shape.startY, shape.endY);
    const maxY = Math.max(shape.startY, shape.endY);
    const step = Math.max(2, this.uvBrushSize * 0.18);
    const ellipse = shape.tool === 'ellipse';
    const filled = this.paintShapeFilled;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const radiusX = Math.max(0.5, (maxX - minX) / 2);
    const radiusY = Math.max(0.5, (maxY - minY) / 2);
    const scan = (x: number, y: number): void => {
      if (ellipse) {
        const nx = (x - centerX) / radiusX;
        const ny = (y - centerY) / radiusY;
        if (nx * nx + ny * ny > 1) {
          return;
        }
      }
      stamp(x, y);
    };
    if (filled) {
      for (let y = minY; y <= maxY; y += step) {
        for (let x = minX; x <= maxX; x += step) {
          scan(x, y);
        }
      }
      return;
    }
    if (ellipse) {
      const circumference =
        Math.PI * (3 * (radiusX + radiusY) -
          Math.sqrt((3 * radiusX + radiusY) * (radiusX + 3 * radiusY)));
      const steps = Math.max(8, Math.ceil(circumference / step));
      for (let index = 0; index < steps; index += 1) {
        const angle = (index / steps) * Math.PI * 2;
        stamp(
          centerX + Math.cos(angle) * radiusX,
          centerY + Math.sin(angle) * radiusY
        );
      }
      return;
    }
    const width = maxX - minX;
    const height = maxY - minY;
    const perimeterSteps = Math.max(4, Math.ceil((width + height) * 2 / step));
    for (let index = 0; index <= perimeterSteps; index += 1) {
      const t = index / perimeterSteps;
      const distance = t * (width + height) * 2;
      let x = minX;
      let y = minY;
      if (distance < width) {
        x = minX + distance;
      } else if (distance < width + height) {
        x = maxX;
        y = minY + distance - width;
      } else if (distance < width * 2 + height) {
        x = maxX - (distance - width - height);
        y = maxY;
      } else {
        x = minX;
        y = maxY - (distance - width * 2 - height);
      }
      stamp(x, y);
    }
  }

  /** Fill the visible active surface with a screen-space gradient. */
  private sampleScreenGradient(
    _engine: PaintEngine,
    _asset: TextureAsset,
    shape: NonNullable<typeof this.projectedShape>,
    stamp: (x: number, y: number, color?: string, pressure?: number) => boolean
  ): void {
    const rect = this.renderer.getCanvasRect();
    const step = Math.max(2, this.uvBrushSize * 0.18);
    const dx = shape.endX - shape.startX;
    const dy = shape.endY - shape.startY;
    const lengthSq = dx * dx + dy * dy;
    const maxDistance = Math.max(1, Math.sqrt(lengthSq));
    for (let y = rect.top; y <= rect.bottom; y += step) {
      for (let x = rect.left; x <= rect.right; x += step) {
        const hit = this.renderer.pickSurface(x, y);
        if (!hit || hit.nodeId !== shape.nodeId) {
          continue;
        }
        const t = this.paintGradient === 'radial'
          ? Math.min(1, Math.hypot(x - shape.startX, y - shape.startY) / maxDistance)
          : Math.max(0, Math.min(1, lengthSq === 0
              ? 0
              : ((x - shape.startX) * dx + (y - shape.startY) * dy) / lengthSq));
        stamp(x, y, this.mixHex(this.uvBrushColor, this.paintSecondaryColor, t));
      }
    }
  }

  /** Interpolate two hex colors in linear RGB for gradient dabs. */
  private mixHex(from: string, to: string, t: number): string {
    const parse = (value: string): [number, number, number] => {
      const hex = value.replace('#', '');
      if (hex.length !== 6) {
        return [255, 255, 255];
      }
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ];
    };
    const a = parse(from);
    const b = parse(to);
    const mix = (i: number): string =>
      Math.round(a[i] + (b[i] - a[i]) * t)
        .toString(16)
        .padStart(2, '0');
    return `#${mix(0)}${mix(1)}${mix(2)}`;
  }

  /** Shared paint settings for texture-space and projected strokes. */
  private paintSettings(radius: number) {
    return {
      tool: this.paintTool,
      color: this.uvBrushColor,
      secondaryColor: this.paintSecondaryColor,
      radius,
      opacity: this.uvBrushOpacity,
      hardness: this.paintHardness,
      smoothing: this.paintSmoothing,
      noise: this.paintNoise,
      spacing: 0.25,
      shapeFilled: this.paintShapeFilled,
      gradient: this.paintGradient
    };
  }

  /** Begin painting the active texture layer directly in texture space. */
  beginTexturePaint(
    x: number,
    y: number,
    width: number,
    height: number,
    pressure: number,
    tiltX = 0,
    tiltY = 0
  ): boolean {
    if (!this.uvOpen || !this.uvPaintMode) {
      return false;
    }
    if (this.paintEngine) {
      this.cancelTexturePaint();
    }
    const asset = this.textureStack;
    const layerId = asset.activeLayerId;
    const point = paintPointToTexture(
      x,
      y,
      width,
      height,
      asset.width,
      asset.height,
      24,
      this.paintViewState()
    );
    if (!layerId || !point) {
      return false;
    }
    const radius = paintTextureRadius(
      this.uvBrushSize,
      width,
      height,
      asset.width,
      24,
      this.paintViewState()
    );
    const engine = new PaintEngine(asset, layerId, this.paintSettings(radius));
    if (!engine.begin({ x: point.x, y: point.y, pressure, tiltX, tiltY })) {
      return false;
    }
    this.paintEngine = engine;
    this.uvRevision += 1;
    this.renderer.refreshTexture();
    this.publish();
    return true;
  }

  /**
   * Start a latched projected gesture on the active object's bound texture.
   *
   * Brush/Eraser paint live; line/shape/gradient gestures show a screen preview
   * and sample the projected surface on release. A miss returns false so
   * InputRouter falls through to camera orbit.
   */
  private beginProjectionPaint(sample: PointerSample): boolean {
    if (this.workspace !== 'paint') {
      return false;
    }
    const node = this.getActiveNode();
    if (!node) {
      return false;
    }
    const asset = this.textureLibrary.get(node.textureId);
    if (!asset || !asset.activeLayerId) {
      this.projectError =
        'Assign a texture to the active object before painting in 3D.';
      this.publish();
      return false;
    }
    const hit = this.renderer.pickSurface(sample.clientX, sample.clientY);
    if (!hit || hit.nodeId !== node.id) {
      return false;
    }
    if (this.textureLibrary.activeAssetId !== asset.id) {
      this.textureLibrary.setActive(asset.id);
    }
    if (this.paintEngine) {
      this.cancelTexturePaint();
    }
    this.projectError = null;
    this.surfaceCursor = {
      x: sample.clientX,
      y: sample.clientY,
      size: this.uvBrushSize
    };
    if (this.paintTool === 'fill') {
      const fill = this.projectedUvIsland(node, hit.face, asset);
      if (!fill) {
        this.projectError = 'No UV island contains the selected surface.';
        this.publish();
        return false;
      }
      const engine = new PaintEngine(
        asset,
        asset.activeLayerId,
        this.paintSettings(1)
      );
      if (!engine.beginProjected({
        x: hit.uv[0] * asset.width,
        y: (1 - hit.uv[1]) * asset.height,
        pressure: sample.pressure
      })) {
        return false;
      }
      engine.fillProjected(fill.path, fill.bounds);
      this.projectedPaint = {
        engine,
        asset,
        nodeId: node.id,
        pointerId: sample.pointerId,
        lastFace: null
      };
      this.uvRevision += 1;
      this.renderer.refreshTexture();
      this.publish();
      return true;
    }
    if (this.paintTool === 'line' || this.paintTool === 'rectangle' ||
        this.paintTool === 'ellipse' || this.paintTool === 'gradient') {
      const shape = {
        tool: this.paintTool,
        asset,
        nodeId: node.id,
        pointerId: sample.pointerId,
        startX: sample.clientX,
        startY: sample.clientY,
        endX: sample.clientX,
        endY: sample.clientY,
        pressure: sample.pressure,
        pointerType: sample.pointerType
      };
      this.projectedShape = shape;
      this.projectionPreview = this.shapePreview(shape);
      this.publish();
      return true;
    }
    const radius = this.projectionRadius(hit, asset);
    const engine = new PaintEngine(
      asset,
      asset.activeLayerId,
      this.paintSettings(radius)
    );
    const point = {
      x: hit.uv[0] * asset.width,
      y: (1 - hit.uv[1]) * asset.height,
      pressure: sample.pressure,
      tiltX: sample.tiltX,
      tiltY: sample.tiltY
    };
    if (!engine.begin(point)) {
      return false;
    }
    this.projectedPaint = {
      engine,
      asset,
      nodeId: node.id,
      pointerId: sample.pointerId,
      lastFace: hit.face
    };
    this.uvRevision += 1;
    this.renderer.refreshTexture();
    this.publish();
    return true;
  }

  /** Build a texture-space path for the seam-bounded UV chart of one face. */
  private projectedUvIsland(
    node: MeshNode,
    evaluatedFace: number,
    asset: TextureAsset
  ): {
    path: Path2D;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  } | null {
    const evaluated = node.getEvaluatedMesh();
    const baseFace =
      evaluated.provenance?.faceBase[evaluatedFace] ?? evaluatedFace;
    const chart = extractUvCharts(node.mesh).find((candidate) =>
      candidate.faces.includes(baseFace)
    );
    if (!chart) {
      return null;
    }
    const mesh = node.mesh;
    const path = new Path2D();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const face of chart.faces) {
      const start = mesh.faceHalfEdge[face];
      let halfEdge = start;
      let first = true;
      do {
        const x = mesh.heUv[halfEdge * 2] * asset.width;
        const y = (1 - mesh.heUv[halfEdge * 2 + 1]) * asset.height;
        if (first) {
          path.moveTo(x, y);
          first = false;
        } else {
          path.lineTo(x, y);
        }
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        halfEdge = mesh.heNext[halfEdge];
      } while (halfEdge !== start);
      path.closePath();
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return null;
    }
    return {
      path,
      bounds: { minX, minY, maxX, maxY }
    };
  }

  private shapePreview(shape: NonNullable<typeof this.projectedShape>): ProjectionPreview {
    return {
      kind: shape.tool,
      startX: shape.startX,
      startY: shape.startY,
      endX: shape.endX,
      endY: shape.endY,
      size: this.uvBrushSize,
      filled: this.paintShapeFilled,
      gradient: this.paintGradient,
      color: this.uvBrushColor,
      secondaryColor: this.paintSecondaryColor
    };
  }

  private projectionRadius(
    hit: { uvPerCssPixel: number },
    asset: TextureAsset
  ): number {
    return Math.max(
      0.5,
      Math.min(512, (this.uvBrushSize / 2) * hit.uvPerCssPixel * asset.width)
    );
  }

  /** Continue a latched projected stroke; misses simply add no samples. */
  private updateProjectionPaint(sample: PointerSample): void {
    const shape = this.projectedShape;
    if (shape) {
      if (shape.pointerId !== sample.pointerId) {
        return;
      }
      shape.endX = sample.clientX;
      shape.endY = sample.clientY;
      this.projectionPreview = this.shapePreview(shape);
      this.surfaceCursor = {
        x: sample.clientX,
        y: sample.clientY,
        size: this.uvBrushSize
      };
      this.publish();
      return;
    }
    const state = this.projectedPaint;
    if (!state || state.pointerId !== sample.pointerId) {
      return;
    }
    const hit = this.renderer.pickSurface(sample.clientX, sample.clientY);
    if (!hit || hit.nodeId !== state.nodeId) {
      state.lastFace = null;
      if (this.surfaceCursor !== null) {
        this.surfaceCursor = null;
        this.publish();
      }
      return;
    }
    const point = {
      x: hit.uv[0] * state.asset.width,
      y: (1 - hit.uv[1]) * state.asset.height,
      pressure: sample.pressure,
      tiltX: sample.tiltX,
      tiltY: sample.tiltY
    };
    this.surfaceCursor = {
      x: sample.clientX,
      y: sample.clientY,
      size: this.uvBrushSize
    };
    const connect = state.lastFace !== null && state.lastFace === hit.face;
    state.engine.updateProjected(point, connect);
    state.lastFace = hit.face;
    this.uvRevision += 1;
    this.renderer.refreshTexture();
    this.publish();
  }

  private finishProjectionPaint(): void {
    if (this.projectedShape) {
      this.commitProjectedShape();
      return;
    }
    const state = this.projectedPaint;
    if (!state) {
      return;
    }
    this.projectedPaint = null;
    state.engine.finish();
    const patch = state.asset.endPaint();
    if (patch) {
      this.history.execute(new PaintTextureCommand(state.asset, patch));
    }
    this.surfaceCursor = null;
    this.renderer.refreshTexture();
    this.publish();
  }

  private cancelProjectionPaint(): void {
    if (this.projectedShape) {
      this.projectedShape = null;
      this.projectionPreview = null;
      this.surfaceCursor = null;
      this.publish();
      return;
    }
    const state = this.projectedPaint;
    if (!state) {
      return;
    }
    this.projectedPaint = null;
    this.surfaceCursor = null;
    state.engine.cancel();
    this.renderer.refreshTexture();
    this.publish();
  }

  /** Continue a texture-space paint stroke. */
  updateTexturePaint(
    x: number,
    y: number,
    width: number,
    height: number,
    pressure: number,
    tiltX = 0,
    tiltY = 0
  ): void {
    if (!this.paintEngine) {
      return;
    }
    const asset = this.textureStack;
    const point = paintPointToTexture(
      x,
      y,
      width,
      height,
      asset.width,
      asset.height,
      24,
      this.paintViewState()
    );
    if (!point) {
      return;
    }
    this.paintEngine.update({ x: point.x, y: point.y, pressure, tiltX, tiltY });
    this.uvRevision += 1;
    this.renderer.refreshTexture();
    this.publish();
  }

  finishTexturePaint(): void {
    const engine = this.paintEngine;
    if (!engine) {
      return;
    }
    this.paintEngine = null;
    engine.finish();
    const asset = this.textureStack;
    const patch = asset.endPaint();
    if (patch) {
      this.history.execute(new PaintTextureCommand(asset, patch));
    }
    this.renderer.refreshTexture();
    this.publish();
  }

  cancelTexturePaint(): void {
    const engine = this.paintEngine;
    if (!engine) {
      return;
    }
    this.paintEngine = null;
    engine.cancel();
    this.renderer.refreshTexture();
    this.publish();
  }

  /**
   * Pick a UV corner in panel-local CSS pixels.
   *
   * A plain click on an already selected corner preserves the rest of a
   * multi-selection so the same pointer-down can begin a drag; a plain click on
   * an unselected corner replaces the set.
   */
  pickUvCorner(
    x: number,
    y: number,
    width: number,
    height: number,
    additive: boolean
  ): boolean {
    const node = this.getActiveNode();
    if (!node) {
      return false;
    }
    const projection = this.uvProjection(node.mesh, width, height);
    let hit: number | null = null;
    if (!additive && this.uvSelection.size > 0) {
      // Coincident UV corners are common across seams. Prefer a corner that is
      // already selected so clicking a multi-corner island starts a drag
      // instead of replacing the set with an arbitrary duplicate.
      let bestDistanceSq = 16 * 16;
      for (const corner of this.uvSelection) {
        if (corner < 0 || corner >= node.mesh.halfEdgeCount) {
          continue;
        }
        const point = uvToCanvas(node.mesh.getCornerUv(corner), projection);
        const distanceSq = (point.x - x) ** 2 + (point.y - y) ** 2;
        if (distanceSq <= bestDistanceSq) {
          bestDistanceSq = distanceSq;
          hit = corner;
        }
      }
    }
    hit ??= pickNearestUvCorner(node.mesh, x, y, projection);
    if (hit === null) {
      if (!additive && this.uvSelection.size > 0) {
        this.uvSelection.clear();
        this.uvRevision += 1;
        this.publish();
      }
      return false;
    }
    if (additive) {
      if (this.uvSelection.has(hit)) {
        this.uvSelection.delete(hit);
      } else {
        this.uvSelection.add(hit);
      }
    } else if (!this.uvSelection.has(hit)) {
      this.uvSelection.clear();
      this.uvSelection.add(hit);
    }
    this.uvRevision += 1;
    this.linkUvSelectionTo3d();
    this.publish();
    return true;
  }

  /** Capture the selected UV corners and drag basis before a drag. */
  beginUvDrag(
    x: number,
    y: number,
    width: number,
    height: number
  ): boolean {
    const node = this.getActiveNode();
    if (!node || this.uvSelection.size === 0) {
      return false;
    }
    const corners = Array.from(this.uvSelection)
      .filter((corner) => corner >= 0 && corner < node.mesh.halfEdgeCount)
      .sort((a, b) => a - b);
    if (corners.length === 0) {
      return false;
    }
    const before = corners.map((corner) => node.mesh.getCornerUv(corner));
    const projection = this.uvProjection(node.mesh, width, height);
    const startUv: Vec2 = [
      (x - projection.offsetX) / projection.scale,
      (height - projection.offsetY - y) / projection.scale
    ];
    const pivot = uvMedian(before);
    const startAngle = Math.atan2(
      startUv[1] - pivot[1],
      startUv[0] - pivot[0]
    );
    const startDistance = Math.max(
      1e-6,
      Math.hypot(startUv[0] - pivot[0], startUv[1] - pivot[1])
    );
    this.uvDragScale = this.uvTransformMode === 'scale' ? 1 : null;
    this.uvDrag = {
      node,
      mode: this.uvTransformMode,
      corners,
      before,
      pivot,
      startUv,
      startAngle,
      startDistance
    };
    return true;
  }

  /** Start a keyboard-driven live UV transform. */
  beginUvKeyboardTransform(
    kind: 'move' | 'rotate' | 'scale',
    width: number,
    height: number,
    anchorX: number,
    anchorY: number
  ): boolean {
    const node = this.getActiveNode();
    if (!node || !this.uvOpen || this.uvSelection.size === 0) {
      return false;
    }
    this.uvTransformMode = kind;
    const projection = this.uvProjection(node.mesh, width, height);
    const corners = [...this.uvSelection];
    const pivot = uvMedian(corners.map((corner) => node.mesh.getCornerUv(corner)));
    const pivotPoint = uvToCanvas(pivot, projection);
    let startX = anchorX;
    let startY = anchorY;
    if (kind !== 'move') {
      const distance = Math.hypot(anchorX - pivotPoint.x, anchorY - pivotPoint.y);
      if (distance < 24) {
        startX = pivotPoint.x + 80;
        startY = pivotPoint.y;
      }
    }
    if (!this.beginUvDrag(startX, startY, width, height)) {
      return false;
    }
    this.publish();
    return true;
  }

  updateUvKeyboardTransform(
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    this.updateUvDrag(x, y, width, height);
  }

  finishUvKeyboardTransform(): void {
    this.finishUvDrag();
  }

  cancelUvKeyboardTransform(): void {
    this.cancelUvDrag();
  }

  /** Apply an absolute UV-space pointer position to the active UV drag. */
  updateUvDrag(
    x: number,
    y: number,
    width: number,
    height: number,
    shiftFine = false
  ): void {
    const drag = this.uvDrag;
    if (!drag) {
      return;
    }
    if (
      this.uvPendingClick &&
      uvClickMoved(
        this.uvPendingClick.startX,
        this.uvPendingClick.startY,
        x,
        y
      )
    ) {
      this.uvPendingClick = null;
    }
    const projection = this.uvProjection(drag.node.mesh, width, height);
    const current: Vec2 = [
      (x - projection.offsetX) / projection.scale,
      (height - projection.offsetY - y) / projection.scale
    ];
    const next: Vec2[] = drag.before.map((uv) => [...uv] as Vec2);
    const precision = this.uvFineMode || shiftFine ? 0.1 : 1;
    const startRadius = drag.startDistance * projection.scale;
    const pivotSensitivity = Math.min(1, Math.max(0.15, startRadius / 40));
    if (drag.mode === 'move') {
      let du = (current[0] - drag.startUv[0]) * precision;
      let dv = (current[1] - drag.startUv[1]) * precision;
      if (this.uvAxisLock === 'u') {
        dv = 0;
      } else if (this.uvAxisLock === 'v') {
        du = 0;
      }
      if (this.snapEnabled) {
        du = snapScalar(du, this.snapStep);
        dv = snapScalar(dv, this.snapStep);
      }
      for (let index = 0; index < next.length; index += 1) {
        next[index][0] += du;
        next[index][1] += dv;
      }
    } else if (drag.mode === 'rotate') {
      const angle = Math.atan2(
        current[1] - drag.pivot[1],
        current[0] - drag.pivot[0]
      );
      let radians = shortestAngleDelta(drag.startAngle, angle);
      radians *= precision * pivotSensitivity;
      if (this.snapEnabled) {
        radians = snapScalar(radians, Math.PI / 12);
      }
      for (let index = 0; index < next.length; index += 1) {
        next[index] = rotateUv(drag.before[index], drag.pivot, radians);
      }
    } else {
      const distance = Math.hypot(
        current[0] - drag.pivot[0],
        current[1] - drag.pivot[1]
      );
      // Scale from pointer displacement, not an unbounded distance ratio.
      // Starting near the pivot therefore cannot cause an explosive factor.
      const radius = distance * projection.scale;
      let factor = uvScaleFactor(startRadius, radius, precision);
      this.uvDragScale = factor;
      if (this.snapEnabled) {
        factor = Math.max(
          1e-3,
          snapScalar(factor, Math.max(this.snapStep, 1e-3))
        );
      }
      for (let index = 0; index < next.length; index += 1) {
        next[index] = scaleUv(
          drag.before[index],
          drag.pivot,
          factor,
          this.uvAxisLock
        );
      }
    }
    if (this.uvClampMode && next.length > 0) {
      let minU = Infinity;
      let maxU = -Infinity;
      let minV = Infinity;
      let maxV = -Infinity;
      for (const [u, v] of next) {
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
      }
      if (maxU - minU <= 1.000001) {
        const shiftU = minU < 0 ? -minU : maxU > 1 ? 1 - maxU : 0;
        if (shiftU !== 0) {
          for (const uv of next) uv[0] += shiftU;
        }
      }
      if (maxV - minV <= 1.000001) {
        const shiftV = minV < 0 ? -minV : maxV > 1 ? 1 - maxV : 0;
        if (shiftV !== 0) {
          for (const uv of next) uv[1] += shiftV;
        }
      }
    }
    for (let index = 0; index < drag.corners.length; index += 1) {
      drag.node.mesh.setCornerUv(drag.corners[index], next[index]);
    }
    this.uvRevision += 1;
    this.renderer.refreshNode(drag.node.id);
    this.publish();
  }

  /** Resolve a no-move UV click that preserved a larger selection. */
  finishUvClick(): void {
    const pending = this.uvPendingClick;
    this.uvPendingClick = null;
    if (!pending) {
      return;
    }
    this.uvSelection.clear();
    for (const corner of pending.corners) {
      this.uvSelection.add(corner);
    }
    this.uvActiveChart = pending.chart;
    this.uvRevision += 1;
    this.linkUvSelectionTo3d();
    this.publish();
    this.recordSelection(pending.before, 'Select UV element');
  }

  /** Commit the current UV drag as one localized command. */
  finishUvDrag(): void {
    this.uvPendingClick = null;
    const drag = this.uvDrag;
    if (!drag) {
      return;
    }
    this.uvDrag = null;
    this.uvDragScale = null;
    const after = drag.corners.map((corner) => drag.node.mesh.getCornerUv(corner));
    const changed = after.some((uv, index) =>
      uv.some(
        (value, component) =>
          Math.abs(value - drag.before[index][component]) > 1e-7
      )
    );
    if (!changed) {
      this.publish();
      return;
    }
    const verb =
      drag.mode === 'rotate'
        ? 'Rotate'
        : drag.mode === 'scale'
          ? 'Scale'
          : 'Move';
    this.history.execute(
      new MoveUvCornersCommand(
        drag.node.mesh,
        drag.node.id,
        drag.corners,
        drag.before,
        after,
        `${verb} ${drag.corners.length} UV corner${drag.corners.length === 1 ? '' : 's'}`
      )
    );
  }

  /** Apply an exact UV-space move to the selected corners. */
  applyUvMove(du: number, dv: number): void {
    if (!Number.isFinite(du) || !Number.isFinite(dv)) {
      return;
    }
    this.commitExactUvTransform(
      (uv) => [uv[0] + du, uv[1] + dv],
      'Move'
    );
  }

  /** Apply an exact rotation in degrees around the UV median. */
  applyUvRotate(degrees: number): void {
    if (!Number.isFinite(degrees)) {
      return;
    }
    const pivot = this.selectedUvPivot();
    if (!pivot) {
      return;
    }
    const radians = (degrees * Math.PI) / 180;
    this.commitExactUvTransform(
      (uv) => rotateUv(uv, pivot, radians),
      'Rotate'
    );
  }

  /** Apply an exact scale factor around the UV median. */
  applyUvScale(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) {
      return;
    }
    const pivot = this.selectedUvPivot();
    if (!pivot) {
      return;
    }
    this.commitExactUvTransform(
      (uv) => scaleUv(uv, pivot, factor, this.uvAxisLock),
      'Scale'
    );
  }

  private selectedUvPivot(): Vec2 | null {
    const node = this.getActiveNode();
    if (!node || this.uvSelection.size === 0) {
      return null;
    }
    const values = Array.from(this.uvSelection)
      .filter((corner) => corner >= 0 && corner < node.mesh.halfEdgeCount)
      .map((corner) => node.mesh.getCornerUv(corner));
    return values.length > 0 ? uvMedian(values) : null;
  }

  private commitExactUvTransform(
    transform: (uv: Vec2) => Vec2,
    verb: string
  ): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const corners = Array.from(this.uvSelection)
      .filter((corner) => corner >= 0 && corner < node.mesh.halfEdgeCount)
      .sort((a, b) => a - b);
    if (corners.length === 0) {
      return;
    }
    const before = corners.map((corner) => node.mesh.getCornerUv(corner));
    const after = before.map((uv) => transform(uv));
    if (
      after.every((uv, index) =>
        uv.every(
          (value, component) =>
            Math.abs(value - before[index][component]) <= 1e-9
        )
      )
    ) {
      return;
    }
    this.history.execute(
      new MoveUvCornersCommand(
        node.mesh,
        node.id,
        corners,
        before,
        after,
        `${verb} ${corners.length} UV corner${corners.length === 1 ? '' : 's'}`
      )
    );
  }

  /** Restore the UVs captured at drag start. */
  cancelUvDrag(): void {
    this.uvPendingClick = null;
    this.uvDragScale = null;
    const drag = this.uvDrag;
    if (!drag) {
      return;
    }
    this.uvDrag = null;
    for (let index = 0; index < drag.corners.length; index += 1) {
      drag.node.mesh.setCornerUv(drag.corners[index], drag.before[index]);
    }
    this.uvRevision += 1;
    this.renderer.refreshNode(drag.node.id);
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
    if (mode !== 'edge') {
      this.loopSelect = false;
    }
    if (mode !== 'vertex') {
      this.axisLock = null;
    }
    this.syncScene();
    this.publish();
  }

  /** Set the sticky selection combination used by clicks and lasso. */
  setSelectionCombineMode(mode: SelectionCombineMode): void {
    if (this.selectionCombineMode === mode) {
      return;
    }
    this.selectionCombineMode = mode;
    this.publish();
  }

  /** Toggle edge-loop expansion for the next edge pick. */
  setLoopSelect(enabled: boolean): void {
    if (this.loopSelect === enabled) {
      return;
    }
    this.loopSelect = enabled && this.selection.mode === 'edge';
    this.publish();
  }

  /** Mark the pane that owns contextual selection and tool commands. */
  setActiveEditor(editor: EditorPane): void {
    if (editor === '3d' && this.workspace === 'paint') {
      return;
    }
    if (editor === 'uv' && (!this.uvOpen || this.uvPaintMode)) {
      return;
    }
    if (editor === 'paint' && (!this.uvOpen || !this.uvPaintMode)) {
      return;
    }
    if (this.activeEditor === editor) {
      return;
    }
    this.activeEditor = editor;
    this.publish();
  }

  /** Select all elements in the current mode in the active editor. */
  selectAllActive(): void {
    if (this.activeEditor === 'paint') {
      return;
    }
    if (this.activeEditor === 'uv' && this.uvOpen) {
      this.selectAllUv();
    } else {
      this.selectAll3d();
    }
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
  setActiveTransform(
    transform: NodeTransform,
    orientation: TransformOrientation = 'local'
  ): void {
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
    const parentTransform =
      this.document.getGroup(node.parentId)?.transform ?? null;
    const next: NodeTransform =
      orientation === 'global'
        ? {
            position: localPositionFromWorld(
              transform.position,
              parentTransform
            ),
            rotation: localRotationFromWorld(
              transform.rotation,
              parentTransform
            ),
            scale: [
              Math.max(0.001, transform.scale[0]),
              Math.max(0.001, transform.scale[1]),
              Math.max(0.001, transform.scale[2])
            ]
          }
        : {
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

  /** Toggle one mesh node's visibility through undoable document state. */
  setNodeVisibility(nodeId: string, visible: boolean): void {
    const node = this.document.getNode(nodeId);
    if (!node || node.visible === visible) {
      return;
    }
    this.history.execute(new SetNodeVisibilityCommand(node, visible));
  }

  /** Toggle a group's visibility through undoable document state. */
  setGroupVisibility(groupId: string, visible: boolean): void {
    const group = this.document.getGroup(groupId);
    if (!group || group.visible === visible) {
      return;
    }
    this.history.execute(new SetGroupVisibilityCommand(group, visible));
  }

  /** Move a node before/after another node in the same scene parent. */
  reorderNode(nodeId: string, targetId: string, placeAfter: boolean): void {
    if (nodeId === targetId) {
      return;
    }
    const source = this.document.getNode(nodeId);
    const target = this.document.getNode(targetId);
    if (!source || !target || source.parentId !== target.parentId) {
      return;
    }
    const from = this.document.nodes.indexOf(source);
    const targetIndex = this.document.nodes.indexOf(target);
    let to = targetIndex + (placeAfter ? 1 : 0);
    if (from < to) {
      to -= 1;
    }
    to = Math.max(0, Math.min(to, this.document.nodes.length - 1));
    if (to === from) {
      return;
    }
    this.history.execute(
      new ReorderNodeCommand(this.document, source, from, to)
    );
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

    if (this.activeNodeId !== nodeId) {
      this.uvPins.clear();
    }
    this.selection.setContext(this.activeNodeId, this.selection.mode);
    this.syncScene();
    this.publish();
  }

  /** Create a new primitive, place it beside the scene, and select it. */
  createPrimitive(kind: PrimitiveKind): void {
    const node = this.document.createNode(kind, this.textureLibrary.activeAssetId);
    // New primitives always begin at the world origin; overlapping an existing
    // object is expected and leaves placement entirely under user control.
    node.setPosition([0, 0, 0]);
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

  /** Rename the active object or group. */
  renameActiveObject(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 64) {
      return;
    }
    const group = this.getActiveGroup();
    if (group) {
      if (group.name === trimmed) {
        return;
      }
      this.history.execute(new RenameGroupCommand(group, group.name, trimmed));
      this.publish();
      return;
    }
    const node = this.getActiveNode();
    if (!node || node.name === trimmed) {
      return;
    }
    this.history.execute(new RenameNodeCommand(node, node.name, trimmed));
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

  /** Toggle UV seam flags on the selected edges as one undoable command. */
  toggleSelectedSeams(): void {
    if (!workspaceCan(this.workspace, 'seamAuthoring')) {
      return;
    }
    const node = this.getActiveNode();
    if (
      !node ||
      this.selection.mode !== 'edge' ||
      this.selection.count === 0
    ) {
      return;
    }
    const edges = this.selection.values();
    const mark = edges.some((edge) => !node.mesh.isEdgeSeam(edge));
    const command = new SetEdgeSeamsCommand(node.mesh, node.id, edges, mark);
    if (!command.noop) {
      this.history.execute(command);
    }
  }

  /** Clear every UV seam on the active mesh as one undoable command. */
  clearAllSeams(): void {
    if (!workspaceCan(this.workspace, 'seamAuthoring')) {
      return;
    }
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const seams: number[] = [];
    for (let edge = 0; edge < node.mesh.edgeCount; edge += 1) {
      if (node.mesh.isEdgeSeam(edge)) {
        seams.push(edge);
      }
    }
    if (seams.length === 0) {
      return;
    }
    const command = new SetEdgeSeamsCommand(node.mesh, node.id, seams, false);
    if (!command.noop) {
      this.history.execute(command);
    }
  }

  /** Cut one quad edge loop through the single selected edge. */
  loopCut(): void {
    const node = this.getActiveNode();
    if (
      !node ||
      this.selection.mode !== 'edge' ||
      this.selection.count !== 1
    ) {
      return;
    }
    const [edge] = this.selection.values();
    const before = node.mesh;
    try {
      const after = loopCutFromEdge(before, edge);
      const previous = this.loopContext();
      const command = new ReplaceMeshCommand(
        node,
        before,
        after,
        'Loop cut',
        {
          before: previous,
          after: {
            nodeId: node.id,
            edge,
            baseMesh: before,
            t: 0.5
          }
        }
      );
      this.selection.clear();
      this.history.execute(command);
    } catch (error) {
      this.projectError = this.errorMessage(error);
      this.publish();
    }
  }

  /** Arm a one-shot ActionDock operation; the next viewport drag applies it. */
  armAction(kind: MeshActionKind): void {
    if (this.uvOpen) {
      return;
    }
    if (this.actionDrag || this.modalTransform) {
      return;
    }
    if (this.armedAction === kind) {
      this.armedAction = null;
      this.publish();
      return;
    }
    const node = this.getActiveNode();
    if (!node || !this.actionAvailable(kind, node)) {
      return;
    }
    this.projectError = null;
    this.armedAction = kind;
    this.publish();
  }

  private actionAvailable(kind: MeshActionKind, node: MeshNode): boolean {
    if (this.getActiveGroup() !== null) {
      return false;
    }
    if (kind === 'loop-slide') {
      return this.lastLoopCut !== null && this.lastLoopCut.node === node;
    }
    if (this.selection.mode === 'face') {
      if (kind === 'extrude') {
        return this.selection.count > 0;
      }
      if (kind === 'inset') {
        return this.selection.count === 1;
      }
      return false;
    }
    if (this.selection.mode === 'edge' && kind === 'loop-cut') {
      return this.selection.count === 1;
    }
    return false;
  }

  private defaultActionValue(kind: MeshActionKind): number {
    if (kind === 'extrude') {
      return 0.25;
    }
    if (kind === 'inset') {
      return 0.2;
    }
    if (kind === 'loop-slide') {
      return this.lastLoopCut?.t ?? 0.5;
    }
    return 0.5;
  }

  private actionSnapshot(): MeshActionSnapshot | null {
    if (this.actionDrag) {
      return {
        kind: this.actionDrag.kind,
        phase:
          this.actionDrag.pointerId === null ? 'adjusting' : 'dragging',
        value: this.actionDrag.value
      };
    }
    if (this.armedAction) {
      return {
        kind: this.armedAction,
        phase: 'armed',
        value: this.defaultActionValue(this.armedAction)
      };
    }
    return null;
  }

  private beginActionGesture(
    sample: PointerSample,
    node: MeshNode,
    pointerId: number | null = sample.pointerId
  ): boolean {
    const kind = this.armedAction;
    if (!kind) {
      return false;
    }
    let faceIndex: number | null = null;
    let edgeIndex: number | null = null;
    let loopBase: HalfEdgeMesh | null = null;
    let selection: readonly number[] = [];
    let value = this.defaultActionValue(kind);

    if (kind === 'extrude') {
      if (this.selection.mode !== 'face' || this.selection.count === 0) {
        this.armedAction = null;
        this.publish();
        return false;
      }
      selection = this.selection.values();
    } else if (kind === 'inset') {
      if (this.selection.mode !== 'face' || this.selection.count !== 1) {
        this.armedAction = null;
        this.publish();
        return false;
      }
      selection = this.selection.values();
      faceIndex = selection[0];
    } else if (kind === 'loop-cut') {
      if (this.selection.mode !== 'edge' || this.selection.count !== 1) {
        this.armedAction = null;
        this.publish();
        return false;
      }
      selection = this.selection.values();
      edgeIndex = selection[0];
    } else {
      if (
        this.lastLoopCut === null ||
        this.lastLoopCut.node !== node
      ) {
        this.armedAction = null;
        this.publish();
        return false;
      }
      loopBase = this.lastLoopCut.baseMesh;
      edgeIndex = this.lastLoopCut.edge;
    }

    const drag: ActionDrag = {
      kind,
      node,
      pointerId,
      before: node.mesh,
      selection,
      selectionMode: this.selection.mode,
      startX: sample.clientX,
      startY: sample.clientY,
      startValue: value,
      faceIndex,
      edgeIndex,
      loopBase,
      numeric: '',
      value
    };
    try {
      const preview = this.buildActionMesh(drag, value);
      this.armedAction = null;
      this.actionDrag = drag;
      node.setMesh(preview);
      this.updateActionPreviewLine(drag, preview);
      this.selection.clear();
      this.projectError = null;
      this.syncScene();
      this.publish();
      return true;
    } catch (error) {
      this.armedAction = null;
      this.projectError = this.errorMessage(error);
      this.publish();
      return false;
    }
  }

  private buildActionMesh(
    drag: ActionDrag,
    value: number
  ): HalfEdgeMesh {
    if (drag.kind === 'extrude') {
      return extrudeSelectedFaces(drag.before, drag.selection, value);
    }
    if (drag.kind === 'inset') {
      if (drag.faceIndex === null) {
        throw new Error('Inset requires one face.');
      }
      return insetSelectedFace(drag.before, drag.faceIndex, value);
    }
    if (drag.edgeIndex === null) {
      throw new Error('Loop action requires one edge.');
    }
    if (drag.kind === 'loop-cut') {
      return loopCutFromEdge(drag.before, drag.edgeIndex, value);
    }
    if (!drag.loopBase) {
      throw new Error('Loop slide has no source loop.');
    }
    return loopCutFromEdge(drag.loopBase, drag.edgeIndex, value);
  }

  private updateActionPointer(sample: PointerSample): void {
    const drag = this.actionDrag;
    if (!drag || drag.pointerId !== sample.pointerId) {
      return;
    }
    const travel =
      drag.startY -
      sample.clientY +
      (sample.clientX - drag.startX) * 0.5;
    let value: number;
    if (drag.kind === 'extrude') {
      value = Math.min(8, Math.max(0.001, drag.startValue + travel * 0.005));
    } else if (drag.kind === 'inset') {
      value = Math.min(0.9, Math.max(0.01, drag.startValue + travel * 0.002));
    } else {
      value = Math.min(0.95, Math.max(0.05, drag.startValue + travel * 0.002));
    }
    if (Math.abs(value - drag.value) < 1e-6) {
      return;
    }
    try {
      const preview = this.buildActionMesh(drag, value);
      drag.value = value;
      drag.node.setMesh(preview);
      this.updateActionPreviewLine(drag, preview);
      this.projectError = null;
      this.syncScene();
      this.publish();
    } catch (error) {
      this.projectError = this.errorMessage(error);
      this.publish();
    }
  }

  private updateActionPreviewLine(
    drag: ActionDrag,
    preview: HalfEdgeMesh
  ): void {
    if (
      (drag.kind !== 'loop-cut' && drag.kind !== 'loop-slide') ||
      drag.node.getEvaluatedMesh().modifiersActive
    ) {
      this.renderer.setActionPreviewLine(null);
      return;
    }
    const source =
      drag.kind === 'loop-cut' ? drag.before : drag.loopBase;
    if (!source) {
      this.renderer.setActionPreviewLine(null);
      return;
    }
    const positions = this.loopCutPreviewLine(source, preview);
    this.renderer.setActionPreviewLine(
      positions.length > 0 ? positions : null
    );
  }

  private loopCutPreviewLine(
    source: HalfEdgeMesh,
    after: HalfEdgeMesh
  ): Float32Array {
    const key = (mesh: HalfEdgeMesh, vertex: number): string => {
      const offset = vertex * 3;
      return `${Math.fround(mesh.positions[offset])}|${Math.fround(
        mesh.positions[offset + 1]
      )}|${Math.fround(mesh.positions[offset + 2])}`;
    };
    const sourcePositions = new Set<string>();
    for (let vertex = 0; vertex < source.vertexCount; vertex += 1) {
      sourcePositions.add(key(source, vertex));
    }
    const newVertices = new Set<number>();
    for (let vertex = 0; vertex < after.vertexCount; vertex += 1) {
      if (!sourcePositions.has(key(after, vertex))) {
        newVertices.add(vertex);
      }
    }
    const positions: number[] = [];
    for (let edge = 0; edge < after.edgeCount; edge += 1) {
      const halfEdge = after.edgeHalfEdge[edge];
      const from = after.heOrigin[halfEdge];
      const to = after.heOrigin[after.heNext[halfEdge]];
      if (!newVertices.has(from) || !newVertices.has(to)) {
        continue;
      }
      const fromOffset = from * 3;
      const toOffset = to * 3;
      positions.push(
        after.positions[fromOffset],
        after.positions[fromOffset + 1],
        after.positions[fromOffset + 2],
        after.positions[toOffset],
        after.positions[toOffset + 1],
        after.positions[toOffset + 2]
      );
    }
    return new Float32Array(positions);
  }

  private finishActionGesture(): void {
    const drag = this.actionDrag;
    if (!drag) {
      return;
    }
    this.actionDrag = null;
    this.armedAction = null;
    this.renderer.setActionPreviewLine(null);
    const after = drag.node.mesh;
    const label =
      drag.kind === 'extrude'
        ? `Extrude ${drag.selection.length} face${drag.selection.length === 1 ? '' : 's'}`
        : drag.kind === 'inset'
          ? 'Inset face'
          : drag.kind === 'loop-cut'
            ? 'Loop cut'
            : 'Loop slide';
    this.selection.clear();
    const loopTransition: ReplaceMeshLoopTransition | null =
      (drag.kind === 'loop-cut' || drag.kind === 'loop-slide') &&
      drag.edgeIndex !== null
        ? {
            before: this.loopContext(),
            after: {
              nodeId: drag.node.id,
              edge: drag.edgeIndex,
              baseMesh:
                drag.kind === 'loop-cut'
                  ? drag.before
                  : (drag.loopBase ?? drag.before),
              t: drag.value
            }
          }
        : null;
    this.history.execute(
      new ReplaceMeshCommand(
        drag.node,
        drag.before,
        after,
        label,
        loopTransition
      )
    );
  }

  private cancelActionGesture(): void {
    const drag = this.actionDrag;
    if (!drag) {
      return;
    }
    this.actionDrag = null;
    this.armedAction = null;
    this.renderer.setActionPreviewLine(null);
    drag.node.setMesh(drag.before);
    this.selection.setValues(drag.selection);
    this.syncScene();
    this.publish();
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

  resetView(): void {
    this.renderer.resetOrientation();
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
      await this.applyProjectTextures(decoded);
      this.recovered = true;
      this.recoveryAvailable = false;
      this.recoveryUpdatedAt = null;
      this.pendingRecovery = null;
      const checkpoint = await this.makeCheckpoint();
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
      const checkpoint = await this.makeCheckpoint();
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
      const checkpoint = await this.makeCheckpoint();
      const saved = await saveProjectFile(
        checkpoint.bytes,
        `${this.projectName}.lpoly`
      );
      if (saved) {
        this.recovered = false;
        this.projectName = this.projectName || 'Untitled';
        await this.autosave.clear();
        const checkpoint = await this.makeCheckpoint();
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
      await this.applyProjectTextures(decoded);
      this.recovered = false;
      this.recoveryAvailable = false;
      this.recoveryUpdatedAt = null;
      this.pendingRecovery = null;
      await this.autosave.clear();
      const checkpoint = await this.makeCheckpoint();
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
    this.textureLibrary.dispose();
  }

  private getActiveNode(): MeshNode | null {
    return this.document.getNode(this.activeNodeId) ?? null;
  }

  private getActiveGroup(): SceneGroup | null {
    return this.document.getGroup(this.activeGroupId) ?? null;
  }

  private tapSelect(
    clientX: number,
    clientY: number,
    additive = false
  ): void {
    const before = this.captureSelection();
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    this.selectEvaluatedElementAt(
      clientX,
      clientY,
      additive ? 'add' : this.selectionCombineMode,
      node
    );
    this.recordSelection(before, 'Select element');
  }

  /** Resolve a mouse/release gesture that fell back to orbit/pan. */
  finishOrbitClick(moved: boolean, additive: boolean): void {
    if (moved || additive || this.pointerSelectionHit) {
      return;
    }
    if (this.selectionCombineMode !== 'replace' || this.selection.count === 0) {
      return;
    }
    const before = this.captureSelection();
    this.selection.clear();
    this.syncScene();
    this.publish();
    this.recordSelection(before, 'Clear selection');
  }

  private selectEvaluatedElementAt(
    clientX: number,
    clientY: number,
    combine: SelectionCombineMode,
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
      if (combine === 'replace') {
        this.selection.clear();
      }
    } else if (baseIndex >= 0) {
      this.pointerSelectionHit = true;
      if (this.selection.mode === 'edge' && this.loopSelect) {
        const loop = collectEdgeLoop(evaluated.mesh, evaluatedIndex);
        const provenance = evaluated.provenance;
        const edges = [
          ...new Set(
            loop.edges.map((edge) => provenance?.edgeBase[edge] ?? edge)
          )
        ];
        this.applyEdgeSelection(edges, combine);
      } else if (combine === 'subtract') {
        this.selection.remove(baseIndex);
      } else {
        this.selection.pick(baseIndex, combine === 'add');
      }
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

  /** Apply one or more edge picks under Replace, Add, or Sub. */
  private applyEdgeSelection(
    edges: readonly number[],
    combine: SelectionCombineMode
  ): void {
    if (edges.length === 0) {
      return;
    }
    if (combine === 'subtract') {
      for (const edge of edges) {
        this.selection.remove(edge);
      }
      return;
    }
    if (combine === 'add') {
      const next = new Set(this.selection.values());
      for (const edge of edges) {
        next.add(edge);
      }
      this.selection.setValues([...next]);
      return;
    }
    this.selection.setValues(edges);
  }

  private beginToolPointer(sample: PointerSample): boolean {
    this.pointerSelectionHit = false;
    const before = this.captureSelection();
    const result = this.beginToolPointerInternal(sample);
    this.recordSelection(before, 'Select element');
    return result;
  }

  private beginToolPointerInternal(sample: PointerSample): boolean {
    if (this.drag || this.gizmoDrag) {
      this.cancelToolPointer();
    }

    if (this.workspace === 'paint') {
      return this.beginProjectionPaint(sample);
    }
    if (!workspaceCan(this.workspace, 'select3d')) {
      return false;
    }
    const allowEdit = workspaceCan(this.workspace, 'edit3d');

    if (allowEdit && this.armedAction) {
      const actionNode = this.getActiveNode();
      if (actionNode) {
        return this.beginActionGesture(sample, actionNode);
      }
      this.armedAction = null;
      this.publish();
      return false;
    }

    const node = this.getActiveNode();
    const group = this.getActiveGroup();
    const target = group ?? node;
    if (!target) {
      return false;
    }

    if (allowEdit && this.transformMode !== 'select') {
      const gizmoHit = this.renderer.pickGizmo(
        sample.clientX,
        sample.clientY
      );
      if (gizmoHit) {
        if (
          node &&
          this.selection.count > 0 &&
          this.getActiveGroup() === null &&
          this.beginSelectionGizmoDrag(gizmoHit, sample, node)
        ) {
          return true;
        }
        if (this.beginGizmoDrag(gizmoHit, sample, target)) {
          return true;
        }
      }
    }

    if (!node) {
      return false;
    }

    const modifierAdd =
      sample.shiftKey || sample.metaKey || sample.ctrlKey;
    const combine: SelectionCombineMode = modifierAdd
      ? 'add'
      : this.selectionCombineMode;
    const additive = combine === 'add';
    const subtract = combine === 'subtract';

    if (node.getEvaluatedMesh().modifiersActive) {
      if (this.selection.mode === 'vertex' && combine === 'replace') {
        const evaluatedVertex = this.renderer.pickVertex(
          sample.clientX,
          sample.clientY
        );
        const evaluated = node.getEvaluatedMesh();
        if (
          evaluatedVertex !== null &&
          evaluated.provenance !== null
        ) {
          const baseVertex =
            evaluated.provenance.vertexBase[evaluatedVertex] ?? -1;
          if (baseVertex >= 0) {
            this.pointerSelectionHit = true;
            this.selection.pick(baseVertex, false);
            this.syncScene();
            this.publish();
            if (
              allowEdit &&
              this.beginMappedVertexDrag(
                node,
                baseVertex,
                evaluatedVertex,
                sample
              )
            ) {
              return true;
            }
          }
        }
      }
      this.selectEvaluatedElementAt(
        sample.clientX,
        sample.clientY,
        combine,
        node
      );
      return false;
    }

    if (this.selection.mode === 'edge') {
      const edge = this.renderer.pickEdge(sample.clientX, sample.clientY);
      if (edge === null) {
        return false;
      }
      this.pointerSelectionHit = true;
      const edges = this.loopSelect
        ? collectEdgeLoop(node.mesh, edge).edges
        : [edge];
      this.applyEdgeSelection(edges, combine);
      this.syncScene();
      this.publish();
      return false;
    }

    if (this.selection.mode === 'face') {
      const face = this.renderer.pickFace(sample.clientX, sample.clientY);
      if (face === null) {
        return false;
      }
      this.pointerSelectionHit = true;
      if (subtract) {
        this.selection.remove(face);
      } else {
        this.selection.pick(face, additive);
      }
      this.syncScene();
      this.publish();
      return false;
    }

    const vertex = this.renderer.pickVertex(sample.clientX, sample.clientY);
    if (vertex === null) {
      return false;
    }

    if (combine !== 'replace') {
      this.pointerSelectionHit = true;
      if (subtract) {
        this.selection.remove(vertex);
      } else {
        this.selection.pick(vertex, true);
      }
      this.syncScene();
      this.publish();
      return false;
    }

    this.pointerSelectionHit = true;
    this.selection.pick(vertex, false);
    if (!allowEdit) {
      this.syncScene();
      this.publish();
      return false;
    }
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
      evaluatedVertex: vertex,
      evaluatedOriginal: original,
      inverseLinear: null,
      startClientX: sample.clientX,
      startClientY: sample.clientY,
      plane,
      offset
    };
    this.publish();
    return true;
  }

  private moveToolPointer(sample: PointerSample): void {
    if (this.projectedPaint || this.projectedShape) {
      this.updateProjectionPaint(sample);
      return;
    }
    if (this.actionDrag) {
      this.updateActionPointer(sample);
      return;
    }

    if (
      this.selectionGizmoDrag &&
      this.selectionGizmoDrag.pointerId === sample.pointerId
    ) {
      this.updateSelectionGizmoDrag(sample);
      return;
    }

    if (this.gizmoDrag && this.gizmoDrag.pointerId === sample.pointerId) {
      this.updateGizmoDrag(sample);
      return;
    }

    if (!this.drag || this.drag.pointerId !== sample.pointerId) {
      return;
    }

    if (this.drag.inverseLinear) {
      const hit = this.renderer.intersectPointerPlane(
        sample.clientX,
        sample.clientY,
        this.drag.plane
      );
      if (!hit) {
        return;
      }
      const local = this.renderer.worldToActiveNodeLocal(
        hit.add(this.drag.offset)
      );
      if (!local) {
        return;
      }
      const delta = applyLinearTransform(this.drag.inverseLinear, [
        local.x - this.drag.evaluatedOriginal[0],
        local.y - this.drag.evaluatedOriginal[1],
        local.z - this.drag.evaluatedOriginal[2]
      ]);
      const next: Vec3 = [
        this.drag.original[0] + delta[0],
        this.drag.original[1] + delta[1],
        this.drag.original[2] + delta[2]
      ];
      const current = this.drag.node.mesh.getVertexPosition(this.drag.vertex);
      if (
        Math.abs(next[0] - current[0]) < 1e-7 &&
        Math.abs(next[1] - current[1]) < 1e-7 &&
        Math.abs(next[2] - current[2]) < 1e-7
      ) {
        return;
      }
      this.drag.node.mesh.setVertexPosition(this.drag.vertex, next);
      this.syncScene();
      this.publish();
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
    if (this.projectedPaint || this.projectedShape) {
      this.finishProjectionPaint();
      return;
    }
    if (this.actionDrag) {
      this.finishActionGesture();
      return;
    }

    if (
      this.selectionGizmoDrag &&
      this.selectionGizmoDrag.pointerId === sample.pointerId
    ) {
      this.finishSelectionGizmoDrag();
      return;
    }

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
    if (this.projectedPaint || this.projectedShape) {
      this.cancelProjectionPaint();
      return;
    }
    if (this.modalTransform) {
      this.cancelModalTransform();
      return;
    }

    if (this.actionDrag) {
      this.cancelActionGesture();
      return;
    }

    if (this.armedAction) {
      this.armedAction = null;
      this.publish();
      return;
    }

    if (this.selectionGizmoDrag) {
      this.cancelSelectionGizmoDrag();
      return;
    }

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
    if (drag.inverseLinear) {
      this.syncScene();
    } else {
      this.renderer.refreshNode(drag.node.id);
      this.syncScene();
    }
    this.publish();
  }

  private beginMappedVertexDrag(
    node: MeshNode,
    baseVertex: number,
    evaluatedVertex: number,
    sample: PointerSample
  ): boolean {
    const evaluated = node.getEvaluatedMesh();
    if (!evaluated.provenance) {
      return false;
    }
    const linear = Array.from(
      evaluated.provenance.vertexLinear.subarray(
        evaluatedVertex * 9,
        evaluatedVertex * 9 + 9
      )
    );
    const inverseLinear = invertLinearTransform(linear);
    if (!inverseLinear) {
      return false;
    }
    const evaluatedOriginal =
      evaluated.mesh.getVertexPosition(evaluatedVertex);
    const original = node.mesh.getVertexPosition(baseVertex);
    const world = this.renderer.getVertexWorldPosition(evaluatedVertex);
    const plane = this.renderer.createCameraFacingPlane(world);
    const grabPoint = this.renderer.intersectPointerPlane(
      sample.clientX,
      sample.clientY,
      plane
    );
    const offset = grabPoint ? world.clone().sub(grabPoint) : new Vector3();
    this.drag = {
      pointerId: sample.pointerId,
      node,
      vertex: baseVertex,
      original,
      originalWorld: world.clone(),
      evaluatedVertex,
      evaluatedOriginal,
      inverseLinear,
      startClientX: sample.clientX,
      startClientY: sample.clientY,
      plane,
      offset
    };
    this.publish();
    return true;
  }

  private modalSnapshot(): ModalTransformSnapshot | null {
    const modal = this.modalTransform;
    if (!modal) {
      return null;
    }
    return {
      kind: modal.kind,
      axis: modal.axis,
      orientation: modal.orientation,
      target: modal.targetLabel,
      numeric: modal.numeric,
      value: modal.value
    };
  }

  private modalSelectedVertices(
    node: MeshNode
  ): { vertices: number[]; mode: SelectionMode; count: number } | null {
    if (this.selection.count === 0) {
      return null;
    }
    const selected = new Set<number>();
    const mesh = node.mesh;
    for (const value of this.selection.values()) {
      if (this.selection.mode === 'vertex') {
        if (value >= 0 && value < mesh.vertexCount) {
          selected.add(value);
        }
      } else if (this.selection.mode === 'edge') {
        if (value < 0 || value >= mesh.edgeCount) {
          continue;
        }
        const halfEdge = mesh.edgeHalfEdge[value];
        const next = mesh.heNext[halfEdge];
        selected.add(mesh.heOrigin[halfEdge]);
        selected.add(mesh.heOrigin[next]);
      } else {
        if (value < 0 || value >= mesh.faceCount) {
          continue;
        }
        const start = mesh.faceHalfEdge[value];
        let current = start;
        do {
          selected.add(mesh.heOrigin[current]);
          current = mesh.heNext[current];
        } while (current !== start);
      }
    }
    if (selected.size === 0) {
      return null;
    }
    return {
      vertices: Array.from(selected).sort((a, b) => a - b),
      mode: this.selection.mode,
      count: this.selection.count
    };
  }

  private beginModalTransform(
    kind: ModalTransformKind,
    clientX: number,
    clientY: number
  ): boolean {
    if (this.modalTransform) {
      return true;
    }
    if (this.activeEditor !== '3d' || this.armedAction || this.actionDrag) {
      return false;
    }
    const node = this.getActiveNode();
    const group = this.getActiveGroup();
    const selection = node ? this.modalSelectedVertices(node) : null;
    const useElements = node !== null && selection !== null;
    const target = useElements ? node : (group ?? node);
    if (!target || this.gizmoDrag || this.drag) {
      return false;
    }
    const parent =
      'primitive' in target && target.parentId !== null
        ? this.document.getGroup(target.parentId)
        : null;
    const parentQuaternion = parent
      ? new Quaternion().setFromEuler(
          new Euler(
            parent.transform.rotation[0],
            parent.transform.rotation[1],
            parent.transform.rotation[2],
            'XYZ'
          )
        )
      : new Quaternion();
    const localQuaternion = new Quaternion().setFromEuler(
      new Euler(
        target.transform.rotation[0],
        target.transform.rotation[1],
        target.transform.rotation[2],
        'XYZ'
      )
    );
    const worldQuaternion = parentQuaternion.clone().multiply(localQuaternion);

    let element: ElementTransform | null = null;
    let origin: Vector3;
    let targetLabel: string;
    if (useElements && node && selection) {
      const before = selection.vertices.map((vertex) =>
        node.mesh.getVertexPosition(vertex)
      );
      const pivot: Vec3 = [0, 0, 0];
      for (const position of before) {
        pivot[0] += position[0] / before.length;
        pivot[1] += position[1] / before.length;
        pivot[2] += position[2] / before.length;
      }
      const worldMatrix = parent
        ? transformMatrix(parent.transform).multiply(
            transformMatrix(node.transform)
          )
        : transformMatrix(node.transform);
      const inverseWorld = worldMatrix.clone().invert();
      const inverseWorldLinear = new Matrix3().setFromMatrix4(inverseWorld);
      origin = new Vector3(pivot[0], pivot[1], pivot[2]).applyMatrix4(
        worldMatrix
      );
      element = {
        node,
        vertices: selection.vertices,
        before,
        pivot,
        worldMatrix,
        inverseWorld,
        inverseWorldLinear,
        selectionMode: selection.mode,
        selectionCount: selection.count,
        modifiersActive: node.getEvaluatedMesh().modifiersActive
      };
      const singular =
        selection.mode === 'vertex'
          ? 'vertex'
          : selection.mode === 'edge'
            ? 'edge'
            : 'face';
      targetLabel = `${selection.count} ${singular}${
        selection.count === 1 ? '' : 's'
      }${element.modifiersActive ? ' (base)' : ''}`;
    } else {
      const frame = this.renderer.getGizmoFrame();
      if (!frame) {
        return false;
      }
      origin = frame.origin.clone();
      targetLabel = group ? 'Group' : 'Object';
    }

    const plane = this.renderer.createCameraFacingPlane(origin);
    const startHit =
      this.renderer.intersectPointerPlane(clientX, clientY, plane) ??
      origin.clone();
    this.modalTransform = {
      kind,
      target,
      element,
      targetLabel,
      before: this.cloneTransform(target.transform),
      orientation: this.transformOrientation,
      axis: null,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      origin,
      plane,
      startHit,
      parentQuaternion,
      localQuaternion,
      worldQuaternion,
      viewAxis: plane.normal.clone().normalize(),
      numeric: '',
      value: 0
    };
    this.projectError = null;
    this.publish();
    return true;
  }

  private moveModalTransform(sample: PointerSample): void {
    const modal = this.modalTransform;
    if (!modal) {
      return;
    }
    modal.lastX = sample.clientX;
    modal.lastY = sample.clientY;
    this.updateModalTransform();
  }

  private handleModalTransformKey(key: string): void {
    const modal = this.modalTransform;
    if (!modal) {
      return;
    }
    const lower = key.toLowerCase();
    if (lower === 'escape') {
      this.cancelModalTransform();
      return;
    }
    if (lower === 'enter') {
      this.commitModalTransform();
      return;
    }
    if (lower === 'x' || lower === 'y' || lower === 'z') {
      modal.axis = modal.axis === lower ? null : lower;
      this.updateModalTransform();
      return;
    }
    if (key === 'Backspace') {
      modal.numeric = modal.numeric.slice(0, -1);
      this.updateModalTransform();
      return;
    }
    if (key.length === 1) {
      if (key === '-' && modal.numeric.length === 0) {
        modal.numeric = '-';
      } else if (key === '.' && !modal.numeric.includes('.')) {
        modal.numeric += '.';
      } else if (/^[0-9]$/.test(key)) {
        modal.numeric += key;
      }
      this.updateModalTransform();
    }
  }

  /** True while the ActionDock is armed or an action preview exists. */
  private hasActiveAction(): boolean {
    return this.armedAction !== null || this.actionDrag !== null;
  }

  /**
   * Route keyboard input to a one-shot action.
   *
   * Armed actions accept digits (starting a numeric preview), Enter, and
   * Escape. Numeric previews consume every key so modal transform shortcuts
   * cannot start underneath them.
   */
  private handleActionKey(key: string): boolean {
    const lower = key.toLowerCase();
    if (this.armedAction) {
      if (lower === 'escape') {
        this.armedAction = null;
        this.publish();
        return true;
      }
      if (key.length === 1 && (/^[0-9]$/.test(key) || key === '.' || key === '-')) {
        if (!this.beginNumericAction()) {
          return true;
        }
        this.appendActionNumeric(key);
        return true;
      }
      if (lower === 'enter') {
        return true;
      }
      return false;
    }

    const drag = this.actionDrag;
    if (!drag) {
      return false;
    }
    if (lower === 'escape') {
      this.cancelActionGesture();
      return true;
    }
    if (lower === 'enter') {
      this.finishActionGesture();
      return true;
    }
    if (drag.pointerId !== null) {
      return false;
    }
    if (key === 'Backspace') {
      drag.numeric = drag.numeric.slice(0, -1);
      this.applyActionNumeric();
      return true;
    }
    if (key.length === 1 && (/^[0-9]$/.test(key) || key === '.' || key === '-')) {
      this.appendActionNumeric(key);
      return true;
    }
    return true;
  }

  private beginNumericAction(): boolean {
    const kind = this.armedAction;
    const node = this.getActiveNode();
    if (!kind || !node) {
      return false;
    }
    const sample: PointerSample = {
      pointerId: -1,
      pointerType: 'mouse',
      clientX: 0,
      clientY: 0,
      pressure: 0,
      tiltX: 0,
      tiltY: 0,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      ctrlKey: false
    };
    return this.beginActionGesture(sample, node, null);
  }

  private appendActionNumeric(key: string): void {
    const drag = this.actionDrag;
    if (!drag) {
      return;
    }
    if (key === '-' && drag.numeric.length === 0) {
      drag.numeric = '-';
    } else if (key === '.' && !drag.numeric.includes('.')) {
      drag.numeric += '.';
    } else if (/^[0-9]$/.test(key)) {
      drag.numeric += key;
    }
    this.applyActionNumeric();
  }

  private applyActionNumeric(): void {
    const drag = this.actionDrag;
    if (!drag) {
      return;
    }
    const parsed = Number(drag.numeric);
    let value = drag.startValue;
    if (drag.numeric.length > 0 && Number.isFinite(parsed)) {
      if (drag.kind === 'extrude') {
        value = Math.min(8, Math.max(0.001, parsed));
      } else {
        value = Math.min(0.95, Math.max(0.01, parsed / 100));
        if (drag.kind === 'inset') {
          value = Math.min(0.9, value);
        }
      }
    }
    try {
      const preview = this.buildActionMesh(drag, value);
      drag.value = value;
      drag.node.setMesh(preview);
      this.updateActionPreviewLine(drag, preview);
      this.projectError = null;
      this.syncScene();
      this.publish();
    } catch (error) {
      this.projectError = this.errorMessage(error);
      this.publish();
    }
  }

  private updateModalTransform(): void {
    const modal = this.modalTransform;
    if (!modal) {
      return;
    }
    const next = this.cloneTransform(modal.before);
    const numeric =
      modal.numeric.length > 0 && Number.isFinite(Number(modal.numeric))
        ? Number(modal.numeric)
        : null;
    const parentInverse = modal.parentQuaternion.clone().invert();
    const axisVector = modal.axis ? GIZMO_AXIS_VECTORS[modal.axis] : null;
    const axisWorld = axisVector
      ? modal.orientation === 'local'
        ? axisVector.clone().applyQuaternion(modal.worldQuaternion).normalize()
        : axisVector.clone()
      : null;
    let value = 0;

    if (modal.element) {
      modal.value = this.updateElementModal(
        modal,
        modal.element,
        numeric,
        axisVector,
        axisWorld
      );
      if (modal.element.modifiersActive) {
        this.syncScene();
      } else {
        this.renderer.refreshNode(modal.element.node.id);
      }
      this.publish();
      return;
    }

    if (modal.kind === 'translate') {
      const hit =
        this.renderer.intersectPointerPlane(
          modal.lastX,
          modal.lastY,
          modal.plane
        ) ?? modal.startHit;
      const worldDelta = hit.clone().sub(modal.startHit);
      if (axisWorld && axisVector) {
        let amount =
          numeric !== null
            ? numeric
            : worldDelta.dot(axisWorld);
        if (numeric === null && this.snapEnabled) {
          amount = snapScalar(amount, this.snapStep);
        }
        const localDirection = axisWorld
          .clone()
          .applyQuaternion(parentInverse)
          .normalize();
        next.position = [
          modal.before.position[0] + localDirection.x * amount,
          modal.before.position[1] + localDirection.y * amount,
          modal.before.position[2] + localDirection.z * amount
        ];
        value = amount;
      } else {
        const localDelta = worldDelta.clone().applyQuaternion(parentInverse);
        next.position = [
          modal.before.position[0] + localDelta.x,
          modal.before.position[1] + localDelta.y,
          modal.before.position[2] + localDelta.z
        ];
        if (this.snapEnabled) {
          next.position = next.position.map((component) =>
            snapScalar(component, this.snapStep)
          ) as [number, number, number];
        }
        value = localDelta.length();
      }
    } else if (modal.kind === 'rotate') {
      const angleDegrees =
        numeric !== null
          ? numeric
          : (modal.lastX - modal.startX - (modal.lastY - modal.startY)) * 0.5;
      const radians = (angleDegrees * Math.PI) / 180;
      const rotationAxis = axisWorld ?? modal.viewAxis;
      let rotated: Quaternion;
      if (axisVector && modal.orientation === 'local') {
        rotated = modal.localQuaternion
          .clone()
          .multiply(
            new Quaternion().setFromAxisAngle(axisVector, radians)
          );
      } else {
        const delta = new Quaternion().setFromAxisAngle(
          rotationAxis,
          radians
        );
        const world = delta.multiply(modal.worldQuaternion);
        rotated = parentInverse.clone().multiply(world);
      }
      const euler = new Euler().setFromQuaternion(rotated, 'XYZ');
      next.rotation = [euler.x, euler.y, euler.z];
      value = angleDegrees;
    } else {
      const factor =
        numeric !== null
          ? Math.max(0.001, numeric)
          : Math.max(
              0.001,
              1 +
                (modal.lastX -
                  modal.startX -
                  (modal.lastY - modal.startY)) /
                  200
            );
      next.scale = [...modal.before.scale];
      if (modal.axis) {
        const index =
          modal.axis === 'x' ? 0 : modal.axis === 'y' ? 1 : 2;
        next.scale[index] = Math.max(
          0.001,
          modal.before.scale[index] * factor
        );
      } else {
        next.scale = next.scale.map((component) =>
          Math.max(0.001, component * factor)
        ) as [number, number, number];
      }
      value = factor;
    }

    modal.value = value;
    modal.target.setTransform(next);
    this.syncScene();
    this.publish();
  }

  private updateElementModal(
    modal: ModalTransform,
    element: ElementTransform,
    numeric: number | null,
    axisVector: Vector3 | null,
    axisWorld: Vector3 | null
  ): number {
    const positions: Vec3[] = element.before.map(
      (position) => [...position] as Vec3
    );
    let value = 0;

    if (modal.kind === 'translate') {
      const hit =
        this.renderer.intersectPointerPlane(
          modal.lastX,
          modal.lastY,
          modal.plane
        ) ?? modal.startHit;
      const worldDelta = hit.clone().sub(modal.startHit);
      if (axisVector && axisWorld) {
        let amount =
          numeric !== null ? numeric : worldDelta.dot(axisWorld);
        if (numeric === null && this.snapEnabled) {
          amount = snapScalar(amount, this.snapStep);
        }
        const localDirection =
          modal.orientation === 'local'
            ? axisVector.clone()
            : axisWorld.clone().applyMatrix3(element.inverseWorldLinear);
        for (let index = 0; index < positions.length; index += 1) {
          positions[index] = [
            element.before[index][0] + localDirection.x * amount,
            element.before[index][1] + localDirection.y * amount,
            element.before[index][2] + localDirection.z * amount
          ];
        }
        value = amount;
      } else {
        const localDelta = worldDelta
          .clone()
          .applyMatrix3(element.inverseWorldLinear);
        if (this.snapEnabled) {
          localDelta.set(
            snapScalar(localDelta.x, this.snapStep),
            snapScalar(localDelta.y, this.snapStep),
            snapScalar(localDelta.z, this.snapStep)
          );
        }
        for (let index = 0; index < positions.length; index += 1) {
          positions[index] = [
            element.before[index][0] + localDelta.x,
            element.before[index][1] + localDelta.y,
            element.before[index][2] + localDelta.z
          ];
        }
        value = localDelta.length();
      }
    } else if (modal.kind === 'rotate') {
      const angleDegrees =
        numeric !== null
          ? numeric
          : (modal.lastX - modal.startX - (modal.lastY - modal.startY)) * 0.5;
      const radians = (angleDegrees * Math.PI) / 180;
      if (axisVector && modal.orientation === 'local') {
        const rotation = new Quaternion().setFromAxisAngle(axisVector, radians);
        for (let index = 0; index < positions.length; index += 1) {
          const offset = new Vector3(
            element.before[index][0] - element.pivot[0],
            element.before[index][1] - element.pivot[1],
            element.before[index][2] - element.pivot[2]
          ).applyQuaternion(rotation);
          positions[index] = [
            element.pivot[0] + offset.x,
            element.pivot[1] + offset.y,
            element.pivot[2] + offset.z
          ];
        }
      } else {
        const rotation = new Quaternion().setFromAxisAngle(
          axisWorld ?? modal.viewAxis,
          radians
        );
        const pivotWorld = new Vector3(
          element.pivot[0],
          element.pivot[1],
          element.pivot[2]
        ).applyMatrix4(element.worldMatrix);
        for (let index = 0; index < positions.length; index += 1) {
          const world = new Vector3(
            element.before[index][0],
            element.before[index][1],
            element.before[index][2]
          ).applyMatrix4(element.worldMatrix);
          const offset = world.sub(pivotWorld).applyQuaternion(rotation);
          const result = pivotWorld.clone().add(offset).applyMatrix4(
            element.inverseWorld
          );
          positions[index] = [result.x, result.y, result.z];
        }
      }
      value = angleDegrees;
    } else {
      const factor =
        numeric !== null
          ? Math.max(0.001, numeric)
          : Math.max(
              0.001,
              1 +
                (modal.lastX -
                  modal.startX -
                  (modal.lastY - modal.startY)) /
                  200
            );
      const axisIndex = modal.axis
        ? modal.axis === 'x'
          ? 0
          : modal.axis === 'y'
            ? 1
            : 2
        : null;
      if (modal.orientation === 'local') {
        for (let index = 0; index < positions.length; index += 1) {
          const offset = [
            element.before[index][0] - element.pivot[0],
            element.before[index][1] - element.pivot[1],
            element.before[index][2] - element.pivot[2]
          ];
          for (let component = 0; component < 3; component += 1) {
            if (axisIndex === null || axisIndex === component) {
              offset[component] *= factor;
            }
          }
          positions[index] = [
            element.pivot[0] + offset[0],
            element.pivot[1] + offset[1],
            element.pivot[2] + offset[2]
          ];
        }
      } else {
        const pivotWorld = new Vector3(
          element.pivot[0],
          element.pivot[1],
          element.pivot[2]
        ).applyMatrix4(element.worldMatrix);
        for (let index = 0; index < positions.length; index += 1) {
          const world = new Vector3(
            element.before[index][0],
            element.before[index][1],
            element.before[index][2]
          ).applyMatrix4(element.worldMatrix);
          const offset = world.sub(pivotWorld);
          if (axisIndex === null) {
            offset.multiplyScalar(factor);
          } else {
            offset.setComponent(
              axisIndex,
              offset.getComponent(axisIndex) * factor
            );
          }
          const result = pivotWorld
            .clone()
            .add(offset)
            .applyMatrix4(element.inverseWorld);
          positions[index] = [result.x, result.y, result.z];
        }
      }
      value = factor;
    }

    for (let index = 0; index < element.vertices.length; index += 1) {
      element.node.mesh.setVertexPosition(
        element.vertices[index],
        positions[index]
      );
    }
    return value;
  }

  private commitModalTransform(): void {
    const modal = this.modalTransform;
    if (!modal) {
      return;
    }
    this.modalTransform = null;
    if (modal.element) {
      const element = modal.element;
      const after = element.vertices.map((vertex) =>
        element.node.mesh.getVertexPosition(vertex)
      );
      const changed = after.some((position, index) =>
        position.some(
          (value, component) =>
            Math.abs(value - element.before[index][component]) > 1e-7
        )
      );
      if (changed) {
        const operation =
          modal.kind === 'translate'
            ? 'Move'
            : modal.kind === 'rotate'
              ? 'Rotate'
              : 'Scale';
        this.history.execute(
          new TransformVerticesCommand(
            element.node.mesh,
            element.vertices,
            element.before,
            after,
            element.node.id,
            `${operation} ${modal.targetLabel}`
          )
        );
      } else {
        this.publish();
      }
      return;
    }
    const after = this.cloneTransform(modal.target.transform);
    const changed =
      after.position.some(
        (value, index) =>
          Math.abs(value - modal.before.position[index]) > 1e-7
      ) ||
      after.rotation.some(
        (value, index) =>
          Math.abs(value - modal.before.rotation[index]) > 1e-7
      ) ||
      after.scale.some(
        (value, index) => Math.abs(value - modal.before.scale[index]) > 1e-7
      );
    if (changed) {
      this.history.execute(
        'primitive' in modal.target
          ? new TransformNodeCommand(modal.target, modal.before, after)
          : new TransformGroupCommand(modal.target, modal.before, after)
      );
    } else {
      this.publish();
    }
  }

  private cancelModalTransform(): void {
    const modal = this.modalTransform;
    if (!modal) {
      return;
    }
    this.modalTransform = null;
    if (modal.element) {
      for (let index = 0; index < modal.element.vertices.length; index += 1) {
        modal.element.node.mesh.setVertexPosition(
          modal.element.vertices[index],
          modal.element.before[index]
        );
      }
      if (modal.element.modifiersActive) {
        this.syncScene();
      } else {
        this.renderer.refreshNode(modal.element.node.id);
      }
      this.publish();
      return;
    }
    modal.target.setTransform(modal.before);
    this.syncScene();
    this.publish();
  }

  private selectionGizmoLabel(
    mode: GizmoMode,
    count: number,
    selectionMode: SelectionMode
  ): string {
    const singular =
      selectionMode === 'vertex'
        ? 'vertex'
        : selectionMode === 'edge'
          ? 'edge'
          : 'face';
    const verb =
      mode === 'translate' ? 'Move' : mode === 'rotate' ? 'Rotate' : 'Scale';
    return `${verb} ${count} ${singular}${count === 1 ? '' : 's'}`;
  }

  private beginSelectionGizmoDrag(
    hit: GizmoHit,
    sample: PointerSample,
    node: MeshNode
  ): boolean {
    const selected = this.modalSelectedVertices(node);
    const frame = this.renderer.getGizmoFrame();
    const ray = this.renderer.getPointerRay(sample.clientX, sample.clientY);
    if (!selected || !frame || !ray) {
      return false;
    }
    const parent =
      node.parentId !== null
        ? this.document.getGroup(node.parentId)
        : null;
    const worldMatrix = parent
      ? transformMatrix(parent.transform).multiply(
          transformMatrix(node.transform)
        )
      : transformMatrix(node.transform);
    const inverseWorld = worldMatrix.clone().invert();
    const inverseWorldLinear = new Matrix3().setFromMatrix4(inverseWorld);
    const before = selected.vertices.map((vertex) =>
      node.mesh.getVertexPosition(vertex)
    );
    const pivot: Vec3 = [0, 0, 0];
    for (const position of before) {
      pivot[0] += position[0] / before.length;
      pivot[1] += position[1] / before.length;
      pivot[2] += position[2] / before.length;
    }
    if (hit.axis === 'view' && hit.mode === 'rotate') {
      return false;
    }
    const axisWorld =
      hit.axis === 'view'
        ? null
        : worldAxis(hit.axis, frame.quaternion).normalize();
    let startParameter = 0;
    let plane: Plane | null = null;
    let basis: { u: Vector3; v: Vector3 } | null = null;
    let startAngle = 0;
    let startHit: Vector3 | null = null;
    if (hit.mode === 'rotate' && axisWorld) {
      plane = new Plane().setFromNormalAndCoplanarPoint(
        axisWorld,
        frame.origin
      );
      const point = ray.intersectPlane(plane, new Vector3());
      if (!point) {
        return false;
      }
      basis = planeBasis(axisWorld);
      startAngle = angleAroundAxis(point, frame.origin, basis);
    } else if (hit.axis === 'view' && hit.mode === 'translate') {
      plane = this.renderer.createCameraFacingPlane(frame.origin);
      startHit = ray.intersectPlane(plane, new Vector3());
      if (!startHit) {
        return false;
      }
    } else if (!axisWorld && hit.mode !== 'scale') {
      return false;
    } else if (axisWorld) {
      const parameter = closestAxisParameter(
        ray,
        frame.origin,
        axisWorld
      );
      if (parameter === null) {
        return false;
      }
      startParameter = parameter;
    }
    this.selectionGizmoDrag = {
      pointerId: sample.pointerId,
      mode: hit.mode,
      axis: hit.axis,
      orientation: this.transformOrientation,
      node,
      vertices: selected.vertices,
      before,
      pivot,
      worldMatrix,
      inverseWorld,
      inverseWorldLinear,
      selectionMode: selected.mode,
      selectionCount: selected.count,
      origin: frame.origin.clone(),
      axisWorld,
      size: frame.size,
      startParameter,
      startX: sample.clientX,
      startY: sample.clientY,
      startHit,
      plane,
      basis,
      startAngle
    };
    this.publish();
    return true;
  }

  private updateSelectionGizmoDrag(sample: PointerSample): void {
    const drag = this.selectionGizmoDrag;
    if (!drag) {
      return;
    }
    const ray = this.renderer.getPointerRay(sample.clientX, sample.clientY);
    if (!ray) {
      return;
    }
    const positions: Vec3[] = drag.before.map(
      (position) => [...position] as Vec3
    );
    if (drag.mode === 'translate') {
      if (drag.axis === 'view') {
        if (!drag.plane || !drag.startHit) {
          return;
        }
        const point = ray.intersectPlane(drag.plane, new Vector3());
        if (!point) {
          return;
        }
        const localDelta = point
          .sub(drag.startHit)
          .applyMatrix3(drag.inverseWorldLinear);
        if (this.snapEnabled) {
          localDelta.set(
            snapScalar(localDelta.x, this.snapStep),
            snapScalar(localDelta.y, this.snapStep),
            snapScalar(localDelta.z, this.snapStep)
          );
        }
        for (let index = 0; index < positions.length; index += 1) {
          positions[index] = [
            drag.before[index][0] + localDelta.x,
            drag.before[index][1] + localDelta.y,
            drag.before[index][2] + localDelta.z
          ];
        }
      } else {
        if (!drag.axisWorld) {
          return;
        }
        const parameter = closestAxisParameter(
          ray,
          drag.origin,
          drag.axisWorld
        );
        if (parameter === null) {
          return;
        }
        let delta = parameter - drag.startParameter;
        if (this.snapEnabled) {
          delta = snapScalar(delta, this.snapStep);
        }
        const localDelta = drag.axisWorld
          .clone()
          .multiplyScalar(delta)
          .applyMatrix3(drag.inverseWorldLinear);
        for (let index = 0; index < positions.length; index += 1) {
          positions[index] = [
            drag.before[index][0] + localDelta.x,
            drag.before[index][1] + localDelta.y,
            drag.before[index][2] + localDelta.z
          ];
        }
      }
    } else if (drag.mode === 'scale') {
      const uniform = drag.axis === 'view';
      let factor = 1;
      let axisIndex = 0;
      if (uniform) {
        factor = Math.max(
          0.001,
          1 +
            ((sample.clientX - drag.startX) -
              (sample.clientY - drag.startY)) /
              200
        );
      } else {
        if (!drag.axisWorld) {
          return;
        }
        const parameter = closestAxisParameter(
          ray,
          drag.origin,
          drag.axisWorld
        );
        if (parameter === null) {
          return;
        }
        factor = Math.max(
          0.001,
          1 + (parameter - drag.startParameter) / (drag.size * 0.9)
        );
        axisIndex = drag.axis === 'x' ? 0 : drag.axis === 'y' ? 1 : 2;
      }
      if (uniform || drag.orientation === 'local') {
        for (let index = 0; index < positions.length; index += 1) {
          const offset = [
            drag.before[index][0] - drag.pivot[0],
            drag.before[index][1] - drag.pivot[1],
            drag.before[index][2] - drag.pivot[2]
          ];
          if (uniform) {
            offset[0] *= factor;
            offset[1] *= factor;
            offset[2] *= factor;
          } else {
            offset[axisIndex] *= factor;
          }
          positions[index] = [
            drag.pivot[0] + offset[0],
            drag.pivot[1] + offset[1],
            drag.pivot[2] + offset[2]
          ];
        }
      } else {
        const pivotWorld = new Vector3(
          drag.pivot[0],
          drag.pivot[1],
          drag.pivot[2]
        ).applyMatrix4(drag.worldMatrix);
        for (let index = 0; index < positions.length; index += 1) {
          const world = new Vector3(
            drag.before[index][0],
            drag.before[index][1],
            drag.before[index][2]
          ).applyMatrix4(drag.worldMatrix);
          const offset = world.sub(pivotWorld);
          offset.setComponent(
            axisIndex,
            offset.getComponent(axisIndex) * factor
          );
          const result = pivotWorld
            .clone()
            .add(offset)
            .applyMatrix4(drag.inverseWorld);
          positions[index] = [result.x, result.y, result.z];
        }
      }
    } else {
      if (drag.axis === 'view' || !drag.plane || !drag.basis) {
        return;
      }
      const point = ray.intersectPlane(drag.plane, new Vector3());
      if (!point) {
        return;
      }
      const angle = angleAroundAxis(point, drag.origin, drag.basis);
      const radians = shortestAngleDelta(drag.startAngle, angle);
      const axisVector = GIZMO_AXIS_VECTORS[drag.axis];
      if (drag.orientation === 'local') {
        const rotation = new Quaternion().setFromAxisAngle(
          axisVector,
          radians
        );
        for (let index = 0; index < positions.length; index += 1) {
          const offset = new Vector3(
            drag.before[index][0] - drag.pivot[0],
            drag.before[index][1] - drag.pivot[1],
            drag.before[index][2] - drag.pivot[2]
          ).applyQuaternion(rotation);
          positions[index] = [
            drag.pivot[0] + offset.x,
            drag.pivot[1] + offset.y,
            drag.pivot[2] + offset.z
          ];
        }
      } else {
        if (!drag.axisWorld) {
          return;
        }
        const rotation = new Quaternion().setFromAxisAngle(
          drag.axisWorld,
          radians
        );
        const pivotWorld = new Vector3(
          drag.pivot[0],
          drag.pivot[1],
          drag.pivot[2]
        ).applyMatrix4(drag.worldMatrix);
        for (let index = 0; index < positions.length; index += 1) {
          const world = new Vector3(
            drag.before[index][0],
            drag.before[index][1],
            drag.before[index][2]
          ).applyMatrix4(drag.worldMatrix);
          const offset = world.sub(pivotWorld).applyQuaternion(rotation);
          const result = pivotWorld
            .clone()
            .add(offset)
            .applyMatrix4(drag.inverseWorld);
          positions[index] = [result.x, result.y, result.z];
        }
      }
    }
    for (let index = 0; index < drag.vertices.length; index += 1) {
      drag.node.mesh.setVertexPosition(drag.vertices[index], positions[index]);
    }
    this.updateSelectionGizmoFrame();
    if (drag.node.getEvaluatedMesh().modifiersActive) {
      this.syncScene();
    } else {
      this.renderer.refreshNode(drag.node.id);
    }
    this.publish();
  }

  private finishSelectionGizmoDrag(): void {
    const drag = this.selectionGizmoDrag;
    if (!drag) {
      return;
    }
    this.selectionGizmoDrag = null;
    const after = drag.vertices.map((vertex) =>
      drag.node.mesh.getVertexPosition(vertex)
    );
    const changed = after.some((position, index) =>
      position.some(
        (value, component) =>
          Math.abs(value - drag.before[index][component]) > 1e-7
      )
    );
    if (changed) {
      this.history.execute(
        new TransformVerticesCommand(
          drag.node.mesh,
          drag.vertices,
          drag.before,
          after,
          drag.node.id,
          this.selectionGizmoLabel(
            drag.mode,
            drag.selectionCount,
            drag.selectionMode
          )
        )
      );
    } else {
      this.publish();
    }
  }

  private cancelSelectionGizmoDrag(): void {
    const drag = this.selectionGizmoDrag;
    if (!drag) {
      return;
    }
    this.selectionGizmoDrag = null;
    for (let index = 0; index < drag.vertices.length; index += 1) {
      drag.node.mesh.setVertexPosition(drag.vertices[index], drag.before[index]);
    }
    this.updateSelectionGizmoFrame();
    if (drag.node.getEvaluatedMesh().modifiersActive) {
      this.syncScene();
    } else {
      this.renderer.refreshNode(drag.node.id);
    }
    this.publish();
  }

  private beginGizmoDrag(
    hit: GizmoHit,
    sample: PointerSample,
    target: MeshNode | SceneGroup
  ): boolean {
    const frame = this.renderer.getGizmoFrame();
    const ray = this.renderer.getPointerRay(sample.clientX, sample.clientY);
    if (!frame || !ray || hit.axis === 'view') {
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
      orientation: this.transformOrientation,
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
          worldDelta.applyMatrix3(
            new Matrix3().setFromMatrix4(
              transformMatrix(parent.transform).invert()
            )
          );
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
      let rotated: Quaternion;
      if (drag.orientation === 'global') {
        let parent = new Quaternion();
        if ('primitive' in drag.target && drag.target.parentId !== null) {
          const group = this.document.getGroup(drag.target.parentId);
          if (group) {
            parent = new Quaternion().setFromEuler(
              new Euler(
                group.transform.rotation[0],
                group.transform.rotation[1],
                group.transform.rotation[2],
                'XYZ'
              )
            );
          }
        }
        const startWorld = parent.clone().multiply(start);
        const worldAxis = GIZMO_AXIS_VECTORS[drag.axis];
        const deltaWorld = new Quaternion().setFromAxisAngle(
          worldAxis,
          delta
        );
        const newWorld = deltaWorld.multiply(startWorld);
        rotated = parent.invert().multiply(newWorld);
      } else {
        const local = GIZMO_AXIS_VECTORS[drag.axis];
        const deltaQuaternion = new Quaternion().setFromAxisAngle(
          local,
          delta
        );
        rotated = start.multiply(deltaQuaternion);
      }
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

  private loopContext(): ReplaceMeshLoopTransition['before'] {
    if (!this.lastLoopCut) {
      return null;
    }
    return {
      nodeId: this.lastLoopCut.node.id,
      edge: this.lastLoopCut.edge,
      baseMesh: this.lastLoopCut.baseMesh,
      t: this.lastLoopCut.t
    };
  }

  private afterDocumentChanged(event: HistoryEvent): void {
    this.pruneUvSelection();
    this.renderer.refreshTexture();
    if (
      event.command instanceof TextureAssetCommand ||
      event.command instanceof PaintTextureCommand ||
      event.command instanceof CreateTextureAssetCommand ||
      event.command instanceof DeleteTextureAssetCommand ||
      event.command instanceof SetTextureFilterCommand ||
      event.command instanceof SetTextureAlphaModeCommand ||
      event.command instanceof RenameTextureAssetCommand
    ) {
      this.autosave.markTextureDirty();
    }
    if (event.command instanceof SetTextureAlphaModeCommand) {
      this.renderer.clearAllTextureMaterials();
    }
    this.uvRevision += 1;
    const loopContext =
      event.command instanceof ReplaceMeshCommand
        ? event.action === 'undo'
          ? event.command.loopContextBefore
          : event.command.loopContextAfter
        : null;
    const loopNode = loopContext
      ? this.document.getNode(loopContext.nodeId)
      : null;
    this.lastLoopCut =
      loopContext && loopNode
        ? {
            node: loopNode,
            edge: loopContext.edge,
            baseMesh: loopContext.baseMesh,
            t: loopContext.t
          }
        : null;
    this.armedAction = null;
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

  private updateSelectionGizmoFrame(): void {
    const node = this.getActiveNode();
    const selected =
      node && this.getActiveGroup() === null
        ? this.modalSelectedVertices(node)
        : null;
    if (!node || !selected || selected.vertices.length === 0) {
      this.renderer.setSelectionGizmoFrame(null, null);
      return;
    }
    const pivot: Vec3 = [0, 0, 0];
    for (const vertex of selected.vertices) {
      const position = node.mesh.getVertexPosition(vertex);
      pivot[0] += position[0] / selected.vertices.length;
      pivot[1] += position[1] / selected.vertices.length;
      pivot[2] += position[2] / selected.vertices.length;
    }
    const parent =
      node.parentId !== null
        ? this.document.getGroup(node.parentId)
        : null;
    const parentQuaternion = parent
      ? new Quaternion().setFromEuler(
          new Euler(
            parent.transform.rotation[0],
            parent.transform.rotation[1],
            parent.transform.rotation[2],
            'XYZ'
          )
        )
      : new Quaternion();
    const localQuaternion = new Quaternion().setFromEuler(
      new Euler(
        node.transform.rotation[0],
        node.transform.rotation[1],
        node.transform.rotation[2],
        'XYZ'
      )
    );
    const worldQuaternion = parentQuaternion.multiply(localQuaternion);
    const worldMatrix = parent
      ? transformMatrix(parent.transform).multiply(
          transformMatrix(node.transform)
        )
      : transformMatrix(node.transform);
    const origin = new Vector3(
      pivot[0],
      pivot[1],
      pivot[2]
    ).applyMatrix4(worldMatrix);
    this.renderer.setSelectionGizmoFrame(
      origin,
      this.transformOrientation === 'global'
        ? new Quaternion()
        : worldQuaternion
    );
  }

  private syncScene(): void {
    this.updateSelectionGizmoFrame();
    this.renderer.syncScene(
      this.document.nodes,
      this.document.groups,
      this.activeNodeId,
      this.activeGroupId,
      this.selection.mode,
      workspaceCan(this.workspace, 'select3d')
        ? this.evaluatedSelectionValues()
        : [],
      workspaceCan(this.workspace, 'edit3d') ? this.transformMode : 'select',
      this.transformOrientation,
      workspaceCan(this.workspace, 'select3d')
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

  private async makeCheckpoint(): Promise<{
    bytes: Uint8Array;
    settings: ProjectSettings;
  }> {
    const settings = this.getSettings();
    const textures = await this.textureLibrary.exportRecords();
    return {
      bytes: encodeLpoly(this.document, settings, textures),
      settings
    };
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
    const checkpoint = await this.makeCheckpoint();
    await this.autosave.start(checkpoint.bytes, checkpoint.settings);
    this.publish();
  }

  private receiveAutosaveState(state: AutosaveState): void {
    this.autosaveStatus = state.status;
    this.lastAutosavedAt = state.lastSavedAt;
    this.autosaveError = state.error;
    this.publish();
  }

  private async applyProjectTextures(decoded: DecodedProject): Promise<void> {
    if (decoded.textures) {
      this.renderer.clearAllTextureMaterials();
      await this.textureLibrary.importRecords(decoded.textures);
    }
    const active = this.getActiveNode();
    if (active?.textureId && this.textureLibrary.get(active.textureId)) {
      this.textureLibrary.setActive(active.textureId);
    }
    this.syncScene();
    this.renderer.refreshTexture();
    this.publish();
  }

  private applyLoadedDocument(decoded: DecodedProject, name: string): void {
    this.renderer.clearAllTextureMaterials();
    this.textureLibrary.reset(512);
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
      this.syncUvSelectionIfChanged();
      this.onSnapshot(this.getSnapshot());
    }
  }

  /**
   * Link the UV corner selection to the current 3D element selection.
   *
   * The signature check keeps a UV-only selection edit from being overwritten:
   * only a change in active node, element mode, or selected 3D elements rebuilds
   * the UV set.
   */
  private uvSourceSignature(): string {
    return `${this.getActiveNode()?.id ?? ''}|${this.selection.mode}|${this.selection.values().join(',')}`;
  }

  private syncUvSelectionIfChanged(): void {
    if (!this.uvOpen) {
      return;
    }
    const signature = this.uvSourceSignature();
    if (signature === this.lastUvSourceSignature) {
      return;
    }
    this.lastUvSourceSignature = signature;
    this.rebuildUvSelection();
  }

  /**
   * Highlight the 3D faces owning the selected UV corners.
   *
   * The UV set is intentionally not rebuilt from those faces: a UV pick on one
   * corner should not silently expand to every corner of the linked face. The
   * source signature is advanced before the publish so the normal 3D-to-UV sync
   * does not overwrite the precise UV selection.
   */
  private linkUvSelectionTo3d(): void {
    const node = this.getActiveNode();
    if (!node || this.uvSelection.size === 0) {
      return;
    }
    const faces = new Set<number>();
    for (const corner of this.uvSelection) {
      if (corner < 0 || corner >= node.mesh.halfEdgeCount) {
        continue;
      }
      const face = node.mesh.heFace[corner];
      if (face >= 0) {
        faces.add(face);
      }
    }
    if (faces.size === 0) {
      return;
    }
    if (this.selection.mode !== 'face') {
      this.selection.setMode('face');
      if (this.axisLock !== null) {
        this.axisLock = null;
      }
    }
    this.selection.setValues(Array.from(faces).sort((a, b) => a - b));
    this.lastUvSourceSignature = this.uvSourceSignature();
    this.syncScene();
  }

  private rebuildUvSelection(): void {
    this.uvSelection.clear();
    const node = this.getActiveNode();
    if (!node || this.selection.count === 0) {
      this.uvRevision += 1;
      return;
    }
    const mesh = node.mesh;
    const selected = new Set(this.selection.values());
    if (this.selection.mode === 'face') {
      for (const face of selected) {
        if (face < 0 || face >= mesh.faceCount) {
          continue;
        }
        const start = mesh.faceHalfEdge[face];
        let halfEdge = start;
        do {
          this.uvSelection.add(halfEdge);
          halfEdge = mesh.heNext[halfEdge];
        } while (halfEdge !== start);
      }
    } else if (this.selection.mode === 'vertex') {
      for (let halfEdge = 0; halfEdge < mesh.halfEdgeCount; halfEdge += 1) {
        if (selected.has(mesh.heOrigin[halfEdge])) {
          this.uvSelection.add(halfEdge);
        }
      }
    } else {
      for (const edge of selected) {
        if (edge < 0 || edge >= mesh.edgeCount) {
          continue;
        }
        const halfEdge = mesh.edgeHalfEdge[edge];
        for (const side of [halfEdge, mesh.heTwin[halfEdge]]) {
          if (side < 0) {
            continue;
          }
          this.uvSelection.add(side);
          this.uvSelection.add(mesh.heNext[side]);
        }
      }
    }
    this.uvRevision += 1;
  }

  private pruneUvSelection(): void {
    const node = this.getActiveNode();
    const limit = node?.mesh.halfEdgeCount ?? 0;
    for (const corner of this.uvSelection) {
      if (corner < 0 || corner >= limit) {
        this.uvSelection.delete(corner);
      }
    }
    for (const corner of this.uvPins) {
      if (corner < 0 || corner >= limit) {
        this.uvPins.delete(corner);
      }
    }
  }
}
