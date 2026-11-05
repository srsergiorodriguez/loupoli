import type { PrimitiveKind } from '../geometry/primitives';
import type { NodeTransform, SelectionMode } from '../scene/MeshNode';
import type { EditorRuntime } from './EditorRuntime';
import { workspaceCan, type WorkspaceCapability } from './workspaces';
import {
  DEFAULT_PS1_AFFINE,
  DEFAULT_PS1_SNAP,
  DEFAULT_SHADING,
  type EditorSnapshot,
  type EditorPane,
  type SelectionCombineMode,
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
  selectionCombineMode: 'replace',
  activeEditor: '3d',
  workspace: 'model',
  selectionMode: 'vertex',
  loopSelect: false,
  selectedPosition: null,
  uvOpen: false,
  uvSplit: 0.38,
  uvLayout: 'bottom',
  uvZoom: 1,
  uvPanX: 0,
  uvPanY: 0,
  uvAxisLock: null,
  uvFineMode: false,
  uvTransformMode: 'move',
  uvDragScale: null,
  uvSelectionMode: 'vertex',
  uvClampMode: false,
  uvSelectedCorners: [],
  uvPinnedCorners: [],
  uvPaintMode: false,
  uvBrushColor: '#f2ffe0',
  uvBrushSize: 36,
  uvBrushOpacity: 0.9,
  paintTool: 'brush',
  paintSecondaryColor: '#1a1a1f',
  paintHardness: 0.7,
  paintSmoothing: 0.25,
  paintNoise: 0,
  paintShapeFilled: true,
  paintGradient: 'linear',
  paintZoom: 1,
  paintPanX: 0,
  paintPanY: 0,
  surfaceCursor: null,
  projectionPreview: null,
  uvRevision: 0,
  uvError: null,
  textureAssets: [],
  textureAssetId: null,
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
  seamCount: 0,
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
  activeLightId: null,
  lights: [],
  activeCameraId: null,
  cameras: [],
  ambientColor: '#ffffff',
  ambientIntensity: 0.22,
  bakeBusy: false,
  renderBusy: false,
  renderCameraView: false,
  renderKind: 'still',
  renderStartFrame: 0,
  renderEndFrame: 48,
  renderVirtualWidth: 320,
  renderVirtualHeight: 180,
  renderOutputWidth: 1280,
  renderOutputHeight: 720,
  renderUpscale: 'nearest',
  renderShading: 'lit',
  renderTransparent: false,
  renderBackground: '#121214',
  renderPreviewUrl: null,
  renderPreviewWidth: 0,
  renderPreviewHeight: 0,
  animationFrame: 0,
  animationStartFrame: 0,
  animationEndFrame: 48,
  animationFps: 24,
  animationLoop: true,
  animationPlaying: false,
  animationTracks: [],
  animationInterpolation: 'linear',
  shapeEditingId: null,
  activeShapeKeyId: null,
  shapeKeys: [],
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
const WORKSPACE_STORAGE_KEY = 'loupoli:workspace';
const UV_LAYOUT_STORAGE_KEY = 'loupoli:uv-layout';

function readPreference(key: string, fallback: string): string {
  if (typeof localStorage === 'undefined') {
    return fallback;
  }
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // UI preferences are best-effort.
  }
}

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
    const layout = readPreference(UV_LAYOUT_STORAGE_KEY, 'bottom');
    runtime.setUvLayout(layout === 'side' ? 'side' : 'bottom');
    const workspace = readPreference(WORKSPACE_STORAGE_KEY, 'model');
    runtime.setWorkspace(
      workspace === 'paint'
        ? 'paint'
        : workspace === 'uv'
          ? 'uv'
          : workspace === 'light'
            ? 'light'
            : 'model'
    );
    this.snapshot = runtime.getSnapshot();
  }

  /** Receive a new UI snapshot from the runtime. */
  receive = (snapshot: EditorSnapshot): void => {
    this.snapshot = snapshot;
  };

  /** Capability gate shared by commands, input, chrome, and Inspector. */
  can(capability: WorkspaceCapability): boolean {
    return workspaceCan(this.snapshot.workspace, capability);
  }

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

  setLoopSelect(enabled: boolean): void {
    this.runtime?.setLoopSelect(enabled);
  }

  setSelectionCombineMode(mode: SelectionCombineMode): void {
    this.runtime?.setSelectionCombineMode(mode);
  }

  setActiveEditor(editor: EditorPane): void {
    this.runtime?.setActiveEditor(editor);
  }

  selectAllActive(): void {
    this.runtime?.selectAllActive();
  }

  toggleUvView(): void {
    this.runtime?.toggleUvView();
  }

  setUvSplit(fraction: number): void {
    this.runtime?.setUvSplit(fraction);
  }

  zoomUv(
    factor: number,
    width: number,
    height: number,
    anchorX = width / 2,
    anchorY = height / 2
  ): void {
    this.runtime?.zoomUv(factor, width, height, anchorX, anchorY);
  }

  panUv(dx: number, dy: number): void {
    this.runtime?.panUv(dx, dy);
  }

  resetUvView(): void {
    this.runtime?.resetUvView();
  }

  setUvLayout(layout: 'bottom' | 'side'): void {
    this.runtime?.setUvLayout(layout);
    writePreference(UV_LAYOUT_STORAGE_KEY, layout);
  }

  toggleUvLayout(): void {
    this.runtime?.toggleUvLayout();
    writePreference(UV_LAYOUT_STORAGE_KEY, this.snapshot.uvLayout);
  }

  setWorkspace(workspace: 'model' | 'light' | 'uv' | 'paint' | 'animation' | 'render'): void {
    this.runtime?.setWorkspace(workspace);
    writePreference(WORKSPACE_STORAGE_KEY, workspace);
  }

  setUvAxisLock(axis: 'u' | 'v'): void {
    this.runtime?.setUvAxisLock(axis);
  }

  syncUvFrom3d(): void {
    this.runtime?.syncUvFrom3d();
  }

  drawPaintView(
    canvas: HTMLCanvasElement,
    width: number,
    height: number
  ): void {
    this.runtime?.drawPaintView(canvas, width, height);
  }

  beginTexturePaint(
    x: number,
    y: number,
    width: number,
    height: number,
    pressure: number,
    tiltX = 0,
    tiltY = 0
  ): boolean {
    return (
      this.runtime?.beginTexturePaint(
        x,
        y,
        width,
        height,
        pressure,
        tiltX,
        tiltY
      ) ?? false
    );
  }

  updateTexturePaint(
    x: number,
    y: number,
    width: number,
    height: number,
    pressure: number,
    tiltX = 0,
    tiltY = 0
  ): void {
    this.runtime?.updateTexturePaint(
      x,
      y,
      width,
      height,
      pressure,
      tiltX,
      tiltY
    );
  }

  finishTexturePaint(): void {
    this.runtime?.finishTexturePaint();
  }

  cancelTexturePaint(): void {
    this.runtime?.cancelTexturePaint();
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

  setUvSelectionMode(mode: 'vertex' | 'edge' | 'face' | 'island'): void {
    this.runtime?.setUvSelectionMode(mode);
  }

  setUvClampMode(enabled: boolean): void {
    this.runtime?.setUvClampMode(enabled);
  }

  beginUvKeyboardTransform(
    kind: 'move' | 'rotate' | 'scale',
    width: number,
    height: number,
    anchorX: number,
    anchorY: number
  ): boolean {
    return (
      this.runtime?.beginUvKeyboardTransform(
        kind,
        width,
        height,
        anchorX,
        anchorY
      ) ?? false
    );
  }

  updateUvKeyboardTransform(
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    this.runtime?.updateUvKeyboardTransform(x, y, width, height);
  }

  finishUvKeyboardTransform(): void {
    this.runtime?.finishUvKeyboardTransform();
  }

  cancelUvKeyboardTransform(): void {
    this.runtime?.cancelUvKeyboardTransform();
  }

  selectUvLasso(
    points: readonly { x: number; y: number }[],
    additive: boolean,
    width: number,
    height: number
  ): void {
    this.runtime?.selectUvLasso(points, additive, width, height);
  }

  pickUvElement(
    x: number,
    y: number,
    width: number,
    height: number,
    additive: boolean
  ): boolean {
    return (
      this.runtime?.pickUvElement(x, y, width, height, additive) ?? false
    );
  }

  selectAll(): void {
    this.runtime?.selectAll();
  }

  setSelectedVertexPosition(position: [number, number, number]): void {
    this.runtime?.setSelectedVertexPosition(position);
  }

  selectAll3d(): void {
    this.runtime?.selectAll3d();
  }

  selectAllUv(): void {
    this.runtime?.selectAllUv();
  }

  clearUvSelectionOnClick(): void {
    this.runtime?.clearUvSelectionOnClick();
  }

  stackUvIslands(): void {
    this.runtime?.stackUvIslands();
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

  setPaintTool(tool: 'brush' | 'eraser' | 'line' | 'rectangle' | 'ellipse' | 'gradient' | 'fill'): void {
    this.runtime?.setPaintTool(tool);
  }

  setPaintSecondaryColor(color: string): void {
    this.runtime?.setPaintSecondaryColor(color);
  }

  setPaintHardness(value: number): void {
    this.runtime?.setPaintHardness(value);
  }

  setPaintSmoothing(value: number): void {
    this.runtime?.setPaintSmoothing(value);
  }

  setPaintNoise(value: number): void {
    this.runtime?.setPaintNoise(value);
  }

  setPaintShapeFilled(value: boolean): void {
    this.runtime?.setPaintShapeFilled(value);
  }

  setPaintGradient(value: 'linear' | 'radial'): void {
    this.runtime?.setPaintGradient(value);
  }

  zoomPaint(factor: number, anchorX: number, anchorY: number, width: number, height: number): void {
    this.runtime?.zoomPaint(factor, anchorX, anchorY, width, height);
  }

  panPaint(dx: number, dy: number): void {
    this.runtime?.panPaint(dx, dy);
  }

  zoomPaintCenter(factor: number): void {
    this.runtime?.zoomPaintCenter(factor);
  }

  resetPaintView(): void {
    this.runtime?.resetPaintView();
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

  setActiveTextureAsset(id: string): void {
    this.runtime?.setActiveTextureAsset(id);
  }

  createTextureAsset(width: number, height: number): void {
    this.runtime?.createTextureAsset(width, height);
  }

  duplicateActiveTextureAsset(): Promise<void> {
    return this.runtime?.duplicateActiveTextureAsset() ?? Promise.resolve();
  }

  deleteActiveTextureAsset(): void {
    this.runtime?.deleteActiveTextureAsset();
  }

  assignTextureToSelection(textureId: string | null): void {
    this.runtime?.assignTextureToSelection(textureId);
  }

  importTextureImage(blob: Blob, name: string): Promise<void> {
    return this.runtime?.importTextureImage(blob, name) ?? Promise.resolve();
  }

  setTextureAssetFilter(filter: 'nearest' | 'linear'): void {
    this.runtime?.setTextureAssetFilter(filter);
  }

  setActiveTextureLayer(id: string): void {
    this.runtime?.setActiveTextureLayer(id);
  }

  addTextureLayer(pattern: 'solid' | 'checker' | 'transparent' = 'solid'): void {
    this.runtime?.addTextureLayer(pattern);
  }

  setTextureLayerPattern(
    id: string,
    pattern: 'solid' | 'checker' | 'transparent'
  ): void {
    this.runtime?.setTextureLayerPattern(id, pattern);
  }

  setTextureAlphaMode(mode: 'opaque' | 'cutout' | 'blend'): void {
    this.runtime?.setTextureAlphaMode(mode);
  }

  renameTextureAsset(name: string): void {
    this.runtime?.renameTextureAsset(name);
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

  setTextureLayerRole(
    id: string,
    role: 'color' | 'detail' | 'lighting'
  ): void {
    this.runtime?.setTextureLayerRole(id, role);
  }

  removeTextureLayer(id: string): void {
    this.runtime?.removeTextureLayer(id);
  }

  toggleTextureLayer(id: string): void {
    this.runtime?.toggleTextureLayer(id);
  }

  reorderTextureLayer(id: string, targetId: string, after: boolean): void {
    this.runtime?.reorderTextureLayer(id, targetId, after);
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
    height: number,
    fine = false
  ): void {
    this.runtime?.updateUvDrag(x, y, width, height, fine);
  }

  setUvFineMode(enabled: boolean): void {
    this.runtime?.setUvFineMode(enabled);
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

  finishUvClick(): void {
    this.runtime?.finishUvClick();
  }

  cancelUvDrag(): void {
    this.runtime?.cancelUvDrag();
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

  selectLight(lightId: string): void {
    this.runtime?.selectLight(lightId);
  }

  addLight(kind: 'directional' | 'point'): void {
    this.runtime?.addLight(kind);
  }

  deleteActiveLight(): void {
    this.runtime?.deleteActiveLight();
  }

  bakeLighting(): Promise<void> {
    return this.runtime?.bakeLighting() ?? Promise.resolve();
  }

  selectCamera(id: string): void {
    this.runtime?.selectCamera(id);
  }

  addCameraFromCurrentView(): void {
    this.runtime?.addCameraFromCurrentView();
  }

  updateActiveCamera(
    patch: Partial<{
      name: string;
      position: [number, number, number];
      target: [number, number, number];
      fov: number;
    }>
  ): void {
    this.runtime?.updateActiveCamera(patch);
  }

  deleteActiveCamera(): void {
    this.runtime?.deleteActiveCamera();
  }

  viewActiveCamera(): void {
    this.runtime?.viewActiveCamera();
  }

  toggleCameraView(): void {
    this.runtime?.toggleCameraView();
  }

  frameActiveCamera(): void {
    this.runtime?.frameActiveCamera();
  }

  updateRenderSettings(patch: Partial<{
    renderVirtualWidth: number;
    renderVirtualHeight: number;
    renderOutputWidth: number;
    renderOutputHeight: number;
    renderUpscale: 'nearest' | 'smooth';
    renderShading: 'lit' | 'texture' | 'solid';
    renderTransparent: boolean;
    renderBackground: string;
    renderKind: 'still' | 'sequence' | 'webm' | 'mp4';
    renderStartFrame: number;
    renderEndFrame: number;
  }>): void {
    this.runtime?.updateRenderSettings(patch);
  }

  previewRender(): Promise<void> {
    return this.runtime?.previewRender() ?? Promise.resolve();
  }

  clearRenderPreview(): void {
    this.runtime?.clearRenderPreview();
  }

  setActiveCameraFromView(): void {
    this.runtime?.setActiveCameraFromView();
  }

  renderStill(): Promise<void> {
    return this.runtime?.renderStill() ?? Promise.resolve();
  }

  renderFrames(): Promise<void> {
    return this.runtime?.renderFrames() ?? Promise.resolve();
  }

  renderVideo(): Promise<void> {
    return this.runtime?.renderVideo() ?? Promise.resolve();
  }

  importObj(): Promise<void> {
    return this.runtime?.importObj() ?? Promise.resolve();
  }

  exportObj(scope: 'active' | 'scene' = 'scene', includeTextures = false): Promise<void> {
    return this.runtime?.exportObj(scope, includeTextures) ?? Promise.resolve();
  }

  importGlb(): Promise<void> {
    return this.runtime?.importGlb() ?? Promise.resolve();
  }

  exportGlb(): Promise<void> {
    return this.runtime?.exportGlb() ?? Promise.resolve();
  }

  setAnimationFrame(frame: number): void {
    this.runtime?.setAnimationFrame(frame);
  }

  setAnimationSettings(
    patch: Partial<{ fps: number; startFrame: number; endFrame: number }>
  ): void {
    this.runtime?.setAnimationSettings(patch);
  }

  setAnimationLoop(loop: boolean): void {
    this.runtime?.setAnimationLoop(loop);
  }

  setAnimationInterpolation(interpolation: 'step' | 'linear'): void {
    this.runtime?.setAnimationInterpolation(interpolation);
  }

  addShapeKey(): void {
    this.runtime?.addShapeKey();
  }

  removeShapeKey(id: string): void {
    this.runtime?.removeShapeKey(id);
  }

  setShapeKeyWeight(id: string, weight: number): void {
    this.runtime?.setShapeKeyWeight(id, weight);
  }

  updateShapeKeyFromMesh(id: string): void {
    this.runtime?.updateShapeKeyFromMesh(id);
  }

  captureShapeKeyFromMesh(id: string): void {
    this.runtime?.captureShapeKeyFromMesh(id);
  }

  selectShapeKey(id: string): void {
    this.runtime?.selectShapeKey(id);
  }

  renameShapeKey(id: string, name: string): void {
    this.runtime?.renameShapeKey(id, name);
  }

  setShapeKeyVisible(id: string, visible: boolean): void {
    this.runtime?.setShapeKeyVisible(id, visible);
  }

  reorderShapeKeys(sourceId: string, targetId: string, after: boolean): void {
    this.runtime?.reorderShapeKeys(sourceId, targetId, after);
  }

  beginShapeEdit(id: string): void {
    this.runtime?.beginShapeEdit(id);
  }

  finishShapeEdit(): void {
    this.runtime?.finishShapeEdit();
  }

  cancelShapeEdit(): void {
    this.runtime?.cancelShapeEdit();
  }

  keyAnimationTrack(track: import('./types').AnimationTrackSummary): void {
    this.runtime?.keyAnimationTrack(
      track.targetId,
      track.targetKind,
      track.kind,
      track.shapeKeyId
    );
  }

  deleteAnimationKeyAt(
    track: import('./types').AnimationTrackSummary,
    frame: number
  ): void {
    this.runtime?.deleteAnimationKeyAt(
      track.targetId,
      track.kind,
      track.shapeKeyId ?? null,
      frame
    );
  }

  setAnimationKeyInterpolation(
    track: import('./types').AnimationTrackSummary,
    frame: number,
    interpolation: 'linear' | 'step'
  ): void {
    this.runtime?.setAnimationKeyInterpolation(
      track.targetId,
      track.kind,
      track.shapeKeyId ?? null,
      frame,
      interpolation
    );
  }

  moveAnimationKey(
    track: import('./types').AnimationTrackSummary,
    fromFrame: number,
    toFrame: number
  ): void {
    this.runtime?.moveAnimationKey(
      track.targetId,
      track.kind,
      track.shapeKeyId ?? null,
      fromFrame,
      toFrame
    );
  }

  keyShapeWeight(id: string): void {
    this.runtime?.keyShapeWeight(id);
  }

  deleteShapeWeightKey(id: string): void {
    this.runtime?.deleteShapeWeightKey(id);
  }

  keyActiveTransform(): void {
    this.runtime?.keyActiveTransform();
  }

  deleteActiveAnimationKey(): void {
    this.runtime?.deleteActiveAnimationKey();
  }

  playAnimation(): void {
    this.runtime?.playAnimation();
  }

  pauseAnimation(): void {
    this.runtime?.pauseAnimation();
  }

  setLightEnabled(id: string, enabled: boolean): void {
    this.runtime?.setLightEnabled(id, enabled);
  }

  updateActiveLight(
    patch: Partial<{
      name: string;
      color: string;
      intensity: number;
      enabled: boolean;
      castShadows: boolean;
      shadowSoftness: number;
      position: [number, number, number];
      direction: [number, number, number];
    }>
  ): void {
    this.runtime?.updateActiveLight(patch);
  }

  setAmbientColor(color: string): void {
    this.runtime?.setAmbientColor(color);
  }

  setAmbientIntensity(intensity: number): void {
    this.runtime?.setAmbientIntensity(intensity);
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

  setNodeVisibility(nodeId: string, visible: boolean): void {
    this.runtime?.setNodeVisibility(nodeId, visible);
  }

  setGroupVisibility(groupId: string, visible: boolean): void {
    this.runtime?.setGroupVisibility(groupId, visible);
  }

  reorderNode(nodeId: string, targetId: string, placeAfter: boolean): void {
    this.runtime?.reorderNode(nodeId, targetId, placeAfter);
  }

  setAdditiveNodeSelection(enabled: boolean): void {
    this.runtime?.setAdditiveNodeSelection(enabled);
  }

  createPrimitive(kind: PrimitiveKind): void {
    this.runtime?.createPrimitive(kind);
  }

  renameActiveObject(name: string): void {
    this.runtime?.renameActiveObject(name);
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

  clearAllSeams(): void {
    this.runtime?.clearAllSeams();
  }

  armAction(kind: MeshActionKind): void {
    this.runtime?.armAction(kind);
  }

  newProject(): void {
    this.runtime?.newProject();
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
