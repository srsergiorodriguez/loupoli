import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Camera
} from 'three';
import type { MeshNode, NodeTransform, SelectionMode } from '../scene/MeshNode';
import type { HalfEdgeMesh } from '../geometry/HalfEdgeMesh';
import type { ShadingMode } from '../editor/types';
import type { ViewportMaterials } from './materials';
import type { SurfaceHit } from './SurfaceHit';

/** Shared materials supplied by the viewport to every node view. */
export interface NodeViewSharedMaterials {
  readonly picking: MeshBasicMaterial;
  readonly vertex: PointsMaterial;
  readonly selectedVertex: PointsMaterial;
  readonly selectedEdge: MeshBasicMaterial;
  readonly selectedOutline: LineBasicMaterial;
  readonly previewLine: LineBasicMaterial;
  readonly seam: LineBasicMaterial;
  readonly seamEdge: MeshBasicMaterial;
  readonly selectedFace: MeshBasicMaterial;
}

interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const PICK_RADIUS_CSS = 16;
const WIRE_TUBE_RADIUS = 0.012;
const FRONT_WIRE_TUBE_RADIUS = 0.014;
const SELECTED_EDGE_RADIUS = 0.025;
const SEAM_TUBE_RADIUS = 0.019;
const Y_AXIS = new Vector3(0, 1, 0);

function pointInPolygon(
  x: number,
  y: number,
  polygon: readonly { x: number; y: number }[]
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if (
      (a.y > y) !== (b.y > y) &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function orientation(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number }
): boolean {
  const o1 = orientation(a.x, a.y, b.x, b.y, c.x, c.y);
  const o2 = orientation(a.x, a.y, b.x, b.y, d.x, d.y);
  const o3 = orientation(c.x, c.y, d.x, d.y, a.x, a.y);
  const o4 = orientation(c.x, c.y, d.x, d.y, b.x, b.y);
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function distanceToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= Number.EPSILON) {
    return (px - ax) ** 2 + (py - ay) ** 2;
  }
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)
  );
  return (px - (ax + dx * t)) ** 2 + (py - (ay + dy * t)) ** 2;
}

/**
 * One scene node's GPU-facing meshes and selection overlays.
 *
 * The view never owns topology. It derives buffers from the node's DCEL and
 * disposes only its own Three.js resources; shared materials stay with the
 * viewport.
 */
export class MeshNodeView {
  readonly group = new Group();
  /** Mesh instance this view's derived buffers were built for. */
  readonly boundMesh: HalfEdgeMesh;
  private readonly mesh: HalfEdgeMesh;
  private seamVisible = false;
  private shadingMode: ShadingMode = 'unlit';
  private cleanRender = false;
  private active = false;
  private selectionMode: SelectionMode = 'vertex';
  private selectedElements: readonly number[] = [];
  private showHandles = true;

  private triangleGeometry = new BufferGeometry();
  private readonly wireGeometry = new BufferGeometry();
  private readonly seamGeometry = new BufferGeometry();
  private readonly vertexGeometry = new BufferGeometry();
  private selectedVertexGeometry = new BufferGeometry();

  private readonly triangleMesh: Mesh;
  private readonly wireSegments: LineSegments;
  private readonly seamSegments: LineSegments;
  private seamEdgeMesh: InstancedMesh;
  private seamEdgeCapacity = 1;
  private readonly vertexPoints: Points;
  private readonly selectedVertexPoint: Points;
  private readonly pickingMesh: Mesh;
  private selectedEdgeMesh: InstancedMesh;
  private wireTubeMesh: InstancedMesh;
  private frontWireTubeMesh: InstancedMesh;
  private readonly edgeUnitGeometry: CylinderGeometry;
  private edgeCapacity = 1;
  private readonly selectedFaceMesh: Mesh;
  private readonly selectedFaceOutline: LineSegments;

  private trianglePositions: Float32Array;
  private triangleNormals: Float32Array;
  private triangleColors: Float32Array;
  private triangleUvs: Float32Array;
  private readonly wirePositions: Float32Array;
  private readonly seamPositions: Float32Array;
  private readonly frontWirePositions: Float32Array;
  private readonly vertexPositions: Float32Array;
  private readonly faceNormals: Float32Array;
  private readonly frontWireGeometry = new BufferGeometry();
  private readonly frontWireSegments: LineSegments;
  private readonly previewLineGeometry = new BufferGeometry();
  private readonly previewLine: LineSegments;

  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly scratchProjected = new Vector3();
  private readonly scratchDirection = new Vector3();

  private lastMeshRevision = -1;
  private referenceMaterial: MeshBasicMaterial | null = null;
  private readonly edgeMatrix = new Matrix4();
  private readonly edgePosition = new Vector3();
  private readonly edgeDirection = new Vector3();
  private readonly edgeQuaternion = new Quaternion();
  private readonly edgeScale = new Vector3();

