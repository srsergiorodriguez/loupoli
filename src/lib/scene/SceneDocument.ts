import type { Vec3 } from '../geometry/HalfEdgeMesh';
import {
  createPrimitiveMesh,
  PRIMITIVE_LABELS,
  type PrimitiveKind
} from '../geometry/primitives';
import { applyDefaultSeams } from '../geometry/defaultSeams';
import { MeshNode, type NodeSummary } from './MeshNode';
import { SceneGroup, type GroupSummary } from './SceneGroup';
import {
  createCameraId,
  SceneCamera,
  type CameraSummary
} from './SceneCamera';
import { SceneAnimation } from './SceneAnimation';
import { SceneAnnotations } from './SceneAnnotations';
import {
  createLightId,
  SceneLight,
  type LightKind,
  type LightSummary
} from './SceneLight';

/**
 * The document's object collection.
 *
 * The document owns topology-bearing nodes, groups, lights, and render cameras.
 * Active object, selection, navigation camera, and UI state are session state and
 * deliberately do not belong here.
 */
export class SceneDocument {
  readonly nodes: MeshNode[] = [];
  readonly groups: SceneGroup[] = [];
  readonly lights: SceneLight[] = [];
  readonly cameras: SceneCamera[] = [];
  readonly animation = new SceneAnimation();
  readonly annotations = new SceneAnnotations();
  ambientColor = '#ffffff';
  ambientIntensity = 0.22;

  /** Construct the default first-run scene from the real primitive path. */
  static createDefault(
    kind: PrimitiveKind = 'quadsphere',
    textureId: string | null = null
  ): SceneDocument {
    const document = new SceneDocument();
    const mesh = createPrimitiveMesh(kind);
    applyDefaultSeams(mesh, kind);
    document.insertNode(
      new MeshNode(mesh, kind, PRIMITIVE_LABELS[kind], undefined, textureId)
    );
    document.insertLight(SceneLight.sun());
    document.insertCamera(SceneCamera.default());
    return document;
  }

  /** Find a node by stable id. */
  getNode(id: string | null): MeshNode | undefined {
    if (id === null) {
      return undefined;
    }
    return this.nodes.find((node) => node.id === id);
  }

  /** Find a group by stable id. */
  getGroup(id: string | null): SceneGroup | undefined {
    if (id === null) {
      return undefined;
    }
    return this.groups.find((group) => group.id === id);
  }

  /** Find a light by stable id. */
  getLight(id: string | null): SceneLight | undefined {
    if (id === null) {
      return undefined;
    }
    return this.lights.find((light) => light.id === id);
  }

  /** Create the next uniquely named light without inserting it. */
  createLight(kind: LightKind): SceneLight {
    const base = kind === 'directional' ? 'Sun' : 'Lamp';
    let index = 1;
    const names = new Set(this.lights.map((light) => light.name));
    let name = index === 1 ? base : `${base} ${index}`;
    while (names.has(name)) {
      index += 1;
      name = index === 1 ? base : `${base} ${index}`;
    }
    return new SceneLight({
      id: createLightId(),
      name,
      kind,
      color: kind === 'directional' ? '#fff4e0' : '#ffe0bd',
      intensity: kind === 'directional' ? 2.2 : 3.5,
      enabled: true,
      castShadows: true,
      shadowSoftness: 0.35,
      position: kind === 'point' ? [0, 0, 4] : [4, 4, 8],
      direction: [0, 0, -1]
    });
  }

  /** Insert a light at a specific index, clamped to the collection. */
  insertLight(light: SceneLight, index = this.lights.length): void {
    if (this.getLight(light.id)) {
      throw new Error(`Scene already contains light ${light.id}.`);
    }
    const clamped = Math.max(0, Math.min(index, this.lights.length));
    this.lights.splice(clamped, 0, light);
  }

  /** Remove a light and return its prior index for localized undo. */
  removeLight(id: string): { light: SceneLight; index: number } | null {
    const index = this.lights.findIndex((light) => light.id === id);
    if (index < 0) {
      return null;
    }
    const [light] = this.lights.splice(index, 1);
    return { light, index };
  }

  /** Replace the light collection, used by project load and recovery. */
  replaceLights(lights: readonly SceneLight[]): void {
    this.lights.length = 0;
    for (const light of lights) {
      this.lights.push(light);
    }
  }

  /** Reactive-safe light summaries. */
  lightSummaries(): LightSummary[] {
    return this.lights.map((light) => light.snapshot());
  }

  /** Find one render camera by id. */
  getCamera(id: string | null): SceneCamera | null {
    if (id === null) {
      return null;
    }
    return this.cameras.find((camera) => camera.id === id) ?? null;
  }

  /** Create a uniquely named camera without inserting it. */
  createCamera(name = `Camera ${this.cameras.length + 1}`): SceneCamera {
    const names = new Set(this.cameras.map((camera) => camera.name));
    let candidate = name;
    let index = 2;
    while (names.has(candidate)) {
      candidate = `${name} ${index}`;
      index += 1;
    }
    return new SceneCamera({
      id: createCameraId(),
      name: candidate,
      position: [4, -6, 4],
      target: [0, 0, 0],
      fov: 42
    });
  }

  /** Insert one camera at a stable index. */
  insertCamera(camera: SceneCamera, index = this.cameras.length): void {
    if (this.getCamera(camera.id)) {
      throw new Error(`Scene already contains camera ${camera.id}.`);
    }
    const clamped = Math.max(0, Math.min(index, this.cameras.length));
    this.cameras.splice(clamped, 0, camera);
  }

