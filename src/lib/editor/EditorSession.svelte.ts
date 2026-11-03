import type { PrimitiveKind } from '../geometry/primitives';
import type { NodeTransform, SelectionMode } from '../scene/MeshNode';
import type { EditorRuntime } from './EditorRuntime';
import {
  DEFAULT_PS1_AFFINE,
  DEFAULT_PS1_SNAP,
  DEFAULT_SHADING,
  type EditorSnapshot,
  type ShadingMode,
  type TransformMode,
  type AxisLock,
  type ModifierPatch,
  type TransformOrientation,
  type MeshActionKind
} from './types';

const INITIAL_SNAPSHOT: EditorSnapshot = {
  shading: DEFAULT_SHADING,
  transformMode: 'select',
  lassoMode: false,
  lassoPath: [],
  snapEnabled: false,
  snapStep: 0.25,
  axisLock: null,
  ps1Snap: DEFAULT_PS1_SNAP,
  ps1Affine: DEFAULT_PS1_AFFINE,
  selectedElements: [],
  additiveSelection: false,
  selectionMode: 'vertex',
  selectedPosition: null,
  uvOpen: false,
  uvSplit: 0.38,
  uvLayout: 'bottom',
  uvAxisLock: null,
  uvTransformMode: 'move',
  uvSelectedCorners: [],
  uvPinnedCorners: [],
  uvPaintMode: false,
  uvBrushColor: '#f2ffe0',
  uvBrushSize: 36,
  uvBrushOpacity: 0.9,
  uvRevision: 0,
  uvError: null,
  textureLayers: [],
  textureActiveId: null,
  textureSize: 0,
  activeTransform: null,
  globalTransform: null,
  transformOrientation: 'local',
  modalTransform: null,
  actionState: null,
  loopSlideAvailable: false,
  modifiers: [],
  modifiersActive: false,
  modifierError: null,
  evaluatedCounts: { vertices: 0, edges: 0, faces: 0, triangles: 0 },
  boundaryEdges: 0,
  counts: {
    vertices: 0,
    edges: 0,
    faces: 0,
    triangles: 0
  },
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  orientation: [],
  pointer: null,
  objectName: 'Scene',
  activeNodeId: null,
  activeGroupId: null,
  groups: [],
  selectedNodeIds: [],
  additiveNodeSelection: false,
  nodes: [],
  projectName: 'Untitled',
  autosaveStatus: 'idle',
  lastAutosavedAt: null,
  autosaveError: null,
  recoveryAvailable: false,
  recoveryUpdatedAt: null,
  recovered: false,
  fileBusy: false,
  projectError: null,
  renderCount: 0
};

const SIDEBAR_STORAGE_KEY = 'loupoli:sidebar:open';

