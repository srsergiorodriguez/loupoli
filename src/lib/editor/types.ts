import type { AxisProjection } from '../render/CameraRig';
import type { NodeSummary, NodeTransform, SelectionMode } from '../scene/MeshNode';
import type { GroupSummary } from '../scene/SceneGroup';
import type {
  Modifier,
  ModifierAxis
} from '../geometry/modifiers';
import type { AutosaveStatus } from '../project/AutosaveService';
import type { TextureLayerSummary } from '../texture/TextureStack';

/** The object transform tools exposed by the toolbar. */
export const TRANSFORM_MODES = ['select', 'translate', 'rotate', 'scale'] as const;

/** The active object transform tool. */
export type TransformMode = (typeof TRANSFORM_MODES)[number];

/** The coordinate space used for transform display and gizmo constraints. */
export const TRANSFORM_ORIENTATIONS = ['local', 'global'] as const;

/** Local or world transform orientation. */
export type TransformOrientation =
  (typeof TRANSFORM_ORIENTATIONS)[number];

/** The transient modal operation started by desktop G, R, or S. */
export type ModalTransformKind = 'translate' | 'rotate' | 'scale';

/** Small UI projection of the active modal transform. */
export interface ModalTransformSnapshot {
  readonly kind: ModalTransformKind;
  readonly axis: 'x' | 'y' | 'z' | null;
  readonly orientation: TransformOrientation;
  readonly target: string;
  readonly numeric: string;
  readonly value: number;
}

/** One-shot modeling actions offered by the touch ActionDock. */
export const MESH_ACTIONS = [
  'extrude',
  'inset',
  'loop-cut',
  'loop-slide'
] as const;

export type MeshActionKind = (typeof MESH_ACTIONS)[number];

/** Armed or dragging state for a one-shot mesh action. */
export interface MeshActionSnapshot {
  readonly kind: MeshActionKind;
  readonly phase: 'armed' | 'dragging' | 'adjusting';
  readonly value: number;
}

/** Supported incremental grid-snap steps. */
export const GRID_SNAP_STEPS = [0.1, 0.25, 0.5, 1] as const;

/** The optional world-axis lock for vertex drags. */
export type AxisLock = 'x' | 'y' | 'z' | null;

/** U/V axis restriction for UV drags. */
export type UvAxisLock = 'u' | 'v' | null;

/** The direct UV transform tool. */
export type UvTransformMode = 'move' | 'rotate' | 'scale';

/** UV entity selection granularity. */
export type UvSelectionMode = 'vertex' | 'edge' | 'face' | 'island';

/** The UV pane arrangement relative to the 3D viewport. */
export type UvLayout = 'bottom' | 'side';

/** The top-level modeling workspace. */
export type Workspace = 'model' | 'uv' | 'paint';

/** The four required viewport shading modes. */
export const SHADING_MODES = [
  'wireframe',
  'solid',
  'unlit',
  'texture-wire',
  'lit'
] as const;

/** A shading mode accepted by the viewport material router. */
export type ShadingMode = (typeof SHADING_MODES)[number];

/** The initial shading path: correct unlit mapping, not the opt-in PS1 look. */
export const DEFAULT_SHADING: ShadingMode = 'unlit';

/** PS1 vertex snapping starts off so the default view is geometrically exact. */
export const DEFAULT_PS1_SNAP = false;

/** Affine UVs start off so Unlit uses standard perspective-correct mapping. */
export const DEFAULT_PS1_AFFINE = false;

/** A normalized pointer diagnostic shown in the editor status bar. */
export interface PointerReading {
  readonly type: 'pen' | 'touch' | 'mouse';
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
}

/** Topology counts displayed by the inspector and status strip. */
export interface MeshCounts {
  readonly vertices: number;
  readonly edges: number;
  readonly faces: number;
  readonly triangles: number;
}

/** Editable parameter patch for one modifier stack entry. */
export interface ModifierPatch {
  readonly axis?: ModifierAxis;
  readonly countX?: number;
  readonly countY?: number;
  readonly spacingX?: number;
  readonly spacingY?: number;
  readonly count?: number;
}

/** The complete small UI-facing projection of the plain editor runtime. */
export interface EditorSnapshot {
  readonly shading: ShadingMode;
  readonly transformMode: TransformMode;
  readonly lassoMode: boolean;
  readonly lassoPath: readonly (readonly [number, number])[];
  readonly snapEnabled: boolean;
  readonly snapStep: number;
  readonly axisLock: AxisLock;
  readonly ps1Snap: boolean;
  readonly ps1Affine: boolean;
  readonly selectedElements: readonly number[];
  readonly additiveSelection: boolean;
  readonly selectionMode: SelectionMode;
  readonly selectedPosition: [number, number, number] | null;
  readonly uvOpen: boolean;
  readonly uvSplit: number;
  readonly uvLayout: UvLayout;
  readonly uvZoom: number;
  readonly uvPanX: number;
  readonly uvPanY: number;
  readonly uvAxisLock: UvAxisLock;
  readonly uvTransformMode: UvTransformMode;
  readonly uvSelectionMode: UvSelectionMode;
  readonly uvLassoMode: boolean;
  readonly uvSubtractMode: boolean;
  readonly uvClampMode: boolean;
  readonly uvSelectedCorners: readonly number[];
  readonly uvPinnedCorners: readonly number[];
  readonly uvPaintMode: boolean;
  readonly uvBrushColor: string;
  readonly uvBrushSize: number;
  readonly uvBrushOpacity: number;
  readonly uvRevision: number;
  readonly uvError: string | null;
  readonly textureLayers: readonly TextureLayerSummary[];
  readonly textureActiveId: string | null;
  readonly textureSize: number;
  readonly activeTransform: NodeTransform | null;
  readonly globalTransform: NodeTransform | null;
  readonly transformOrientation: TransformOrientation;
  readonly modalTransform: ModalTransformSnapshot | null;
  readonly actionState: MeshActionSnapshot | null;
  readonly loopSlideAvailable: boolean;
  readonly modifiers: readonly Modifier[];
  readonly modifiersActive: boolean;
  readonly modifierError: string | null;
  readonly evaluatedCounts: MeshCounts;
  readonly counts: MeshCounts;
  readonly boundaryEdges: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  readonly orientation: readonly AxisProjection[];
  readonly pointer: PointerReading | null;
  readonly objectName: string;
  readonly activeNodeId: string | null;
  readonly activeGroupId: string | null;
  readonly groups: readonly GroupSummary[];
  readonly selectedNodeIds: readonly string[];
  readonly additiveNodeSelection: boolean;
  readonly nodes: readonly NodeSummary[];
  readonly projectName: string;
  readonly autosaveStatus: AutosaveStatus;
  readonly lastAutosavedAt: number | null;
  readonly autosaveError: string | null;
  readonly recoveryAvailable: boolean;
  readonly recoveryUpdatedAt: number | null;
  readonly recovered: boolean;
  readonly fileBusy: boolean;
  readonly projectError: string | null;
  readonly renderCount: number;
}