  /** Remove one camera and return its prior index for localized undo. */
  removeCamera(id: string): { camera: SceneCamera; index: number } | null {
    const index = this.cameras.findIndex((camera) => camera.id === id);
    if (index < 0) {
      return null;
    }
    const [camera] = this.cameras.splice(index, 1);
    return { camera, index };
  }

  /** Replace the camera collection, used by project load and recovery. */
  replaceCameras(cameras: readonly SceneCamera[]): void {
    this.cameras.length = 0;
    for (const camera of cameras) {
      this.cameras.push(camera);
    }
  }

  /** Reactive-safe camera summaries. */
  cameraSummaries(): CameraSummary[] {
    return this.cameras.map((camera) => camera.snapshot());
  }

  /** Replace all animation state on project load or recovery. */
  replaceAnimation(animation: SceneAnimation): void {
    this.animation.apply(animation.snapshot());
  }

  /** Whether the document has no editable objects. */
  get isEmpty(): boolean {
    return this.nodes.length === 0;
  }

  /** Replace the object collection, used by project load and recovery. */
  replaceNodes(nodes: readonly MeshNode[]): void {
    this.nodes.length = 0;
    for (const node of nodes) {
      this.nodes.push(node);
    }
  }

  /** Replace the group collection, used by project load and recovery. */
  replaceGroups(groups: readonly SceneGroup[]): void {
    this.groups.length = 0;
    for (const group of groups) {
      this.groups.push(group);
    }
  }

  /** Insert a group at a specific index, clamped to the current collection. */
  insertGroup(group: SceneGroup, index = this.groups.length): void {
    if (this.getGroup(group.id)) {
      throw new Error(`Scene already contains group ${group.id}.`);
    }
    const clamped = Math.max(0, Math.min(index, this.groups.length));
    this.groups.splice(clamped, 0, group);
  }

  /** Remove a group and return its prior index. */
  removeGroup(id: string): { group: SceneGroup; index: number } | null {
    const index = this.groups.findIndex((group) => group.id === id);
    if (index < 0) {
      return null;
    }
    const [group] = this.groups.splice(index, 1);
    return { group, index };
  }

  /** Create the next uniquely named group without inserting it. */
  createGroup(): SceneGroup {
    let index = this.groups.length + 1;
    const names = new Set(this.groups.map((group) => group.name));
    let name = `Group ${index}`;
    while (names.has(name)) {
      index += 1;
      name = `Group ${index}`;
    }
    return new SceneGroup(name);
  }

  /** Insert a node at a specific index, clamped to the current collection. */
  insertNode(node: MeshNode, index = this.nodes.length): void {
    if (this.getNode(node.id)) {
      throw new Error(`Scene already contains node ${node.id}.`);
    }
    const clamped = Math.max(0, Math.min(index, this.nodes.length));
    this.nodes.splice(clamped, 0, node);
  }

  /** Remove a node and return its prior index for localized undo. */
  removeNode(id: string): { node: MeshNode; index: number } | null {
    const index = this.nodes.findIndex((node) => node.id === id);
    if (index < 0) {
      return null;
    }
    const [node] = this.nodes.splice(index, 1);
    return { node, index };
  }

  /** Create a named primitive node without inserting it yet. */
  createNode(kind: PrimitiveKind, textureId: string | null = null): MeshNode {
    const base = PRIMITIVE_LABELS[kind];
    const counts = new Map<string, number>();
    for (const node of this.nodes) {
      const current = counts.get(node.primitive) ?? 0;
      counts.set(node.primitive, current + 1);
    }
    const index = (counts.get(kind) ?? 0) + 1;
    const name = index === 1 ? base : `${base} ${index}`;
    const mesh = createPrimitiveMesh(kind);
    applyDefaultSeams(mesh, kind);
    return new MeshNode(mesh, kind, name, undefined, textureId);
  }

  /** Compute a non-overlapping local-space X placement for a new node. */
  placementFor(node: MeshNode, spacing = 1.5): Vec3 {
    if (this.nodes.length === 0) {
      return [0, 0, 0];
    }

    const newBounds = node.mesh.getBounds();
    let maxX = -Infinity;
    for (const existing of this.nodes) {
      const bounds = existing.mesh.getBounds();
      maxX = Math.max(
        maxX,
        existing.transform.position[0] + bounds.max[0],
        existing.transform.position[0] + bounds.min[0]
      );
    }
    return [maxX + spacing - newBounds.min[0], 0, 0];
  }

  /** Move one node to a final index in the scene collection. */
  moveNodeToIndex(id: string, index: number): boolean {
    const from = this.nodes.findIndex((node) => node.id === id);
    if (from < 0) {
      return false;
    }
    const [node] = this.nodes.splice(from, 1);
    const to = Math.max(0, Math.min(index, this.nodes.length));
    this.nodes.splice(to, 0, node);
    return from !== to;
  }

  /** Move one group to a final index in the group collection. */
  moveGroupToIndex(id: string, index: number): boolean {
    const from = this.groups.findIndex((group) => group.id === id);
    if (from < 0) {
      return false;
    }
    const [group] = this.groups.splice(from, 1);
    const to = Math.max(0, Math.min(index, this.groups.length));
    this.groups.splice(to, 0, group);
    return from !== to;
  }

  /** UI summaries for the outliner. */
  summaries(): NodeSummary[] {
    return this.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      primitive: node.primitive,
      visible: node.visible,
      parentId: node.parentId,
      textureId: node.textureId,
      reference: node.reference
        ? { opacity: node.reference.opacity, inFront: node.reference.inFront }
        : null
    }));
  }

  /** UI summaries for groups in the outliner. */
  groupSummaries(): GroupSummary[] {
    return this.groups.map((group) => ({
      id: group.id,
      name: group.name,
      visible: group.visible
    }));
  }
}