  constructor(
    readonly node: MeshNode,
    private surfaceMaterials: ViewportMaterials,
    shared: NodeViewSharedMaterials
  ) {
    const mesh = node.getEvaluatedMesh().mesh;
    this.mesh = mesh;
    this.boundMesh = mesh;
    this.group.name = `loupoli-node-${node.id}`;
    this.group.visible = node.visible;

    this.trianglePositions = new Float32Array(mesh.triangleVertexCount * 3);
    this.triangleNormals = new Float32Array(mesh.triangleVertexCount * 3);
    this.triangleColors = new Float32Array(mesh.triangleVertexCount * 3);
    this.triangleUvs = new Float32Array(mesh.triangleVertexCount * 2);
    this.wirePositions = new Float32Array(mesh.edgeCount * 6);
    this.seamPositions = new Float32Array(mesh.edgeCount * 6);
    this.frontWirePositions = new Float32Array(mesh.edgeCount * 6);
    this.vertexPositions = new Float32Array(mesh.vertexCount * 3);
    this.faceNormals = new Float32Array(mesh.faceCount * 3);

    this.triangleGeometry.setAttribute(
      'position',
      new BufferAttribute(this.trianglePositions, 3).setUsage(DynamicDrawUsage)
    );
    this.triangleGeometry.setAttribute(
      'normal',
      new BufferAttribute(this.triangleNormals, 3).setUsage(DynamicDrawUsage)
    );
    this.triangleGeometry.setAttribute(
      'uv',
      new BufferAttribute(this.triangleUvs, 2).setUsage(DynamicDrawUsage)
    );
    this.triangleGeometry.setAttribute(
      'color',
      new BufferAttribute(this.triangleColors, 3).setUsage(DynamicDrawUsage)
    );

    this.wireGeometry.setAttribute(
      'position',
      new BufferAttribute(this.wirePositions, 3).setUsage(DynamicDrawUsage)
    );
    this.frontWireGeometry.setAttribute(
      'position',
      new BufferAttribute(this.frontWirePositions, 3).setUsage(
        DynamicDrawUsage
      )
    );
    this.frontWireGeometry.setDrawRange(0, 0);
    this.seamGeometry.setAttribute(
      'position',
      new BufferAttribute(this.seamPositions, 3).setUsage(DynamicDrawUsage)
    );
    this.seamGeometry.setDrawRange(0, 0);
    this.vertexGeometry.setAttribute(
      'position',
      new BufferAttribute(this.vertexPositions, 3).setUsage(DynamicDrawUsage)
    );
    this.triangleMesh = new Mesh(this.triangleGeometry, surfaceMaterials.solid);
    this.triangleMesh.name = 'loupoli-mesh';
    this.triangleMesh.frustumCulled = false;
    this.triangleMesh.castShadow = true;
    this.triangleMesh.receiveShadow = true;

    this.wireSegments = new LineSegments(
      this.wireGeometry,
      surfaceMaterials.wire
    );
    this.wireSegments.name = 'loupoli-wire';
    this.wireSegments.frustumCulled = false;
    this.wireSegments.visible = false;
    this.wireSegments.renderOrder = 1;

    this.frontWireSegments = new LineSegments(
      this.frontWireGeometry,
      surfaceMaterials.wireOverlay
    );
    this.frontWireSegments.name = 'loupoli-front-wire';
    this.frontWireSegments.frustumCulled = false;
    this.frontWireSegments.visible = false;
    this.frontWireSegments.renderOrder = 1;

    this.seamSegments = new LineSegments(
      this.seamGeometry,
      shared.seam
    );
    this.seamSegments.name = 'loupoli-seams';
    this.seamSegments.frustumCulled = false;
    this.seamSegments.renderOrder = 3;

    this.previewLine = new LineSegments(
      this.previewLineGeometry,
      shared.previewLine
    );
    this.previewLine.name = 'loupoli-action-preview-line';
    this.previewLine.frustumCulled = false;
    this.previewLine.visible = false;
    this.previewLine.renderOrder = 4;

    this.vertexPoints = new Points(this.vertexGeometry, shared.vertex);
    this.vertexPoints.name = 'loupoli-vertex-handles';
    this.vertexPoints.frustumCulled = false;
    this.vertexPoints.renderOrder = 2;

    this.selectedVertexPoint = new Points(
      this.selectedVertexGeometry,
      shared.selectedVertex
    );
    this.selectedVertexPoint.name = 'loupoli-selected-vertex';
    this.selectedVertexPoint.frustumCulled = false;
    this.selectedVertexPoint.renderOrder = 3;
    this.selectedVertexPoint.visible = false;

    this.edgeUnitGeometry = new CylinderGeometry(1, 1, 1, 6, 1, false);
    this.selectedEdgeMesh = this.createEdgeInstances(shared.selectedEdge, 1);
    this.wireTubeMesh = this.createEdgeInstances(
      surfaceMaterials.wireTube,
      Math.max(1, mesh.edgeCount),
      'loupoli-wire-tubes',
      1
    );
    this.frontWireTubeMesh = this.createEdgeInstances(
      surfaceMaterials.wireOverlayTube,
      Math.max(1, mesh.edgeCount),
      'loupoli-front-wire-tubes',
      2
    );
    this.seamEdgeMesh = this.createEdgeInstances(
      shared.seamEdge,
      1,
      'loupoli-seam-tubes',
      3
    );

    this.selectedFaceMesh = new Mesh(
      new BufferGeometry(),
      shared.selectedFace
    );
    this.selectedFaceMesh.name = 'loupoli-selected-face';
    this.selectedFaceMesh.frustumCulled = false;
    this.selectedFaceMesh.renderOrder = 2;
    this.selectedFaceMesh.visible = false;

    this.selectedFaceOutline = new LineSegments(
      new BufferGeometry(),
      shared.selectedOutline
    );
    this.selectedFaceOutline.name = 'loupoli-selected-face-outline';
    this.selectedFaceOutline.frustumCulled = false;
    this.selectedFaceOutline.renderOrder = 4;
    this.selectedFaceOutline.visible = false;

    this.pickingMesh = new Mesh(this.triangleGeometry, shared.picking);
    this.pickingMesh.name = 'loupoli-picking';
    this.pickingMesh.visible = false;

    this.group.add(
      this.triangleMesh,
      this.wireSegments,
      this.wireTubeMesh,
      this.frontWireSegments,
      this.frontWireTubeMesh,
      this.seamSegments,
      this.previewLine,
      this.vertexPoints,
      this.selectedVertexPoint,
      this.seamEdgeMesh,
      this.selectedEdgeMesh,
      this.selectedFaceMesh,
      this.selectedFaceOutline,
      this.pickingMesh
    );

    this.seamSegments.visible = false;
    this.setTransform(node.transform);
    this.refreshMesh();
  }

  /** Revision of the mesh data last written into this view. */
  get meshRevision(): number {
    return this.lastMeshRevision;
  }

  /** Apply a node transform without touching derived geometry. */
  setTransform(transform: NodeTransform): void {
    this.group.position.set(...transform.position);
    this.group.rotation.set(...transform.rotation);
    this.group.scale.set(...transform.scale);
    this.group.updateMatrixWorld(true);
  }

  /** Set node visibility. */
  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /** Update the active node and the full set of selected element indices. */
  /** Swap in a reference-image material and suppress editor overlays. */
  setReferenceMaterial(material: MeshBasicMaterial | null): void {
    this.referenceMaterial = material;
    if (material) {
      material.side = DoubleSide;
      this.triangleMesh.castShadow = false;
      this.triangleMesh.receiveShadow = false;
    } else {
      this.triangleMesh.castShadow = true;
      this.triangleMesh.receiveShadow = true;
    }
    this.setShadingMode(this.shadingMode);
  }

