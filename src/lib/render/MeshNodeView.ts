import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
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

/** Shared materials supplied by the viewport to every node view. */
export interface NodeViewSharedMaterials {
  readonly picking: MeshBasicMaterial;
  readonly vertex: PointsMaterial;
  readonly selectedVertex: PointsMaterial;
  readonly selectedEdge: MeshBasicMaterial;
  readonly selectedOutline: LineBasicMaterial;
  readonly selectedFace: MeshBasicMaterial;
}

interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const PICK_RADIUS_CSS = 16;
const Y_AXIS = new Vector3(0, 1, 0);

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

  private triangleGeometry = new BufferGeometry();
  private readonly wireGeometry = new BufferGeometry();
  private readonly vertexGeometry = new BufferGeometry();
  private selectedVertexGeometry = new BufferGeometry();

  private readonly triangleMesh: Mesh;
  private readonly wireSegments: LineSegments;
  private readonly vertexPoints: Points;
  private readonly selectedVertexPoint: Points;
  private readonly pickingMesh: Mesh;
  private selectedEdgeMesh: InstancedMesh;
  private readonly edgeUnitGeometry: CylinderGeometry;
  private edgeCapacity = 1;
  private readonly selectedFaceMesh: Mesh;
  private readonly selectedFaceOutline: LineSegments;

  private trianglePositions: Float32Array;
  private triangleNormals: Float32Array;
  private triangleUvs: Float32Array;
  private readonly wirePositions: Float32Array;
  private readonly vertexPositions: Float32Array;

  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly scratchProjected = new Vector3();
  private readonly scratchDirection = new Vector3();

  private lastMeshRevision = -1;
  private active = false;
  private selectionMode: SelectionMode = 'vertex';
  private selectedElements: readonly number[] = [];
  private readonly edgeMatrix = new Matrix4();
  private readonly edgePosition = new Vector3();
  private readonly edgeDirection = new Vector3();
  private readonly edgeQuaternion = new Quaternion();
  private readonly edgeScale = new Vector3();

  constructor(
    readonly node: MeshNode,
    private readonly surfaceMaterials: ViewportMaterials,
    shared: NodeViewSharedMaterials
  ) {
    const mesh = node.getEvaluatedMesh().mesh;
    this.mesh = mesh;
    this.boundMesh = mesh;
    this.group.name = `loupoli-node-${node.id}`;
    this.group.visible = node.visible;

    this.trianglePositions = new Float32Array(mesh.triangleVertexCount * 3);
    this.triangleNormals = new Float32Array(mesh.triangleVertexCount * 3);
    this.triangleUvs = new Float32Array(mesh.triangleVertexCount * 2);
    this.wirePositions = new Float32Array(mesh.edgeCount * 6);
    this.vertexPositions = new Float32Array(mesh.vertexCount * 3);

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

    this.wireGeometry.setAttribute(
      'position',
      new BufferAttribute(this.wirePositions, 3).setUsage(DynamicDrawUsage)
    );
    this.vertexGeometry.setAttribute(
      'position',
      new BufferAttribute(this.vertexPositions, 3).setUsage(DynamicDrawUsage)
    );
    this.triangleMesh = new Mesh(this.triangleGeometry, surfaceMaterials.solid);
    this.triangleMesh.name = 'loupoli-mesh';
    this.triangleMesh.frustumCulled = false;

    this.wireSegments = new LineSegments(
      this.wireGeometry,
      surfaceMaterials.wire
    );
    this.wireSegments.name = 'loupoli-wire';
    this.wireSegments.frustumCulled = false;
    this.wireSegments.visible = false;
    this.wireSegments.renderOrder = 1;

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
      this.vertexPoints,
      this.selectedVertexPoint,
      this.selectedEdgeMesh,
      this.selectedFaceMesh,
      this.selectedFaceOutline,
      this.pickingMesh
    );

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
  setInteraction(
    active: boolean,
    mode: SelectionMode,
    selectedElements: readonly number[],
    showHandles = true
  ): void {
    this.active = active;
    this.selectionMode = mode;
    this.selectedElements = [...selectedElements];

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
    const isWire = mode === 'wireframe';
    const isTextureWire = mode === 'texture-wire';
    this.triangleMesh.visible = !isWire;
    this.wireSegments.visible = isWire || isTextureWire;
    this.wireSegments.material = isTextureWire
      ? this.surfaceMaterials.wireOverlay
      : this.surfaceMaterials.wire;

    if (mode === 'solid') {
      this.triangleMesh.material = this.surfaceMaterials.solid;
    } else if (mode === 'lit') {
      this.triangleMesh.material = this.surfaceMaterials.lit;
    } else {
      this.triangleMesh.material = this.surfaceMaterials.ps1;
    }
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
    mesh.writeEdgePositions(this.wirePositions);
    mesh.writeVertexPositions(this.vertexPositions);

    this.triangleGeometry.getAttribute('position').needsUpdate = true;
    this.triangleGeometry.getAttribute('normal').needsUpdate = true;
    this.triangleGeometry.getAttribute('uv').needsUpdate = true;
    this.wireGeometry.getAttribute('position').needsUpdate = true;
    this.vertexGeometry.getAttribute('position').needsUpdate = true;

    this.triangleGeometry.computeBoundingBox();
    this.triangleGeometry.computeBoundingSphere();
    this.wireGeometry.computeBoundingSphere();
    this.vertexGeometry.computeBoundingSphere();
    this.lastMeshRevision = mesh.meshRevision;
    this.updateSelectionGeometry();
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

  /** Release all GPU resources owned by this view. */
  dispose(): void {
    this.group.removeFromParent();
    const faceGeometry = this.selectedFaceMesh.geometry;
    this.triangleGeometry.dispose();
    this.wireGeometry.dispose();
    this.vertexGeometry.dispose();
    this.selectedVertexGeometry.dispose();
    this.selectedEdgeMesh.dispose();
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
      const radius = Math.min(0.08, Math.max(0.008, length * 0.035));
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
    capacity: number
  ): InstancedMesh {
    const mesh = new InstancedMesh(this.edgeUnitGeometry, material, capacity);
    mesh.name = 'loupoli-selected-edges';
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.count = 0;
    mesh.visible = false;
    return mesh;
  }

  private rebuildTriangleGeometry(vertexCount: number): void {
    const previousGeometry = this.triangleGeometry;
    this.trianglePositions = new Float32Array(vertexCount * 3);
    this.triangleNormals = new Float32Array(vertexCount * 3);
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
