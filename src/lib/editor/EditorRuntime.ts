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
import { MeshNode } from '../scene/MeshNode';
import type { NodeTransform, SelectionMode, ShapeKey } from '../scene/MeshNode';
import type { SceneGroup } from '../scene/SceneGroup';
import { SceneDocument } from '../scene/SceneDocument';
import { workspaceCan } from './workspaces';
import { screenRotationDegrees } from './modalRotation';
import { screenScaleFactor } from './modalScale';
import {
  applyUvView,
  fitUvProjection,
  pickUvCorner as pickNearestUvCorner,
  uvToCanvas,
  uvClickMoved,
  type UvProjection,
  type UvProjectionBase
} from '../uv/uvView';
import { drawUvCanvas, drawUvWireframe } from '../uv/uvCanvas';
import { extractUvCharts } from '../geometry/uvCharts';
import { buildBakeAtlasPlan } from '../uv/bakeAtlas';
import { bakeAtlasTargetSize } from '../texture/size';
import { resampleTextureDataForBakeAtlas } from '../texture/bakeAtlasTexture';
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
import {
  exportObj,
  importObjNodes,
  type ObjExportScope,
  type ObjTextureFile
} from '../io/obj';
import { exportGlb, importGlb } from '../io/gltf';
import { SetAnimationCommand } from './commands/AnimationCommands';
import {
  animationExportFrames,
  MAX_OBJ_FRAME_EXPORT
} from './animationFrameExport';
import {
  animationPasteBase,
  animationPasteEndFrame,
  buildAnimationKeyClipboard,
  type AnimationKeyClipboardEntry
} from './animationClipboard';
import { SetShapeKeysCommand } from './commands/ShapeKeyCommands';
import { CaptureShapeKeyCommand } from './commands/CaptureShapeKeyCommand';
import {
  CreateCameraCommand,
  DeleteCameraCommand,
  UpdateCameraCommand
} from './commands/CameraCommands';
import { DeleteMeshNodeCommand } from './commands/DeleteMeshNodeCommand';
import {
  ReorderNodeCommand,
  SetGroupVisibilityCommand,
  SetNodeVisibilityCommand
} from './commands/SceneOrderCommands';
import { SetEdgeSeamsCommand } from './commands/SetEdgeSeamsCommand';
import { AssignTextureCommand } from './commands/AssignTextureCommand';
import { BakeLightingCommand } from './commands/BakeLightingCommand';
import { CompositeCommand } from './commands/CompositeCommand';
import { WithShadingCommand } from './commands/WithShadingCommand';
import { bakeLighting, hasUvOverlap, uvCoverage } from '../lighting/bake';
import type {
  TextureEffect,
  TextureEffectType
} from '../texture/effects';
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
  CreateLightCommand,
  DeleteLightCommand,
  SetAmbientLightCommand,
  UpdateLightCommand,
  type AmbientLightSnapshot
} from './commands/LightCommands';
import type { LightKind, LightSnapshot } from '../scene/SceneLight';
import type { CameraSnapshot, SceneCamera } from '../scene/SceneCamera';
import type {
  AnimationInterpolation,
  AnimationSnapshot,
  AnimationTargetKind,
  AnimationTrack,
  CameraPose,
  LightPose
} from '../scene/SceneAnimation';
import { fitRect, upscaleRenderImage, canvasToPng } from '../render/renderImage';
import {
  videoExtension,
  videoLabel,
  videoMimeFor
} from '../render/videoExport';
import type { RenderShading, RenderUpscale } from '../render/renderSettings';
import type { SceneLight } from '../scene/SceneLight';
import {
  decodeLpoly,
  encodeLpoly,
  type DecodedProject,
  type ProjectSettings
} from '../project/lpoly';
import {
  openModelFile,
  openProjectFile,
  PROJECT_EXTENSION,
  saveBinaryFile,
  saveFrameSequence,
  saveProjectFile
} from '../platform/projectFiles';
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
  type ModifierPatch,
  type ToastKind,
  type ToastMessage,
  type AnimationKeyReference,
  type ObjFrameExportOptions
} from './types';

/** Transactional animation pose edit on a temporary mesh. */
interface MeshPoseEditSession {
  readonly node: MeshNode;
  readonly baseMesh: HalfEdgeMesh;
  readonly frame: number;
  readonly beforeAnimation: AnimationSnapshot;
}

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

/** Active drag of a camera body in the Render workspace. */
interface CameraDrag {
  readonly pointerId: number;
  readonly camera: SceneCamera;
  readonly before: import('../scene/SceneCamera').CameraSnapshot;
  readonly baseBefore: import('../scene/SceneCamera').CameraSnapshot;
  readonly plane: import('three').Plane;
  readonly offset: Vector3;
}

/** Active drag of a camera target/arrow handle. */
interface CameraTargetDrag {
  readonly pointerId: number;
  readonly camera: SceneCamera;
  readonly before: import('../scene/SceneCamera').CameraSnapshot;
  readonly baseBefore: import('../scene/SceneCamera').CameraSnapshot;
  readonly plane: import('three').Plane;
}

/** Transactional direct editing of one shape key's target. */
interface ShapeKeyEditSession {
  readonly node: MeshNode;
  readonly keyId: string;
  readonly baseMesh: MeshNode['mesh'];
  readonly beforeKeys: readonly ShapeKey[];
}

/** Active drag of a light marker in the Light workspace. */
interface LightDrag {
  readonly pointerId: number;
  readonly light: SceneLight;
  readonly before: LightSnapshot;
  readonly baseBefore: LightSnapshot;
  readonly plane: import('three').Plane;
  readonly offset: Vector3;
}

/** Active drag of a directional light arrow tip. */
interface LightDirectionDrag {
  readonly pointerId: number;
  readonly light: SceneLight;
  readonly before: LightSnapshot;
  readonly baseBefore: LightSnapshot;
  readonly plane: import('three').Plane;
}

/** Active axis-constrained object gizmo drag. */
interface GizmoDrag {
  readonly pointerId: number;
  readonly mode: GizmoMode;
  readonly axis: GizmoAxis;
  readonly orientation: TransformOrientation;
  readonly target: MeshNode | SceneGroup;
  /** Visible pose at drag start; usually equals the rest transform. */
  readonly before: NodeTransform;
  /** Rest transform before an animation-pose edit, restored on cancel. */
  readonly restBefore: NodeTransform;
  readonly animationTargetKind: 'node' | 'group' | null;
  readonly origin: Vector3;
  readonly axisWorld: Vector3;
  readonly size: number;
  readonly startParameter: number;
  readonly plane: Plane | null;
  readonly basis: { u: Vector3; v: Vector3 } | null;
  readonly startAngle: number;
  dragged: boolean;
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
  readonly restBefore: NodeTransform;
  readonly animationTargetKind: 'node' | 'group' | null;
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
  readonly pivotScreen: { x: number; y: number } | null;
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

/** Persisted user preference for background autosave. */
const AUTOSAVE_ENABLED_KEY = 'loupoli-autosave-enabled';

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
  private snapStep = 0.1;
  private uvSnapStep = 0.01;
  private rotationSnapStep = 15;
  private axisLock: AxisLock = null;
  private ps1Snap = DEFAULT_PS1_SNAP;
  private ps1Affine = DEFAULT_PS1_AFFINE;
  private activeNodeId: string | null;
  private activeGroupId: string | null = null;
  private activeLightId: string | null = null;
  private activeCameraId: string | null = null;
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
  private paintUvOverlay = true;
  private uvBrushColor = '#f2ffe0';
  private uvBrushColorAlpha = 1;
  private uvBrushSize = 36;
  private uvBrushOpacity = 0.9;
  private paintTool: PaintTool = 'brush';
  private paintSecondaryColor = '#1a1a1f';
  private paintSecondaryColorAlpha = 1;
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
  private lightDrag: LightDrag | null = null;
  private cameraDrag: CameraDrag | null = null;
  private cameraTargetDrag: CameraTargetDrag | null = null;
  private shapeEdit: ShapeKeyEditSession | null = null;
  private meshPoseEdit: MeshPoseEditSession | null = null;
  private activeShapeKeyId: string | null = null;
  private lightDirectionDrag: LightDirectionDrag | null = null;
  private gizmoDrag: GizmoDrag | null = null;
  private selectionGizmoDrag: SelectionGizmoDrag | null = null;
  private disposed = false;
  private projectName = 'Untitled';
  private autosaveStatus: AutosaveStatus = 'idle';
  private autosaveEnabled = true;
  private lastAutosavedAt: number | null = null;
  private autosaveError: string | null = null;
  private pendingRecovery: RecoveryRecord | null = null;
  private recoveryAvailable = false;
  private recoveryUpdatedAt: number | null = null;
  private recovered = false;
  private fileBusy = false;
  private bakeBusy = false;
  private bakeAtlasPrompt: import('./types').BakeAtlasPrompt | null = null;
  private renderBusy = false;
  private renderCameraView = false;
  private renderKind: 'still' | 'sequence' | 'webm' | 'mp4' = 'still';
  private renderPreviewSplit = 0.38;
  private renderPreviewRevision = 0;
  private renderPreviewSource: HTMLCanvasElement | null = null;
  private renderStartFrame = 0;
  private renderEndFrame = 48;
  private renderVirtualWidth = 320;
  private renderVirtualHeight = 180;
  private renderOutputWidth = 1280;
  private renderOutputHeight = 720;
  private renderUpscale: RenderUpscale = 'nearest';
  private renderShading: RenderShading = 'lit';
  private renderTransparent = false;
  private renderBackground = '#121214';
  private animationFrame = 0;
  private animationPlaying = false;
  private animationLoop = true;
  private animationInterpolation: AnimationInterpolation = 'linear';
  private animationPose = new Map<string, NodeTransform>();
  private animationCameraPose = new Map<string, CameraPose>();
  private animationLightPose = new Map<string, LightPose>();
  private animationKeyClipboard: AnimationKeyClipboardEntry[] = [];
  private animationRaf = 0;
  private animationClockStart = 0;
  private animationClockFrame = 0;
  private projectError: string | null = null;
  private toasts: ToastMessage[] = [];
  private toastSequence = 0;
  private readonly toastTimers = new Map<string, number>();

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
    this.activeCameraId = this.document.cameras[0]?.id ?? null;
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
      orbit: (dx, dy) => {
        this.renderer.orbit(dx, dy);
        this.leaveCameraView();
      },
      pan: (dx, dy) => {
        this.renderer.pan(dx, dy);
        this.leaveCameraView();
      },
      zoom: (factor) => {
        this.renderer.zoom(factor);
        this.leaveCameraView();
      },
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
    try {
      this.autosaveEnabled =
        window.localStorage.getItem(AUTOSAVE_ENABLED_KEY) !== 'false';
    } catch {
      this.autosaveEnabled = true;
    }
    if (!this.autosaveEnabled) {
      this.autosave.setUserEnabled(false);
    }

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
    const targetId = activeGroup?.id ?? active?.id ?? null;
    const pose =
      this.workspace === 'animation' && targetId !== null
        ? this.animationPose.get(targetId)
        : undefined;
    const activeTransformValue = activeGroup
      ? this.cloneTransform(pose ?? activeGroup.transform)
      : active
        ? this.cloneTransform(pose ?? active.transform)
        : null;
    const globalTransform = activeGroup
      ? this.cloneTransform(pose ?? activeGroup.transform)
      : active
        ? worldTransformForNode(pose ?? active.transform, parentTransform)
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
      uvSnapStep: this.uvSnapStep,
      rotationSnapStep: this.rotationSnapStep,
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
      paintUvOverlay: this.paintUvOverlay,
      uvBrushColor: this.uvBrushColor,
      uvBrushColorAlpha: this.uvBrushColorAlpha,
      uvBrushSize: this.uvBrushSize,
      uvBrushOpacity: this.uvBrushOpacity,
      paintTool: this.paintTool,
      paintSecondaryColor: this.paintSecondaryColor,
      paintSecondaryColorAlpha: this.paintSecondaryColorAlpha,
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
      textureHeight: this.textureStack.height,
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
      activeTransform: activeTransformValue,
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
      objectName:
        this.workspace === 'light'
          ? (this.getActiveLight()?.name ?? 'Lighting')
          : this.workspace === 'render'
            ? (this.getActiveCamera()?.name ?? 'Render')
            : (activeGroup?.name ?? active?.name ?? 'Scene'),
      activeNodeId: this.activeNodeId,
      activeGroupId: this.activeGroupId,
      activeLightId: this.activeLightId,
      lights: this.posedLightSummaries(),
      activeCameraId: this.activeCameraId,
      cameras: this.posedCameraSummaries(),
      ambientColor: this.document.ambientColor,
      ambientIntensity: this.document.ambientIntensity,
      groups: this.document.groupSummaries(),
      selectedNodeIds: [...this.selectedNodeIds],
      additiveNodeSelection: this.additiveNodeSelection,
      nodes: this.document.summaries(),
      projectName: this.projectName,
      autosaveStatus: this.autosaveStatus,
      autosaveEnabled: this.autosaveEnabled,
      lastAutosavedAt: this.lastAutosavedAt,
      autosaveError: this.autosaveError,
      recoveryAvailable: this.recoveryAvailable,
      recoveryUpdatedAt: this.recoveryUpdatedAt,
      recovered: this.recovered,
      fileBusy: this.fileBusy,
      bakeBusy: this.bakeBusy,
      bakeAtlasPrompt: this.bakeAtlasPrompt,
      renderBusy: this.renderBusy,
      renderCameraView: this.renderCameraView,
      renderKind: this.renderKind,
      renderStartFrame: this.renderStartFrame,
      renderEndFrame: this.renderEndFrame,
      renderVirtualWidth: this.renderVirtualWidth,
      renderVirtualHeight: this.renderVirtualHeight,
      renderOutputWidth: this.renderOutputWidth,
      renderOutputHeight: this.renderOutputHeight,
      renderUpscale: this.renderUpscale,
      renderShading: this.renderShading,
      renderTransparent: this.renderTransparent,
      renderBackground: this.renderBackground,
      renderPreviewSplit: this.renderPreviewSplit,
      renderPreviewRevision: this.renderPreviewRevision,
      animationFrame: this.animationFrame,
      animationStartFrame: this.document.animation.startFrame,
      animationEndFrame: this.document.animation.endFrame,
      animationFps: this.document.animation.fps,
      animationClipId: this.document.animation.activeClipId,
      animationClips: this.document.animation.clips.map((clip) => ({
        id: clip.id,
        name: clip.name,
        startFrame: clip.startFrame,
        endFrame: clip.endFrame,
        trackCount:
          clip.tracks.length +
          clip.weightTracks.length +
          clip.meshTracks.length +
          clip.cameraTracks.length +
          clip.lightTracks.length
      })),
      animationClipboardCount: this.animationKeyClipboard.length,
      meshPoseEditing: this.meshPoseEdit !== null,
      meshPoseFrame: this.meshPoseEdit?.frame ?? 0,
      animationLoop: this.animationLoop,
      animationPlaying: this.animationPlaying,
      animationTracks: this.animationTrackSummaries(),
      animationInterpolation: this.animationInterpolation,
      shapeEditingId: this.shapeEdit?.keyId ?? null,
      activeShapeKeyId:
        this.getActiveNode()?.shapeKeys.some(
          (key) => key.id === this.activeShapeKeyId
        )
          ? this.activeShapeKeyId
          : (this.getActiveNode()?.shapeKeys[0]?.id ?? null),
      shapeKeys: (this.getActiveNode()?.shapeKeys ?? []).map((key) => ({
        id: key.id,
        name: key.name,
        weight: this.getActiveNode()?.shapeKeyWeight(key) ?? key.weight,
        visible: key.visible
      })),
      projectError: this.projectError,
      toasts: this.toasts,
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

  /** Add a non-destructive post-processing layer at the top. */
  addTextureEffect(type: TextureEffectType): void {
    this.commitTextureMutation('Add texture effect', () => {
      this.textureStack.addEffectLayer(type);
    });
  }