  /** Whether this view is currently displaying a reference image plane. */
  get isReference(): boolean {
    return this.referenceMaterial !== null;
  }

  setInteraction(
    active: boolean,
    mode: SelectionMode,
    selectedElements: readonly number[],
    showHandles = true
  ): void {
    this.active = active;
    this.selectionMode = mode;
    this.selectedElements = [...selectedElements];
    this.showHandles = showHandles;
    if (this.cleanRender) {
      return;
    }
    if (this.referenceMaterial) {
      this.vertexPoints.visible = false;
      this.selectedVertexPoint.visible = false;
      this.selectedEdgeMesh.visible = false;
      this.selectedFaceMesh.visible = false;
      this.selectedFaceOutline.visible = false;
      this.wireSegments.visible = false;
      this.wireTubeMesh.visible = false;
      this.frontWireSegments.visible = false;
      this.frontWireTubeMesh.visible = false;
      this.seamSegments.visible = false;
      this.seamEdgeMesh.visible = false;
      this.previewLine.visible = false;
      return;
    }

    const hasSelection = active && selectedElements.length > 0;
    this.vertexPoints.visible = active && mode === 'vertex' && showHandles;
    this.selectedVertexPoint.visible = hasSelection && mode === 'vertex';
    this.selectedEdgeMesh.visible = hasSelection && mode === 'edge';
    this.selectedFaceMesh.visible = hasSelection && mode === 'face';
    this.selectedFaceOutline.visible = hasSelection && mode === 'face';

    this.updateSelectionGeometry();
  }

  /** Switch surface shading for this node. */
  setShadingMode(mode: ShadingMode): void {
    this.shadingMode = mode;
    const isWire = mode === 'wireframe';
    const isTextureWire = mode === 'texture-wire';
    this.triangleMesh.visible = !isWire;
    this.wireSegments.visible = isWire;
    this.wireTubeMesh.visible = isWire;
    this.frontWireSegments.visible = isTextureWire;
    this.frontWireTubeMesh.visible = isTextureWire;
    if (this.frontWireSegments.visible) {
      this.frontWireGeometry.setDrawRange(0, 0);
    }
    if (this.referenceMaterial) {
      this.triangleMesh.visible = true;
      this.triangleMesh.material = this.referenceMaterial;
      this.wireSegments.visible = false;
      this.wireTubeMesh.visible = false;
      this.frontWireSegments.visible = false;
      this.frontWireTubeMesh.visible = false;
      this.seamSegments.visible = false;
      this.seamEdgeMesh.visible = false;
      this.vertexPoints.visible = false;
      this.selectedVertexPoint.visible = false;
      this.selectedEdgeMesh.visible = false;
      this.selectedFaceMesh.visible = false;
      this.selectedFaceOutline.visible = false;
      this.previewLine.visible = false;
      return;
    }

    if (mode === 'solid') {
      this.triangleMesh.material = this.surfaceMaterials.solid;
    } else if (mode === 'lit') {
      this.triangleMesh.material = this.surfaceMaterials.lit;
    } else {
      this.triangleMesh.material = this.surfaceMaterials.ps1;
    }
  }

  /** Swap the per-texture material set without rebuilding geometry. */
  setSurfaceMaterials(materials: ViewportMaterials): void {
    this.surfaceMaterials = materials;
    this.setShadingMode(this.shadingMode);
  }

  /** Show or hide the seam overlay without changing seam data. */
  setSeamVisible(visible: boolean): void {
    this.seamVisible = visible;
    if (this.cleanRender || this.referenceMaterial) {
      return;
    }
    this.seamSegments.visible = visible;
    this.seamEdgeMesh.visible = visible && this.seamEdgeMesh.count > 0;
  }

  /** Hide all editor-only overlays for one clean render. */
  setCleanRender(clean: boolean): void {
    if (this.cleanRender === clean) {
      return;
    }
    this.cleanRender = clean;
    if (clean) {
      this.vertexPoints.visible = false;
      this.selectedVertexPoint.visible = false;
      this.selectedEdgeMesh.visible = false;
      this.selectedFaceMesh.visible = false;
      this.selectedFaceOutline.visible = false;
      this.seamSegments.visible = false;
      this.seamEdgeMesh.visible = false;
      this.wireSegments.visible = false;
      this.wireTubeMesh.visible = false;
      this.frontWireSegments.visible = false;
      this.frontWireTubeMesh.visible = false;
      this.previewLine.visible = false;
      return;
    }
    this.setShadingMode(this.shadingMode);
    this.seamSegments.visible = this.seamVisible;
    this.seamEdgeMesh.visible =
      this.seamVisible && this.seamEdgeMesh.count > 0;
    this.setInteraction(
      this.active,
      this.selectionMode,
      this.selectedElements,
      this.showHandles
    );
  }

  /** Write current DCEL data into the reusable render buffers. */
  refreshMesh(): void {
    if (this.lastMeshRevision === this.mesh.meshRevision) {
      return;
    }

    const mesh = this.mesh;
    const required = mesh.triangleVertexCount;
    if (this.trianglePositions.length !== required * 3) {
      this.rebuildTriangleGeometry(required);
    }

    mesh.writeTriangleData(
      this.trianglePositions,
      this.triangleNormals,
      this.triangleUvs
    );
    this.writeMaterialColors(mesh);
    mesh.writeEdgePositions(this.wirePositions);
    this.updateWireTubes();
    const seamCount = mesh.writeSeamEdgePositions(this.seamPositions);
    this.seamGeometry.setDrawRange(0, seamCount * 2);
    this.updateSeamEdges(seamCount);
    this.updateFaceNormals(mesh);
    mesh.writeVertexPositions(this.vertexPositions);

    this.triangleGeometry.getAttribute('position').needsUpdate = true;
    this.triangleGeometry.getAttribute('normal').needsUpdate = true;
    this.triangleGeometry.getAttribute('uv').needsUpdate = true;
    this.triangleGeometry.getAttribute('color').needsUpdate = true;
    this.wireGeometry.getAttribute('position').needsUpdate = true;
    this.seamGeometry.getAttribute('position').needsUpdate = true;
    this.vertexGeometry.getAttribute('position').needsUpdate = true;

    this.triangleGeometry.computeBoundingBox();
    this.triangleGeometry.computeBoundingSphere();
    this.wireGeometry.computeBoundingSphere();
    this.vertexGeometry.computeBoundingSphere();
    this.lastMeshRevision = mesh.meshRevision;
    this.updateSelectionGeometry();
  }