function readSidebarPreference(): boolean {
  if (typeof localStorage === 'undefined') {
    return true;
  }
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

/**
 * Reactive UI projection of the plain editor runtime.
 *
 * Only small primitives live in runes state. Half-edge columns, Three.js
 * objects, and canvas contexts never pass through Svelte's proxy machinery.
 */
export class EditorSession {
  snapshot = $state<EditorSnapshot>(INITIAL_SNAPSHOT);
  inspectorOpen = $state(false);
  sidebarOpen = $state(readSidebarPreference());
  compactLayout = $state(false);

  private runtime: EditorRuntime | null = null;

  /** Connect the mounted runtime and immediately sync its first snapshot. */
  attach(runtime: EditorRuntime): void {
    this.runtime = runtime;
    this.snapshot = runtime.getSnapshot();
  }

  /** Receive a new UI snapshot from the runtime. */
  receive = (snapshot: EditorSnapshot): void => {
    this.snapshot = snapshot;
  };

  setShading(mode: ShadingMode): void {
    this.runtime?.setShadingMode(mode);
  }

  setTransformMode(mode: TransformMode): void {
    this.runtime?.setTransformMode(mode);
  }

  setLassoMode(enabled: boolean): void {
    this.runtime?.setLassoMode(enabled);
  }

  setSnapEnabled(enabled: boolean): void {
    this.runtime?.setSnapEnabled(enabled);
  }

  setSnapStep(step: number): void {
    this.runtime?.setSnapStep(step);
  }

  setAxisLock(axis: AxisLock): void {
    this.runtime?.setAxisLock(axis);
  }

  setPs1Snap(enabled: boolean): void {
    this.runtime?.setPs1Snap(enabled);
  }

  setPs1Affine(enabled: boolean): void {
    this.runtime?.setPs1Affine(enabled);
  }

  setSelectionMode(mode: SelectionMode): void {
    this.runtime?.setSelectionMode(mode);
  }

  toggleUvView(): void {
    this.runtime?.toggleUvView();
  }

  setUvSplit(fraction: number): void {
    this.runtime?.setUvSplit(fraction);
  }

  setUvLayout(layout: 'bottom' | 'side'): void {
    this.runtime?.setUvLayout(layout);
  }

  toggleUvLayout(): void {
    this.runtime?.toggleUvLayout();
  }

  setWorkspace(workspace: 'model' | 'uv' | 'paint'): void {
    this.runtime?.setWorkspace(workspace);
  }

  setUvAxisLock(axis: 'u' | 'v'): void {
    this.runtime?.setUvAxisLock(axis);
  }

  syncUvFrom3d(): void {
    this.runtime?.syncUvFrom3d();
  }

  drawUvView(
    canvas: HTMLCanvasElement,
    width: number,
    height: number
  ): void {
    this.runtime?.drawUvView(canvas, width, height);
  }

  pickUvCorner(
    x: number,
    y: number,
    width: number,
    height: number,
    additive: boolean
  ): boolean {
    return this.runtime?.pickUvCorner(x, y, width, height, additive) ?? false;
  }

  toggleUvPins(): void {
    this.runtime?.toggleUvPins();
  }

  setUvTransformMode(mode: 'move' | 'rotate' | 'scale'): void {
    this.runtime?.setUvTransformMode(mode);
  }

  setUvPaintMode(enabled: boolean): void {
    this.runtime?.setUvPaintMode(enabled);
  }

  setUvBrushColor(color: string): void {
    this.runtime?.setUvBrushColor(color);
  }

  setUvBrushSize(size: number): void {
    this.runtime?.setUvBrushSize(size);
  }

  setUvBrushOpacity(opacity: number): void {
    this.runtime?.setUvBrushOpacity(opacity);
  }

  beginUvPaint(
    x: number,
    y: number,
    width: number,
    height: number,
    pressure: number
  ): boolean {
    return (
      this.runtime?.beginUvPaint(x, y, width, height, pressure) ?? false
    );
  }

  updateUvPaint(
    x: number,
    y: number,
    width: number,
    height: number,
    pressure: number
  ): void {
    this.runtime?.updateUvPaint(x, y, width, height, pressure);
  }

  finishUvPaint(): void {
    this.runtime?.finishUvPaint();
  }

  cancelUvPaint(): void {
    this.runtime?.cancelUvPaint();
  }

  setActiveTextureLayer(id: string): void {
    this.runtime?.setActiveTextureLayer(id);
  }

  addTextureLayer(): void {
    this.runtime?.addTextureLayer();
  }

  renameTextureLayer(id: string, name: string): void {
    this.runtime?.renameTextureLayer(id, name);
  }

  setTextureLayerBlendMode(
    id: string,
    mode: 'normal' | 'multiply' | 'screen'
  ): void {
    this.runtime?.setTextureLayerBlendMode(id, mode);
  }

  removeTextureLayer(id: string): void {
    this.runtime?.removeTextureLayer(id);
  }

  toggleTextureLayer(id: string): void {
    this.runtime?.toggleTextureLayer(id);
  }

  moveTextureLayer(id: string, direction: -1 | 1): void {
    this.runtime?.moveTextureLayer(id, direction);
  }

  setTextureLayerOpacity(id: string, opacity: number): void {
    this.runtime?.setTextureLayerOpacity(id, opacity);
  }

  setTextureLayerColor(id: string, color: string): void {
    this.runtime?.setTextureLayerColor(id, color);
  }

  beginUvDrag(
    x: number,
    y: number,
    width: number,
    height: number
  ): boolean {
    return this.runtime?.beginUvDrag(x, y, width, height) ?? false;
  }

  updateUvDrag(
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    this.runtime?.updateUvDrag(x, y, width, height);
  }

  applyUvMove(du: number, dv: number): void {
    this.runtime?.applyUvMove(du, dv);
  }

  applyUvRotate(degrees: number): void {
    this.runtime?.applyUvRotate(degrees);
  }

  applyUvScale(factor: number): void {
    this.runtime?.applyUvScale(factor);
  }

  unwrapUv(): void {
    this.runtime?.unwrapUv();
  }

  finishUvDrag(): void {
    this.runtime?.finishUvDrag();
  }

  cancelUvDrag(): void {
    this.runtime?.cancelUvDrag();
  }

  setAdditiveSelection(enabled: boolean): void {
    this.runtime?.setAdditiveSelection(enabled);
  }

  setActiveTransform(
    transform: NodeTransform,
    orientation: TransformOrientation = 'local'
  ): void {
    this.runtime?.setActiveTransform(transform, orientation);
  }

  setTransformOrientation(orientation: TransformOrientation): void {
    this.runtime?.setTransformOrientation(orientation);
  }

  orbitView(dx: number, dy: number): void {
    this.runtime?.orbitView(dx, dy);
  }

  selectNode(nodeId: string, additive = false): void {
    this.runtime?.selectNode(nodeId, additive);
  }

  joinSelectedNodes(): void {
    this.runtime?.joinSelectedNodes();
  }

  groupSelectedNodes(): void {
    this.runtime?.groupSelectedNodes();
  }

  selectGroup(groupId: string): void {
    this.runtime?.selectGroup(groupId);
  }

  ungroupActiveGroup(): void {
    this.runtime?.ungroupActiveGroup();
  }

  addModifier(kind: 'mirror' | 'grid-array' | 'radial-array'): void {
    this.runtime?.addModifier(kind);
  }

  toggleModifier(id: string): void {
    this.runtime?.toggleModifier(id);
  }

  removeModifier(id: string): void {
    this.runtime?.removeModifier(id);
  }

  moveModifier(id: string, direction: -1 | 1): void {
    this.runtime?.moveModifier(id, direction);
  }

  updateModifier(id: string, patch: ModifierPatch): void {
    this.runtime?.updateModifier(id, patch);
  }

  setAdditiveNodeSelection(enabled: boolean): void {
    this.runtime?.setAdditiveNodeSelection(enabled);
  }

  createPrimitive(kind: PrimitiveKind): void {
    this.runtime?.createPrimitive(kind);
  }

  deleteActiveNode(): void {
    this.runtime?.deleteActiveNode();
  }

  deleteSelection(): void {
    this.runtime?.deleteSelection();
  }

  mergeSelectedVertices(): void {
    this.runtime?.mergeSelectedVertices();
  }

  bridgeSelectedEdges(): void {
    this.runtime?.bridgeSelectedEdges();
  }

  extrudeSelectedFaces(): void {
    this.runtime?.extrudeSelectedFaces();
  }

  insetSelectedFace(): void {
    this.runtime?.insetSelectedFace();
  }

  loopCut(): void {
    this.runtime?.loopCut();
  }

  toggleSelectedSeams(): void {
    this.runtime?.toggleSelectedSeams();
  }

  armAction(kind: MeshActionKind): void {
    this.runtime?.armAction(kind);
  }

  async saveProject(): Promise<void> {
    await this.runtime?.saveProject();
  }

  async openProject(): Promise<void> {
    await this.runtime?.openProject();
  }

  async recoverAutosave(): Promise<void> {
    await this.runtime?.recoverAutosave();
  }

  async discardRecovery(): Promise<void> {
    await this.runtime?.discardRecovery();
  }

  dismissProjectError(): void {
    this.runtime?.dismissProjectError();
  }

  undo(): void {
    this.runtime?.undo();
  }

  redo(): void {
    this.runtime?.redo();
  }

  frameSelection(): void {
    this.runtime?.frameSelection();
  }

  snapView(axis: 'x' | 'y' | 'z', sign: 1 | -1): void {
    this.runtime?.snapView(axis, sign);
  }

  resetView(): void {
    this.runtime?.resetView();
  }

  setCompactLayout(compact: boolean): void {
    this.compactLayout = compact;
  }

  get sidebarVisible(): boolean {
    return this.compactLayout ? this.inspectorOpen : this.sidebarOpen;
  }

  toggleInspector(): void {
    if (this.compactLayout) {
      this.inspectorOpen = !this.inspectorOpen;
      return;
    }
    this.sidebarOpen = !this.sidebarOpen;
    this.persistSidebar();
  }

  closeSidebar(): void {
    if (this.compactLayout) {
      this.inspectorOpen = false;
      return;
    }
    this.sidebarOpen = false;
    this.persistSidebar();
  }

  closeInspector(): void {
    // Tool selection only dismisses the compact sheet. The desktop sidebar is
    // deliberately persistent until the user collapses it.
    if (this.compactLayout) {
      this.inspectorOpen = false;
    }
  }

  private persistSidebar(): void {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(this.sidebarOpen));
    } catch {
      // Storage can be unavailable in private/embedded contexts.
    }
  }

  /** Dispose the runtime and release GPU resources. */
  dispose(): void {
    this.runtime?.dispose();
    this.runtime = null;
  }
}
