import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  Group as ThreeGroup,
  LineBasicMaterial,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PointLight,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  type Ray,
  type ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type WebGLRendererParameters
} from 'three';
import type { Theme } from '../../design/theme';
import type { MeshNode, NodeTransform, SelectionMode } from '../scene/MeshNode';
import type { SceneGroup } from '../scene/SceneGroup';
import type { LightSummary } from '../scene/SceneLight';
import type { RenderStillOptions } from './renderSettings';
import type {
  ShadingMode,
  TransformMode,
  TransformOrientation
} from '../editor/types';
import { ObjectGizmo, type GizmoHit } from './ObjectGizmo';
import type { SurfaceHit } from './SurfaceHit';
import { CameraRig, type AxisProjection, type AxisName } from './CameraRig';
import { ViewportGrid } from './Grid';
import { MeshNodeView } from './MeshNodeView';
import { LightGizmos } from './LightGizmos';
import { CameraGizmos } from './CameraGizmos';
import { ambientVisibility, bakeNormalSign } from '../lighting/bake';
import {
  DEFAULT_AMBIENT_OCCLUSION,
  type AmbientOcclusionSettings
} from '../lighting/ao';
import { AnnotationOverlay } from './AnnotationOverlay';
import {
  createViewportMaterials,
  disposeViewportMaterials,
  type Ps1Uniforms,
  type ViewportMaterials
} from './materials';

/** Screen-space radius, in CSS pixels, used for topology picking. */
export const PICK_RADIUS_CSS = 16;

const DESKTOP_PIXEL_RATIO_CAP = 2;
const TOUCH_PIXEL_RATIO_CAP = 1.5;
/** AO preview is CPU-facing; keep the interactive budget bounded. */
const MAX_AO_PREVIEW_FACES = 16000;

/** Optional callbacks for the editor runtime that owns this viewport. */
interface ViewportRendererOptions {
  readonly onViewChanged?: (orientation: readonly AxisProjection[]) => void;
  readonly resolveNodeTexture?: (node: MeshNode) => Texture | null;
  readonly resolveNodeTextureId?: (node: MeshNode) => string | null;
  readonly resolveNodeAlphaMode?: (node: MeshNode) => 'opaque' | 'cutout' | 'blend';
}

/**
 * Owns the WebGL2 viewport, scene, camera, materials, and on-demand scheduler.
 *
 * The renderer never owns document state. Each `MeshNodeView` derives and owns
 * only its GPU resources; the editor runtime remains the source of truth for
 * nodes, active object, selection, and history.
 */