  /** Write one flat material color per render triangle. */
  private writeMaterialColors(mesh: HalfEdgeMesh): void {
    const palette = this.node.materialPalette;
    let cursor = 0;
    for (let face = 0; face < mesh.faceCount; face += 1) {
      const material = mesh.faceMaterial[face];
      const color =
        material >= 0 && material < palette.length
          ? palette[material]
          : '#ffffff';
      const hex = /^#([0-9a-fA-F]{6})$/.exec(color)?.[1] ?? 'ffffff';
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const count = mesh.renderTriangleCountForFace(face) * 3;
      for (let i = 0; i < count; i += 1) {
        const offset = (cursor + i) * 3;
        this.triangleColors[offset] = r;
        this.triangleColors[offset + 1] = g;
        this.triangleColors[offset + 2] = b;
      }
      cursor += count;
    }
  }

  /** World-space bounds of this node. */
  getWorldBounds(): Box3 {
    const bounds = this.mesh.getBounds();
    this.group.updateMatrixWorld(true);
    return new Box3(
      new Vector3(bounds.min[0], bounds.min[1], bounds.min[2]),
      new Vector3(bounds.max[0], bounds.max[1], bounds.max[2])
    ).applyMatrix4(this.group.matrixWorld);
  }

  /** Convert a world-space point into this node's local coordinate system. */
  worldToLocal(world: Vector3): Vector3 {
    this.group.updateMatrixWorld(true);
    return this.group.worldToLocal(world.clone());
  }

  /** World-space position of a topology vertex. */
  getVertexWorldPosition(vertex: number): Vector3 {
    this.group.updateMatrixWorld(true);
    return new Vector3()
      .fromArray(this.mesh.positions, vertex * 3)
      .applyMatrix4(this.group.matrixWorld);
  }

  /**
   * Select topology elements inside or intersecting a screen-space lasso.
   *
   * Lasso selection is view-through only in Wireframe. In shaded modes,
   * vertices, edge samples, and face centroids use the same occlusion test as
   * individual picks. Vertices use point containment, edges use endpoint
   * containment or segment crossing, and faces use corner/centroid containment.
   */
  lassoSelect(
    mode: SelectionMode,
    clientPolygon: readonly { x: number; y: number }[],
    camera: Camera,
    canvas: HTMLCanvasElement,
    visibleOnly = false
  ): number[] {
    if (clientPolygon.length < 3) {
      return [];
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return [];
    }
    const polygon = clientPolygon.map((point) => ({
      x: point.x - rect.left,
      y: point.y - rect.top
    }));
    this.group.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    const selected: number[] = [];
    if (mode === 'vertex') {
      for (let vertex = 0; vertex < this.mesh.vertexCount; vertex += 1) {
        const point = this.projectVertex(vertex, camera, rect);
        if (!point || !pointInPolygon(point.x, point.y, polygon)) {
          continue;
        }
        if (
          visibleOnly &&
          this.isOccluded(this.getVertexWorldPosition(vertex), camera)
        ) {
          continue;
        }
        selected.push(vertex);
      }
      return selected;
    }
    if (mode === 'edge') {
      for (let edge = 0; edge < this.mesh.edgeCount; edge += 1) {
        const [from, to] = this.mesh.getEdgeVertices(edge);
        const a = this.projectVertex(from, camera, rect);
        const b = this.projectVertex(to, camera, rect);
        if (!a || !b) {
          continue;
        }
        let crosses = false;
        for (let index = 0; index < polygon.length && !crosses; index += 1) {
          const next = polygon[(index + 1) % polygon.length];
          crosses = segmentsIntersect(a, b, polygon[index], next);
        }
        const inLasso =
          crosses ||
          pointInPolygon(a.x, a.y, polygon) ||
          pointInPolygon(b.x, b.y, polygon);
        if (!inLasso) {
          continue;
        }
        if (visibleOnly) {
          const worldA = this.getVertexWorldPosition(from);
          const worldB = this.getVertexWorldPosition(to);
          const sample = new Vector3();
          let visible = false;
          for (const t of [0.25, 0.5, 0.75]) {
            sample.lerpVectors(worldA, worldB, t);
            if (!this.isOccluded(sample, camera)) {
              visible = true;
              break;
            }
          }
          if (!visible) {
            continue;
          }
        }
        selected.push(edge);
      }
      return selected;
    }
    for (let face = 0; face < this.mesh.faceCount; face += 1) {
      const start = this.mesh.faceHalfEdge[face];
      let halfEdge = start;
      let anyCorner = false;
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      do {
        const point = this.projectVertex(
          this.mesh.heOrigin[halfEdge],
          camera,
          rect
        );
        if (point) {
          anyCorner ||= pointInPolygon(point.x, point.y, polygon);
          sumX += point.x;
          sumY += point.y;
          count += 1;
        }
        halfEdge = this.mesh.heNext[halfEdge];
      } while (halfEdge !== start);
      if (
        !anyCorner &&
        !(count > 0 && pointInPolygon(sumX / count, sumY / count, polygon))
      ) {
        continue;
      }
      if (visibleOnly && count > 0) {
        const startHalfEdge = this.mesh.faceHalfEdge[face];
        let halfEdge = startHalfEdge;
        const center = new Vector3();
        let samples = 0;
        do {
          center.add(this.getVertexWorldPosition(this.mesh.heOrigin[halfEdge]));
          samples += 1;
          halfEdge = this.mesh.heNext[halfEdge];
        } while (halfEdge !== startHalfEdge);
        center.multiplyScalar(1 / Math.max(samples, 1));
        if (this.isOccluded(center, camera)) {
          continue;
        }
      }
      selected.push(face);
    }
    return selected;
  }

  /**
   * Pick the nearest visible vertex within 16 CSS px.
   *
   * Candidate ordering is screen distance first and camera depth second, which
   * makes overlapping handles deterministic.
   */
  pickVertex(
    clientX: number,
    clientY: number,
    camera: Camera,
    canvas: HTMLCanvasElement
  ): number | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    this.group.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const radiusSq = PICK_RADIUS_CSS * PICK_RADIUS_CSS;
    let best: number | null = null;
    let bestDistanceSq = radiusSq;
    let bestDepth = Infinity;

