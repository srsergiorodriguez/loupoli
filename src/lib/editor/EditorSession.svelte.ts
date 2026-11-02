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
  type ModifierPatch
} from './types';

const INITIAL_SNAPSHOT: EditorSnapshot = {
  shading: DEFAULT_SHADING,
  transformMode: 'select',
  snapEnabled: false,
  snapStep: 0.25,
  axisLock: null,
  ps1Snap: DEFAULT_PS1_SNAP,
  ps1Affine: DEFAULT_PS1_AFFINE,
  selectedElements: [],
  additiveSelection: false,
  selectionMode: 'vertex',
  selectedPosition: null,
  activeTransform: null,
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

/**
 * Reactive UI projection of the plain editor runtime.
 *
 * Only small primitives live in runes state. Half-edge columns, Three.js
 * objects, and canvas contexts never pass through Svelte's proxy machinery.
 */
export class EditorSession {
  snapshot = $state<EditorSnapshot>(INITIAL_SNAPSHOT);
  inspectorOpen = $state(false);

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

  setAdditiveSelection(enabled: boolean): void {
    this.runtime?.setAdditiveSelection(enabled);
  }

  setActiveTransform(transform: NodeTransform): void {
    this.runtime?.setActiveTransform(transform);
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

  toggleInspector(): void {
    this.inspectorOpen = !this.inspectorOpen;
  }

  closeInspector(): void {
    this.inspectorOpen = false;
  }

  /** Dispose the runtime and release GPU resources. */
  dispose(): void {
    this.runtime?.dispose();
    this.runtime = null;
  }
}