export class ViewportRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly cameraRig = new CameraRig();
  private readonly grid: ViewportGrid;
  private readonly materials: ViewportMaterials;
  private readonly nodeViews = new Map<string, MeshNodeView>();
  private readonly textureMaterials = new Map<
    string,
    { texture: Texture | null; alphaMode: 'opaque' | 'cutout' | 'blend'; materials: ViewportMaterials }
  >();
  private readonly referenceMaterials = new Map<
    string,
    {
      material: MeshBasicMaterial;
      texture: Texture | null;
      opacity: number;
      inFront: boolean;
    }
  >();
  private readonly resolveNodeTexture: (node: MeshNode) => Texture | null;
  private readonly resolveNodeTextureId: (node: MeshNode) => string | null;
  private readonly resolveNodeAlphaMode: (node: MeshNode) => 'opaque' | 'cutout' | 'blend';
  private readonly groupViews = new Map<string, ThreeGroup>();
  private readonly objectGizmo: ObjectGizmo;
  private readonly lightGizmos = new LightGizmos();
  private readonly cameraGizmos = new CameraGizmos();
  private readonly annotations: AnnotationOverlay;

  private readonly vertexMaterial: PointsMaterial;
  private readonly selectedVertexMaterial: PointsMaterial;
  private readonly pickingMaterial: MeshBasicMaterial;
  private readonly selectedEdgeMaterial: MeshBasicMaterial;
  private readonly selectedOutlineMaterial: LineBasicMaterial;
  private readonly previewLineMaterial: LineBasicMaterial;
  private readonly seamLineMaterial: LineBasicMaterial;
  private readonly seamEdgeMaterial: MeshBasicMaterial;
  private readonly selectedFaceMaterial: MeshBasicMaterial;

  private readonly ambientLight: AmbientLight;
  private readonly keyLight: DirectionalLight;
  private readonly fillLight: DirectionalLight;
  private readonly sceneAmbient: AmbientLight;
  private readonly documentLightGroup = new ThreeGroup();
  private readonly documentLights = new Map<
    string,
    {
      readonly kind: 'directional' | 'point';
      readonly light: DirectionalLight | PointLight;
      readonly target: Object3D | null;
    }
  >();

  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly scratchDirection = new Vector3();
  private readonly scratchPlaneHit = new Vector3();

  private readonly resizeObserver: ResizeObserver;
  private readonly onViewChanged: ((orientation: readonly AxisProjection[]) => void) | null;
  private readonly handleWindowResize = (): void => {
    this.resize();
  };

  private currentMode: ShadingMode = 'texture-wire';
  private ambientOcclusion: AmbientOcclusionSettings = {
    ...DEFAULT_AMBIENT_OCCLUSION
  };
  private aoDirty = true;
  private aoApplied = false;
  private aoDirtyAt = 0;
  private aoTimer = 0;
  private seamOverlayVisible = false;
  private transformMode: TransformMode = 'select';
  private transformOrientation: TransformOrientation = 'global';
  private actionPreviewLine: Float32Array | null = null;
  private selectionGizmoOrigin: Vector3 | null = null;
  private selectionGizmoQuaternion: Quaternion | null = null;
  private activeNodeId: string | null = null;
  private activeGroupId: string | null = null;
  private pixelRatio = 1;
  private renderCount = 0;
  private rafId = 0;
  private disposed = false;
  private cameraChanged = true;
  private hasFramed = false;

  constructor(
    canvas: HTMLCanvasElement,
    theme: Theme,
    options: ViewportRendererOptions = {}
  ) {
    this.canvas = canvas;
    this.onViewChanged = options.onViewChanged ?? null;

    const contextAttributes: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    };
    const context = canvas.getContext('webgl2', contextAttributes);
    if (!context) {
      throw new Error(
        'loupoli needs a WebGL2-capable browser or WebView. Graphics could not start on this device.'
      );
    }

    const rendererParameters: WebGLRendererParameters = {
      canvas,
      context,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance'
    };
    this.resolveNodeTexture = options.resolveNodeTexture ?? (() => null);
    this.resolveNodeTextureId =
      options.resolveNodeTextureId ?? ((node) => node.textureId);
    this.resolveNodeAlphaMode = options.resolveNodeAlphaMode ?? (() => 'opaque');
    this.renderer = new WebGLRenderer(rendererParameters);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(theme.canvas.color, 1);
    this.renderer.autoClear = true;

    this.materials = createViewportMaterials(theme);
    this.grid = new ViewportGrid(theme);
    this.scene.add(this.grid.group);
    this.objectGizmo = new ObjectGizmo(theme);
    this.scene.add(this.objectGizmo.group);
    this.annotations = new AnnotationOverlay(theme);
    this.scene.add(this.annotations.group);

    this.vertexMaterial = new PointsMaterial({
      name: 'loupoli-vertex-handles',
      color: theme.vertexHandle.color,
      size: 7 * this.pixelRatio,
      sizeAttenuation: false,
      transparent: true,
      opacity: Math.max(theme.vertexHandle.alpha, 0.7),
      depthWrite: false,
      toneMapped: false
    });
    this.selectedVertexMaterial = new PointsMaterial({
      name: 'loupoli-selected-vertex',
      color: theme.accent.color,
      size: 13 * this.pixelRatio,
      sizeAttenuation: false,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      toneMapped: false
    });
    this.pickingMaterial = new MeshBasicMaterial({
      side: DoubleSide,
      colorWrite: false,
      depthWrite: false
    });
    this.selectedEdgeMaterial = new MeshBasicMaterial({
      name: 'loupoli-selected-edge',
      color: theme.accent.color,
      depthTest: false,
      toneMapped: false
    });
    this.selectedOutlineMaterial = new LineBasicMaterial({
      name: 'loupoli-selected-outline',
      color: theme.accent.color,
      depthTest: false,
      toneMapped: false
    });
    this.previewLineMaterial = new LineBasicMaterial({
      name: 'loupoli-action-preview-line',
      color: theme.axisZ.color,
      transparent: true,
      opacity: 1,
      depthTest: false,
      toneMapped: false
    });
    this.seamLineMaterial = new LineBasicMaterial({
      name: 'loupoli-seam',
      color: theme.seam.color,
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false
    });
    this.seamEdgeMaterial = new MeshBasicMaterial({
      name: 'loupoli-seam-tube',
      color: theme.seam.color,
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false
    });
    this.selectedFaceMaterial = new MeshBasicMaterial({
      name: 'loupoli-selected-face',
      color: theme.accent.color,
      transparent: true,
      opacity: 0.2,
      side: DoubleSide,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      toneMapped: false
    });

    this.ambientLight = new AmbientLight(new Color(1, 1, 1), 0.8);
    this.keyLight = new DirectionalLight(theme.keyLight.color, 2);
    this.keyLight.position.set(-4, -6, 8);
    this.fillLight = new DirectionalLight(theme.fillLight.color, 0.4);
    this.fillLight.position.set(5, 4, 3);
    this.sceneAmbient = new AmbientLight(new Color(1, 1, 1), 0.2);
    this.documentLightGroup.name = 'loupoli-document-lights';
    this.scene.add(
      this.ambientLight,
      this.keyLight,
      this.fillLight,
      this.sceneAmbient,
      this.documentLightGroup
    );
    this.scene.add(this.lightGizmos.group);
    this.scene.add(this.cameraGizmos.group);

    this.resizeObserver = new ResizeObserver(this.handleWindowResize);
    // Observe the canvas itself, not its parent: the UV split changes the
    // canvas CSS height while the full-viewport parent keeps its size.
    this.resizeObserver.observe(canvas);
    window.addEventListener('resize', this.handleWindowResize);

    this.resize();
    this.applyShadingMode('texture-wire');
    this.schedule();
  }

  /**
   * Reconcile the viewport with the document and session selection.
   *
   * Adding or removing nodes creates/disposes their derived views. Existing
   * views refresh only when their DCEL revision changed or their transform was
   * updated.
   */
  syncScene(
    nodes: readonly MeshNode[],
    groups: readonly SceneGroup[],
    activeNodeId: string | null,
    activeGroupId: string | null,
    selectionMode: SelectionMode,
    selectedElements: readonly number[],
    transformMode: TransformMode,
    transformOrientation: TransformOrientation,
    showEditHandles = true,
    animationPose: ReadonlyMap<string, NodeTransform> = new Map()
  ): void {
    const incoming = new Set(nodes.map((node) => node.id));

    for (const [id, view] of this.nodeViews) {
      if (!incoming.has(id)) {
        view.dispose();
        this.nodeViews.delete(id);
      }
    }

    const incomingGroups = new Set(groups.map((group) => group.id));
    for (const [id, wrapper] of this.groupViews) {
      if (!incomingGroups.has(id)) {
        wrapper.removeFromParent();
        wrapper.clear();
        this.groupViews.delete(id);
      }
    }
    for (const group of groups) {
      let wrapper = this.groupViews.get(group.id);
      if (!wrapper) {
        wrapper = new ThreeGroup();
        wrapper.name = `loupoli-group-${group.id}`;
        this.groupViews.set(group.id, wrapper);
        this.scene.add(wrapper);
      }
      const transform = animationPose.get(group.id) ?? group.transform;
      wrapper.position.set(...transform.position);
      wrapper.rotation.set(...transform.rotation);
      wrapper.scale.set(...transform.scale);
      wrapper.visible = group.visible;
      wrapper.updateMatrixWorld(true);
    }

    for (const node of nodes) {
      let view = this.nodeViews.get(node.id);
      const evaluated = node.getEvaluatedMesh();
      if (view && view.boundMesh !== evaluated.mesh) {
        view.dispose();
        this.nodeViews.delete(node.id);
        view = undefined;
      }
      if (!view) {
        view = new MeshNodeView(node, this.materials, this.overlayMaterials());
        this.nodeViews.set(node.id, view);
        view.setShadingMode(this.currentMode);
        view.setSeamVisible(this.seamOverlayVisible);
      }
      if (node.reference) {
        view.setSurfaceMaterials(this.materials);
        view.setReferenceMaterial(this.referenceMaterialFor(node));
      } else {
        view.setReferenceMaterial(null);
        view.setSurfaceMaterials(this.materialsForNode(node));
        const stale = this.referenceMaterials.get(node.id);
        if (stale) {
          stale.material.dispose();
          this.referenceMaterials.delete(node.id);
        }
      }

      const parent =
        node.parentId !== null
          ? (this.groupViews.get(node.parentId) ?? this.scene)
          : this.scene;
      if (view.group.parent !== parent) {
        parent.add(view.group);
      }

      view.setTransform(animationPose.get(node.id) ?? node.transform);
      view.setVisible(node.visible);
      view.refreshMesh();
      const isActive =
        activeGroupId === null && node.id === activeNodeId;
      view.setInteraction(
        isActive,
        selectionMode,
        isActive ? selectedElements : [],
        showEditHandles && !evaluated.modifiersActive && !node.reference
      );
    }

    const referencedTextures = new Set(
      nodes
        .map((node) => this.resolveNodeTextureId(node))
        .filter((id): id is string => id !== null)
    );
    for (const id of [...this.textureMaterials.keys()]) {
      if (!referencedTextures.has(id)) {
        this.clearTextureMaterials(id);
      }
    }
    const incomingIds = new Set(nodes.map((node) => node.id));
    for (const [id, entry] of this.referenceMaterials) {
      if (!incomingIds.has(id)) {
        entry.material.dispose();
        this.referenceMaterials.delete(id);
      }
    }

    this.activeGroupId = groups.some((group) => group.id === activeGroupId)
      ? activeGroupId
      : null;
    this.activeNodeId =
      this.activeGroupId === null &&
      nodes.some((node) => node.id === activeNodeId)
        ? activeNodeId
        : null;
    this.transformMode = transformMode;
    this.transformOrientation = transformOrientation;
    this.objectGizmo.setMode(transformMode);
    this.updateGizmo();

    if (
      !this.hasFramed &&
      (this.activeNodeId !== null || this.activeGroupId !== null)
    ) {
      this.frameActiveNode();
      this.hasFramed = true;
    }

    this.applyActionPreviewLine();
    this.markAmbientOcclusionDirty();
    this.schedule();
  }

  /** Replace editor-only world-space annotation segments. */
  setAnnotationSegments(positions: Float32Array | null): void {
    this.annotations.setSegments(positions);
    this.schedule();
  }

  /** Show document camera markers in modeling/animation views. */
  setCameraGizmos(
    cameras: readonly import('../scene/SceneCamera').CameraSummary[],
    activeCameraId: string | null,
    visible: boolean,
    aspect = 16 / 9
  ): void {
    this.cameraGizmos.sync(cameras, activeCameraId, visible, aspect);
    this.schedule();
  }

  /** Show or hide the modeling grid without touching the document. */
  setGridVisible(visible: boolean): void {
    if (this.grid.group.visible === visible) {
      return;
    }
    this.grid.group.visible = visible;
    this.schedule();
  }

  /** Show the seam overlay only in contexts that explicitly opt in. */
  setSeamOverlayVisible(visible: boolean): void {
    if (this.seamOverlayVisible === visible) {
      return;
    }
    this.seamOverlayVisible = visible;
    for (const view of this.nodeViews.values()) {
      view.setSeamVisible(visible);
    }
    this.schedule();
  }

  /** Show or clear the loop-cut preview line owned by the action system. */
  setActionPreviewLine(positions: Float32Array | null): void {
    this.actionPreviewLine = positions ? positions.slice() : null;
    this.applyActionPreviewLine();
    this.schedule();
  }

  private applyActionPreviewLine(): void {
    for (const view of this.nodeViews.values()) {
      view.setPreviewLine(null);
    }
    if (!this.actionPreviewLine) {
      return;
    }
    this.activeView()?.setPreviewLine(this.actionPreviewLine);
  }

  /** Refresh one node after a direct runtime edit such as a drag preview. */
  refreshNode(nodeId: string, scheduleRender = true): void {
    this.nodeViews.get(nodeId)?.refreshMesh();
    if (scheduleRender) {
      this.schedule();
    }
  }

  /** Reset the orbit to the standard above-front three-quarter view. */
  resetCameraOrientation(): void {
    this.cameraRig.resetDefaultOrientation();
    this.markCameraChanged();
  }

  /** Frame the active node, or all nodes if there is no active node. */
  frameActiveNode(): void {
    if (this.activeGroupId !== null) {
      const bounds = new Box3();
      for (const view of this.nodeViews.values()) {
        if (view.node.parentId === this.activeGroupId) {
          bounds.union(view.getWorldBounds());
        }
      }
      if (!bounds.isEmpty()) {
        this.cameraRig.frame(bounds);
        this.markCameraChanged();
        return;
      }
    }

    if (this.activeNodeId !== null) {
      const view = this.nodeViews.get(this.activeNodeId);
      if (view) {
        this.cameraRig.frame(view.getWorldBounds());
        this.markCameraChanged();
        return;
      }
    }

    if (this.nodeViews.size > 0) {
      const bounds = new Box3();
      for (const view of this.nodeViews.values()) {
        bounds.union(view.getWorldBounds());
      }
      if (!bounds.isEmpty()) {
        this.cameraRig.frame(bounds);
        this.markCameraChanged();
      }
    }
  }

  /** Frame the active object together with visible light markers. */
  frameLightWorkspace(): void {
    const bounds = new Box3();
    const view = this.activeView();
    if (view) {
      bounds.union(view.getWorldBounds());
    }
    if (this.lightGizmos.group.visible && this.lightGizmos.group.children.length > 0) {
      bounds.union(new Box3().setFromObject(this.lightGizmos.group));
    }
    if (!bounds.isEmpty()) {
      this.cameraRig.frame(bounds);
      this.markCameraChanged();
    }
  }

  /** Orbit the camera by a CSS-pixel pointer delta. */
  orbit(dx: number, dy: number): void {
    this.cameraRig.orbit(dx, dy);
    this.markCameraChanged();
  }

  /** Pan the camera by a CSS-pixel pointer delta. */
  pan(dx: number, dy: number): void {
    this.cameraRig.pan(dx, dy);
    this.markCameraChanged();
  }

  /** Dolly by a multiplicative factor. */
  zoom(factor: number): void {
    this.cameraRig.zoom(factor);
    this.markCameraChanged();
  }

  /** Animate the camera to an axis-aligned view. */
  viewAxis(axis: AxisName, sign: 1 | -1): void {
    this.cameraRig.viewAxis(axis, sign);
    this.markCameraChanged();
  }

  /** Reset orientation to Blender Front, preserving target and zoom. */
  resetOrientation(): void {
    this.cameraRig.resetOrientation();
    this.markCameraChanged();
  }

  /** Place the transform gizmo at a selected-element median instead of a node. */
  setSelectionGizmoFrame(
    origin: Vector3 | null,
    quaternion: Quaternion | null
  ): void {
    this.selectionGizmoOrigin = origin ? origin.clone() : null;
    this.selectionGizmoQuaternion = quaternion ? quaternion.clone() : null;
    if (this.transformMode !== 'select') {
      this.updateGizmo();
    }
    this.schedule();
  }

  /**
   * Render one clean frame to a virtual-resolution image.
   *
   * Editor chrome, selection overlays, and the grid are hidden only for the
   * duration of this call. The returned pixels are bottom-up flipped into
   * ordinary ImageData order; upscaling and encoding live in the caller.
   */
  renderStill(options: RenderStillOptions): ImageData {
    const width = Math.max(1, Math.min(4096, Math.round(options.width)));
    const height = Math.max(1, Math.min(4096, Math.round(options.height)));
    const previousMode = this.currentMode;
    const previousGrid = this.grid.group.visible;
    const previousGizmo = this.objectGizmo.group.visible;
    const previousLights = this.lightGizmos.group.visible;
    const previousCameras = this.cameraGizmos.group.visible;
    const previousAnnotations = this.annotations.group.visible;
    const previousClear = this.renderer.getClearColor(new Color());
    const previousClearAlpha = this.renderer.getClearAlpha();
    const views = [...this.nodeViews.values()];
    const hiddenReferences = views
      .filter((view) => view.isReference && view.group.visible)
      .map((view) => view);
    for (const view of hiddenReferences) {
      view.group.visible = false;
    }
    for (const view of views) {
      view.setCleanRender(true);
    }
    this.grid.group.visible = false;
    this.objectGizmo.group.visible = false;
    this.lightGizmos.group.visible = false;
    this.cameraGizmos.group.visible = false;
    this.annotations.group.visible = false;

    const target = new WebGLRenderTarget(width, height, {
      depthBuffer: true,
      stencilBuffer: false
    });
    target.texture.colorSpace = SRGBColorSpace;
    try {
      this.setShadingMode(
        options.shading === 'texture' ? 'unlit' : options.shading
      );
      const camera = new PerspectiveCamera(
        options.camera.fov,
        width / height,
        0.01,
        500
      );
      camera.up.set(0, 0, 1);
      camera.position.set(...options.camera.position);
      camera.lookAt(new Vector3(...options.camera.target));
      camera.updateMatrixWorld(true);
      this.updateAmbientOcclusionPreview(true);
      this.renderer.setRenderTarget(target);
      this.renderer.setViewport(0, 0, width, height);
      this.renderer.setClearColor(
        new Color(options.transparent ? '#000000' : options.backgroundColor),
        options.transparent ? 0 : 1
      );
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, camera);
      const raw = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, raw);
      const flipped = new Uint8ClampedArray(raw.length);
      const rowBytes = width * 4;
      for (let y = 0; y < height; y += 1) {
        const source = (height - 1 - y) * rowBytes;
        flipped.set(raw.subarray(source, source + rowBytes), y * rowBytes);
      }
      return new ImageData(flipped, width, height);
    } finally {
      this.renderer.setRenderTarget(null);
      this.renderer.setViewport(
        0,
        0,
        this.canvas.clientWidth,
        this.canvas.clientHeight
      );
      this.renderer.setClearColor(previousClear, previousClearAlpha);
      this.setShadingMode(previousMode);
      this.grid.group.visible = previousGrid;
      this.objectGizmo.group.visible = previousGizmo;
      this.lightGizmos.group.visible = previousLights;
      this.cameraGizmos.group.visible = previousCameras;
      this.annotations.group.visible = previousAnnotations;
      for (const view of views) {
        view.setCleanRender(false);
      }
      for (const view of hiddenReferences) {
        view.group.visible = true;
      }
      target.dispose();
      this.schedule();
    }
  }

  /** Frame a camera position and its target for inspection. */
  frameCameraView(
    position: readonly [number, number, number],
    target: readonly [number, number, number]
  ): void {
    const bounds = new Box3();
    const a = new Vector3(...position);
    const b = new Vector3(...target);
    bounds.expandByPoint(a);
    bounds.expandByPoint(b);
    const center = bounds.getCenter(new Vector3());
    const radius = Math.max(1, bounds.getSize(new Vector3()).length() * 0.5);
    bounds.expandByPoint(center.clone().add(new Vector3(radius, radius, radius)));
    this.cameraRig.frame(bounds);
    this.markCameraChanged();
  }

  /** Show an explicit document camera in the navigation viewport. */
  setCameraView(
    position: readonly [number, number, number],
    target: readonly [number, number, number],
    fov: number
  ): void {
    this.cameraRig.setView(
      new Vector3(...position),
      new Vector3(...target),
      fov
    );
    this.markCameraChanged();
  }

  /** Capture the current navigation camera for a render camera preset. */
  captureCameraView(): {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  } {
    const position = this.cameraRig.getPosition();
    const target = this.cameraRig.getTarget();
    return {
      position: [position.x, position.y, position.z],
      target: [target.x, target.y, target.z],
      fov: this.cameraRig.getFov()
    };
  }

  /** Current camera-space axis projections for the orientation gizmo. */
  getOrientation(): readonly AxisProjection[] {
    return this.cameraRig.computeOrientation();
  }

  /** Change the active shading path without recreating geometry. */
  setShadingMode(mode: ShadingMode): void {
    if (this.currentMode === mode) {
      return;
    }
    this.currentMode = mode;
    this.applyShadingMode(mode);
    this.schedule();
  }

  /** Toggle PS1 vertex snapping and affine UV interpolation. */
  setPs1Options(snap: boolean, affine: boolean): void {
    const apply = (material: ShaderMaterial): void => {
      const uniforms = material.uniforms as unknown as Ps1Uniforms;
      uniforms.uSnapEnabled.value = snap ? 1 : 0;
      uniforms.uAffineEnabled.value = affine ? 1 : 0;
    };
    apply(this.materials.ps1);
    // Textured nodes use cloned per-asset materials, so the base material
    // alone is not what the viewport draws.
    for (const record of this.textureMaterials.values()) {
      apply(record.materials.ps1);
    }
    if (
      this.currentMode === 'unlit' ||
      this.currentMode === 'texture-wire'
    ) {
      this.schedule();
    }
  }

  /** Replace document lights used by the Lit shading path. */
  setLighting(
    lights: readonly LightSummary[],
    ambientColor: string,
    ambientIntensity: number,
    activeLightId: string | null = null,
    showLightGizmos = false
  ): void {
    this.lightGizmos.sync(lights, activeLightId, showLightGizmos);
    this.sceneAmbient.color.set(ambientColor);
    this.sceneAmbient.intensity = Math.max(0, ambientIntensity);

    const incoming = new Map(lights.map((light) => [light.id, light]));
    for (const [id, entry] of this.documentLights) {
      const summary = incoming.get(id);
      if (summary && summary.kind === entry.kind) {
        continue;
      }
      this.disposeDocumentLight(entry);
      this.documentLights.delete(id);
    }

    for (const summary of lights) {
      let entry = this.documentLights.get(summary.id);
      if (!entry || entry.kind !== summary.kind) {
        if (entry) {
          this.disposeDocumentLight(entry);
        }
        const created =
          summary.kind === 'directional'
            ? this.createDirectionalLight(summary)
            : this.createPointLight(summary);
        this.documentLights.set(summary.id, created);
        this.documentLightGroup.add(created.light);
        if (created.target) {
          this.documentLightGroup.add(created.target);
        }
        entry = created;
      }
      this.updateDocumentLight(entry, summary);
    }
    this.applyDocumentLightVisibility();
    this.schedule();
  }

  private createDirectionalLight(
    summary: LightSummary
  ): {
    readonly kind: 'directional';
    readonly light: DirectionalLight;
    readonly target: Object3D;
  } {
    const light = new DirectionalLight(
      new Color(summary.color),
      Math.max(0, summary.intensity)
    );
    const target = new Object3D();
    light.target = target;
    return { kind: 'directional', light, target };
  }

  private createPointLight(summary: LightSummary): {
    readonly kind: 'point';
    readonly light: PointLight;
    readonly target: null;
  } {
    return {
      kind: 'point',
      light: new PointLight(
        new Color(summary.color),
        Math.max(0, summary.intensity),
        0,
        2
      ),
      target: null
    };
  }

  private updateDocumentLight(
    entry: {
      readonly kind: 'directional' | 'point';
      readonly light: DirectionalLight | PointLight;
      readonly target: Object3D | null;
    },
    summary: LightSummary
  ): void {
    const light = entry.light;
    light.color.set(summary.color);
    light.intensity = Math.max(0, summary.intensity);
    light.visible = summary.enabled && summary.intensity > 0;
    light.castShadow = light.visible && summary.castShadows;

    if (entry.kind === 'directional' && entry.target) {
      const directional = light as DirectionalLight;
      const direction = new Vector3(
        summary.direction[0],
        summary.direction[1],
        summary.direction[2]
      ).normalize();
      directional.position.set(
        -direction.x * 10,
        -direction.y * 10,
        -direction.z * 10
      );
      entry.target.position.set(0, 0, 0);
      entry.target.updateMatrixWorld();
      const shadowCamera = directional.shadow.camera;
      if (shadowCamera instanceof PerspectiveCamera === false) {
        shadowCamera.left = -12;
        shadowCamera.right = 12;
        shadowCamera.top = 12;
        shadowCamera.bottom = -12;
        shadowCamera.updateProjectionMatrix();
      }
      directional.shadow.mapSize.set(1024, 1024);
      directional.shadow.camera.near = 0.1;
      directional.shadow.camera.far = 50;
      directional.shadow.bias = -0.0005;
      directional.shadow.normalBias = 0.02;
      directional.shadow.radius = 1 + summary.shadowSoftness * 6;
    } else {
      light.position.set(
        summary.position[0],
        summary.position[1],
        summary.position[2]
      );
      light.shadow.mapSize.set(512, 512);
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = 30;
      light.shadow.bias = -0.001;
      light.shadow.normalBias = 0.02;
      light.shadow.radius = 1 + summary.shadowSoftness * 6;
      light.shadow.camera.updateProjectionMatrix();
    }
  }

  private disposeDocumentLight(entry: {
    readonly light: DirectionalLight | PointLight;
    readonly target: Object3D | null;
  }): void {
    entry.light.removeFromParent();
    entry.target?.removeFromParent();
    entry.light.dispose();
  }

  private applyDocumentLightVisibility(): void {
    const lit = this.currentMode === 'lit';
    this.sceneAmbient.visible = lit;
    this.documentLightGroup.visible = lit;
  }

  /** Update the interactive AO preview settings. */
  setAmbientOcclusion(settings: AmbientOcclusionSettings): void {
    if (
      this.ambientOcclusion.enabled === settings.enabled &&
      this.ambientOcclusion.strength === settings.strength &&
      this.ambientOcclusion.distance === settings.distance &&
      this.ambientOcclusion.bias === settings.bias &&
      this.ambientOcclusion.samples === settings.samples
    ) {
      return;
    }
    this.ambientOcclusion = { ...settings };
    this.markAmbientOcclusionDirty();
    this.schedule();
  }

  /** Pick a transform gizmo handle on the active object. */
  pickGizmo(clientX: number, clientY: number): GizmoHit | null {
    if (
      this.transformMode === 'select' ||
      (this.activeNodeId === null && this.activeGroupId === null)
    ) {
      return null;
    }
    this.updateGizmo();
    if (!this.setRayFromPointer(clientX, clientY)) {
      return null;
    }
    return this.objectGizmo.pick(this.raycaster);
  }

  /** World-space frame of the active gizmo for drag math. */
  getGizmoFrame(): {
    origin: Vector3;
    quaternion: Quaternion;
    size: number;
  } | null {
    if (
      this.activeGroupId === null &&
      this.selectionGizmoOrigin !== null &&
      this.selectionGizmoQuaternion !== null
    ) {
      const origin = this.selectionGizmoOrigin.clone();
      const quaternion = this.selectionGizmoQuaternion.clone();
      const size = Math.max(
        0.05,
        this.cameraRig.camera.position.distanceTo(origin) * 0.16
      );
      return { origin, quaternion, size };
    }
    const view = this.activeView();
    const group =
      this.activeGroupId !== null
        ? this.groupViews.get(this.activeGroupId)
        : undefined;
    const target = group ?? view?.group;
    if (!target) {
      return null;
    }
    target.updateMatrixWorld(true);
    const origin = target.getWorldPosition(new Vector3());
    const quaternion = target.getWorldQuaternion(new Quaternion());
    if (
      this.transformOrientation === 'global' &&
      this.transformMode !== 'scale'
    ) {
      quaternion.identity();
    }
    const size = Math.max(
      0.05,
      this.cameraRig.camera.position.distanceTo(origin) * 0.16
    );
    return { origin, quaternion, size };
  }

  /** Pick one visible camera marker in the Render workspace. */
  pickCamera(clientX: number, clientY: number): string | null {
    if (!this.setRayFromPointer(clientX, clientY)) {
      return null;
    }
    return this.cameraGizmos.pick(this.raycaster);
  }

  /** Pick one visible camera target/arrow handle. */
  pickCameraTarget(clientX: number, clientY: number): string | null {
    if (!this.setRayFromPointer(clientX, clientY)) {
      return null;
    }
    return this.cameraGizmos.pickTarget(this.raycaster);
  }

  /** Pick one visible light direction handle in the Light workspace. */
  pickLightDirection(clientX: number, clientY: number): string | null {
    if (!this.setRayFromPointer(clientX, clientY)) {
      return null;
    }
    return this.lightGizmos.pickDirection(this.raycaster);
  }

  /** Pick one visible light marker in the Light workspace. */
  pickLight(clientX: number, clientY: number): string | null {
    if (!this.setRayFromPointer(clientX, clientY)) {
      return null;
    }
    return this.lightGizmos.pick(this.raycaster);
  }

  /** Pointer ray in world space for axis-constrained gizmo drags. */
  getPointerRay(clientX: number, clientY: number): Ray | null {
    if (!this.setRayFromPointer(clientX, clientY)) {
      return null;
    }
    return this.raycaster.ray.clone();
  }

  /** Select active-node elements inside a screen-space lasso. */
  lassoSelect(
    mode: SelectionMode,
    clientPolygon: readonly { x: number; y: number }[]
  ): number[] {
    const view = this.activeView();
    if (!view) {
      return [];
    }
    return view.lassoSelect(
      mode,
      clientPolygon,
      this.cameraRig.camera,
      this.canvas,
      this.currentMode !== 'wireframe'
    );
  }

  /** Pick the nearest vertex on the active node. */
  pickVertex(clientX: number, clientY: number): number | null {
    const view = this.activeView();
    if (!view) {
      return null;
    }
    return view.pickVertex(
      clientX,
      clientY,
      this.cameraRig.camera,
      this.canvas
    );
  }

  /** Pick the nearest edge on the active node. */
  pickEdge(clientX: number, clientY: number): number | null {
    const view = this.activeView();
    if (!view) {
      return null;
    }
    return view.pickEdge(
      clientX,
      clientY,
      this.cameraRig.camera,
      this.canvas
    );
  }

  /** CSS bounds of the WebGL canvas, used for projected tool sampling. */
  getCanvasRect(): DOMRect {
    return this.canvas.getBoundingClientRect();
  }

  /** Project a world point into CSS client coordinates, if it is in front. */
  worldToClient(point: Vector3): { x: number; y: number } | null {
    this.cameraRig.camera.updateMatrixWorld();
    const projected = point.clone().project(this.cameraRig.camera);
    if (projected.z < -1 || projected.z > 1) {
      return null;
    }
    const rect = this.getCanvasRect();
    return {
      x: rect.left + ((projected.x + 1) * 0.5) * rect.width,
      y: rect.top + ((1 - projected.y) * 0.5) * rect.height
    };
  }

  /** Pick the frontmost surface point and interpolated UV on the active node. */
  pickSurface(clientX: number, clientY: number): SurfaceHit | null {
    const view = this.activeView();
    if (!view) {
      return null;
    }
    return view.pickSurface(
      clientX,
      clientY,
      this.cameraRig.camera,
      this.canvas
    );
  }

  /** Pick the frontmost face on the active node. */
  pickFace(clientX: number, clientY: number): number | null {
    const view = this.activeView();
    if (!view) {
      return null;
    }
    return view.pickFace(
      clientX,
      clientY,
      this.cameraRig.camera,
      this.canvas
    );
  }

  /** World-space position of a vertex on the active node. */
  getVertexWorldPosition(vertex: number): Vector3 {
    const view = this.activeView();
    if (!view) {
      return new Vector3();
    }
    return view.getVertexWorldPosition(vertex);
  }

  /** Convert a world-space point into the active node's local space. */
  worldToActiveNodeLocal(world: Vector3): Vector3 | null {
    return this.activeView()?.worldToLocal(world) ?? null;
  }

  /** Create a plane through a point, facing the current camera. */
  createCameraFacingPlane(point: Vector3): Plane {
    this.cameraRig.camera.getWorldDirection(this.scratchDirection);
    return new Plane().setFromNormalAndCoplanarPoint(
      this.scratchDirection,
      point
    );
  }

  /** Intersect a pointer ray with a world-space plane. */
  intersectPointerPlane(
    clientX: number,
    clientY: number,
    plane: Plane
  ): Vector3 | null {
    if (!this.setRayFromPointer(clientX, clientY)) {
      return null;
    }
    this.raycaster.ray.intersectPlane(plane, this.scratchPlaneHit);
    return this.scratchPlaneHit.clone();
  }

  /** Build or update the unlit transparent material for a reference plane. */
  private referenceMaterialFor(node: MeshNode): MeshBasicMaterial {
    const settings = node.reference;
    const opacity = settings?.opacity ?? 0.4;
    const inFront = settings?.inFront ?? true;
    const texture = this.resolveNodeTexture(node);
    const existing = this.referenceMaterials.get(node.id);
    if (
      existing &&
      existing.texture === texture &&
      existing.opacity === opacity &&
      existing.inFront === inFront
    ) {
      return existing.material;
    }
    existing?.material.dispose();
    const material = new MeshBasicMaterial({
      name: `loupoli-reference-${node.id}`,
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity,
      side: DoubleSide,
      depthTest: !inFront,
      depthWrite: false,
      toneMapped: false
    });
    this.referenceMaterials.set(node.id, {
      material,
      texture,
      opacity,
      inFront
    });
    return material;
  }

  /** Materials for a node's effective texture, cached per asset. */
  private materialsForNode(node: MeshNode): ViewportMaterials {
    const id = this.resolveNodeTextureId(node);
    if (id === null) {
      return this.materials;
    }
    const texture = this.resolveNodeTexture(node);
    if (!texture) {
      return this.materials;
    }
    const alphaMode = this.resolveNodeAlphaMode(node);
    const existing = this.textureMaterials.get(id);
    if (
      existing &&
      existing.texture === texture &&
      existing.alphaMode === alphaMode
    ) {
      return existing.materials;
    }
    if (existing) {
      existing.materials.lit.dispose();
      existing.materials.ps1.dispose();
    }
    const lit = this.materials.lit.clone();
    lit.map = texture;
    lit.alphaTest = alphaMode === 'cutout' ? 0.5 : 0;
    lit.transparent = alphaMode === 'blend';
    lit.depthWrite = alphaMode !== 'blend';
    lit.needsUpdate = true;
    const ps1 = this.materials.ps1.clone();
    const uniforms = ps1.uniforms as unknown as Ps1Uniforms;
    uniforms.uMap.value = texture;
    uniforms.uAlphaCutoff.value = alphaMode === 'cutout' ? 0.5 : 0;
    uniforms.uAlphaBlend.value = alphaMode === 'blend' ? 1 : 0;
    ps1.transparent = alphaMode === 'blend';
    ps1.depthWrite = alphaMode !== 'blend';
    ps1.needsUpdate = true;
    const materials: ViewportMaterials = {
      ...this.materials,
      lit,
      ps1
    };
    this.textureMaterials.set(id, { texture, alphaMode, materials });
    return materials;
  }

  /** Release per-asset material variants when an asset is deleted. */
  clearTextureMaterials(assetId: string): void {
    const record = this.textureMaterials.get(assetId);
    if (!record) {
      return;
    }
    record.materials.lit.dispose();
    record.materials.ps1.dispose();
    this.textureMaterials.delete(assetId);
  }

  /** Release every per-asset material variant after a project replacement. */
  clearAllTextureMaterials(): void {
    for (const record of this.textureMaterials.values()) {
      record.materials.lit.dispose();
      record.materials.ps1.dispose();
    }
    this.textureMaterials.clear();
    for (const entry of this.documentLights.values()) {
      this.disposeDocumentLight(entry);
    }
    this.documentLights.clear();
  }

  /** Schedule a frame after a texture composite or layer change. */
  refreshTexture(): void {
    this.schedule();
  }

  getRenderCount(): number {
    return this.renderCount;
  }

  /** True if a frame is currently queued. */
  hasScheduledFrame(): boolean {
    return this.rafId !== 0;
  }

  /** Number of loaded node views, used by development smoke tests. */
  getNodeViewCount(): number {
    return this.nodeViews.size;
  }

  /** Release every owned GPU resource and event listener. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }

    window.removeEventListener('resize', this.handleWindowResize);
    if (this.aoTimer !== 0) {
      window.clearTimeout(this.aoTimer);
      this.aoTimer = 0;
    }
    this.resizeObserver.disconnect();

    for (const view of this.nodeViews.values()) {
      this.scene.remove(view.group);
      view.dispose();
    }
    this.nodeViews.clear();

    this.scene.remove(this.grid.group);
    this.grid.dispose();
    for (const wrapper of this.groupViews.values()) {
      wrapper.removeFromParent();
      wrapper.clear();
    }
    this.groupViews.clear();
    this.scene.remove(this.objectGizmo.group);
    this.objectGizmo.dispose();
    this.lightGizmos.dispose();
    this.cameraGizmos.dispose();
    this.annotations.dispose();

    this.vertexMaterial.dispose();
    this.selectedVertexMaterial.dispose();
    this.pickingMaterial.dispose();
    this.selectedEdgeMaterial.dispose();
    this.selectedOutlineMaterial.dispose();
    this.previewLineMaterial.dispose();
    this.seamLineMaterial.dispose();
    this.seamEdgeMaterial.dispose();
    this.selectedFaceMaterial.dispose();
    for (const record of this.textureMaterials.values()) {
      record.materials.lit.dispose();
      record.materials.ps1.dispose();
    }
    this.textureMaterials.clear();
    for (const entry of this.documentLights.values()) {
      this.disposeDocumentLight(entry);
    }
    this.documentLights.clear();
    disposeViewportMaterials(this.materials);

    this.scene.clear();
    this.renderer.dispose();
  }

  private activeView(): MeshNodeView | null {
    return this.activeNodeId === null
      ? null
      : (this.nodeViews.get(this.activeNodeId) ?? null);
  }

  private overlayMaterials() {
    return {
      picking: this.pickingMaterial,
      vertex: this.vertexMaterial,
      selectedVertex: this.selectedVertexMaterial,
      selectedEdge: this.selectedEdgeMaterial,
      selectedOutline: this.selectedOutlineMaterial,
      previewLine: this.previewLineMaterial,
      seam: this.seamLineMaterial,
      seamEdge: this.seamEdgeMaterial,
      selectedFace: this.selectedFaceMaterial
    };
  }

  private updateGizmo(): void {
    if (
      this.transformMode === 'select' ||
      (this.activeNodeId === null && this.activeGroupId === null)
    ) {
      this.objectGizmo.group.visible = false;
      return;
    }
    const frame = this.getGizmoFrame();
    if (!frame) {
      this.objectGizmo.group.visible = false;
      return;
    }
    this.objectGizmo.setMode(this.transformMode);
    this.objectGizmo.setCenterHandles(
      this.activeGroupId === null && this.selectionGizmoOrigin !== null
    );
    this.objectGizmo.update(frame.origin, frame.quaternion, frame.size);
  }

  private applyShadingMode(mode: ShadingMode): void {
    this.markAmbientOcclusionDirty();
    for (const view of this.nodeViews.values()) {
      view.setShadingMode(mode);
      if (mode === 'texture-wire') {
        view.updateFrontWire(this.cameraRig.camera);
      }
    }

    const solid = mode === 'solid';
    this.ambientLight.intensity = 0.9;
    this.keyLight.intensity = 1.8;
    this.fillLight.intensity = 0.35;
    this.ambientLight.visible = solid;
    this.keyLight.visible = solid;
    this.fillLight.visible = solid;
    this.applyDocumentLightVisibility();
  }

  private markAmbientOcclusionDirty(): void {
    this.aoDirty = true;
    this.aoDirtyAt = performance.now();
    if (this.aoTimer !== 0 || this.disposed) {
      return;
    }
    this.aoTimer = window.setTimeout(() => {
      this.aoTimer = 0;
      this.schedule();
    }, 90);
  }

  /** Recompute the per-face AO preview when the Lit scene changes. */
  private updateAmbientOcclusionPreview(force = false): void {
    if (!this.ambientOcclusion.enabled || this.currentMode !== 'lit') {
      if (this.aoApplied) {
        for (const view of this.nodeViews.values()) {
          view.setFaceAo(null);
        }
        this.aoApplied = false;
      }
      this.aoDirty = false;
      return;
    }
    if (!this.aoDirty) {
      return;
    }
    if (!force && performance.now() - this.aoDirtyAt < 80) {
      if (this.aoTimer === 0) {
        this.aoTimer = window.setTimeout(() => {
          this.aoTimer = 0;
          this.schedule();
        }, 80);
      }
      return;
    }
    this.aoDirty = false;
    const views = [...this.nodeViews.values()].filter(
      (view) => !view.isReference && this.isViewVisible(view)
    );
    const faceTotal = views.reduce(
      (total, view) => total + view.evaluatedMesh.faceCount,
      0
    );
    if (faceTotal === 0 || faceTotal > MAX_AO_PREVIEW_FACES) {
      for (const view of this.nodeViews.values()) {
        view.setFaceAo(null);
      }
      this.aoApplied = false;
      return;
    }
    const occluders = views.map((view) =>
      this.occlusionTriangles(view, view.worldMatrix)
    );
    views.forEach((view, viewIndex) => {
      view.setFaceAo(
        this.faceAmbientOcclusion(
          view,
          view.worldMatrix,
          occluders,
          viewIndex
        )
      );
    });
    this.aoApplied = true;
  }

  private isViewVisible(view: MeshNodeView): boolean {
    let object: Object3D | null = view.group;
    while (object) {
      if (!object.visible) {
        return false;
      }
      object = object.parent;
    }
    return true;
  }

  private occlusionTriangles(
    view: MeshNodeView,
    matrix: Matrix4
  ): Float32Array {
    const mesh = view.evaluatedMesh;
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
      for (let corner = 1; corner < loop.length - 1; corner += 1) {
        for (const vertex of [loop[0], loop[corner], loop[corner + 1]]) {
          const point = new Vector3(
            mesh.positions[vertex * 3],
            mesh.positions[vertex * 3 + 1],
            mesh.positions[vertex * 3 + 2]
          ).applyMatrix4(matrix);
          triangles.push(point.x, point.y, point.z);
        }
      }
    }
    return new Float32Array(triangles);
  }

  private faceAmbientOcclusion(
    view: MeshNodeView,
    matrix: Matrix4,
    occluders: readonly Float32Array[],
    viewIndex: number
  ): Float32Array {
    const mesh = view.evaluatedMesh;
    const factors = new Float32Array(mesh.faceCount);
    const sign = bakeNormalSign(mesh, matrix);
    for (let face = 0; face < mesh.faceCount; face += 1) {
      const first = mesh.faceHalfEdge[face];
      const loop: number[] = [];
      let halfEdge = first;
      do {
        loop.push(mesh.heOrigin[halfEdge]);
        halfEdge = mesh.heNext[halfEdge];
      } while (halfEdge !== first && loop.length < 64);
      if (loop.length < 3) {
        factors[face] = 1;
        continue;
      }
      const world = loop.map((vertex) =>
        new Vector3(
          mesh.positions[vertex * 3],
          mesh.positions[vertex * 3 + 1],
          mesh.positions[vertex * 3 + 2]
        ).applyMatrix4(matrix)
      );
      const normal = new Vector3()
        .subVectors(world[1], world[0])
        .cross(new Vector3().subVectors(world[2], world[0]))
        .normalize()
        .multiplyScalar(sign);
      if (normal.lengthSq() < 1e-8) {
        factors[face] = 1;
        continue;
      }
      const center = new Vector3();
      for (const point of world) {
        center.add(point);
      }
      center.multiplyScalar(1 / world.length);
      const visibility = ambientVisibility(
        center,
        normal,
        this.ambientOcclusion,
        occluders,
        (viewIndex + 1) * 73856093 ^ (face + 1) * 19349663
      );
      factors[face] =
        1 - (1 - visibility) * this.ambientOcclusion.strength;
    }
    return factors;
  }

  private markCameraChanged(): void {
    this.cameraChanged = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.disposed || this.rafId !== 0) {
      return;
    }
    this.rafId = requestAnimationFrame(this.renderFrame);
  }

  private renderFrame = (timestamp: number): void => {
    this.rafId = 0;
    if (this.disposed) {
      return;
    }

    const wasTransitioning = this.cameraRig.isTransitioning;
    const stillTransitioning = this.cameraRig.tick(timestamp);
    if (wasTransitioning) {
      this.cameraChanged = true;
    }

    this.updateGizmo();
    this.updateAmbientOcclusionPreview();
    if (this.currentMode === 'texture-wire') {
      for (const view of this.nodeViews.values()) {
        view.updateFrontWire(this.cameraRig.camera);
      }
    }
    this.renderer.render(this.scene, this.cameraRig.camera);
    this.renderCount += 1;

    if (this.cameraChanged) {
      this.cameraChanged = false;
      this.onViewChanged?.(this.cameraRig.computeOrientation());
    }

    if (stillTransitioning) {
      this.schedule();
    }
  };

  private resize(): void {
    const host = this.canvas.parentElement;
    const width = Math.max(
      1,
      this.canvas.clientWidth || host?.clientWidth || window.innerWidth
    );
    const height = Math.max(
      1,
      this.canvas.clientHeight || host?.clientHeight || window.innerHeight
    );

    const coarsePointer =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    const cap = coarsePointer ? TOUCH_PIXEL_RATIO_CAP : DESKTOP_PIXEL_RATIO_CAP;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, cap);

    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setSize(width, height, false);

    const camera = this.cameraRig.camera;
    const nextAspect = width / height;
    if (camera.aspect !== nextAspect) {
      camera.aspect = nextAspect;
      camera.updateProjectionMatrix();
    }
    this.cameraRig.setViewportHeight(height);

    this.vertexMaterial.size = 7 * this.pixelRatio;
    this.selectedVertexMaterial.size = 13 * this.pixelRatio;

    // setSize clears the drawing buffer. Render synchronously so a pointer-move
    // resize never leaves a blank frame before the next animation-frame paint.
    this.updateGizmo();
    this.updateAmbientOcclusionPreview();
    if (this.currentMode === 'texture-wire') {
      for (const view of this.nodeViews.values()) {
        view.updateFrontWire(this.cameraRig.camera);
      }
    }
    this.renderer.render(this.scene, this.cameraRig.camera);
    this.renderCount += 1;
    this.schedule();
  }

  private setRayFromPointer(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.cameraRig.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointerNdc, this.cameraRig.camera);
    this.raycaster.near = 0;
    this.raycaster.far = Infinity;
    return true;
  }
}