    for (let vertex = 0; vertex < this.mesh.vertexCount; vertex += 1) {
      const projected = this.projectVertex(vertex, camera, rect);
      if (!projected) {
        continue;
      }
      const distanceSq = (projected.x - px) ** 2 + (projected.y - py) ** 2;
      if (distanceSq > radiusSq) {
        continue;
      }
      if (this.isOccluded(this.getVertexWorldPosition(vertex), camera)) {
        continue;
      }
      if (
        distanceSq < bestDistanceSq - 0.001 ||
        (Math.abs(distanceSq - bestDistanceSq) < 0.001 &&
          projected.z < bestDepth)
      ) {
        best = vertex;
        bestDistanceSq = distanceSq;
        bestDepth = projected.z;
      }
    }

    return best;
  }

  /** Pick the nearest visible topological edge within 16 CSS px. */
  pickEdge(
    clientX: number,
    clientY: number,
    camera: Camera,
    canvas: HTMLCanvasElement
  ): number | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    this.group.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const radiusSq = PICK_RADIUS_CSS * PICK_RADIUS_CSS;
    let best: number | null = null;
    let bestDistanceSq = radiusSq;
    let bestDepth = Infinity;

    for (let edge = 0; edge < this.mesh.edgeCount; edge += 1) {
      const [from, to] = this.mesh.getEdgeVertices(edge);
      const a = this.projectWorld(this.getVertexWorldPosition(from), camera, rect);
      const b = this.projectWorld(this.getVertexWorldPosition(to), camera, rect);
      if (!a || !b) {
        continue;
      }
      const distanceSq = distanceToSegmentSq(px, py, a.x, a.y, b.x, b.y);
      if (distanceSq > radiusSq) {
        continue;
      }

      const depth = (a.z + b.z) * 0.5;
      const t = clampProjection(px, py, a, b);
      const aWorld = this.getVertexWorldPosition(from);
      const bWorld = this.getVertexWorldPosition(to);
      const world = aWorld.clone().lerp(bWorld, t);
      if (this.isOccluded(world, camera)) {
        continue;
      }

      if (
        distanceSq < bestDistanceSq - 0.001 ||
        (Math.abs(distanceSq - bestDistanceSq) < 0.001 && depth < bestDepth)
      ) {
        best = edge;
        bestDistanceSq = distanceSq;
        bestDepth = depth;
      }
    }

    return best;
  }

  /** Pick the frontmost source face under the pointer. */
  pickFace(
    clientX: number,
    clientY: number,
    camera: Camera,
    canvas: HTMLCanvasElement
  ): number | null {
    if (!this.setRayFromPointer(clientX, clientY, camera, canvas)) {
      return null;
    }
    this.group.updateMatrixWorld(true);
    const intersections = this.raycaster.intersectObject(this.pickingMesh, false);
    if (intersections.length === 0) {
      return null;
    }
    const triangle = intersections[0].faceIndex;
    if (triangle === undefined || triangle === null) {
      return null;
    }
    return this.mesh.faceFromRenderTriangle(triangle);
  }

  /**
   * Pick the frontmost surface point and interpolate its texture UV.
   *
   * This is the shared hit primitive for 3D selection and projection painting.
   * The returned UV density converts a screen-space brush diameter into a
   * texture-space radius without assuming a fixed camera distance.
   */
  pickSurface(
    clientX: number,
    clientY: number,
    camera: Camera,
    canvas: HTMLCanvasElement
  ): SurfaceHit | null {
    if (!this.setRayFromPointer(clientX, clientY, camera, canvas)) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    this.group.updateMatrixWorld(true);
    const intersections = this.raycaster.intersectObject(this.pickingMesh, false);
    const hit = intersections[0];
    if (!hit || hit.faceIndex === undefined || hit.faceIndex === null) {
      return null;
    }
    const triangle = hit.faceIndex;
    const face = this.mesh.faceFromRenderTriangle(triangle);
    const uv = hit.uv;
    if (!uv) {
      return null;
    }
    const worldNormal = (hit.face?.normal ?? new Vector3(0, 0, 1))
      .clone()
      .transformDirection(this.group.matrixWorld)
      .normalize();
    const viewDirection = hit.point.clone().sub(camera.position).normalize();
    if (worldNormal.dot(viewDirection) > 0) {
      return null;
    }
    const uvPerCssPixel = this.surfaceUvDensity(
      triangle,
      camera,
      rect
    );
    return {
      nodeId: this.node.id,
      face,
      triangle,
      uv: [uv.x, uv.y],
      point: [hit.point.x, hit.point.y, hit.point.z],
      normal: [worldNormal.x, worldNormal.y, worldNormal.z],
      distance: hit.distance,
      uvPerCssPixel
    };
  }

  /** Estimate local UV units per CSS pixel from one render triangle. */
  private surfaceUvDensity(
    triangle: number,
    camera: Camera,
    rect: DOMRect
  ): number {
    const base = triangle * 3;
    const uvs = [
      [this.triangleUvs[base * 2], this.triangleUvs[base * 2 + 1]],
      [this.triangleUvs[base * 2 + 2], this.triangleUvs[base * 2 + 3]],
      [this.triangleUvs[base * 2 + 4], this.triangleUvs[base * 2 + 5]]
    ];
    const points: { x: number; y: number }[] = [];
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = (base + corner) * 3;
      const local = new Vector3(
        this.trianglePositions[offset],
        this.trianglePositions[offset + 1],
        this.trianglePositions[offset + 2]
      );
      this.group.localToWorld(local);
      const projected = this.projectWorld(local, camera, rect);
      if (!projected) {
        return 0.002;
      }
      points.push(projected);
    }
    const uvArea = Math.abs(
      (uvs[1][0] - uvs[0][0]) * (uvs[2][1] - uvs[0][1]) -
        (uvs[2][0] - uvs[0][0]) * (uvs[1][1] - uvs[0][1])
    ) / 2;
    const screenArea = Math.abs(
      (points[1].x - points[0].x) * (points[2].y - points[0].y) -
        (points[2].x - points[0].x) * (points[1].y - points[0].y)
    ) / 2;
    if (uvArea <= 1e-12 || screenArea <= 0.25) {
      return 0.002;
    }
    return Math.sqrt(uvArea / screenArea);
  }

  /** Release all GPU resources owned by this view. */
  dispose(): void {
    this.group.removeFromParent();
    const faceGeometry = this.selectedFaceMesh.geometry;
    this.triangleGeometry.dispose();
    this.wireGeometry.dispose();
    this.frontWireGeometry.dispose();
    this.previewLineGeometry.dispose();
    this.vertexGeometry.dispose();
    this.selectedVertexGeometry.dispose();
    this.selectedEdgeMesh.dispose();
    this.wireTubeMesh.dispose();
    this.frontWireTubeMesh.dispose();
    this.edgeUnitGeometry.dispose();
    this.selectedFaceOutline.geometry.dispose();
    faceGeometry.dispose();
    this.group.clear();
  }

  private projectVertex(
    vertex: number,
    camera: Camera,
    rect: DOMRect
  ): ProjectedPoint | null {
    const world = this.getVertexWorldPosition(vertex);
    return this.projectWorld(world, camera, rect);
  }

  private projectWorld(
    world: Vector3,
    camera: Camera,
    rect: DOMRect
  ): ProjectedPoint | null {
    this.scratchProjected.copy(world).project(camera);
    if (this.scratchProjected.z < -1 || this.scratchProjected.z > 1) {
      return null;
    }
    return {
      x: (this.scratchProjected.x * 0.5 + 0.5) * rect.width,
      y: (-this.scratchProjected.y * 0.5 + 0.5) * rect.height,
      z: this.scratchProjected.z
    };
  }

  private setRayFromPointer(
    clientX: number,
    clientY: number,
    camera: Camera,
    canvas: HTMLCanvasElement
  ): boolean {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointerNdc, camera);
    this.raycaster.near = 0;
    this.raycaster.far = Infinity;
    return true;
  }

  private isOccluded(world: Vector3, camera: Camera): boolean {
    const distance = world.distanceTo(camera.position);
    this.scratchDirection.copy(world).sub(camera.position).normalize();
    this.raycaster.set(camera.position, this.scratchDirection);
    this.raycaster.near = 0;
    this.raycaster.far = Math.max(0, distance - 0.02);
    const hits = this.raycaster.intersectObject(this.pickingMesh, false);
    this.raycaster.far = Infinity;
    return hits.length > 0;
  }

  private updateSelectionGeometry(): void {
    if (!this.active || this.selectedElements.length === 0) {
      this.selectedVertexPoint.visible = false;
      this.selectedEdgeMesh.visible = false;
      this.selectedFaceMesh.visible = false;
      this.selectedFaceOutline.visible = false;
      return;
    }

    if (this.selectionMode === 'vertex') {
      this.updateSelectedVertices();
      return;
    }

    if (this.selectionMode === 'edge') {
      this.updateSelectedEdges();
      return;
    }

    this.updateSelectedFaces();
  }

  private updateSelectedVertices(): void {
    const mesh = this.mesh;
    const vertices = this.selectedElements.filter(
      (vertex) => vertex >= 0 && vertex < mesh.vertexCount
    );
    if (vertices.length === 0) {
      this.selectedVertexPoint.visible = false;
      return;
    }

    const positions = new Float32Array(vertices.length * 3);
    for (let i = 0; i < vertices.length; i += 1) {
      const offset = vertices[i] * 3;
      positions[i * 3] = mesh.positions[offset];
      positions[i * 3 + 1] = mesh.positions[offset + 1];
      positions[i * 3 + 2] = mesh.positions[offset + 2];
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    const previous = this.selectedVertexGeometry;
    this.selectedVertexGeometry = geometry;
    this.selectedVertexPoint.geometry = geometry;
    this.selectedVertexPoint.visible =
      this.active && this.selectionMode === 'vertex';
    previous.dispose();
  }

  private updateSelectedEdges(): void {
    const mesh = this.mesh;
    const edges = this.selectedElements.filter(
      (edge) => edge >= 0 && edge < mesh.edgeCount
    );
    if (edges.length === 0) {
      this.selectedEdgeMesh.visible = false;
      return;
    }

    if (edges.length > this.edgeCapacity) {
      const material = this.selectedEdgeMesh.material as MeshBasicMaterial;
      this.group.remove(this.selectedEdgeMesh);
      this.selectedEdgeMesh.dispose();
    this.wireTubeMesh.dispose();
    this.frontWireTubeMesh.dispose();
      this.edgeCapacity = nextPowerOfTwo(edges.length);
      this.selectedEdgeMesh = this.createEdgeInstances(
        material,
        this.edgeCapacity
      );
      this.group.add(this.selectedEdgeMesh);
    }

    for (let i = 0; i < edges.length; i += 1) {
      const [from, to] = mesh.getEdgeVertices(edges[i]);
      const start = new Vector3(...mesh.getVertexPosition(from));
      const end = new Vector3(...mesh.getVertexPosition(to));
      this.edgeDirection.copy(end).sub(start);
      const length = this.edgeDirection.length();
      if (length <= Number.EPSILON) {
        this.selectedEdgeMesh.setMatrixAt(i, this.edgeMatrix.makeScale(0, 0, 0));
        continue;
      }
      this.edgeDirection.normalize();
      const radius = SELECTED_EDGE_RADIUS;
      this.edgePosition.copy(start).add(end).multiplyScalar(0.5);
      this.edgeQuaternion.setFromUnitVectors(Y_AXIS, this.edgeDirection);
      this.edgeScale.set(radius, length, radius);
      this.edgeMatrix.compose(
        this.edgePosition,
        this.edgeQuaternion,
        this.edgeScale
      );
      this.selectedEdgeMesh.setMatrixAt(i, this.edgeMatrix);
    }

    this.selectedEdgeMesh.count = edges.length;
    this.selectedEdgeMesh.instanceMatrix.needsUpdate = true;
    this.selectedEdgeMesh.visible =
      this.active && this.selectionMode === 'edge';
  }

  /**
   * Keep seam tubes visible in every shading mode.
   *
   * The line overlay stays for exact one-pixel continuity; the instanced tubes
   * provide a readable target at tablet viewing distance without duplicating
   * the selected-edge overlay.
   */
  private updateSeamEdges(seamCount: number): void {
    const mesh = this.mesh;
    if (seamCount > this.seamEdgeCapacity) {
      while (this.seamEdgeCapacity < seamCount) {
        this.seamEdgeCapacity *= 2;
      }
      this.seamEdgeMesh.removeFromParent();
      this.seamEdgeMesh.dispose();
      this.seamEdgeMesh = this.createEdgeInstances(
        this.seamEdgeMesh.material as MeshBasicMaterial,
        this.seamEdgeCapacity,
        'loupoli-seam-tubes',
        3
      );
      this.group.add(this.seamEdgeMesh);
    }
    if (seamCount === 0) {
      this.seamEdgeMesh.count = 0;
      this.seamEdgeMesh.visible = false;
      return;
    }
    let cursor = 0;
    for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
      if (!mesh.isEdgeSeam(edge)) {
        continue;
      }
      const [from, to] = mesh.getEdgeVertices(edge);
      const start = new Vector3(...mesh.getVertexPosition(from));
      const end = new Vector3(...mesh.getVertexPosition(to));
      this.edgeDirection.copy(end).sub(start);
      const length = this.edgeDirection.length();
      if (length <= Number.EPSILON) {
        this.seamEdgeMesh.setMatrixAt(cursor, this.edgeMatrix.makeScale(0, 0, 0));
      } else {
        this.edgeDirection.normalize();
        const radius = SEAM_TUBE_RADIUS;
        this.edgePosition.copy(start).add(end).multiplyScalar(0.5);
        this.edgeQuaternion.setFromUnitVectors(Y_AXIS, this.edgeDirection);
        this.edgeScale.set(radius, length, radius);
        this.edgeMatrix.compose(
          this.edgePosition,
          this.edgeQuaternion,
          this.edgeScale
        );
        this.seamEdgeMesh.setMatrixAt(cursor, this.edgeMatrix);
      }
      cursor += 1;
    }
    this.seamEdgeMesh.count = cursor;
    this.seamEdgeMesh.instanceMatrix.needsUpdate = true;
    this.seamEdgeMesh.visible = this.seamVisible;
  }

  private updateSelectedFaces(): void {
    const mesh = this.mesh;
    const faces = this.selectedElements.filter(
      (face) => face >= 0 && face < mesh.faceCount
    );
    if (faces.length === 0) {
      this.selectedFaceMesh.visible = false;
      this.selectedFaceOutline.visible = false;
      return;
    }

    const fill: number[] = [];
    const outline: number[] = [];
    for (const face of faces) {
      const vertices = mesh.getFaceVertices(face);
      for (let i = 1; i < vertices.length - 1; i += 1) {
        fill.push(...mesh.getVertexPosition(vertices[0]));
        fill.push(...mesh.getVertexPosition(vertices[i]));
        fill.push(...mesh.getVertexPosition(vertices[i + 1]));
      }
      for (let i = 0; i < vertices.length; i += 1) {
        outline.push(...mesh.getVertexPosition(vertices[i]));
        outline.push(
          ...mesh.getVertexPosition(vertices[(i + 1) % vertices.length])
        );
      }
    }

    const fillGeometry = new BufferGeometry();
    fillGeometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(fill), 3)
    );
    fillGeometry.computeBoundingSphere();
    const oldFill = this.selectedFaceMesh.geometry;
    this.selectedFaceMesh.geometry = fillGeometry;
    oldFill.dispose();

    const outlineGeometry = new BufferGeometry();
    outlineGeometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(outline), 3)
    );
    outlineGeometry.computeBoundingSphere();
    const oldOutline = this.selectedFaceOutline.geometry;
    this.selectedFaceOutline.geometry = outlineGeometry;
    oldOutline.dispose();

    this.selectedFaceMesh.visible =
      this.active && this.selectionMode === 'face';
    this.selectedFaceOutline.visible =
      this.active && this.selectionMode === 'face';
  }

  private createEdgeInstances(
    material: MeshBasicMaterial,
    capacity: number,
    name = 'loupoli-selected-edges',
    renderOrder = 4
  ): InstancedMesh {
    const mesh = new InstancedMesh(this.edgeUnitGeometry, material, capacity);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.count = 0;
    mesh.visible = false;
    return mesh;
  }

  private updateFaceNormals(mesh: HalfEdgeMesh): void {
    for (let face = 0; face < mesh.faceCount; face += 1) {
      const normal = mesh.computeFaceNormal(face);
      this.faceNormals[face * 3] = normal[0];
      this.faceNormals[face * 3 + 1] = normal[1];
      this.faceNormals[face * 3 + 2] = normal[2];
    }
  }

  private updateWireTubes(): void {
    const mesh = this.mesh;
    for (let edge = 0; edge < mesh.edgeCount; edge += 1) {
      const [from, to] = mesh.getEdgeVertices(edge);
      this.writeEdgeTube(
        this.wireTubeMesh,
        edge,
        from,
        to,
        WIRE_TUBE_RADIUS
      );
    }
    this.wireTubeMesh.count = mesh.edgeCount;
    this.wireTubeMesh.instanceMatrix.needsUpdate = true;
  }

  private writeEdgeTube(
    target: InstancedMesh,
    index: number,
    fromVertex: number,
    toVertex: number,
    radius: number
  ): void {
    this.writeEdgeTubePositions(
      target,
      index,
      new Vector3(...this.mesh.getVertexPosition(fromVertex)),
      new Vector3(...this.mesh.getVertexPosition(toVertex)),
      radius
    );
  }

  private writeEdgeTubePositions(
    target: InstancedMesh,
    index: number,
    start: Vector3,
    end: Vector3,
    radius: number
  ): void {
    this.edgeDirection.copy(end).sub(start);
    const length = this.edgeDirection.length();
    if (length <= Number.EPSILON) {
      target.setMatrixAt(index, this.edgeMatrix.makeScale(0, 0, 0));
      return;
    }
    this.edgeDirection.normalize();
    this.edgePosition.copy(start).add(end).multiplyScalar(0.5);
    this.edgeQuaternion.setFromUnitVectors(Y_AXIS, this.edgeDirection);
    this.edgeScale.set(radius, length, radius);
    target.setMatrixAt(
      index,
      this.edgeMatrix.compose(
        this.edgePosition,
        this.edgeQuaternion,
        this.edgeScale
      )
    );
  }

  /**
   * Rebuild the camera-facing wire subset used by Texture + Wire.
   *
   * An edge is kept when either adjacent face points toward the camera. This
   * avoids unstable depth-bias tuning; occluded concave edges are still drawn.
   */
  updateFrontWire(camera: Camera): void {
    if (!this.frontWireSegments.visible) {
      return;
    }
    this.group.updateWorldMatrix(true, false);
    const cameraLocal = camera.position
      .clone()
      .applyMatrix4(this.group.matrixWorld.clone().invert());
    let cursor = 0;
    let tubeCount = 0;
    for (let edge = 0; edge < this.mesh.edgeCount; edge += 1) {
      const halfEdge = this.mesh.edgeHalfEdge[edge];
      const fromVertex = this.mesh.heOrigin[halfEdge];
      const toVertex = this.mesh.halfEdgeDestination(halfEdge);
      const from = fromVertex * 3;
      const to = toVertex * 3;
      const midX =
        (this.mesh.positions[from] + this.mesh.positions[to]) / 2;
      const midY =
        (this.mesh.positions[from + 1] + this.mesh.positions[to + 1]) / 2;
      const midZ =
        (this.mesh.positions[from + 2] + this.mesh.positions[to + 2]) / 2;
      const viewX = cameraLocal.x - midX;
      const viewY = cameraLocal.y - midY;
      const viewZ = cameraLocal.z - midZ;
      const faceA = this.mesh.heFace[halfEdge];
      const faceB = this.mesh.heFace[this.mesh.heTwin[halfEdge]];
      const frontA =
        faceA >= 0 &&
        this.faceNormals[faceA * 3] * viewX +
          this.faceNormals[faceA * 3 + 1] * viewY +
          this.faceNormals[faceA * 3 + 2] * viewZ >
          0;
      const frontB =
        faceB >= 0 &&
        this.faceNormals[faceB * 3] * viewX +
          this.faceNormals[faceB * 3 + 1] * viewY +
          this.faceNormals[faceB * 3 + 2] * viewZ >
          0;
      if (!frontA && !frontB) {
        continue;
      }
      // Front-facing normals still include surfaces hidden behind another
      // part of the model. Depth-test the overlay and lift it just off the
      // visible surface so only edges visible from this camera remain.
      const nx =
        (frontA ? this.faceNormals[faceA * 3] : 0) +
        (frontB ? this.faceNormals[faceB * 3] : 0);
      const ny =
        (frontA ? this.faceNormals[faceA * 3 + 1] : 0) +
        (frontB ? this.faceNormals[faceB * 3 + 1] : 0);
      const nz =
        (frontA ? this.faceNormals[faceA * 3 + 2] : 0) +
        (frontB ? this.faceNormals[faceB * 3 + 2] : 0);
      const normalLength = Math.hypot(nx, ny, nz);
      const cameraDistance = Math.hypot(viewX, viewY, viewZ);
      const offset = Math.max(0.0005, cameraDistance * 0.0012);
      const scale = normalLength > 1e-8 ? offset / normalLength : 0;
      const start = new Vector3(
        this.mesh.positions[from] + nx * scale,
        this.mesh.positions[from + 1] + ny * scale,
        this.mesh.positions[from + 2] + nz * scale
      );
      const end = new Vector3(
        this.mesh.positions[to] + nx * scale,
        this.mesh.positions[to + 1] + ny * scale,
        this.mesh.positions[to + 2] + nz * scale
      );
      this.frontWirePositions[cursor] = start.x;
      this.frontWirePositions[cursor + 1] = start.y;
      this.frontWirePositions[cursor + 2] = start.z;
      this.frontWirePositions[cursor + 3] = end.x;
      this.frontWirePositions[cursor + 4] = end.y;
      this.frontWirePositions[cursor + 5] = end.z;
      this.writeEdgeTubePositions(
        this.frontWireTubeMesh,
        tubeCount,
        start,
        end,
        FRONT_WIRE_TUBE_RADIUS
      );
      tubeCount += 1;
      cursor += 6;
    }
    this.frontWireGeometry.getAttribute('position').needsUpdate = true;
    this.frontWireGeometry.setDrawRange(0, cursor / 3);
    this.frontWireTubeMesh.count = tubeCount;
    this.frontWireTubeMesh.instanceMatrix.needsUpdate = true;
  }

  /** Show or clear the temporary action loop preview line. */
  setPreviewLine(positions: Float32Array | null): void {
    if (!positions || positions.length === 0) {
      this.previewLine.visible = false;
      return;
    }
    const geometry = this.previewLineGeometry;
    const existing = geometry.getAttribute('position');
    if (existing && existing.array.length >= positions.length) {
      (existing.array as Float32Array).set(positions, 0);
      existing.needsUpdate = true;
      geometry.setDrawRange(0, positions.length / 3);
    } else {
      geometry.setAttribute(
        'position',
        new BufferAttribute(positions.slice(), 3).setUsage(DynamicDrawUsage)
      );
      geometry.setDrawRange(0, positions.length / 3);
    }
    this.previewLine.visible = true;
  }

  private rebuildTriangleGeometry(vertexCount: number): void {
    const previousGeometry = this.triangleGeometry;
    this.trianglePositions = new Float32Array(vertexCount * 3);
    this.triangleNormals = new Float32Array(vertexCount * 3);
    this.triangleColors = new Float32Array(vertexCount * 3);
    this.triangleUvs = new Float32Array(vertexCount * 2);

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(this.trianglePositions, 3).setUsage(DynamicDrawUsage)
    );
    geometry.setAttribute(
      'normal',
      new BufferAttribute(this.triangleNormals, 3).setUsage(DynamicDrawUsage)
    );
    geometry.setAttribute(
      'uv',
      new BufferAttribute(this.triangleUvs, 2).setUsage(DynamicDrawUsage)
    );
    geometry.setAttribute(
      'color',
      new BufferAttribute(this.triangleColors, 3).setUsage(DynamicDrawUsage)
    );

    this.triangleGeometry = geometry;
    this.triangleMesh.geometry = geometry;
    this.pickingMesh.geometry = geometry;
    previousGeometry.dispose();
  }
}

/** Smallest power of two at least as large as `value`. */
function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) {
    result *= 2;
  }
  return result;
}

/** Return the clamped parameter of the closest point on a projected segment. */
function clampProjection(
  px: number,
  py: number,
  a: ProjectedPoint,
  b: ProjectedPoint
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= Number.EPSILON) {
    return 0;
  }
  return Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lengthSq));
}