  /** Update one effect layer's bounded parameters. */
  setTextureEffect(id: string, effect: TextureEffect): void {
    this.commitTextureMutation('Change texture effect', () => {
      this.textureStack.setEffect(id, effect);
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
    this.autosave.markTextureDirty();
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

  /** Change normalized UV translation/scale snapping. */
  setUvSnapStep(step: number): void {
    if (!Number.isFinite(step) || step <= 0 || step === this.uvSnapStep) {
      return;
    }
    this.uvSnapStep = step;
    this.publish();
  }

  /** Change the rotation snap angle in degrees. */
  setRotationSnapStep(step: number): void {
    if (!Number.isFinite(step) || step <= 0 || step === this.rotationSnapStep) {
      return;
    }
    this.rotationSnapStep = step;
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
    if (this.shapeEdit) {
      this.cancelShapeEdit();
    }
    if (this.meshPoseEdit) {
      this.cancelMeshPoseEdit();
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
    this.document.replaceLights(fresh.lights);
    this.document.replaceCameras(fresh.cameras);
    this.document.replaceAnimation(fresh.animation);
    this.refreshMotionLocks();
    this.stopAnimationLoop();
    this.animationFrame = 0;
    this.animationPose.clear();
    this.animationLoop = true;
    this.document.ambientColor = fresh.ambientColor;
    this.document.ambientIntensity = fresh.ambientIntensity;
    this.projectName = 'Untitled';
    this.activeGroupId = null;
    this.activeLightId = this.document.lights[0]?.id ?? null;
    this.activeCameraId = this.document.cameras[0]?.id ?? null;
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
    this.shading = 'lit';
    this.renderer.setShadingMode('lit');
    this.renderer.setGridVisible(true);
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
    this.renderer.resetCameraOrientation();
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

  /** Switch Model, Light, UV, and Paint without duplicating open/close logic. */
  setWorkspace(
    workspace: 'model' | 'light' | 'uv' | 'paint' | 'animation' | 'render'
  ): void {
    if (this.shapeEdit) {
      this.cancelShapeEdit();
    }
    if (this.meshPoseEdit) {
      this.cancelMeshPoseEdit();
    }
    if (workspace === 'uv' || workspace === 'paint') {
      this.clearAnimationPose();
    }
    if (workspace !== 'paint') {
      this.cancelProjectionPaint();
      this.surfaceCursor = null;
      this.projectionPreview = null;
    }
    this.renderer.setGridVisible(true);
    this.workspace = workspace;
    if (workspace !== 'animation') {
      this.pauseAnimation();
    }
    if (
      workspace === 'model' ||
      workspace === 'light' ||
      workspace === 'animation' ||
      workspace === 'render'
    ) {
      this.activeEditor = '3d';
      if (this.uvOpen) {
        this.closeUvView();
      } else if (this.uvPaintMode) {
        this.uvPaintMode = false;
        this.renderer.setSeamOverlayVisible(false);
        this.syncScene();
      }
      if (workspace === 'render' || workspace === 'animation') {
        if (this.shading !== 'lit') {
          this.shading = 'lit';
          this.renderer.setShadingMode('lit');
        }
      }
      if (workspace === 'light') {
        if (this.shading !== 'lit') {
          this.shading = 'lit';
          this.renderer.setShadingMode('lit');
        }
        if (this.activeLightId === null) {
          this.activeLightId = this.document.lights[0]?.id ?? null;
        }
      }
      // closeUvView() resets the workspace to Model; restore the requested
      // Light workspace after closing a pane that was open on entry.
      this.workspace = workspace;
      this.syncScene();
      if (workspace === 'light') {
        this.renderer.frameLightWorkspace();
      }
      if (workspace === 'render') {
        this.renderCameraView = false;
        const camera = this.getActiveCamera();
        if (camera) {
          this.renderer.frameCameraView(camera.position, camera.target);
        }
      }
      if (
        workspace === 'animation' ||
        workspace === 'render' ||
        workspace === 'light'
      ) {
        this.applyAnimationPose();
      } else {
        this.clearAnimationPose();
      }
      this.publish();
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
  stackUvIslands(mirror = false): void {
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
      moving,
      mirror ? 'mirror' : 'direct'
    );
    if (!alignment) {
      this.uvError = mirror
        ? 'The selected UV islands could not be matched as mirrored charts.'
        : 'The selected UV islands could not be mapped one-to-one.';
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

  /** Stack two selected islands using a reflected correspondence. */
  mirrorStackUvIslands(): void {
    this.stackUvIslands(true);
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

  /** Show or hide the read-only UV wireframe over the Paint texture. */
  setPaintUvOverlay(enabled: boolean): void {
    if (this.paintUvOverlay === enabled) {
      return;
    }
    this.paintUvOverlay = enabled;
    this.publish();
  }

  /** Set the fraction of the viewport occupied by the render preview pane. */
  setRenderPreviewSplit(fraction: number): void {
    const clamped = Math.min(0.65, Math.max(0.25, fraction));
    if (Math.abs(clamped - this.renderPreviewSplit) < 1e-4) {
      return;
    }
    this.renderPreviewSplit = clamped;
    this.publish();
  }

  setUvBrushColor(color: string): void {
    this.uvBrushColor = color;
    this.publish();
  }

  setUvBrushColorAlpha(alpha: number): void {
    this.uvBrushColorAlpha = Math.min(1, Math.max(0, alpha));
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

  setPaintSecondaryColorAlpha(alpha: number): void {
    this.paintSecondaryColorAlpha = Math.min(1, Math.max(0, alpha));
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
    const texture = this.textureStack;
    const current = paintBounds(
      width,
      height,
      texture.width,
      texture.height,
      24,
      this.paintViewState()
    );
    const u = (anchorX - current.x) / current.width;
    const v = (anchorY - current.y) / current.height;
    this.paintZoom = next;
    const nextBounds = paintBounds(
      width,
      height,
      texture.width,
      texture.height,
      24,
      { zoom: next, panX: 0, panY: 0 }
    );
    this.paintPanX =
      anchorX - u * nextBounds.width - (width - nextBounds.width) / 2;
    this.paintPanY =
      anchorY - v * nextBounds.height - (height - nextBounds.height) / 2;
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
    const bounds = paintBounds(
      width,
      height,
      this.textureStack.width,
      this.textureStack.height,
      24,
      this.paintViewState()
    );
    const textureRect = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
    drawTextureChecker(context, textureRect);
    drawTextureSurface(context, this.textureStack, textureRect);
    const node = this.getActiveNode();
    if (this.paintUvOverlay && node) {
      context.save();
      context.beginPath();
      context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      context.clip();
      const rootStyle = getComputedStyle(document.documentElement);
      const wire =
        rootStyle.getPropertyValue('--text-primary').trim() || '#f2efe6';
      const seam =
        rootStyle.getPropertyValue('--accent-warning').trim() || '#ffb45e';
      context.shadowColor = 'rgba(0, 0, 0, 0.8)';
      context.shadowBlur = 2;
      drawUvWireframe(
        context,
        node.mesh,
        (u, v) => [
          bounds.x + u * bounds.width,
          bounds.y + (1 - v) * bounds.height
        ],
        {
          color: wire,
          seamColor: seam,
          lineWidth: 1,
          seamWidth: 1.5,
          alpha: 0.75,
          seamAlpha: 0.95
        }
      );
      context.restore();
    }
    context.strokeStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--border-subtle')
        .trim() || 'rgba(255,255,255,.12)';
    context.lineWidth = 1;
    context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
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
      pressure = strokePressure,
      colorAlpha?: number
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
        color,
        colorAlpha
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
    stamp: (
      x: number,
      y: number,
      color?: string,
      pressure?: number,
      colorAlpha?: number
    ) => boolean
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
        const colorAlpha =
          this.uvBrushColorAlpha +
          (this.paintSecondaryColorAlpha - this.uvBrushColorAlpha) * t;
        stamp(
          x,
          y,
          this.mixHex(this.uvBrushColor, this.paintSecondaryColor, t),
          undefined,
          colorAlpha
        );
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
      colorAlpha: this.uvBrushColorAlpha,
      secondaryColor: this.paintSecondaryColor,
      secondaryColorAlpha: this.paintSecondaryColorAlpha,
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
      asset.height,
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
      colorAlpha: this.uvBrushColorAlpha,
      secondaryColor: this.paintSecondaryColor,
      secondaryColorAlpha: this.paintSecondaryColorAlpha
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
        du = snapScalar(du, this.uvSnapStep);
        dv = snapScalar(dv, this.uvSnapStep);
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
        radians = snapScalar(
          radians,
          (this.rotationSnapStep * Math.PI) / 180
        );
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
          snapScalar(factor, Math.max(this.uvSnapStep, 1e-3))
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
    if (this.workspace === 'animation') {
      const id = group?.id ?? this.getActiveNode()?.id;
      if (id !== undefined) {
        this.animationPose.delete(id);
      }
    }
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
        this.syncAnimationTransformEdit(group);
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
    this.syncAnimationTransformEdit(node);
  }

  /** Select a light for the Light Inspector without losing the bake target. */
  selectLight(lightId: string): void {
    if (!this.document.getLight(lightId)) {
      return;
    }
    if (this.drag || this.gizmoDrag) {
      this.cancelToolPointer();
    }
    this.activeLightId = lightId;
    this.activeGroupId = null;
    if (this.activeNodeId === null && this.selectedNodeIds.size > 0) {
      this.activeNodeId = [...this.selectedNodeIds][0] ?? null;
    }
    this.syncScene();
    this.publish();
  }

  /** Add a directional or point light and select it. */
  addLight(kind: LightKind): void {
    const light = this.document.createLight(kind);
    this.history.execute(
      new CreateLightCommand(this.document, light, this.document.lights.length)
    );
    this.activeLightId = light.id;
    this.activeGroupId = null;
    this.syncScene();
    this.renderer.frameLightWorkspace();
    this.publish();
  }

  /** Collect visible scene meshes as world-space triangles for bake shadows. */
  private bakeOccluders(): Float32Array[] {
    const occluders: Float32Array[] = [];
    for (const node of this.document.nodes) {
      if (!node.visible) {
        continue;
      }
      const parent = this.document.getGroup(node.parentId);
      if (parent && !parent.visible) {
        continue;
      }
      const matrix = transformMatrix(
        worldTransformForNode(node.transform, parent?.transform ?? null)
      );
      const mesh = node.getEvaluatedMesh().mesh;
      const triangles: number[] = [];
      for (let face = 0; face < mesh.faceCount; face += 1) {
        const first = mesh.faceHalfEdge[face];
        const loop: number[] = [];
        let halfEdge = first;
        do {
          loop.push(mesh.heOrigin[halfEdge]);
          halfEdge = mesh.heNext[halfEdge];
        } while (halfEdge !== first && loop.length < 64);
        if (loop.length < 3) {
          continue;
        }
        for (let i = 1; i < loop.length - 1; i += 1) {
          for (const vertex of [loop[0], loop[i], loop[i + 1]]) {
            const point = new Vector3(
              mesh.positions[vertex * 3],
              mesh.positions[vertex * 3 + 1],
              mesh.positions[vertex * 3 + 2]
            ).applyMatrix4(matrix);
            triangles.push(point.x, point.y, point.z);
          }
        }
      }
      occluders.push(new Float32Array(triangles));
    }
    return occluders;
  }

  /** Find the active render camera. */
  getActiveCamera(): SceneCamera | null {
    return this.document.getCamera(this.activeCameraId);
  }

  /** Select a render camera without changing the modeling selection. */
  selectCamera(id: string): void {
    if (!this.document.getCamera(id)) {
      return;
    }
    this.activeCameraId = id;
    if (this.workspace === 'render' && this.renderCameraView) {
      const view = this.activeCameraRenderPose();
      if (view) {
        this.renderer.setCameraView(view.position, view.target, view.fov);
      }
    }
    this.publish();
  }

  /** Frame the active camera's position and target in the viewport. */
  /** Leave the through-camera view and show camera handles again. */
  private leaveCameraView(): void {
    if (this.workspace !== 'render' || !this.renderCameraView) {
      return;
    }
    this.renderCameraView = false;
    this.syncScene();
    this.publish();
  }

  /** Toggle between free camera editing and looking through the render camera. */
  toggleCameraView(): void {
    const camera = this.getActiveCamera();
    if (!camera) {
      return;
    }
    if (this.workspace !== 'render') {
      this.setWorkspace('render');
    }
    if (this.renderCameraView) {
      this.renderCameraView = false;
      this.frameActiveCamera();
      return;
    }
    this.renderCameraView = true;
    const view = this.activeCameraRenderPose();
    if (view) {
      this.renderer.setCameraView(view.position, view.target, view.fov);
    }
    this.syncScene();
    this.publish();
  }

  frameActiveCamera(): void {
    const camera = this.getActiveCamera();
    if (!camera) {
      return;
    }
    this.renderCameraView = false;
    const view = this.activeCameraRenderPose();
    if (view) {
      this.renderer.frameCameraView(view.position, view.target);
    }
    this.syncScene();
    this.publish();
  }

  /** Toggle Render between free editing and camera view. */
  viewActiveCamera(): void {
    this.toggleCameraView();
  }



  /** Create a camera from the current navigation view. */
  addCameraFromCurrentView(): void {
    const view = this.renderer.captureCameraView();
    const camera = this.document.createCamera();
    camera.apply({
      ...camera.snapshot(),
      position: view.position,
      target: view.target,
      fov: view.fov
    });
    this.history.execute(
      new CreateCameraCommand(this.document, camera, this.document.cameras.length)
    );
    this.activeCameraId = camera.id;
    this.publish();
  }

  /** Auto-key camera pose fields while a camera track exists in Render. */
  private autoKeyCameraPose(
    camera: SceneCamera,
    pose: CameraPose,
    base: CameraSnapshot
  ): boolean {
    if (this.workspace !== 'render') {
      return false;
    }
    const track = this.document.animation.getCameraTrack(camera.id);
    if (!track) {
      return false;
    }
    const animation = this.document.animation;
    const beforeAnimation = animation.snapshot();
    track.setKey(
      Math.round(this.animationFrame),
      pose,
      this.animationInterpolation
    );
    camera.apply(base);
    const afterAnimation = animation.snapshot();
    if (JSON.stringify(beforeAnimation) !== JSON.stringify(afterAnimation)) {
      this.history.execute(
        new SetAnimationCommand(
          animation,
          beforeAnimation,
          afterAnimation,
          'Key camera'
        )
      );
      this.applyAnimationPose();
    } else {
      this.syncScene();
      this.publish();
    }
    return true;
  }

  /** Auto-key light pose fields while a light track exists in Light. */
  private autoKeyLightPose(
    light: SceneLight,
    pose: LightPose,
    base: LightSnapshot
  ): boolean {
    if (this.workspace !== 'light') {
      return false;
    }
    const track = this.document.animation.getLightTrack(light.id);
    if (!track) {
      return false;
    }
    const animation = this.document.animation;
    const beforeAnimation = animation.snapshot();
    track.setKey(
      Math.round(this.animationFrame),
      pose,
      this.animationInterpolation
    );
    light.apply(base);
    const afterAnimation = animation.snapshot();
    if (JSON.stringify(beforeAnimation) !== JSON.stringify(afterAnimation)) {
      this.history.execute(
        new SetAnimationCommand(
          animation,
          beforeAnimation,
          afterAnimation,
          'Key light'
        )
      );
      this.applyAnimationPose();
    } else {
      this.syncScene();
      this.publish();
    }
    return true;
  }

  /** Edit one camera as a single undoable command. */
  updateCamera(
    id: string,
    patch: Partial<Pick<import('../scene/SceneCamera').CameraSnapshot, 'name' | 'position' | 'target' | 'fov'>>
  ): void {
    const camera = this.document.getCamera(id);
    if (!camera) {
      return;
    }
    const before = camera.snapshot();
    let baseBefore = before;
    const posed =
      this.animationCameraPose.get(camera.id) ?? {
        position: [...before.position] as [number, number, number],
        target: [...before.target] as [number, number, number],
        fov: before.fov
      };
    if (patch.name !== undefined && patch.name.trim().slice(0, 64) !== before.name) {
      const named = { ...before, name: patch.name.trim().slice(0, 64) };
      this.history.execute(new UpdateCameraCommand(camera, before, named));
      baseBefore = camera.snapshot();
    }
    if (
      patch.position !== undefined ||
      patch.target !== undefined ||
      patch.fov !== undefined
    ) {
      const nextPose: CameraPose = {
        position:
          patch.position !== undefined
            ? ([...patch.position] as [number, number, number])
            : posed.position,
        target:
          patch.target !== undefined
            ? ([...patch.target] as [number, number, number])
            : posed.target,
        fov:
          patch.fov !== undefined
            ? Math.max(5, Math.min(160, patch.fov))
            : posed.fov
      };
      if (
        this.autoKeyCameraPose(camera, nextPose, baseBefore)
      ) {
        return;
      }
    }
    const baseAfter = {
      ...baseBefore,
      ...(patch.position !== undefined ? { position: [...patch.position] as [number, number, number] } : {}),
      ...(patch.target !== undefined ? { target: [...patch.target] as [number, number, number] } : {}),
      ...(patch.fov !== undefined ? { fov: Math.max(5, Math.min(160, patch.fov)) } : {})
    };
    if (JSON.stringify(baseBefore) === JSON.stringify(baseAfter)) {
      this.publish();
      return;
    }
    this.history.execute(new UpdateCameraCommand(camera, baseBefore, baseAfter));
    if (
      this.workspace === 'render' &&
      this.renderCameraView &&
      this.activeCameraId === id
    ) {
      const view = this.activeCameraRenderPose();
      if (view) {
        this.renderer.setCameraView(view.position, view.target, view.fov);
      }
    }
    this.publish();
  }

  /** Edit the active render camera. */
  updateActiveCamera(
    patch: Partial<Pick<import('../scene/SceneCamera').CameraSnapshot, 'name' | 'position' | 'target' | 'fov'>>
  ): void {
    if (this.activeCameraId) {
      this.updateCamera(this.activeCameraId, patch);
    }
  }

  /** Delete the active render camera and select the next one. */
  deleteActiveCamera(): void {
    if (!this.activeCameraId) {
      return;
    }
    const camera = this.document.getCamera(this.activeCameraId);
    if (!camera) {
      return;
    }
    const index = this.document.cameras.indexOf(camera);
    this.history.execute(new DeleteCameraCommand(this.document, camera, index));
    this.activeCameraId = this.document.cameras[Math.min(index, this.document.cameras.length - 1)]?.id ?? null;
    this.publish();
  }

  /** Update render output settings without touching the document. */
  updateRenderSettings(
    patch: Partial<{
      renderVirtualWidth: number;
      renderVirtualHeight: number;
      renderOutputWidth: number;
      renderOutputHeight: number;
      renderUpscale: RenderUpscale;
      renderShading: RenderShading;
      renderTransparent: boolean;
      renderBackground: string;
      renderKind: 'still' | 'sequence' | 'webm' | 'mp4';
      renderStartFrame: number;
      renderEndFrame: number;
    }>
  ): void {
    const clampDimension = (value: number): number =>
      Math.max(1, Math.min(4096, Math.round(value)));
    if (patch.renderVirtualWidth !== undefined) {
      this.renderVirtualWidth = clampDimension(patch.renderVirtualWidth);
    }
    if (patch.renderVirtualHeight !== undefined) {
      this.renderVirtualHeight = clampDimension(patch.renderVirtualHeight);
    }
    if (patch.renderOutputWidth !== undefined) {
      this.renderOutputWidth = clampDimension(patch.renderOutputWidth);
    }
    if (patch.renderOutputHeight !== undefined) {
      this.renderOutputHeight = clampDimension(patch.renderOutputHeight);
    }
    if (patch.renderUpscale !== undefined) {
      this.renderUpscale = patch.renderUpscale;
    }
    if (patch.renderShading !== undefined) {
      this.renderShading = patch.renderShading;
    }
    if (patch.renderTransparent !== undefined) {
      this.renderTransparent = patch.renderTransparent;
    }
    if (patch.renderBackground !== undefined) {
      this.renderBackground = patch.renderBackground;
    }
    if (patch.renderKind !== undefined) {
      this.renderKind = patch.renderKind;
    }
    this.renderCameraView = false;
    if (patch.renderStartFrame !== undefined) {
      this.renderStartFrame = Math.max(0, Math.round(patch.renderStartFrame));
    }
    if (patch.renderEndFrame !== undefined) {
      this.renderEndFrame = Math.max(1, Math.round(patch.renderEndFrame));
    }
    this.renderer.setCameraGizmos(
      this.posedCameraSummaries(),
      this.activeCameraId,
      this.workspace === 'render' && !this.renderCameraView,
      this.renderVirtualWidth / Math.max(1, this.renderVirtualHeight)
    );
    this.publish();
  }

  /** Render one still from the active camera and save it as a PNG. */
  async renderStill(): Promise<void> {
    if (this.renderBusy) {
      return;
    }
    const camera = this.getActiveCamera();
    const view = this.activeCameraRenderPose();
    if (!camera || !view) {
      this.projectError = 'Add a camera before rendering.';
      this.notify('warning', 'Render unavailable', 'Add a camera before rendering.');
      this.publish();
      return;
    }
    this.renderBusy = true;
    this.projectError = null;
    this.publish();
    try {
      const image = this.renderer.renderStill({
        width: this.renderVirtualWidth,
        height: this.renderVirtualHeight,
        shading: this.renderShading,
        camera: view,
        transparent: this.renderTransparent,
        backgroundColor: this.renderBackground
      });
      const canvas = upscaleRenderImage(
        image,
        this.renderOutputWidth,
        this.renderOutputHeight,
        this.renderUpscale,
        {
          transparent: this.renderTransparent,
          background: this.renderBackground
        }
      );
      const bytes = await canvasToPng(canvas);
      const saved = await saveBinaryFile(
        bytes,
        `${this.projectName}-render.png`,
        'png',
        'PNG image'
      );
      if (saved) {
        this.notify(
          'success',
          'Render exported',
          `${this.renderOutputWidth}×${this.renderOutputHeight} PNG`
        );
      }
    } catch (error) {
      const message = this.errorMessage(error);
      this.projectError = message;
      this.notify('error', 'Render failed', message);
    } finally {
      this.renderBusy = false;
      this.publish();
    }
  }

  /** Reactive-safe animation track summaries with resolved target names. */
  private animationTrackSummaries() {
    const transforms = this.document.animation.tracks.map((track) => ({
      id: track.id,
      kind: 'transform' as const,
      targetId: track.targetId,
      targetKind: track.targetKind,
      targetName:
        track.targetKind === 'node'
          ? (this.document.getNode(track.targetId)?.name ?? 'Missing object')
          : (this.document.getGroup(track.targetId)?.name ?? 'Missing group'),
      hasTrack: true,
      keyframes: track.keyframes.map((key) => ({
        frame: key.frame,
        interpolation: key.interpolation
      }))
    }));
    const activeGroup = this.getActiveGroup();
    const activeNode = activeGroup ? null : this.getActiveNode();
    if (
      (activeGroup || activeNode) &&
      !this.document.animation.getTrack(activeGroup?.id ?? activeNode?.id ?? '')
    ) {
      transforms.push({
        id: `pending-transform:${activeGroup?.id ?? activeNode?.id}`,
        kind: 'transform' as const,
        targetId: activeGroup?.id ?? activeNode?.id ?? '',
        targetKind: activeGroup ? 'group' as const : 'node' as const,
        targetName: activeGroup?.name ?? activeNode?.name ?? 'Missing object',
        hasTrack: false,
        keyframes: []
      });
    }
    const weights = this.document.animation.weightTracks.map((track) => {
      const node = this.document.getNode(track.targetId);
      const key = node?.shapeKeys.find((item) => item.id === track.shapeKeyId);
      return {
        id: track.id,
        kind: 'shape' as const,
        targetId: track.targetId,
        targetKind: 'node' as const,
        targetName: `${node?.name ?? 'Missing object'} · ${key?.name ?? 'Missing shape'}`,
        shapeKeyId: track.shapeKeyId,
        hasTrack: true,
        keyframes: track.keyframes.map((item) => ({
          frame: item.frame,
          interpolation: item.interpolation
        }))
      };
    });
    if (activeNode) {
      for (const key of activeNode.shapeKeys) {
        if (this.document.animation.getWeightTrack(activeNode.id, key.id)) {
          continue;
        }
        weights.push({
          id: `pending-shape:${activeNode.id}:${key.id}`,
          kind: 'shape' as const,
          targetId: activeNode.id,
          targetKind: 'node' as const,
          targetName: `${activeNode.name} · ${key.name}`,
          shapeKeyId: key.id,
          hasTrack: false,
          keyframes: []
        });
      }
    }
    const motions = this.document.animation.meshTracks.map((track) => {
      const node = this.document.getNode(track.targetId);
      return {
        id: track.id,
        kind: 'mesh' as const,
        targetId: track.targetId,
        targetKind: 'node' as const,
        targetName: `${node?.name ?? 'Missing object'} · Mesh`,
        hasTrack: true,
        keyframes: track.keyframes.map((item) => ({
          frame: item.frame,
          interpolation: item.interpolation
        }))
      };
    });
    const cameras = this.document.animation.cameraTracks.map((track) => {
      const camera = this.document.getCamera(track.targetId);
      return {
        id: track.id,
        kind: 'camera' as const,
        targetId: track.targetId,
        targetKind: 'camera' as const,
        targetName: `Camera · ${camera?.name ?? 'Missing camera'}`,
        hasTrack: true,
        keyframes: track.keyframes.map((item) => ({
          frame: item.frame,
          interpolation: item.interpolation
        }))
      };
    });
    const lights = this.document.animation.lightTracks.map((track) => {
      const light = this.document.getLight(track.targetId);
      return {
        id: track.id,
        kind: 'light' as const,
        targetId: track.targetId,
        targetKind: 'light' as const,
        targetName: `Light · ${light?.name ?? 'Missing light'}`,
        hasTrack: true,
        keyframes: track.keyframes.map((item) => ({
          frame: item.frame,
          interpolation: item.interpolation
        }))
      };
    });
    const activeCamera = this.document.getCamera(this.activeCameraId);
    if (
      activeCamera &&
      this.workspace === 'render' &&
      !this.document.animation.getCameraTrack(activeCamera.id)
    ) {
      cameras.push({
        id: `pending-camera:${activeCamera.id}`,
        kind: 'camera' as const,
        targetId: activeCamera.id,
        targetKind: 'camera' as const,
        targetName: `Camera · ${activeCamera.name}`,
        hasTrack: false,
        keyframes: []
      });
    }
    const activeLight = this.document.getLight(this.activeLightId);
    if (
      activeLight &&
      this.workspace === 'light' &&
      !this.document.animation.getLightTrack(activeLight.id)
    ) {
      lights.push({
        id: `pending-light:${activeLight.id}`,
        kind: 'light' as const,
        targetId: activeLight.id,
        targetKind: 'light' as const,
        targetName: `Light · ${activeLight.name}`,
        hasTrack: false,
        keyframes: []
      });
    }
    return [...transforms, ...weights, ...motions, ...cameras, ...lights];
  }

  /** Return the animation track for the active node/group, if any. */
  getActiveAnimationTrack(): AnimationTrack | null {
    const target = this.getActiveGroup() ?? this.getActiveNode();
    return target ? this.document.animation.getTrack(target.id) : null;
  }

  /** Camera summaries with the active animation pose applied. */
  private posedCameraSummaries(): import('../scene/SceneCamera').CameraSummary[] {
    return this.document.cameraSummaries().map((camera) => {
      const pose = this.animationCameraPose.get(camera.id);
      return pose
        ? {
            ...camera,
            position: [...pose.position] as [number, number, number],
            target: [...pose.target] as [number, number, number],
            fov: pose.fov
          }
        : camera;
    });
  }

  /** Light summaries with the active animation pose applied. */
  private posedLightSummaries(): import('../scene/SceneLight').LightSummary[] {
    return this.document.lightSummaries().map((light) => {
      const pose = this.animationLightPose.get(light.id);
      return pose
        ? {
            ...light,
            position: [...pose.position] as [number, number, number],
            direction: [...pose.direction] as [number, number, number],
            intensity: pose.intensity
          }
        : light;
    });
  }

  /** Current camera pose used by render previews and stills. */
  private activeCameraRenderPose(): CameraPose | null {
    const camera = this.getActiveCamera();
    if (!camera) {
      return null;
    }
    const pose = this.animationCameraPose.get(camera.id);
    return pose ?? {
      position: [...camera.position] as [number, number, number],
      target: [...camera.target] as [number, number, number],
      fov: camera.fov
    };
  }

  /** Keep topology replacement locked while any clip animates a node. */
  private refreshMotionLocks(): void {
    for (const node of this.document.nodes) {
      node.motionTracked = this.document.animation.clips.some(
        (clip) => clip.getMeshTrack(node.id) !== null
      );
    }
  }

  /** Evaluate and apply the current animation pose to the viewport. */
  private applyAnimationPose(): void {
    if (this.meshPoseEdit) {
      return;
    }
    const pose = new Map<string, NodeTransform>();
    for (const track of this.document.animation.tracks) {
      const transform = track.evaluate(this.animationFrame);
      if (!transform) {
        continue;
      }
      if (
        track.targetKind === 'node'
          ? this.document.getNode(track.targetId) !== undefined
          : this.document.getGroup(track.targetId) !== undefined
      ) {
        pose.set(track.targetId, transform);
      }
    }
    this.animationPose = pose;
    this.animationCameraPose.clear();
    this.animationLightPose.clear();
    for (const track of this.document.animation.cameraTracks) {
      const camera = this.document.getCamera(track.targetId);
      const cameraPose = track.evaluate(this.animationFrame);
      if (camera && cameraPose) {
        this.animationCameraPose.set(camera.id, cameraPose);
      }
    }
    for (const track of this.document.animation.lightTracks) {
      const light = this.document.getLight(track.targetId);
      const lightPose = track.evaluate(this.animationFrame);
      if (light && lightPose) {
        this.animationLightPose.set(light.id, lightPose);
      }
    }
    for (const node of this.document.nodes) {
      node.setMotionDeltas(null);
    }
    for (const track of this.document.animation.meshTracks) {
      const node = this.document.getNode(track.targetId);
      const values = track.evaluate(this.animationFrame);
      if (!node || !values) {
        continue;
      }
      const deltas = new Float32Array(node.mesh.positions.length);
      track.vertexIndices.forEach((vertex, position) => {
        if (vertex >= node.mesh.vertexCount) {
          return;
        }
        deltas[vertex * 3] = values[position * 3];
        deltas[vertex * 3 + 1] = values[position * 3 + 1];
        deltas[vertex * 3 + 2] = values[position * 3 + 2];
      });
      node.setMotionDeltas(deltas);
    }
    const weightOverrides = new Map<string, Map<string, number>>();
    for (const track of this.document.animation.weightTracks) {
      const node = this.document.getNode(track.targetId);
      if (!node || !node.shapeKeys.some((key) => key.id === track.shapeKeyId)) {
        continue;
      }
      const weight = track.evaluate(this.animationFrame);
      if (weight === null) {
        continue;
      }
      let values = weightOverrides.get(track.targetId);
      if (!values) {
        values = new Map();
        weightOverrides.set(track.targetId, values);
      }
      values.set(track.shapeKeyId, weight);
    }
    for (const node of this.document.nodes) {
      node.setShapeWeightOverrides(weightOverrides.get(node.id) ?? null);
    }
    this.syncScene();
    if (this.renderCameraView) {
      const view = this.activeCameraRenderPose();
      if (view) {
        this.renderer.setCameraView(view.position, view.target, view.fov);
      }
    }
    this.publish();
  }

  /** Begin editing a temporary mesh pose at the current frame. */
  beginMeshPoseEdit(): void {
    if (this.meshPoseEdit || this.shapeEdit) {
      return;
    }
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    this.stopAnimationLoop();
    const animation = this.document.animation;
    const frame = Math.round(this.animationFrame);
    const beforeAnimation = animation.snapshot();
    const track = animation.ensureMeshTrack(node.id);
    const values = track.evaluate(frame);
    const positions = node.mesh.positions.slice();
    if (values) {
      track.vertexIndices.forEach((vertex, position) => {
        if (vertex >= node.mesh.vertexCount) {
          return;
        }
        positions[vertex * 3] += values[position * 3];
        positions[vertex * 3 + 1] += values[position * 3 + 1];
        positions[vertex * 3 + 2] += values[position * 3 + 2];
      });
    }
    const baseMesh = node.mesh;
    node.motionTracked = true;
    node.setMotionDeltas(null);
    if (node.shapeKeys.length > 0) {
      node.setShapeWeightOverrides(
        new Map(node.shapeKeys.map((key) => [key.id, 0]))
      );
    }
    node.mesh = baseMesh.withPositions(positions);
    this.animationFrame = frame;
    this.meshPoseEdit = {
      node,
      baseMesh,
      frame,
      beforeAnimation
    };
    this.history.suspend();
    this.autosave.pause();
    this.syncScene();
    this.publish();
  }

  /** Commit the temporary mesh pose as one undoable Mesh Motion key. */
  finishMeshPoseEdit(): void {
    const session = this.meshPoseEdit;
    if (!session) {
      return;
    }
    const node = session.node;
    if (
      node.mesh.vertexCount !== session.baseMesh.vertexCount ||
      node.mesh.faceCount !== session.baseMesh.faceCount
    ) {
      this.notify(
        'error',
        'Cannot key mesh pose',
        'Mesh Motion requires unchanged topology.'
      );
      return;
    }
    const animation = this.document.animation;
    const track =
      animation.getMeshTrack(node.id) ?? animation.ensureMeshTrack(node.id);
    track.setPoseKey(
      session.frame,
      session.baseMesh.positions,
      node.mesh.positions,
      this.animationInterpolation
    );
    if (track.keyframes.length === 0) {
      animation.removeMeshTrack(node.id);
    }
    node.motionTracked = track.keyframes.length > 0;
    node.mesh = session.baseMesh;
    node.setMotionDeltas(null);
    node.setShapeWeightOverrides(null);
    this.meshPoseEdit = null;
    const after = animation.snapshot();
    this.history.resume();
    if (JSON.stringify(session.beforeAnimation) !== JSON.stringify(after)) {
      this.history.execute(
        new SetAnimationCommand(
          animation,
          session.beforeAnimation,
          after,
          'Key mesh pose'
        )
      );
    }
    void this.autosave.resume();
    this.animationFrame = session.frame;
    this.applyAnimationPose();
  }

  /** Discard a temporary mesh pose and restore the base mesh. */
  cancelMeshPoseEdit(): void {
    const session = this.meshPoseEdit;
    if (!session) {
      return;
    }
    session.node.mesh = session.baseMesh;
    session.node.setMotionDeltas(null);
    session.node.setShapeWeightOverrides(null);
    this.document.animation.apply(session.beforeAnimation);
    this.refreshMotionLocks();
    this.meshPoseEdit = null;
    this.history.resume();
    void this.autosave.resume();
    this.animationFrame = session.frame;
    this.applyAnimationPose();
  }

  /** Switch the timeline to another clip without an undo step. */
  setActiveAnimationClip(id: string): void {
    if (this.meshPoseEdit) {
      return;
    }
    if (!this.document.animation.setActiveClip(id)) {
      return;
    }
    this.stopAnimationLoop();
    this.animationFrame = Math.max(
      this.document.animation.startFrame,
      Math.min(this.document.animation.endFrame, this.animationFrame)
    );
    this.applyAnimationPose();
  }

  /** Add an empty animation clip and make it active. */
  addAnimationClip(): void {
    if (this.meshPoseEdit) {
      return;
    }
    const animation = this.document.animation;
    const before = animation.snapshot();
    animation.createClip();
    const after = animation.snapshot();
    this.history.execute(
      new SetAnimationCommand(animation, before, after, 'Add animation clip')
    );
    this.animationFrame = animation.startFrame;
    this.applyAnimationPose();
  }

  /** Duplicate the active clip with fresh key/track ids. */
  duplicateAnimationClip(): void {
    if (this.meshPoseEdit) {
      return;
    }
    const animation = this.document.animation;
    const before = animation.snapshot();
    if (!animation.duplicateClip()) {
      return;
    }
    const after = animation.snapshot();
    this.history.execute(
      new SetAnimationCommand(
        animation,
        before,
        after,
        'Duplicate animation clip'
      )
    );
    this.animationFrame = animation.startFrame;
    this.applyAnimationPose();
  }

  /** Delete the active clip, keeping at least one. */
  deleteAnimationClip(): void {
    if (this.meshPoseEdit) {
      return;
    }
    const animation = this.document.animation;
    if (animation.clips.length <= 1) {
      return;
    }
    const before = animation.snapshot();
    animation.removeClip(animation.activeClipId);
    const after = animation.snapshot();
    this.history.execute(
      new SetAnimationCommand(animation, before, after, 'Delete animation clip')
    );
    this.animationFrame = animation.startFrame;
    this.applyAnimationPose();
  }

  /** Rename the active clip. */
  renameAnimationClip(name: string): void {
    const animation = this.document.animation;
    const before = animation.snapshot();
    if (!animation.renameClip(animation.activeClipId, name)) {
      return;
    }
    const after = animation.snapshot();
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return;
    }
    this.history.execute(
      new SetAnimationCommand(animation, before, after, 'Rename animation clip')
    );
    this.publish();
  }

  /** Move the playhead and evaluate the animation pose. */
  setAnimationFrame(frame: number): void {
    if (this.meshPoseEdit) {
      return;
    }
    this.stopAnimationLoop();
    const start = this.document.animation.startFrame;
    const end = this.document.animation.endFrame;
    this.animationFrame = Math.max(start, Math.min(end, frame));
    this.applyAnimationPose();
  }

  /** Set the animation frame rate and range as one undoable document edit. */
  setAnimationSettings(
    patch: Partial<{
      fps: number;
      startFrame: number;
      endFrame: number;
    }>
  ): void {
    if (this.meshPoseEdit) {
      return;
    }
    const animation = this.document.animation;
    const before = animation.snapshot();
    const clip = animation.activeClip;
    if (patch.fps !== undefined) {
      animation.fps = Math.max(1, Math.min(120, Math.round(patch.fps)));
    }
    if (patch.startFrame !== undefined) {
      clip.startFrame = Math.max(0, Math.round(patch.startFrame));
    }
    if (patch.endFrame !== undefined) {
      clip.endFrame = Math.max(1, Math.round(patch.endFrame));
    }
    if (clip.endFrame <= clip.startFrame) {
      clip.endFrame = clip.startFrame + 1;
    }
    const after = animation.snapshot();
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return;
    }
    this.history.execute(
      new SetAnimationCommand(
        animation,
        before,
        after,
        'Change animation settings'
      )
    );
    this.animationFrame = Math.max(
      clip.startFrame,
      Math.min(clip.endFrame, this.animationFrame)
    );
    this.applyAnimationPose();
  }

  /** Copy selected keys from the active clip with relative frame offsets. */
  copyAnimationKeys(keys: readonly AnimationKeyReference[]): number {
    const entries = buildAnimationKeyClipboard(
      this.document.animation.activeClip,
      keys
    );
    if (entries.length === 0) {
      return 0;
    }
    this.animationKeyClipboard = entries;
    this.publish();
    return entries.length;
  }

  /** Paste the internal key clipboard at the playhead into the active clip. */
  pasteAnimationKeys(): number {
    const entries = this.animationKeyClipboard;
    if (entries.length === 0) {
      return 0;
    }
    const animation = this.document.animation;
    const clip = animation.activeClip;
    const base = animationPasteBase(clip, this.animationFrame);
    type PlannedPaste =
      | {
          kind: 'shape';
          targetId: string;
          shapeKeyId: string;
          frame: number;
          interpolation: AnimationInterpolation;
          weight: number;
        }
      | {
          kind: 'transform';
          targetId: string;
          targetKind: AnimationTargetKind;
          frame: number;
          interpolation: AnimationInterpolation;
          transform: NodeTransform;
        }
      | {
          kind: 'mesh';
          targetId: string;
          frame: number;
          interpolation: AnimationInterpolation;
          vertexIndices: readonly number[];
          values: readonly number[];
        }
      | {
          kind: 'camera';
          targetId: string;
          frame: number;
          interpolation: AnimationInterpolation;
          pose: CameraPose;
        }
      | {
          kind: 'light';
          targetId: string;
          frame: number;
          interpolation: AnimationInterpolation;
          pose: LightPose;
        };
    const planned: PlannedPaste[] = [];
    for (const entry of entries) {
      const frame = base + entry.offsetFrame;
      if (entry.kind === 'mesh') {
        const node = this.document.getNode(entry.targetId);
        if (!node || !entry.vertexIndices || !entry.values) {
          continue;
        }
        planned.push({
          kind: 'mesh',
          targetId: node.id,
          frame,
          interpolation: entry.interpolation,
          vertexIndices: entry.vertexIndices,
          values: entry.values
        });
        continue;
      }
      if (entry.kind === 'shape') {
        const node = this.document.getNode(entry.targetId);
        const shapeKey = node?.shapeKeys.find(
          (key) => key.id === entry.shapeKeyId
        );
        if (!node || !shapeKey || entry.weight === undefined) {
          continue;
        }
        planned.push({
          kind: 'shape',
          targetId: node.id,
          shapeKeyId: shapeKey.id,
          frame,
          interpolation: entry.interpolation,
          weight: entry.weight
        });
        continue;
      }
      if (entry.kind === 'camera') {
        const camera = this.document.getCamera(entry.targetId);
        if (
          !camera ||
          !entry.cameraPosition ||
          !entry.cameraTarget ||
          entry.cameraFov === undefined
        ) {
          continue;
        }
        planned.push({
          kind: 'camera',
          targetId: camera.id,
          frame,
          interpolation: entry.interpolation,
          pose: {
            position: [...entry.cameraPosition] as [number, number, number],
            target: [...entry.cameraTarget] as [number, number, number],
            fov: entry.cameraFov
          }
        });
        continue;
      }
      if (entry.kind === 'light') {
        const light = this.document.getLight(entry.targetId);
        if (
          !light ||
          !entry.lightPosition ||
          !entry.lightDirection ||
          entry.lightIntensity === undefined
        ) {
          continue;
        }
        planned.push({
          kind: 'light',
          targetId: light.id,
          frame,
          interpolation: entry.interpolation,
          pose: {
            position: [...entry.lightPosition] as [number, number, number],
            direction: [...entry.lightDirection] as [number, number, number],
            intensity: entry.lightIntensity
          }
        });
        continue;
      }
      if (entry.targetKind !== 'node' && entry.targetKind !== 'group') {
        continue;
      }
      const target =
        entry.targetKind === 'group'
          ? this.document.getGroup(entry.targetId)
          : this.document.getNode(entry.targetId);
      if (!target || !entry.transform) {
        continue;
      }
      planned.push({
        kind: 'transform',
        targetId: entry.targetId,
        targetKind: entry.targetKind,
        frame,
        interpolation: entry.interpolation,
        transform: entry.transform
      });
    }
    if (planned.length === 0) {
      return 0;
    }
    const before = animation.snapshot();
    const lastFrame = animationPasteEndFrame(
      clip,
      planned.map((entry) => entry.frame)
    );
    if (lastFrame > clip.endFrame) {
      clip.endFrame = lastFrame;
    }
    let pasted = 0;
    for (const entry of planned) {
      if (entry.kind === 'mesh') {
        const node = this.document.getNode(entry.targetId);
        if (!node) {
          continue;
        }
        const deltas = new Map<number, [number, number, number]>();
        entry.vertexIndices.forEach((vertex, position) => {
          if (vertex >= node.mesh.vertexCount) {
            return;
          }
          deltas.set(vertex, [
            entry.values[position * 3],
            entry.values[position * 3 + 1],
            entry.values[position * 3 + 2]
          ]);
        });
        animation
          .ensureMeshTrack(node.id)
          .setDeltasKey(entry.frame, deltas, entry.interpolation);
      } else if (entry.kind === 'camera') {
        animation
          .ensureCameraTrack(entry.targetId)
          .setKey(entry.frame, entry.pose, entry.interpolation);
      } else if (entry.kind === 'light') {
        animation
          .ensureLightTrack(entry.targetId)
          .setKey(entry.frame, entry.pose, entry.interpolation);
      } else if (entry.kind === 'shape') {
        animation
          .ensureWeightTrack(entry.targetId, entry.shapeKeyId)
          .setKey(entry.frame, entry.weight, entry.interpolation);
      } else {
        animation
          .ensureTrack(entry.targetId, entry.targetKind)
          .setKey(entry.frame, entry.transform, entry.interpolation);
      }
      pasted += 1;
    }
    const after = animation.snapshot();
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return 0;
    }
    this.history.execute(
      new SetAnimationCommand(animation, before, after, 'Paste keyframes')
    );
    this.animationFrame = base;
    this.applyAnimationPose();
    return pasted;
  }

  /** Remove several selected keys as one undoable edit. */
  deleteAnimationKeys(keys: readonly AnimationKeyReference[]): number {
    if (keys.length === 0) {
      return 0;
    }
    const animation = this.document.animation;
    const clip = animation.activeClip;
    const before = animation.snapshot();
    let removed = 0;
    const transformFrames = new Map<string, Set<number>>();
    const shapeFrames = new Map<string, Set<number>>();
    const meshFrames = new Map<string, Set<number>>();
    const cameraFrames = new Map<string, Set<number>>();
    const lightFrames = new Map<string, Set<number>>();
    for (const reference of keys) {
      if (clip.tracks.some((track) => track.id === reference.trackId)) {
        let frames = transformFrames.get(reference.trackId);
        if (!frames) {
          frames = new Set();
          transformFrames.set(reference.trackId, frames);
        }
        frames.add(reference.frame);
      } else if (
        clip.weightTracks.some((track) => track.id === reference.trackId)
      ) {
        let frames = shapeFrames.get(reference.trackId);
        if (!frames) {
          frames = new Set();
          shapeFrames.set(reference.trackId, frames);
        }
        frames.add(reference.frame);
      } else if (
        clip.meshTracks.some((track) => track.id === reference.trackId)
      ) {
        let frames = meshFrames.get(reference.trackId);
        if (!frames) {
          frames = new Set();
          meshFrames.set(reference.trackId, frames);
        }
        frames.add(reference.frame);
      } else if (
        clip.cameraTracks.some((track) => track.id === reference.trackId)
      ) {
        let frames = cameraFrames.get(reference.trackId);
        if (!frames) {
          frames = new Set();
          cameraFrames.set(reference.trackId, frames);
        }
        frames.add(reference.frame);
      } else if (
        clip.lightTracks.some((track) => track.id === reference.trackId)
      ) {
        let frames = lightFrames.get(reference.trackId);
        if (!frames) {
          frames = new Set();
          lightFrames.set(reference.trackId, frames);
        }
        frames.add(reference.frame);
      }
    }
    for (const [trackId, frames] of transformFrames) {
      const track = clip.tracks.find((item) => item.id === trackId);
      if (!track) {
        continue;
      }
      for (const frame of frames) {
        const hadKey = track.keyframes.some((key) => key.frame === frame);
        track.removeKey(frame);
        if (hadKey) {
          removed += 1;
        }
      }
      if (track.keyframes.length === 0) {
        animation.removeTrack(track.targetId);
      }
    }
    for (const [trackId, frames] of shapeFrames) {
      const track = clip.weightTracks.find((item) => item.id === trackId);
      if (!track) {
        continue;
      }
      for (const frame of frames) {
        const hadKey = track.keyframes.some((key) => key.frame === frame);
        track.removeKey(frame);
        if (hadKey) {
          removed += 1;
        }
      }
      if (track.keyframes.length === 0) {
        animation.removeWeightTrack(track.targetId, track.shapeKeyId);
      }
    }
    for (const [trackId, frames] of meshFrames) {
      const track = clip.meshTracks.find((item) => item.id === trackId);
      if (!track) {
        continue;
      }
      for (const frame of frames) {
        const hadKey = track.keyframes.some((key) => key.frame === frame);
        track.removeKey(frame);
        if (hadKey) {
          removed += 1;
        }
      }
      if (track.keyframes.length === 0) {
        animation.removeMeshTrack(track.targetId);
      }
    }
    for (const [trackId, frames] of cameraFrames) {
      const track = clip.cameraTracks.find((item) => item.id === trackId);
      if (!track) {
        continue;
      }
      for (const frame of frames) {
        const hadKey = track.keyframes.some((key) => key.frame === frame);
        track.removeKey(frame);
        if (hadKey) {
          removed += 1;
        }
      }
      if (track.keyframes.length === 0) {
        animation.removeCameraTrack(track.targetId);
      }
    }
    for (const [trackId, frames] of lightFrames) {
      const track = clip.lightTracks.find((item) => item.id === trackId);
      if (!track) {
        continue;
      }
      for (const frame of frames) {
        const hadKey = track.keyframes.some((key) => key.frame === frame);
        track.removeKey(frame);
        if (hadKey) {
          removed += 1;
        }
      }
      if (track.keyframes.length === 0) {
        animation.removeLightTrack(track.targetId);
      }
    }
    if (removed === 0) {
      return 0;
    }
    this.history.execute(
      new SetAnimationCommand(
        animation,
        before,
        animation.snapshot(),
        removed === 1 ? 'Delete keyframe' : 'Delete keyframes'
      )
    );
    this.applyAnimationPose();
    return removed;
  }

  /** Set whether playback loops at the end of the range. */
  setAnimationLoop(loop: boolean): void {
    this.animationLoop = loop;
    this.publish();
  }

  /** Choose the interpolation used by newly added keys. */
  setAnimationInterpolation(interpolation: AnimationInterpolation): void {
    this.animationInterpolation = interpolation;
    this.publish();
  }

  /** Add or update the key for one timeline track at the playhead. */
  keyAnimationTrack(
    targetId: string,
    targetKind: import('../scene/SceneAnimation').AnimationTargetKind | 'camera' | 'light',
    kind: 'transform' | 'shape' | 'mesh' | 'camera' | 'light',
    shapeKeyId?: string
  ): void {
    if (this.meshPoseEdit) {
      return;
    }
    const keyFrame = Math.round(this.animationFrame);
    this.animationFrame = keyFrame;
    const before = this.document.animation.snapshot();
    if (kind === 'camera') {
      const camera = this.document.getCamera(targetId);
      if (!camera) {
        return;
      }
      const pose =
        this.animationCameraPose.get(camera.id) ?? {
          position: [...camera.position] as [number, number, number],
          target: [...camera.target] as [number, number, number],
          fov: camera.fov
        };
      this.document.animation
        .ensureCameraTrack(camera.id)
        .setKey(keyFrame, pose, this.animationInterpolation);
    } else if (kind === 'light') {
      const light = this.document.getLight(targetId);
      if (!light) {
        return;
      }
      const pose =
        this.animationLightPose.get(light.id) ?? {
          position: [...light.position] as [number, number, number],
          direction: [...light.direction] as [number, number, number],
          intensity: light.intensity
        };
      this.document.animation
        .ensureLightTrack(light.id)
        .setKey(keyFrame, pose, this.animationInterpolation);
    } else if (kind === 'mesh') {
      const node = this.document.getNode(targetId);
      if (!node) {
        return;
      }
      const track = this.document.animation.getMeshTrack(node.id);
      const values = track?.evaluate(keyFrame) ?? null;
      if (track && values) {
        const deltas = new Map<number, [number, number, number]>();
        track.vertexIndices.forEach((vertex, position) => {
          deltas.set(vertex, [
            values[position * 3],
            values[position * 3 + 1],
            values[position * 3 + 2]
          ]);
        });
        track.setDeltasKey(keyFrame, deltas, this.animationInterpolation);
      } else {
        return;
      }
    } else if (kind === 'shape' && shapeKeyId) {
      const node = this.document.getNode(targetId);
      const key = node?.shapeKeys.find((item) => item.id === shapeKeyId);
      if (!node || !key) {
        return;
      }
      const track = this.document.animation.ensureWeightTrack(
        node.id,
        key.id
      );
      track.setKey(
        keyFrame,
        node.shapeKeyWeight(key),
        this.animationInterpolation
      );
    } else {
      if (targetKind !== 'node' && targetKind !== 'group') {
        return;
      }
      const target =
        targetKind === 'group'
          ? this.document.getGroup(targetId)
          : this.document.getNode(targetId);
      if (!target) {
        return;
      }
      const track = this.document.animation.ensureTrack(targetId, targetKind);
      track.setKey(
        keyFrame,
        this.animationPose.get(targetId) ?? target.transform,
        this.animationInterpolation
      );
    }
    this.history.execute(
      new SetAnimationCommand(
        this.document.animation,
        before,
        this.document.animation.snapshot(),
        kind === 'shape'
          ? 'Key shape weight'
          : kind === 'mesh'
            ? 'Key mesh pose'
            : kind === 'camera'
              ? 'Key camera'
              : kind === 'light'
                ? 'Key light'
                : 'Key transform'
      )
    );
    this.applyAnimationPose();
  }

  /** Change the interpolation of one selected key without moving it. */
  setAnimationKeyInterpolation(
    targetId: string,
    kind: 'transform' | 'shape' | 'mesh' | 'camera' | 'light',
    shapeKeyId: string | null,
    frame: number,
    interpolation: import('../scene/SceneAnimation').AnimationInterpolation
  ): void {
    const before = this.document.animation.snapshot();
    if (kind === 'camera') {
      const track = this.document.animation.getCameraTrack(targetId);
      if (!track || !track.setInterpolation(frame, interpolation)) {
        return;
      }
    } else if (kind === 'light') {
      const track = this.document.animation.getLightTrack(targetId);
      if (!track || !track.setInterpolation(frame, interpolation)) {
        return;
      }
    } else if (kind === 'mesh') {
      const track = this.document.animation.getMeshTrack(targetId);
      if (!track || !track.setInterpolation(frame, interpolation)) {
        return;
      }
    } else if (kind === 'shape' && shapeKeyId) {
      const track = this.document.animation.getWeightTrack(targetId, shapeKeyId);
      const key = track?.keyframes.find((item) => item.frame === frame);
      if (!track || !key || key.interpolation === interpolation) {
        return;
      }
      track.setKey(frame, key.weight, interpolation);
    } else {
      const track = this.document.animation.getTrack(targetId);
      const key = track?.keyframes.find((item) => item.frame === frame);
      if (!track || !key || key.interpolation === interpolation) {
        return;
      }
      track.setKey(frame, key.transform, interpolation);
    }
    this.history.execute(
      new SetAnimationCommand(
        this.document.animation,
        before,
        this.document.animation.snapshot(),
        'Change key interpolation'
      )
    );
    this.applyAnimationPose();
  }

  /** Remove one key from a transform or shape-weight track. */
  deleteAnimationKeyAt(
    targetId: string,
    kind: 'transform' | 'shape' | 'mesh' | 'camera' | 'light',
    shapeKeyId: string | null,
    frame: number
  ): void {
    const before = this.document.animation.snapshot();
    if (kind === 'camera') {
      const track = this.document.animation.getCameraTrack(targetId);
      if (!track) {
        return;
      }
      track.removeKey(frame);
      if (track.keyframes.length === 0) {
        this.document.animation.removeCameraTrack(targetId);
      }
    } else if (kind === 'light') {
      const track = this.document.animation.getLightTrack(targetId);
      if (!track) {
        return;
      }
      track.removeKey(frame);
      if (track.keyframes.length === 0) {
        this.document.animation.removeLightTrack(targetId);
      }
    } else if (kind === 'mesh') {
      const track = this.document.animation.getMeshTrack(targetId);
      if (!track) {
        return;
      }
      track.removeKey(frame);
      if (track.keyframes.length === 0) {
        this.document.animation.removeMeshTrack(targetId);
      }
    } else if (kind === 'shape' && shapeKeyId) {
      const track = this.document.animation.getWeightTrack(
        targetId,
        shapeKeyId
      );
      if (!track) {
        return;
      }
      track.removeKey(frame);
      if (track.keyframes.length === 0) {
        this.document.animation.removeWeightTrack(targetId, shapeKeyId);
      }
    } else {
      const track = this.document.animation.getTrack(targetId);
      if (!track) {
        return;
      }
      track.removeKey(frame);
      if (track.keyframes.length === 0) {
        this.document.animation.removeTrack(targetId);
      }
    }
    this.history.execute(
      new SetAnimationCommand(
        this.document.animation,
        before,
        this.document.animation.snapshot(),
        'Delete keyframe'
      )
    );
    this.applyAnimationPose();
  }

  /** Move one key to another integer frame as one undoable edit. */
  moveAnimationKey(
    targetId: string,
    kind: 'transform' | 'shape' | 'mesh' | 'camera' | 'light',
    shapeKeyId: string | null,
    fromFrame: number,
    toFrame: number
  ): void {
    const start = Math.min(
      this.document.animation.startFrame,
      this.document.animation.endFrame
    );
    const end = Math.max(
      this.document.animation.startFrame,
      this.document.animation.endFrame
    );
    const targetFrame = Math.max(start, Math.min(end, Math.round(toFrame)));
    if (targetFrame === fromFrame) {
      return;
    }
    const before = this.document.animation.snapshot();
    if (kind === 'camera') {
      const track = this.document.animation.getCameraTrack(targetId);
      const key = track?.keyframes.find((item) => item.frame === fromFrame);
      if (!track || !key) {
        return;
      }
      track.removeKey(fromFrame);
      track.setKey(
        targetFrame,
        { position: key.position, target: key.target, fov: key.fov },
        key.interpolation
      );
    } else if (kind === 'light') {
      const track = this.document.animation.getLightTrack(targetId);
      const key = track?.keyframes.find((item) => item.frame === fromFrame);
      if (!track || !key) {
        return;
      }
      track.removeKey(fromFrame);
      track.setKey(
        targetFrame,
        {
          position: key.position,
          direction: key.direction,
          intensity: key.intensity
        },
        key.interpolation
      );
    } else if (kind === 'mesh') {
      const track = this.document.animation.getMeshTrack(targetId);
      const key = track?.keyframes.find((item) => item.frame === fromFrame);
      if (!track || !key) {
        return;
      }
      const deltas = new Map<number, [number, number, number]>();
      track.vertexIndices.forEach((vertex, position) => {
        deltas.set(vertex, [
          key.values[position * 3],
          key.values[position * 3 + 1],
          key.values[position * 3 + 2]
        ]);
      });
      track.removeKey(fromFrame);
      track.setDeltasKey(targetFrame, deltas, key.interpolation);
    } else if (kind === 'shape' && shapeKeyId) {
      const track = this.document.animation.getWeightTrack(
        targetId,
        shapeKeyId
      );
      const key = track?.keyframes.find((item) => item.frame === fromFrame);
      if (!track || !key) {
        return;
      }
      track.removeKey(fromFrame);
      track.setKey(targetFrame, key.weight, key.interpolation);
    } else {
      const track = this.document.animation.getTrack(targetId);
      const key = track?.keyframes.find((item) => item.frame === fromFrame);
      if (!track || !key) {
        return;
      }
      track.removeKey(fromFrame);
      track.setKey(targetFrame, key.transform, key.interpolation);
    }
    this.history.execute(
      new SetAnimationCommand(
        this.document.animation,
        before,
        this.document.animation.snapshot(),
        'Move keyframe'
      )
    );
    this.animationFrame = targetFrame;
    this.applyAnimationPose();
  }

  /** Update an existing transform key when the current frame is keyed. */
  private syncAnimationTransformEdit(target: MeshNode | SceneGroup): void {
    if (this.workspace !== 'animation') {
      return;
    }
    const track = this.document.animation.getTrack(target.id);
    if (!track) {
      return;
    }
    const frame = Math.round(this.animationFrame);
    if (!track.keyframes.some((key) => key.frame === frame)) {
      return;
    }
    const before = this.document.animation.snapshot();
    track.setKey(frame, target.transform, this.animationInterpolation);
    const after = this.document.animation.snapshot();
    this.history.execute(
      new SetAnimationCommand(
        this.document.animation,
        before,
        after,
        'Update transform key'
      )
    );
    this.applyAnimationPose();
  }

  /** Key the active object or group transform at the current frame. */
  keyActiveTransform(): void {
    const group = this.getActiveGroup();
    const node = group ? null : this.getActiveNode();
    const target = group ?? node;
    if (!target) {
      return;
    }
    const keyFrame = Math.round(this.animationFrame);
    this.animationFrame = keyFrame;
    const before = this.document.animation.snapshot();
    const track = this.document.animation.ensureTrack(
      target.id,
      group ? 'group' : 'node'
    );
    track.setKey(
      keyFrame,
      target.transform,
      this.animationInterpolation
    );
    const after = this.document.animation.snapshot();
    this.history.execute(
      new SetAnimationCommand(
        this.document.animation,
        before,
        after,
        'Key transform'
      )
    );
    this.applyAnimationPose();
  }

  /** Key the active object's shape weight at the current frame. */
  keyShapeWeight(shapeKeyId: string): void {
    const node = this.getActiveNode();
    const key = node?.shapeKeys.find((item) => item.id === shapeKeyId);
    if (!node || !key) {
      return;
    }
    const keyFrame = Math.round(this.animationFrame);
    this.animationFrame = keyFrame;
    const before = this.document.animation.snapshot();
    const track = this.document.animation.ensureWeightTrack(node.id, key.id);
    track.setKey(
      keyFrame,
      node.shapeKeyWeight(key),
      this.animationInterpolation
    );
    const after = this.document.animation.snapshot();
    this.history.execute(
      new SetAnimationCommand(
        this.document.animation,
        before,
        after,
        'Key shape weight'
      )
    );
    this.applyAnimationPose();
  }

  /** Delete the active object's shape-weight key at the current frame. */
  deleteShapeWeightKey(shapeKeyId: string): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const track = this.document.animation.getWeightTrack(node.id, shapeKeyId);
    if (!track) {
      return;
    }
    const before = this.document.animation.snapshot();
    track.removeKey(Math.round(this.animationFrame));
    if (track.keyframes.length === 0) {
      this.document.animation.removeWeightTrack(node.id, shapeKeyId);
    }
    const after = this.document.animation.snapshot();
    this.history.execute(
      new SetAnimationCommand(
        this.document.animation,
        before,
        after,
        'Delete shape-weight key'
      )
    );
    this.applyAnimationPose();
  }

  /** Delete the key at the current frame for the active target. */
  deleteActiveAnimationKey(): void {
    const track = this.getActiveAnimationTrack();
    if (!track) {
      return;
    }
    const before = this.document.animation.snapshot();
    track.removeKey(Math.round(this.animationFrame));
    if (track.keyframes.length === 0) {
      this.document.animation.removeTrack(track.targetId);
    }
    const after = this.document.animation.snapshot();
    this.history.execute(
      new SetAnimationCommand(
        this.document.animation,
        before,
        after,
        'Delete keyframe'
      )
    );
    this.applyAnimationPose();
  }

  /** Start scheduler-driven animation playback. */
  playAnimation(): void {
    if (
      this.animationPlaying ||
      this.meshPoseEdit ||
      (this.document.animation.tracks.length === 0 &&
        this.document.animation.weightTracks.length === 0 &&
        this.document.animation.meshTracks.length === 0 &&
        this.document.animation.cameraTracks.length === 0 &&
        this.document.animation.lightTracks.length === 0)
    ) {
      return;
    }
    const settings = this.document.animation;
    if (this.animationFrame >= settings.endFrame) {
      this.animationFrame = settings.startFrame;
    }
    this.animationPlaying = true;
    this.animationClockStart = performance.now();
    this.animationClockFrame = this.animationFrame;
    this.publish();
    const tick = (now: number): void => {
      if (!this.animationPlaying) {
        return;
      }
      const elapsed = (now - this.animationClockStart) / 1000;
      let next =
        this.animationClockFrame + elapsed * this.document.animation.fps;
      const duration =
        this.document.animation.endFrame - this.document.animation.startFrame;
      if (next > this.document.animation.endFrame) {
        if (this.animationLoop && duration > 0) {
          next =
            this.document.animation.startFrame +
            ((next - this.document.animation.startFrame) % duration);
        } else {
          next = this.document.animation.endFrame;
        }
      }
      this.animationFrame = next;
      this.applyAnimationPose();
      if (next >= this.document.animation.endFrame && !this.animationLoop) {
        this.stopAnimationLoop();
        this.publish();
        return;
      }
      this.animationRaf = requestAnimationFrame(tick);
    };
    this.animationRaf = requestAnimationFrame(tick);
  }

  /** Stop playback and return the playhead to the clip start. */
  rewindAnimation(): void {
    this.pauseAnimation();
    this.setAnimationFrame(this.document.animation.startFrame);
  }

  /** Stop animation playback and release its scheduler frame. */
  pauseAnimation(): void {
    const wasPlaying = this.animationPlaying;
    this.stopAnimationLoop();
    if (wasPlaying) {
      this.publish();
    }
  }

  private stopAnimationLoop(): void {
    if (this.animationRaf) {
      cancelAnimationFrame(this.animationRaf);
      this.animationRaf = 0;
    }
    this.animationPlaying = false;
  }

  /** Clear the preview pose when leaving animation-oriented views. */
  private clearAnimationPose(): void {
    this.animationPose.clear();
    this.animationCameraPose.clear();
    this.animationLightPose.clear();
    for (const node of this.document.nodes) {
      node.setShapeWeightOverrides(null);
      node.setMotionDeltas(null);
    }
    this.syncScene();
  }

  /**
   * Draw the current scene through the active render camera into a live pane.
   *
   * The virtual-resolution render is upscaled into the supplied 2D canvas. It
   * runs only after a render-relevant snapshot change, never from an idle loop.
   */
  drawRenderPreview(
    canvas: HTMLCanvasElement,
    width: number,
    height: number
  ): void {
    if (width <= 0 || height <= 0 || this.renderBusy) {
      return;
    }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
    const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const camera = this.getActiveCamera();
    const view = this.activeCameraRenderPose();
    if (!camera || !view) {
      return;
    }
    let image: ImageData;
    try {
      image = this.renderer.renderStill({
        width: this.renderVirtualWidth,
        height: this.renderVirtualHeight,
        shading: this.renderShading,
        camera: view,
        transparent: this.renderTransparent,
        backgroundColor: this.renderBackground
      });
    } catch {
      return;
    }

    const source =
      this.renderPreviewSource ?? (this.renderPreviewSource = document.createElement('canvas'));
    if (source.width !== image.width || source.height !== image.height) {
      source.width = image.width;
      source.height = image.height;
    }
    const sourceContext = source.getContext('2d');
    if (!sourceContext) {
      return;
    }
    sourceContext.putImageData(image, 0, 0);
    const outputFrame = fitRect(
      this.renderOutputWidth,
      this.renderOutputHeight,
      width,
      height
    );
    if (!this.renderTransparent) {
      context.fillStyle = this.renderBackground;
      context.fillRect(
        outputFrame.x,
        outputFrame.y,
        outputFrame.width,
        outputFrame.height
      );
    }
    const fitted = fitRect(
      image.width,
      image.height,
      outputFrame.width,
      outputFrame.height
    );
    context.imageSmoothingEnabled = this.renderUpscale !== 'nearest';
    context.drawImage(
      source,
      outputFrame.x + fitted.x,
      outputFrame.y + fitted.y,
      fitted.width,
      fitted.height
    );
  }

  /** Update the active camera from the current navigation view. */
  setActiveCameraFromView(): void {
    const camera = this.getActiveCamera();
    if (!camera) {
      return;
    }
    const view = this.renderer.captureCameraView();
    this.renderCameraView = false;
    this.updateCamera(camera.id, {
      position: view.position,
      target: view.target,
      fov: view.fov
    });
  }

  /** Render a deterministic PNG frame sequence over the render range. */
  async renderFrames(): Promise<void> {
    if (this.renderBusy) {
      return;
    }
    const camera = this.getActiveCamera();
    if (!camera) {
      this.projectError = 'Add a camera before rendering.';
      this.notify('warning', 'Render unavailable', 'Add a camera before rendering.');
      this.publish();
      return;
    }
    const start = Math.min(this.renderStartFrame, this.renderEndFrame);
    const end = Math.max(this.renderStartFrame, this.renderEndFrame);
    if (end - start + 1 > 1200) {
      this.projectError = 'The frame sequence is limited to 1200 frames.';
      this.notify('warning', 'Frame sequence limited', 'The maximum is 1200 frames.');
      this.publish();
      return;
    }
    this.renderBusy = true;
    this.projectError = null;
    this.pauseAnimation();
    const originalFrame = this.animationFrame;
    this.publish();
    const frames: { name: string; bytes: Uint8Array }[] = [];
    try {
      const base = (this.projectName || 'render')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'render';
      for (let frame = start; frame <= end; frame += 1) {
        this.setAnimationFrame(frame);
        const view = this.activeCameraRenderPose();
        if (!view) {
          throw new Error('The active render camera is unavailable.');
        }
        const image = this.renderer.renderStill({
          width: this.renderVirtualWidth,
          height: this.renderVirtualHeight,
          shading: this.renderShading,
          camera: view,
          transparent: this.renderTransparent,
          backgroundColor: this.renderBackground
        });
        const canvas = upscaleRenderImage(
          image,
          this.renderOutputWidth,
          this.renderOutputHeight,
          this.renderUpscale,
          {
            transparent: this.renderTransparent,
            background: this.renderBackground
          }
        );
        frames.push({
          name: `${base}_${String(frame - start).padStart(4, '0')}.png`,
          bytes: await canvasToPng(canvas)
        });
      }
      const saved = await saveFrameSequence(frames, `${base}-frames.zip`);
      if (saved) {
        this.notify(
          'success',
          'Frame sequence exported',
          `${frames.length} PNG frame${frames.length === 1 ? '' : 's'}`
        );
      }
    } catch (error) {
      const message = this.errorMessage(error);
      this.projectError = message;
      this.notify('error', 'Frame export failed', message);
    } finally {
      this.setAnimationFrame(originalFrame);
      this.renderBusy = false;
      this.publish();
    }
  }

  /** Encode the render range to WebM or MP4 through the platform recorder. */
  async renderVideo(): Promise<void> {
    if (this.renderBusy) {
      return;
    }
    const camera = this.getActiveCamera();
    if (!camera) {
      this.projectError = 'Add a camera before rendering.';
      this.notify('warning', 'Render unavailable', 'Add a camera before rendering.');
      this.publish();
      return;
    }
    const format = this.renderKind === 'mp4' ? 'mp4' : 'webm';
    const mime = videoMimeFor(format);
    if (!mime) {
      this.projectError = `${videoLabel(format)} recording is not supported by this WebView. Use a PNG frame sequence instead.`;
      this.notify(
        'warning',
        `${videoLabel(format)} unavailable`,
        'Use a PNG frame sequence in this WebView.'
      );
      this.publish();
      return;
    }
    const start = Math.min(this.renderStartFrame, this.renderEndFrame);
    const end = Math.max(this.renderStartFrame, this.renderEndFrame);
    if (end - start + 1 > 1200) {
      this.projectError = 'The video is limited to 1200 frames.';
      this.notify('warning', 'Video limited', 'The maximum is 1200 frames.');
      this.publish();
      return;
    }
    this.renderBusy = true;
    this.projectError = null;
    this.pauseAnimation();
    const originalFrame = this.animationFrame;
    this.publish();
    const output = document.createElement('canvas');
    output.width = this.renderOutputWidth;
    output.height = this.renderOutputHeight;
    const context = output.getContext('2d');
    if (!context) {
      this.projectError = 'The video canvas could not be created.';
      this.renderBusy = false;
      this.publish();
      return;
    }
    try {
      const fps = Math.max(1, this.document.animation.fps);
      // A zero-rate stream plus an explicit requestFrame() after every drawn
      // frame is more reliable than the timer-driven captureStream(fps) path,
      // especially in WKWebView and headless Chromium.
      const stream = output.captureStream(0);
      const track = stream.getVideoTracks()[0] as
        | CanvasCaptureMediaStreamTrack
        | undefined;
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 8_000_000
      });
      const chunks: Blob[] = [];
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      });
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.addEventListener('stop', () => resolve());
        recorder.addEventListener('error', () =>
          reject(new Error('The video recorder failed.'))
        );
      });
      recorder.start(250);
      for (let frame = start; frame <= end; frame += 1) {
        this.setAnimationFrame(frame);
        const image = this.renderer.renderStill({
          width: this.renderVirtualWidth,
          height: this.renderVirtualHeight,
          shading: this.renderShading,
          camera: {
            position: camera.position,
            target: camera.target,
            fov: camera.fov
          },
          transparent: false,
          backgroundColor: this.renderBackground
        });
        const frameCanvas = upscaleRenderImage(
          image,
          this.renderOutputWidth,
          this.renderOutputHeight,
          this.renderUpscale,
          {
            transparent: this.renderTransparent,
            background: this.renderBackground
          }
        );
        context.drawImage(frameCanvas, 0, 0);
        track?.requestFrame();
        await new Promise((resolve) =>
          window.setTimeout(resolve, 1000 / fps)
        );
      }
      recorder.stop();
      await stopped;
      const bytes = new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer());
      const base = (this.projectName || 'render')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'render';
      const saved = await saveBinaryFile(
        bytes,
        `${base}.${videoExtension(format)}`,
        videoExtension(format),
        `${videoLabel(format)} video`
      );
      if (saved) {
        this.notify(
          'success',
          `${videoLabel(format)} exported`,
          `${end - start + 1} frames`
        );
      }
    } catch (error) {
      const message = this.errorMessage(error);
      this.projectError = message;
      this.notify('error', 'Video export failed', message);
    } finally {
      this.setAnimationFrame(originalFrame);
      this.renderBusy = false;
      this.publish();
    }
  }

  /** Import a Wavefront OBJ as one undoable scene transaction. */
  async importObj(): Promise<void> {
    if (this.fileBusy) {
      return;
    }
    this.fileBusy = true;
    this.projectError = null;
    this.publish();
    try {
      const file = await openModelFile(['obj'], 'Wavefront OBJ');
      if (!file) {
        return;
      }
      const text = new TextDecoder().decode(file.bytes);
      const nodes = importObjNodes(text, '', { upAxis: 'y', scale: 1 });
      const start = this.document.nodes.length;
      const commands = nodes.map(
        (node, index) =>
          new CreateMeshNodeCommand(this.document, node, start + index)
      );
      this.history.execute(
        new CompositeCommand('Import OBJ', commands)
      );
      this.activeGroupId = null;
      this.activeNodeId = nodes[0]?.id ?? this.activeNodeId;
      this.selectedNodeIds.clear();
      if (this.activeNodeId) {
        this.selectedNodeIds.add(this.activeNodeId);
      }
      this.selection.setContext(this.activeNodeId, 'vertex');
      this.renderer.frameActiveNode();
      this.notify(
        'success',
        'OBJ imported',
        `${nodes.length} object${nodes.length === 1 ? '' : 's'}`
      );
      this.publish();
    } catch (error) {
      const message = this.errorMessage(error);
      this.projectError = message;
      this.notify('error', 'OBJ import failed', message);
    } finally {
      this.fileBusy = false;
      this.publish();
    }
  }

  /** Import a binary glTF as one undoable scene transaction. */
  async importGlb(): Promise<void> {
    if (this.fileBusy) {
      return;
    }
    this.fileBusy = true;
    this.projectError = null;
    this.publish();
    try {
      const file = await openModelFile(['glb'], 'Binary glTF');
      if (!file) {
        return;
      }
      const buffer = file.bytes.buffer.slice(
        file.bytes.byteOffset,
        file.bytes.byteOffset + file.bytes.byteLength
      ) as ArrayBuffer;
      const imported = await importGlb(buffer, this.document.animation.fps);
      const nodes = imported.nodes;
      const start = this.document.nodes.length;
      const commands: import('./commands/EditorCommand').EditorCommand[] =
        nodes.map(
          (node, index) =>
            new CreateMeshNodeCommand(this.document, node, start + index)
        );
      if (imported.clips.length > 0) {
        const animation = this.document.animation;
        const beforeAnimation = animation.snapshot();
        const afterAnimation = {
          ...beforeAnimation,
          clips: [...(beforeAnimation.clips ?? []), ...imported.clips],
          activeClipId: imported.clips[0].id
        };
        commands.push(
          new SetAnimationCommand(
            animation,
            beforeAnimation,
            afterAnimation,
            'Import GLB animation'
          )
        );
      }
      this.history.execute(new CompositeCommand('Import GLB', commands));
      if (imported.clips.length > 0) {
        this.animationFrame = this.document.animation.startFrame;
        this.applyAnimationPose();
      }
      this.activeGroupId = null;
      this.activeNodeId = nodes[0]?.id ?? this.activeNodeId;
      this.selectedNodeIds.clear();
      if (this.activeNodeId) {
        this.selectedNodeIds.add(this.activeNodeId);
      }
      this.selection.setContext(this.activeNodeId, 'vertex');
      this.renderer.frameActiveNode();
      this.notify(
        'success',
        'GLB imported',
        `${nodes.length} object${nodes.length === 1 ? '' : 's'}${imported.clips.length > 0 ? ` · ${imported.clips.length} animation clip${imported.clips.length === 1 ? '' : 's'}` : ''}`
      );
      this.publish();
    } catch (error) {
      const message = this.errorMessage(error);
      this.projectError = message;
      this.notify('error', 'GLB import failed', message);
    } finally {
      this.fileBusy = false;
      this.publish();
    }
  }

  /** Export visible objects as a triangulated binary GLB. */
  async exportGlb(): Promise<void> {
    if (this.fileBusy) {
      return;
    }
    this.fileBusy = true;
    this.projectError = null;
    this.publish();
    try {
      const base = this.exportBaseName(this.projectName);
      const textures = await this.exportTextureFiles(
        this.document.nodes,
        base
      );
      const exportableClips = this.document.animation.clips.filter(
        (clip) =>
          clip.tracks.length > 0 ||
          clip.weightTracks.length > 0 ||
          clip.meshTracks.length > 0
      ).length;
      const bytes = await exportGlb(
        this.document.nodes,
        this.document.groups,
        textures,
        {
          clips: this.document.animation.clips,
          fps: this.document.animation.fps
        }
      );
      const saved = await saveBinaryFile(
        bytes,
        `${base}.glb`,
        'glb',
        'Binary glTF'
      );
      if (saved) {
        this.notify(
          'success',
          'GLB exported',
          `${base}.glb${exportableClips > 0 ? ` · ${exportableClips} clip${exportableClips === 1 ? '' : 's'}` : ''}${textures.size > 0 ? ` · ${textures.size} embedded texture${textures.size === 1 ? '' : 's'}` : ''}`
        );
      }
    } catch (error) {
      const message = this.errorMessage(error);
      this.projectError = message;
      this.notify('error', 'GLB export failed', message);
    } finally {
      this.fileBusy = false;
      this.publish();
    }
  }

  /** Export the active object or scene as OBJ/MTL, optionally with textures. */
  async exportObj(
    scope: 'active' | 'scene' = 'scene',
    includeTextures = false
  ): Promise<void> {
    if (this.fileBusy) {
      return;
    }
    const active = this.getActiveNode();
    const requested =
      scope === 'active'
        ? active
          ? [active]
          : []
        : this.document.nodes;
    if (requested.length === 0 || requested.every((node) => !node.visible)) {
      this.projectError =
        scope === 'active'
          ? 'Select a visible object before exporting.'
          : 'There are no visible objects to export.';
      this.notify('warning', 'Nothing to export', this.projectError);
      this.publish();
      return;
    }
    this.fileBusy = true;
    this.projectError = null;
    this.publish();
    try {
      const base = this.exportBaseName(
        scope === 'active' ? active?.name : this.projectName
      );
      const textures = includeTextures
        ? await this.exportTextureFiles(requested, base)
        : new Map<string, ObjTextureFile>();
      const result = exportObj(requested, this.document.groups, {
        upAxis: 'y',
        mtlName: `${base}.mtl`,
        includeTextures,
        textures
      });
      const saved = await saveFrameSequence(
        [
          { name: `${base}.obj`, bytes: new TextEncoder().encode(result.obj) },
          { name: `${base}.mtl`, bytes: new TextEncoder().encode(result.mtl) },
          ...result.textures.map((texture) => ({
            name: texture.name,
            bytes: texture.bytes
          }))
        ],
        `${base}-obj.zip`
      );
      if (saved) {
        this.notify(
          'success',
          'OBJ exported',
          `${requested.length} object${requested.length === 1 ? '' : 's'}${result.textures.length > 0 ? ` · ${result.textures.length} PNG` : ''}`
        );
      }
    } catch (error) {
      const message = this.errorMessage(error);
      this.projectError = message;
      this.notify('error', 'OBJ export failed', message);
    } finally {
      this.fileBusy = false;
      this.publish();
    }
  }

  /** Export selected animation frames as a shared-MTL OBJ sequence. */
  async exportObjFrames(options: ObjFrameExportOptions): Promise<void> {
    if (this.fileBusy || this.meshPoseEdit || this.shapeEdit) {
      return;
    }
    const animation = this.document.animation;
    const clip = animation.getClip(options.clipId) ?? animation.activeClip;
    const scope: ObjExportScope = options.scope;
    const active = this.getActiveNode();
    const requested =
      scope === 'active'
        ? active
          ? [active]
          : []
        : this.document.nodes;
    if (requested.length === 0 || requested.every((node) => !node.visible)) {
      this.notify(
        'warning',
        'Nothing to export',
        scope === 'active'
          ? 'Select a visible object before exporting.'
          : 'There are no visible objects to export.'
      );
      return;
    }
    const frames = animationExportFrames(clip, {
      startFrame: options.startFrame,
      endFrame: options.endFrame,
      step: options.step,
      keyedOnly: options.keyedOnly
    });
    if (frames.length === 0) {
      this.notify(
        'warning',
        'No frames to export',
        options.keyedOnly
          ? 'The selected range has no keyed frames.'
          : 'Choose a valid frame range.'
      );
      return;
    }
    if (frames.length > MAX_OBJ_FRAME_EXPORT) {
      this.notify(
        'warning',
        'Too many frames',
        `OBJ frame export is limited to ${MAX_OBJ_FRAME_EXPORT} frames.`
      );
      return;
    }

    const previousClipId = animation.activeClipId;
    const previousFrame = this.animationFrame;
    const restorePose =
      this.workspace === 'animation' || this.workspace === 'render';
    this.fileBusy = true;
    this.projectError = null;
    this.pauseAnimation();
    this.publish();
    try {
      const base = this.exportBaseName(
        scope === 'active' ? active?.name : this.projectName
      );
      const mtlName = `${base}.mtl`;
      const textures = options.includeTextures
        ? await this.exportTextureFiles(requested, base)
        : new Map<string, ObjTextureFile>();
      const includeTextures = textures.size > 0;
      const files: { name: string; bytes: Uint8Array }[] = [];
      let mtlWritten = false;
      animation.setActiveClip(clip.id);
      for (const frame of frames) {
        this.setAnimationFrame(frame);
        const result = exportObj(requested, this.document.groups, {
          upAxis: 'y',
          mtlName,
          includeTextures,
          textures,
          pose: this.animationPose
        });
        if (!mtlWritten) {
          files.push({
            name: mtlName,
            bytes: new TextEncoder().encode(result.mtl)
          });
          for (const texture of result.textures) {
            files.push({ name: texture.name, bytes: texture.bytes });
          }
          mtlWritten = true;
        }
        files.push({
          name: `${base}_${String(frame).padStart(4, '0')}.obj`,
          bytes: new TextEncoder().encode(result.obj)
        });
      }
      const saved = await saveFrameSequence(
        files,
        `${base}-obj-frames.zip`
      );
      if (saved) {
        this.notify(
          'success',
          'OBJ frames exported',
          `${frames.length} frame${frames.length === 1 ? '' : 's'} · shared MTL${includeTextures ? ' + PNG' : ''}`
        );
      }
    } catch (error) {
      const message = this.errorMessage(error);
      this.projectError = message;
      this.notify('error', 'OBJ frame export failed', message);
    } finally {
      animation.setActiveClip(previousClipId);
      this.animationFrame = previousFrame;
      if (restorePose) {
        this.applyAnimationPose();
      } else {
        this.clearAnimationPose();
      }
      this.fileBusy = false;
      this.publish();
    }
  }

  /** Sanitize a project or object name for export file names. */
  private exportBaseName(value: string | null | undefined): string {
    return (
      (value || 'loupoli')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'loupoli'
    );
  }

  /** Encode the assigned composite textures as PNG files for OBJ. */
  private async exportTextureFiles(
    nodes: readonly MeshNode[],
    base: string
  ): Promise<Map<string, ObjTextureFile>> {
    const files = new Map<string, ObjTextureFile>();
    const usedNames = new Set<string>();
    for (const node of nodes) {
      if (!node.textureId || files.has(node.textureId)) {
        continue;
      }
      const asset = this.textureLibrary.get(node.textureId);
      if (!asset) {
        continue;
      }
      const blob = await new Promise<Blob | null>((resolve) => {
        asset.image.toBlob(resolve, 'image/png');
      });
      if (!blob) {
        throw new Error(`Could not encode texture "${asset.name}" as PNG.`);
      }
      const assetBase =
        asset.name
          .replace(/[^a-z0-9_-]+/gi, '-')
          .replace(/^-+|-+$/g, '') || 'texture';
      let name = `${base}-${assetBase}.png`;
      let suffix = 2;
      while (usedNames.has(name)) {
        name = `${base}-${assetBase}-${suffix}.png`;
        suffix += 1;
      }
      usedNames.add(name);
      files.set(node.textureId, {
        name,
        bytes: new Uint8Array(await blob.arrayBuffer())
      });
    }
    return files;
  }

  private cloneShapeKeys(node: MeshNode) {
    return node.shapeKeys.map((key) => ({
      ...key,
      targetPositions: key.targetPositions.slice()
    }));
  }

  /** Rename one shape key as an undoable list edit. */
  renameShapeKey(id: string, name: string): void {
    const node = this.getActiveNode();
    if (!node || !node.shapeKeys.some((key) => key.id === id)) {
      return;
    }
    const before = this.cloneShapeKeys(node);
    node.renameShapeKey(id, name);
    this.history.execute(
      new SetShapeKeysCommand(node, before, node.shapeKeys, 'Rename shape key')
    );
    this.publish();
  }

  /** Toggle one shape key's visibility without changing its weight. */
  setShapeKeyVisible(id: string, visible: boolean): void {
    const node = this.getActiveNode();
    if (!node || !node.shapeKeys.some((key) => key.id === id)) {
      return;
    }
    const before = this.cloneShapeKeys(node);
    node.setShapeKeyVisible(id, visible);
    this.history.execute(
      new SetShapeKeysCommand(
        node,
        before,
        node.shapeKeys,
        visible ? 'Show shape key' : 'Hide shape key'
      )
    );
    this.publish();
  }

  /** Reorder one shape key in the list as an undoable edit. */
  reorderShapeKeys(sourceId: string, targetId: string, after: boolean): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const before = this.cloneShapeKeys(node);
    node.reorderShapeKeys(sourceId, targetId, after);
    this.history.execute(
      new SetShapeKeysCommand(node, before, node.shapeKeys, 'Reorder shape keys')
    );
    this.publish();
  }

  /** Add an identity shape key to the active object. */
  addShapeKey(): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const before = this.cloneShapeKeys(node);
    const key = node.addShapeKey();
    this.activeShapeKeyId = key.id;
    this.history.execute(
      new SetShapeKeysCommand(node, before, node.shapeKeys, `Add ${key.name}`)
    );
    this.publish();
  }

  /** Select one shape key for the contextual controls. */
  selectShapeKey(id: string): void {
    const node = this.getActiveNode();
    if (!node?.shapeKeys.some((key) => key.id === id)) {
      return;
    }
    this.activeShapeKeyId = id;
    this.publish();
  }

  /** Remove one shape key from the active object. */
  removeShapeKey(id: string): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const before = this.cloneShapeKeys(node);
    node.removeShapeKey(id);
    this.history.execute(
      new SetShapeKeysCommand(node, before, node.shapeKeys, 'Remove shape key')
    );
    if (this.activeShapeKeyId === id) {
      this.activeShapeKeyId = node.shapeKeys[0]?.id ?? null;
    }
    const track = this.document.animation.getWeightTrack(node.id, id);
    if (track) {
      const animationBefore = this.document.animation.snapshot();
      this.document.animation.removeWeightTrack(node.id, id);
      this.history.execute(
        new SetAnimationCommand(
          this.document.animation,
          animationBefore,
          this.document.animation.snapshot(),
          'Remove shape-weight track'
        )
      );
    }
    this.applyAnimationPose();
  }

  /** Change one shape-key weight. */
  setShapeKeyWeight(id: string, weight: number): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const before = this.cloneShapeKeys(node);
    node.setShapeKeyWeight(id, weight);
    this.history.execute(
      new SetShapeKeysCommand(node, before, node.shapeKeys, 'Shape key weight')
    );
    if (this.workspace === 'animation') {
      const track = this.document.animation.getWeightTrack(node.id, id);
      if (track) {
        const animationBefore = this.document.animation.snapshot();
        track.setKey(
          Math.round(this.animationFrame),
          weight,
          this.animationInterpolation
        );
        this.history.execute(
          new SetAnimationCommand(
            this.document.animation,
            animationBefore,
            this.document.animation.snapshot(),
            'Shape key weight'
          )
        );
      }
      this.applyAnimationPose();
    } else {
      this.publish();
    }
  }

  /** Enter a live, transactional edit session for one captured shape key. */
  beginShapeEdit(id: string): void {
    if (this.shapeEdit) {
      return;
    }
    const node = this.getActiveNode();
    const key = node?.shapeKeys.find((item) => item.id === id);
    if (!node || !key) {
      return;
    }
    this.activeShapeKeyId = id;
    const beforeKeys = this.cloneShapeKeys(node);
    const baseMesh = node.mesh;
    node.mesh = baseMesh.withPositions(key.targetPositions);
    node.setShapeWeightOverrides(
      new Map(node.shapeKeys.map((item) => [item.id, 0]))
    );
    this.shapeEdit = { node, keyId: id, baseMesh, beforeKeys };
    this.history.suspend();
    this.autosave.pause();
    this.syncScene();
    this.publish();
  }

  /** Commit the live shape edit as one undoable capture. */
  finishShapeEdit(): void {
    const session = this.shapeEdit;
    if (!session) {
      return;
    }
    const edited = session.node.mesh.positions.slice();
    const afterKeys = session.beforeKeys.map((key) =>
      key.id === session.keyId
        ? { ...key, targetPositions: edited }
        : { ...key, targetPositions: key.targetPositions.slice() }
    );
    session.node.mesh = session.baseMesh;
    session.node.setShapeKeys(session.beforeKeys);
    session.node.setShapeWeightOverrides(null);
    this.shapeEdit = null;
    this.history.resume();
    this.history.execute(
      new CaptureShapeKeyCommand(
        session.node,
        session.baseMesh,
        session.baseMesh,
        session.beforeKeys,
        afterKeys
      )
    );
    void this.autosave.resume();
    if (this.workspace === 'animation') {
      this.applyAnimationPose();
    } else {
      this.syncScene();
    }
  }

  /** Abort a live shape edit and restore the original target/base. */
  cancelShapeEdit(): void {
    const session = this.shapeEdit;
    if (!session) {
      return;
    }
    session.node.mesh = session.baseMesh;
    session.node.setShapeKeys(session.beforeKeys);
    session.node.setShapeWeightOverrides(null);
    this.shapeEdit = null;
    this.history.resume();
    void this.autosave.resume();
    if (this.workspace === 'animation') {
      this.applyAnimationPose();
    } else {
      this.syncScene();
    }
  }

  /** Capture the edited base mesh into a key and restore the source base. */
  captureShapeKeyFromMesh(id: string): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const beforeKeys = this.cloneShapeKeys(node);
    const beforeMesh = node.mesh;
    node.captureShapeKeyFromMesh(id);
    const afterMesh = node.mesh;
    this.history.execute(
      new CaptureShapeKeyCommand(
        node,
        beforeMesh,
        afterMesh,
        beforeKeys,
        node.shapeKeys
      )
    );
    this.publish();
  }

  /** Capture the current base mesh into a shape key. */
  updateShapeKeyFromMesh(id: string): void {
    const node = this.getActiveNode();
    if (!node) {
      return;
    }
    const before = this.cloneShapeKeys(node);
    node.updateShapeKeyFromMesh(id);
    this.history.execute(
      new SetShapeKeysCommand(node, before, node.shapeKeys, 'Update shape key')
    );
    this.publish();
  }

  /** Dismiss the bake-atlas confirmation without changing the scene. */
  dismissBakeAtlasPrompt(): void {
    if (this.bakeAtlasPrompt === null) {
      return;
    }
    this.bakeAtlasPrompt = null;
    this.publish();
  }

  /**
   * Create a hidden-source duplicate with a unique bake atlas.
   *
   * The original object and texture remain untouched. Every layer is resampled
   * into a larger unique UV layout, then the copy is baked immediately.
   */
  async prepareBakeAtlas(): Promise<void> {
    if (this.bakeBusy) {
      return;
    }
    const prompt = this.bakeAtlasPrompt;
    const node = prompt
      ? this.document.getNode(prompt.nodeId)
      : this.getActiveNode();
    if (!node) {
      this.projectError = 'Select an object before preparing a bake atlas.';
      this.bakeAtlasPrompt = null;
      this.publish();
      return;
    }
    const source = this.textureLibrary.get(node.textureId);
    if (!source) {
      this.projectError = 'Assign a texture to the object before preparing a bake atlas.';
      this.bakeAtlasPrompt = null;
      this.publish();
      return;
    }
    const target = bakeAtlasTargetSize(source.width, source.height);
    this.bakeBusy = true;
    this.bakeAtlasPrompt = null;
    this.projectError = null;
    this.publish();
    let asset: TextureAsset | null = null;
    let inserted = false;
    let shouldBake = false;
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (source.layerCount >= 8 && source.lightingLayerId() === null) {
        throw new Error(
          'This texture already has eight layers. Remove a layer before creating a bake atlas.'
        );
      }
      const plan = buildBakeAtlasPlan(
        node.mesh,
        target.width,
        target.height
      );
      if (!plan) {
        throw new Error(
          'The UV charts could not be packed into a unique atlas at the supported texture size.'
        );
      }
      const data = await source.exportData();
      const resampled = await resampleTextureDataForBakeAtlas(
        data,
        plan,
        source.textureFilter
      );
      asset = this.textureLibrary.build(
        plan.width,
        plan.height,
        `${source.name} Bake`.slice(0, 64),
        source.textureFilter
      );
      await asset.importData(resampled);
      asset.setAlphaMode(source.textureAlphaMode);

      const mesh = node.mesh.withPositions(node.mesh.positions);
      mesh.setAllCornerUvs(plan.uvs);
      const bakeNode = new MeshNode(
        mesh,
        node.primitive,
        `${node.name} Bake`.slice(0, 64),
        undefined,
        asset.id,
        node.materialPalette
      );
      bakeNode.setTransform(node.transform);
      bakeNode.parentId = node.parentId;
      bakeNode.visible = true;
      bakeNode.setModifiers(node.modifiers);
      bakeNode.setShapeKeys(
        node.shapeKeys.map((key) => ({
          ...key,
          targetPositions: key.targetPositions.slice()
        }))
      );
      bakeNode.shapeBasePositions = node.shapeBasePositions?.slice() ?? null;
      if (hasUvOverlap(bakeNode.getEvaluatedMesh().mesh)) {
        throw new Error(
          'The repacked atlas still contains overlapping UV faces. The object needs different seams before baking.'
        );
      }
      const index = this.document.nodes.indexOf(node);
      const commands: import('./commands/EditorCommand').EditorCommand[] = [
        new CreateTextureAssetCommand(this.textureLibrary, asset),
        new CreateMeshNodeCommand(this.document, bakeNode, index + 1)
      ];
      if (node.visible) {
        commands.push(new SetNodeVisibilityCommand(node, false));
      }
      this.history.execute(
        new CompositeCommand('Prepare bake atlas', commands)
      );
      inserted = true;
      this.activeGroupId = null;
      this.activeNodeId = bakeNode.id;
      this.selectedNodeIds.clear();
      this.selectedNodeIds.add(bakeNode.id);
      this.selection.clear();
      this.selection.setContext(bakeNode.id, this.selection.mode);
      this.textureLibrary.setActive(asset.id);
      this.uvSelection.clear();
      this.uvPins.clear();
      this.uvRevision += 1;
      this.renderer.refreshTexture();
      this.syncScene();
      this.publish();
      shouldBake = true;
      this.notify(
        'info',
        'Bake copy ready',
        `${plan.width}×${plan.height} · Baking lighting`
      );
    } catch (error) {
      if (!inserted) {
        asset?.dispose();
      }
      const message = this.errorMessage(error);
      this.projectError = message;
      this.notify('error', 'Bake atlas failed', message);
    } finally {
      this.bakeBusy = false;
      this.publish();
    }
    if (shouldBake) {
      await this.bakeLighting();
    }
  }

  /** Bake direct lights into the active object's texture lighting layer. */
  async bakeLighting(): Promise<void> {
    if (this.bakeBusy) {
      return;
    }
    const node = this.getActiveNode();
    if (!node) {
      this.projectError = 'Select an object before baking lighting.';
      this.publish();
      return;
    }
    const source = this.textureLibrary.get(node.textureId);
    if (!source) {
      this.projectError = 'Assign a texture to the active object before baking lighting.';
      this.publish();
      return;
    }
    const bakeMesh = node.getEvaluatedMesh().mesh;
    const coverage = uvCoverage(bakeMesh);
    if (hasUvOverlap(bakeMesh)) {
      if (source.layerCount >= 8 && source.lightingLayerId() === null) {
        this.projectError =
          'This texture already has eight layers. Remove a layer before baking or preparing a bake atlas.';
        this.publish();
        return;
      }
      const target = bakeAtlasTargetSize(source.width, source.height);
      const plan = buildBakeAtlasPlan(bakeMesh, target.width, target.height);
      if (!plan) {
        this.projectError =
          'The UV layers could not be packed into a bake atlas at the supported texture size.';
        this.publish();
        return;
      }
      this.bakeAtlasPrompt = {
        nodeId: node.id,
        nodeName: node.name,
        textureName: source.name,
        fromWidth: source.width,
        fromHeight: source.height,
        targetWidth: plan.width,
        targetHeight: plan.height,
        layerCount: source.layerCount,
        chartCount: plan.charts.length,
        estimatedBytes:
          plan.width * plan.height * 4 * Math.max(1, source.layerCount)
      };
      this.projectError = null;
      this.publish();
      return;
    }
    if (coverage < 1e-6) {
      this.projectError = 'The object has no UV-covered surface to bake.';
      this.publish();
      return;
    }
    const shared = this.document.nodes.filter(
      (item) => item.textureId === source.id
    ).length > 1;
    if (source.layerCount >= 8 && source.lightingLayerId() === null) {
      this.projectError = 'The texture layer limit prevents adding a baked lighting layer.';
      this.publish();
      return;
    }
    this.bakeBusy = true;
    this.projectError = null;
    this.publish();
    let copy: TextureAsset | null = null;
    try {
      // Yield one frame so the busy state can paint before CPU rasterization.
      await new Promise((resolve) => setTimeout(resolve, 0));
      let target = source;
      if (shared) {
        copy = this.textureLibrary.build(
          source.width,
          source.height,
          `${source.name} Baked`,
          source.textureFilter
        );
        await copy.importData(await source.exportData());
        copy.setFilter(source.textureFilter);
        copy.setAlphaMode(source.textureAlphaMode);
        if (copy.layerCount >= 8 && copy.lightingLayerId() === null) {
          copy.dispose();
          copy = null;
          throw new Error('The copied texture has no free layer for baked lighting.');
        }
        target = copy;
      }
      const existingLayerId = target.lightingLayerId();
      const before = existingLayerId
        ? target.getLayerPixels(existingLayerId)
        : null;
      const after = bakeLighting({
        mesh: bakeMesh,
        node,
        parent: this.document.getGroup(node.parentId) ?? null,
        lights: this.document.lightSummaries(),
        ambientColor: this.document.ambientColor,
        ambientIntensity: this.document.ambientIntensity,
        width: target.width,
        height: target.height,
        occluders: this.bakeOccluders(),
        shadowSamples: 16
      });
      if (!after) {
        throw new Error('The object has no UV-covered surface to bake.');
      }
      const commands: import('./commands/EditorCommand').EditorCommand[] = [];
      if (copy) {
        commands.push(new CreateTextureAssetCommand(this.textureLibrary, copy));
        commands.push(new AssignTextureCommand([node], copy.id));
      }
      commands.push(
        new BakeLightingCommand(target, existingLayerId, before, after)
      );
      const bakeCommand =
        commands.length === 1
          ? commands[0]
          : new CompositeCommand('Bake lighting', commands);
      this.history.execute(
        new WithShadingCommand(
          bakeCommand,
          (mode) => this.setShadingMode(mode),
          this.shading,
          'unlit'
        )
      );
      this.textureLibrary.setActive(target.id);
      this.autosave.markTextureDirty();
      this.renderer.refreshTexture();
      this.publish();
      this.notify(
        'success',
        'Lighting baked',
        `${target.width}×${target.height} · Baked lighting`
      );
    } catch (error) {
      copy?.dispose();
      this.projectError = this.errorMessage(error);
    } finally {
      this.bakeBusy = false;
      this.publish();
    }
  }

  /** Delete the selected light and choose a deterministic fallback. */
  deleteActiveLight(): void {
    const light = this.getActiveLight();
    if (!light) {
      return;
    }
    const index = this.document.lights.indexOf(light);
    const fallback =
      this.document.lights[index + 1] ??
      this.document.lights[index - 1] ??
      null;
    this.history.execute(new DeleteLightCommand(this.document, light, index));
    this.activeLightId = fallback?.id ?? null;
    this.publish();
  }

  /** Toggle one light's visibility without changing selection. */
  setLightEnabled(id: string, enabled: boolean): void {
    this.updateLight(id, { enabled });
  }

  /** Edit one light as a single undoable command. */
  updateLight(
    id: string,
    patch: Partial<
      Pick<
        LightSnapshot,
        'name' | 'color' | 'intensity' | 'enabled' | 'castShadows' | 'shadowSoftness' | 'position' | 'direction'
      >
    >
  ): void {
    const light = this.document.getLight(id);
    if (!light) {
      return;
    }
    const before = light.snapshot();
    const baseAfter: LightSnapshot = {
      ...before,
      ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 64) } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.castShadows !== undefined ? { castShadows: patch.castShadows } : {}),
      ...(patch.shadowSoftness !== undefined
        ? { shadowSoftness: Math.max(0, Math.min(1, patch.shadowSoftness)) }
        : {})
    };
    if (baseAfter.name.length === 0) {
      return;
    }
    if (JSON.stringify(before) !== JSON.stringify(baseAfter)) {
      this.history.execute(new UpdateLightCommand(light, before, baseAfter));
    }
    const posed =
      this.animationLightPose.get(light.id) ?? {
        position: [...before.position] as [number, number, number],
        direction: [...before.direction] as [number, number, number],
        intensity: before.intensity
      };
    if (
      patch.position !== undefined ||
      patch.direction !== undefined ||
      patch.intensity !== undefined
    ) {
      const nextPose: LightPose = {
        position:
          patch.position !== undefined
            ? ([...patch.position] as [number, number, number])
            : posed.position,
        direction:
          patch.direction !== undefined
            ? ([...patch.direction] as [number, number, number])
            : posed.direction,
        intensity:
          patch.intensity !== undefined
            ? Math.max(0, Math.min(20, patch.intensity))
            : posed.intensity
      };
      if (
        this.autoKeyLightPose(light, nextPose, {
          ...baseAfter,
          position: [...before.position] as [number, number, number],
          direction: [...before.direction] as [number, number, number],
          intensity: before.intensity
        })
      ) {
        return;
      }
      const after: LightSnapshot = {
        ...baseAfter,
        position: nextPose.position,
        direction: [...nextPose.direction] as [number, number, number],
        intensity: nextPose.intensity
      };
      if (JSON.stringify(baseAfter) !== JSON.stringify(after)) {
        this.history.execute(new UpdateLightCommand(light, baseAfter, after));
      } else {
        this.publish();
      }
      return;
    }
    if (JSON.stringify(before) === JSON.stringify(baseAfter)) {
      return;
    }
    this.publish();
  }

  /** Edit the selected light as one undoable command. */
  updateActiveLight(
    patch: Partial<
      Pick<
        LightSnapshot,
        'name' | 'color' | 'intensity' | 'enabled' | 'castShadows' | 'shadowSoftness' | 'position' | 'direction'
      >
    >
  ): void {
    if (this.activeLightId) {
      this.updateLight(this.activeLightId, patch);
    }
  }

  /** Set document ambient color. */
  setAmbientColor(color: string): void {
    if (!/^#[0-9a-fA-F]{6}$/.test(color) || color === this.document.ambientColor) {
      return;
    }
    this.setAmbientLighting({ color, intensity: this.document.ambientIntensity });
  }

  /** Set document ambient intensity. */
  setAmbientIntensity(intensity: number): void {
    if (!Number.isFinite(intensity) || intensity < 0) {
      return;
    }
    this.setAmbientLighting({
      color: this.document.ambientColor,
      intensity: Math.min(10, intensity)
    });
  }

  private setAmbientLighting(after: AmbientLightSnapshot): void {
    const before: AmbientLightSnapshot = {
      color: this.document.ambientColor,
      intensity: this.document.ambientIntensity
    };
    if (before.color === after.color && before.intensity === after.intensity) {
      return;
    }
    this.history.execute(new SetAmbientLightCommand(this.document, before, after));
    this.publish();
  }

  /** Select a group as the active transform target. */
  selectGroup(groupId: string): void {
    if (this.meshPoseEdit) {
      return;
    }
    const group = this.document.getGroup(groupId);
    if (!group) {
      return;
    }
    if (this.drag || this.gizmoDrag) {
      this.cancelToolPointer();
    }
    this.activeGroupId = group.id;
    this.activeNodeId = null;
    this.activeLightId = null;
    this.selectedNodeIds.clear();
    this.selection.clear();
    this.selection.setContext(null, this.selection.mode);
    this.axisLock = null;
    this.syncScene();
    this.publish();
  }

  /** Group all object-selected ungrouped mesh nodes under one transform. */
  groupSelectedNodes(): void {
    if (this.meshPoseEdit) {
      return;
    }
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
    if (this.meshPoseEdit && nodeId !== this.activeNodeId) {
      return;
    }
    if (!this.document.getNode(nodeId)) {
      return;
    }
    this.activeGroupId = null;
    this.activeLightId = null;

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
    if (this.meshPoseEdit) {
      return;
    }
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
    if (this.meshPoseEdit) {
      return;
    }
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
    if (this.meshPoseEdit) {
      return;
    }
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
    if (this.meshPoseEdit) {
      return;
    }
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
    if (this.meshPoseEdit) {
      return;
    }
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
    if (this.shapeEdit || this.meshPoseEdit) {
      return;
    }
    if (this.drag || this.gizmoDrag) {
      this.cancelToolPointer();
      return;
    }
    this.history.undo();
  }

  redo(): void {
    if (this.shapeEdit || this.meshPoseEdit) {
      return;
    }
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
      this.notify('success', 'Project recovered', this.projectName);
    } catch (error) {
      const message = this.errorMessage(error);
      this.projectError = message;
      this.notify('error', 'Recovery failed', message);
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
  /** Enable or pause background autosave without affecting manual saves. */
  setAutosaveEnabled(enabled: boolean): void {
    if (this.autosaveEnabled === enabled) {
      return;
    }
    this.autosaveEnabled = enabled;
    this.autosaveError = null;
    try {
      window.localStorage.setItem(AUTOSAVE_ENABLED_KEY, String(enabled));
    } catch {
      // UI preference only; autosave still works for this session.
    }
    this.autosave.setUserEnabled(enabled);
    if (!enabled) {
      this.autosaveStatus = 'unavailable';
    }
    this.publish();
  }

  async saveProject(): Promise<void> {
    if (this.meshPoseEdit) {
      this.notify(
        'warning',
        'Finish or cancel the mesh pose',
        'The temporary pose cannot be saved as the base mesh.'
      );
      return;
    }
    if (this.fileBusy) {
      return;
    }
    if (this.shapeEdit) {
      this.projectError = 'Finish or cancel shape editing before saving.';
      this.publish();
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
        `${this.projectName}.${PROJECT_EXTENSION}`
      );
      if (saved) {
        this.recovered = false;
        this.projectName = this.projectName || 'Untitled';
        await this.autosave.clear();
        const checkpoint = await this.makeCheckpoint();
        await this.autosave.start(checkpoint.bytes, checkpoint.settings);
        this.notify('success', 'Project saved', `${this.projectName}.${PROJECT_EXTENSION}`);
      }
    } catch (error) {
      const message = this.errorMessage(error);
      this.projectError = message;
      this.notify('error', 'Save failed', message);
    } finally {
      this.fileBusy = false;
      this.publish();
    }
  }

  /** Open a project through the platform adapter, replacing the scene on success. */
  async openProject(): Promise<void> {
    if (this.meshPoseEdit) {
      this.notify(
        'warning',
        'Finish or cancel the mesh pose',
        'Close the temporary pose before opening another project.'
      );
      return;
    }
    if (this.fileBusy) {
      return;
    }
    if (this.shapeEdit) {
      this.projectError = 'Finish or cancel shape editing before opening another project.';
      this.publish();
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
      const name = file.name.replace(/\.(lpoli|lpoly)$/i, '') || 'Untitled';
      this.applyLoadedDocument(decoded, name);
      await this.applyProjectTextures(decoded);
      this.recovered = false;
      this.recoveryAvailable = false;
      this.recoveryUpdatedAt = null;
      this.pendingRecovery = null;
      await this.autosave.clear();
      const checkpoint = await this.makeCheckpoint();
      await this.autosave.start(checkpoint.bytes, checkpoint.settings);
      this.notify('success', 'Project opened', name);
    } catch (error) {
      const message = this.errorMessage(error);
      this.projectError = message;
      this.notify('error', 'Open failed', message);
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

  /** Add a transient notification; the newest few remain visible. */
  notify(
    kind: ToastKind,
    message: string,
    detail?: string,
    timeoutMs = kind === 'error' ? 7000 : 4200
  ): void {
    const id = `toast-${++this.toastSequence}`;
    this.toasts = [...this.toasts, { id, kind, message, detail }].slice(-4);
    const timer = window.setTimeout(() => this.dismissToast(id), timeoutMs);
    this.toastTimers.set(id, timer);
    this.publish();
  }

  /** Dismiss one transient notification. */
  dismissToast(id: string): void {
    const timer = this.toastTimers.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.toastTimers.delete(id);
    }
    if (!this.toasts.some((toast) => toast.id === id)) {
      return;
    }
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
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
    for (const timer of this.toastTimers.values()) {
      window.clearTimeout(timer);
    }
    this.toastTimers.clear();
    this.input.dispose();
    this.history.dispose();
    this.autosave.dispose();
    this.renderer.dispose();
    this.textureLibrary.dispose();
    this.renderPreviewSource = null;
  }

  private getActiveNode(): MeshNode | null {
    return this.document.getNode(this.activeNodeId) ?? null;
  }

  private getActiveGroup(): SceneGroup | null {
    return this.document.getGroup(this.activeGroupId) ?? null;
  }

  private getActiveLight(): import('../scene/SceneLight').SceneLight | null {
    return this.document.getLight(this.activeLightId) ?? null;
  }

  private tapSelect(
    clientX: number,
    clientY: number,
    additive = false
  ): void {
    if (this.workspace === 'light') {
      const lightId = this.renderer.pickLight(clientX, clientY);
      if (lightId) {
        this.selectLight(lightId);
        return;
      }
    }
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

  private beginCameraDrag(sample: PointerSample): boolean {
    const targetId = this.renderer.pickCameraTarget(
      sample.clientX,
      sample.clientY
    );
    if (targetId) {
      const camera = this.document.getCamera(targetId);
      if (!camera) {
        return false;
      }
      this.selectCamera(camera.id);
      const baseBefore = camera.snapshot();
      const cameraPose = this.animationCameraPose.get(camera.id);
      if (cameraPose) {
        camera.apply({
          ...baseBefore,
          position: [...cameraPose.position] as [number, number, number],
          target: [...cameraPose.target] as [number, number, number],
          fov: cameraPose.fov
        });
      }
      const point = new Vector3(...camera.target);
      const plane = this.renderer.createCameraFacingPlane(point);
      if (
        !this.renderer.intersectPointerPlane(
          sample.clientX,
          sample.clientY,
          plane
        )
      ) {
        camera.apply(baseBefore);
        return false;
      }
      this.animationCameraPose.delete(camera.id);
      this.cameraTargetDrag = {
        pointerId: sample.pointerId,
        camera,
        before: camera.snapshot(),
        baseBefore,
        plane
      };
      return true;
    }
    const cameraId = this.renderer.pickCamera(
      sample.clientX,
      sample.clientY
    );
    if (!cameraId) {
      return false;
    }
    const camera = this.document.getCamera(cameraId);
    if (!camera) {
      return false;
    }
    this.selectCamera(camera.id);
    const baseBefore = camera.snapshot();
    const cameraPose = this.animationCameraPose.get(camera.id);
    if (cameraPose) {
      camera.apply({
        ...baseBefore,
        position: [...cameraPose.position] as [number, number, number],
        target: [...cameraPose.target] as [number, number, number],
        fov: cameraPose.fov
      });
    }
    const point = new Vector3(...camera.position);
    const plane = this.renderer.createCameraFacingPlane(point);
    const hit = this.renderer.intersectPointerPlane(
      sample.clientX,
      sample.clientY,
      plane
    );
    if (!hit) {
      camera.apply(baseBefore);
      return false;
    }
    this.animationCameraPose.delete(camera.id);
    this.cameraDrag = {
      pointerId: sample.pointerId,
      camera,
      before: camera.snapshot(),
      baseBefore,
      plane,
      offset: point.sub(hit)
    };
    return true;
  }

  private moveCameraTargetDrag(sample: PointerSample): void {
    const drag = this.cameraTargetDrag;
    if (!drag || drag.pointerId !== sample.pointerId) {
      return;
    }
    const hit = this.renderer.intersectPointerPlane(
      sample.clientX,
      sample.clientY,
      drag.plane
    );
    if (!hit) {
      return;
    }
    drag.camera.target = [hit.x, hit.y, hit.z];
    this.syncScene();
    this.publish();
  }

  private finishCameraTargetDrag(): void {
    const drag = this.cameraTargetDrag;
    if (!drag) {
      return;
    }
    this.cameraTargetDrag = null;
    const after = drag.camera.snapshot();
    if (JSON.stringify(drag.before) !== JSON.stringify(after)) {
      if (
        this.autoKeyCameraPose(
          drag.camera,
          {
            position: [...after.position] as [number, number, number],
            target: [...after.target] as [number, number, number],
            fov: after.fov
          },
          drag.baseBefore
        )
      ) {
        return;
      }
      this.history.execute(
        new UpdateCameraCommand(drag.camera, drag.baseBefore, after)
      );
    } else {
      drag.camera.apply(drag.baseBefore);
      this.applyAnimationPose();
    }
  }

  private moveCameraDrag(sample: PointerSample): void {
    const drag = this.cameraDrag;
    if (!drag || drag.pointerId !== sample.pointerId) {
      return;
    }
    const hit = this.renderer.intersectPointerPlane(
      sample.clientX,
      sample.clientY,
      drag.plane
    );
    if (!hit) {
      return;
    }
    hit.add(drag.offset);
    drag.camera.position = [hit.x, hit.y, hit.z];
    this.syncScene();
    this.publish();
  }

  private finishCameraDrag(): void {
    const drag = this.cameraDrag;
    if (!drag) {
      return;
    }
    this.cameraDrag = null;
    const after = drag.camera.snapshot();
    if (JSON.stringify(drag.before) !== JSON.stringify(after)) {
      if (
        this.autoKeyCameraPose(
          drag.camera,
          {
            position: [...after.position] as [number, number, number],
            target: [...after.target] as [number, number, number],
            fov: after.fov
          },
          drag.baseBefore
        )
      ) {
        return;
      }
      this.history.execute(
        new UpdateCameraCommand(drag.camera, drag.baseBefore, after)
      );
    } else {
      drag.camera.apply(drag.baseBefore);
      this.applyAnimationPose();
    }
  }

  private beginLightDrag(sample: PointerSample): boolean {
    const directionLightId = this.renderer.pickLightDirection(
      sample.clientX,
      sample.clientY
    );
    if (directionLightId) {
      return this.beginLightDirectionDrag(sample, directionLightId);
    }
    const lightId = this.renderer.pickLight(sample.clientX, sample.clientY);
    if (!lightId) {
      return false;
    }
    const light = this.document.getLight(lightId);
    if (!light) {
      return false;
    }
    this.selectLight(light.id);
    const baseBefore = light.snapshot();
    const lightPose = this.animationLightPose.get(light.id);
    if (lightPose) {
      light.apply({
        ...baseBefore,
        position: [...lightPose.position] as [number, number, number],
        direction: [...lightPose.direction] as [number, number, number],
        intensity: lightPose.intensity
      });
    }
    const point = new Vector3(
      light.position[0],
      light.position[1],
      light.position[2]
    );
    const plane = this.renderer.createCameraFacingPlane(point);
    const hit = this.renderer.intersectPointerPlane(
      sample.clientX,
      sample.clientY,
      plane
    );
    if (!hit) {
      light.apply(baseBefore);
      return false;
    }
    this.animationLightPose.delete(light.id);
    this.lightDrag = {
      pointerId: sample.pointerId,
      light,
      before: light.snapshot(),
      baseBefore,
      plane,
      offset: point.sub(hit)
    };
    return true;
  }

  private beginLightDirectionDrag(
    sample: PointerSample,
    lightId: string
  ): boolean {
    const light = this.document.getLight(lightId);
    if (!light) {
      return false;
    }
    this.selectLight(light.id);
    const baseBefore = light.snapshot();
    const lightPose = this.animationLightPose.get(light.id);
    if (lightPose) {
      light.apply({
        ...baseBefore,
        position: [...lightPose.position] as [number, number, number],
        direction: [...lightPose.direction] as [number, number, number],
        intensity: lightPose.intensity
      });
    }
    const direction = new Vector3(...light.direction).normalize();
    const tip = new Vector3(...light.position).addScaledVector(direction, 1.55);
    const plane = this.renderer.createCameraFacingPlane(tip);
    if (
      !this.renderer.intersectPointerPlane(sample.clientX, sample.clientY, plane)
    ) {
      light.apply(baseBefore);
      return false;
    }
    this.animationLightPose.delete(light.id);
    this.lightDirectionDrag = {
      pointerId: sample.pointerId,
      light,
      before: light.snapshot(),
      baseBefore,
      plane
    };
    return true;
  }

  private moveLightDirectionDrag(sample: PointerSample): void {
    const drag = this.lightDirectionDrag;
    if (!drag || drag.pointerId !== sample.pointerId) {
      return;
    }
    const hit = this.renderer.intersectPointerPlane(
      sample.clientX,
      sample.clientY,
      drag.plane
    );
    if (!hit) {
      return;
    }
    const origin = new Vector3(...drag.light.position);
    const direction = hit.sub(origin);
    if (direction.lengthSq() < 1e-8) {
      return;
    }
    direction.normalize();
    drag.light.direction = [direction.x, direction.y, direction.z];
    this.syncScene();
    this.publish();
  }

  private finishLightDirectionDrag(): void {
    const drag = this.lightDirectionDrag;
    if (!drag) {
      return;
    }
    this.lightDirectionDrag = null;
    const after = drag.light.snapshot();
    if (JSON.stringify(drag.before) !== JSON.stringify(after)) {
      if (
        this.autoKeyLightPose(
          drag.light,
          {
            position: [...after.position] as [number, number, number],
            direction: [...after.direction] as [number, number, number],
            intensity: after.intensity
          },
          drag.baseBefore
        )
      ) {
        return;
      }
      this.history.execute(
        new UpdateLightCommand(drag.light, drag.baseBefore, after)
      );
    } else {
      drag.light.apply(drag.baseBefore);
      this.applyAnimationPose();
    }
  }

  private moveLightDrag(sample: PointerSample): void {
    const drag = this.lightDrag;
    if (!drag || drag.pointerId !== sample.pointerId) {
      return;
    }
    const hit = this.renderer.intersectPointerPlane(
      sample.clientX,
      sample.clientY,
      drag.plane
    );
    if (!hit) {
      return;
    }
    hit.add(drag.offset);
    drag.light.position = [hit.x, hit.y, hit.z];
    this.syncScene();
    this.publish();
  }

  private finishLightDrag(): void {
    const drag = this.lightDrag;
    if (!drag) {
      return;
    }
    this.lightDrag = null;
    const after = drag.light.snapshot();
    if (JSON.stringify(drag.before) !== JSON.stringify(after)) {
      if (
        this.autoKeyLightPose(
          drag.light,
          {
            position: [...after.position] as [number, number, number],
            direction: [...after.direction] as [number, number, number],
            intensity: after.intensity
          },
          drag.baseBefore
        )
      ) {
        return;
      }
      this.history.execute(
        new UpdateLightCommand(drag.light, drag.baseBefore, after)
      );
    } else {
      drag.light.apply(drag.baseBefore);
      this.syncScene();
      this.publish();
    }
  }

  private beginToolPointer(sample: PointerSample): boolean {
    this.pointerSelectionHit = false;
    const before = this.captureSelection();
    const result = this.beginToolPointerInternal(sample);
    this.recordSelection(before, 'Select element');
    return result;
  }

  private beginToolPointerInternal(sample: PointerSample): boolean {
    if (
      this.drag ||
      this.gizmoDrag ||
      this.lightDrag ||
      this.lightDirectionDrag ||
      this.cameraDrag ||
      this.cameraTargetDrag
    ) {
      this.cancelToolPointer();
    }

    if (this.workspace === 'render') {
      return this.beginCameraDrag(sample);
    }

    if (this.workspace === 'light') {
      return this.beginLightDrag(sample);
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
    if (this.cameraTargetDrag && this.cameraTargetDrag.pointerId === sample.pointerId) {
      this.moveCameraTargetDrag(sample);
      return;
    }
    if (this.cameraDrag && this.cameraDrag.pointerId === sample.pointerId) {
      this.moveCameraDrag(sample);
      return;
    }
    if (
      this.lightDirectionDrag &&
      this.lightDirectionDrag.pointerId === sample.pointerId
    ) {
      this.moveLightDirectionDrag(sample);
      return;
    }
    if (this.lightDrag && this.lightDrag.pointerId === sample.pointerId) {
      this.moveLightDrag(sample);
      return;
    }
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
    if (this.cameraTargetDrag && this.cameraTargetDrag.pointerId === sample.pointerId) {
      this.finishCameraTargetDrag();
      return;
    }
    if (this.cameraDrag && this.cameraDrag.pointerId === sample.pointerId) {
      this.finishCameraDrag();
      return;
    }
    if (
      this.lightDirectionDrag &&
      this.lightDirectionDrag.pointerId === sample.pointerId
    ) {
      this.finishLightDirectionDrag();
      return;
    }
    if (this.lightDrag && this.lightDrag.pointerId === sample.pointerId) {
      this.finishLightDrag();
      return;
    }
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
    if (this.cameraTargetDrag) {
      const drag = this.cameraTargetDrag;
      this.cameraTargetDrag = null;
      drag.camera.apply(drag.baseBefore);
      this.applyAnimationPose();
      return;
    }
    if (this.cameraDrag) {
      const drag = this.cameraDrag;
      this.cameraDrag = null;
      drag.camera.apply(drag.baseBefore);
      this.applyAnimationPose();
      return;
    }
    if (this.lightDirectionDrag) {
      const drag = this.lightDirectionDrag;
      this.lightDirectionDrag = null;
      drag.light.apply(drag.baseBefore);
      this.applyAnimationPose();
      return;
    }
    if (this.lightDrag) {
      const drag = this.lightDrag;
      this.lightDrag = null;
      drag.light.apply(drag.baseBefore);
      this.applyAnimationPose();
      return;
    }
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
      drag.target.setTransform(drag.restBefore);
      if (drag.animationTargetKind !== null) {
        this.applyAnimationPose();
      } else {
        this.syncScene();
        this.publish();
      }
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
    if (this.meshPoseEdit) {
      return false;
    }
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
    const restBefore = this.cloneTransform(target.transform);
    const posed =
      !useElements && this.workspace === 'animation'
        ? this.animationPose.get(target.id)
        : undefined;
    if (posed) {
      target.setTransform(posed);
      this.animationPose.delete(target.id);
      this.syncScene();
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
    const pivotScreen = this.renderer.worldToClient(origin);
    this.modalTransform = {
      kind,
      target,
      element,
      targetLabel,
      before: this.cloneTransform(target.transform),
      restBefore,
      animationTargetKind: posed
        ? ('primitive' in target ? 'node' : 'group')
        : null,
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
      // The camera-facing plane normal points into the screen. Rotate around
      // the opposite direction so a positive modal angle reads counterclockwise.
      viewAxis: plane.normal.clone().normalize().negate(),
      pivotScreen,
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

  /** Resolve a modal scale factor from the pointer distance to the pivot. */
  private modalScaleFactor(modal: ModalTransform, numeric: number | null): number {
    if (numeric !== null) {
      return Math.max(0.001, numeric);
    }
    if (modal.axis === null && modal.pivotScreen) {
      const radial = screenScaleFactor(
        modal.pivotScreen.x,
        modal.pivotScreen.y,
        modal.startX,
        modal.startY,
        modal.lastX,
        modal.lastY
      );
      if (radial !== null) {
        return radial;
      }
    }
    return Math.max(
      0.001,
      1 +
        (modal.lastX - modal.startX - (modal.lastY - modal.startY)) /
          200
    );
  }

  /** Resolve a modal rotation in degrees, using radial pointer motion on screen. */
  private modalRotationDegrees(modal: ModalTransform, numeric: number | null): number {
    if (numeric !== null) {
      return numeric;
    }
    if (modal.axis === null && modal.pivotScreen) {
      const radial = screenRotationDegrees(
        modal.pivotScreen.x,
        modal.pivotScreen.y,
        modal.startX,
        modal.startY,
        modal.lastX,
        modal.lastY
      );
      if (radial !== null) {
        return radial;
      }
    }
    return (modal.lastX - modal.startX - (modal.lastY - modal.startY)) * 0.5;
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
      const angleDegrees = this.modalRotationDegrees(modal, numeric);
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
      const factor = this.modalScaleFactor(modal, numeric);
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
      const angleDegrees = this.modalRotationDegrees(modal, numeric);
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
      const factor = this.modalScaleFactor(modal, numeric);
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
          ? new TransformNodeCommand(modal.target, modal.restBefore, after)
          : new TransformGroupCommand(modal.target, modal.restBefore, after)
      );
      this.syncAnimationTransformEdit(modal.target);
    } else if (modal.animationTargetKind !== null) {
      modal.target.setTransform(modal.restBefore);
      this.applyAnimationPose();
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
    modal.target.setTransform(modal.restBefore);
    if (modal.animationTargetKind !== null) {
      this.applyAnimationPose();
    } else {
      this.syncScene();
      this.publish();
    }
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
    if (this.meshPoseEdit) {
      return false;
    }
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

    const restBefore = this.cloneTransform(target.transform);
    const posed =
      this.workspace === 'animation'
        ? this.animationPose.get(target.id)
        : undefined;
    const before = posed
      ? this.cloneTransform(posed)
      : this.cloneTransform(target.transform);
    if (posed) {
      // Edit from the visible animated pose. The edit becomes the rest
      // transform immediately and the stale preview pose is removed; press
      // Key to write it back into the animation track.
      target.setTransform(before);
      this.animationPose.delete(target.id);
      this.syncScene();
    }
    this.gizmoDrag = {
      pointerId: sample.pointerId,
      mode: hit.mode,
      axis: hit.axis,
      orientation: this.transformOrientation,
      target,
      before,
      restBefore,
      animationTargetKind: posed
        ? ('primitive' in target ? 'node' : 'group')
        : null,
      origin: frame.origin,
      axisWorld,
      size: frame.size,
      startParameter,
      plane,
      basis,
      startAngle,
      dragged: false
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

    const current = drag.target.transform;
    const changed =
      next.position.some((value, i) => Math.abs(value - current.position[i]) > 1e-7) ||
      next.rotation.some((value, i) => Math.abs(value - current.rotation[i]) > 1e-7) ||
      next.scale.some((value, i) => Math.abs(value - current.scale[i]) > 1e-7);
    if (!changed) {
      return;
    }
    drag.target.setTransform(next);
    drag.dragged = true;
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
      drag.dragged ||
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
          ? new TransformNodeCommand(drag.target, drag.restBefore, after)
          : new TransformGroupCommand(drag.target, drag.restBefore, after)
      );
      this.syncAnimationTransformEdit(drag.target);
    } else if (drag.animationTargetKind !== null) {
      drag.target.setTransform(drag.restBefore);
      this.applyAnimationPose();
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
    this.refreshMotionLocks();
    this.pruneUvSelection();
    this.renderer.refreshTexture();
    if (
      event.command instanceof TextureAssetCommand ||
      event.command instanceof PaintTextureCommand ||
      event.command instanceof CreateTextureAssetCommand ||
      event.command instanceof DeleteTextureAssetCommand ||
      event.command instanceof SetTextureFilterCommand ||
      event.command instanceof SetTextureAlphaModeCommand ||
      event.command instanceof RenameTextureAssetCommand ||
      event.command instanceof BakeLightingCommand ||
      (event.command instanceof CompositeCommand &&
        (event.command.label === 'Bake lighting' ||
          event.command.label === 'Prepare bake atlas'))
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
    if (this.activeLightId !== null && !this.document.getLight(this.activeLightId)) {
      this.activeLightId = null;
    }
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

    if (event.command.journalPatch && this.shapeEdit === null) {
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
    this.renderer.setLighting(
      this.posedLightSummaries(),
      this.document.ambientColor,
      this.document.ambientIntensity,
      this.activeLightId,
      this.workspace === 'light'
    );
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
      workspaceCan(this.workspace, 'select3d'),
      this.animationPose
    );
    this.renderer.setCameraGizmos(
      this.posedCameraSummaries(),
      this.activeCameraId,
      this.workspace === 'render' && !this.renderCameraView,
      this.renderVirtualWidth / Math.max(1, this.renderVirtualHeight)
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
    this.document.replaceLights(decoded.document.lights);
    this.document.replaceCameras(decoded.document.cameras);
    this.document.replaceAnimation(decoded.document.animation);
    this.refreshMotionLocks();
    this.stopAnimationLoop();
    this.animationFrame = decoded.document.animation.startFrame;
    this.animationPose.clear();
    this.document.ambientColor = decoded.document.ambientColor;
    this.document.ambientIntensity = decoded.document.ambientIntensity;
    this.projectName = name;
    this.activeGroupId = null;
    this.activeLightId = this.document.lights[0]?.id ?? null;
    this.activeCameraId = this.document.cameras[0]?.id ?? null;
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
    this.renderer.resetCameraOrientation();
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
      if (this.workspace === 'render') {
        this.renderPreviewRevision += 1;
      }
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
