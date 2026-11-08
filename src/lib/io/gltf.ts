import {
  BufferAttribute,
  type BufferAttribute as BufferAttributeType,
  AnimationMixer,
  BufferGeometry,
  Euler,
  LoopOnce,
  Matrix3,
  Matrix4,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  NumberKeyframeTrack,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  QuaternionKeyframeTrack,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  VectorKeyframeTrack,
  AnimationClip as ThreeAnimationClip
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  HalfEdgeMesh,
  type MeshCornerSpec,
  type MeshFaceSpec
} from '../geometry/HalfEdgeMesh';
import { MeshNode, type NodeTransform } from '../scene/MeshNode';
import {
  createAnimationClipId,
  createAnimationTrackId,
  createShapeWeightTrackId,
  type AnimationClip as SceneAnimationClip,
  type AnimationClipSnapshot,
  type AnimationTrackSnapshot,
  type CameraAnimationTrackSnapshot,
  type LightAnimationTrackSnapshot,
  createCameraAnimationTrackId,
  createLightAnimationTrackId,
  type MeshMotionTrack,
  type ShapeWeightTrackSnapshot
} from '../scene/SceneAnimation';
import type { SceneGroup } from '../scene/SceneGroup';
import { createCameraId, type CameraSnapshot } from '../scene/SceneCamera';
import { createLightId, type LightSnapshot } from '../scene/SceneLight';
import { transformMatrix, worldTransformForNode } from '../editor/groupTransforms';

/** Three's Y-up conversion for app Z-up coordinates. */
const Y_UP_TO_Z_UP = new Matrix4().makeRotationX(Math.PI / 2);
const Z_UP_TO_Y_UP = new Matrix4().makeRotationX(-Math.PI / 2);
const IMPORTED_CAMERA_TARGET_DISTANCE = 5;

function colorHex(color: { getHexString(): string } | null | undefined): string {
  return `#${color?.getHexString() ?? 'c8c2ad'}`;
}

/** Convert one app Z-up point to glTF Y-up. */
function yUpPoint(value: readonly [number, number, number]): Vector3 {
  return new Vector3(value[0], value[1], value[2]).applyMatrix4(
    Z_UP_TO_Y_UP
  );
}

/** Convert one glTF Y-up direction back to app Z-up. */
function appDirection(value: Vector3): Vector3 {
  return value
    .applyMatrix3(new Matrix3().setFromMatrix4(Y_UP_TO_Z_UP))
    .normalize();
}

/** Camera orientation for a look-at target in the Y-up export scene. */
function cameraQuaternion(position: Vector3, target: Vector3): Quaternion {
  if (position.distanceToSquared(target) < 1e-10) {
    return new Quaternion();
  }
  const matrix = new Matrix4().lookAt(
    position,
    target,
    new Vector3(0, 1, 0)
  );
  return new Quaternion().setFromRotationMatrix(matrix);
}

/** Directional-light node orientation: glTF lights point down local -Z. */
function lightQuaternion(direction: readonly [number, number, number]): Quaternion {
  const vector = yUpPoint(direction).normalize();
  if (vector.lengthSq() < 1e-10) {
    vector.set(0, -1, 0);
  }
  return new Quaternion().setFromUnitVectors(
    new Vector3(0, 0, -1),
    vector
  );
}

function normalizeName(value: string, index: number): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : `Imported ${index + 1}`;
}

/** App animation data included in a GLB export. */
export interface GlbAnimationExportOptions {
  readonly clips: readonly SceneAnimationClip[];
  readonly fps: number;
  /** Scene cameras exported as glTF cameras. */
  readonly cameras?: readonly CameraSnapshot[];
  /** Scene lights exported with KHR_lights_punctual. */
  readonly lights?: readonly LightSnapshot[];
}

interface MotionMorphSample {
  readonly frame: number;
  readonly targetIndex: number;
  readonly interpolation: 'step' | 'linear';
}

interface MotionMorphBinding {
  readonly clipId: string;
  readonly samples: readonly MotionMorphSample[];
}

interface CameraGlbAnimationContext {
  readonly camera: CameraSnapshot;
  readonly object: PerspectiveCamera;
}

interface LightGlbAnimationContext {
  readonly light: LightSnapshot;
  readonly object: DirectionalLight | PointLight;
}

interface NodeGlbAnimationContext {
  readonly node: MeshNode;
  readonly parent: SceneGroup | null;
  readonly root: Object3D;
  readonly meshes: Mesh[];
  readonly morphNames: string[];
  readonly shapeKeyIds: string[];
  readonly motionBindings: MotionMorphBinding[];
  readonly motionTargetCount: number;
}

/** Sample one app clip's node/group transforms into world OBB transforms. */
function sampleClipTransformPose(
  clip: SceneAnimationClip,
  frame: number
): Map<string, NodeTransform> {
  const pose = new Map<string, NodeTransform>();
  for (const track of clip.tracks) {
    const transform = track.evaluate(frame);
    if (transform) {
      pose.set(track.targetId, transform);
    }
  }
  return pose;
}

/** Resolve one mesh-motion clip's active morph weights at a frame. */
function sampleMotionWeights(
  binding: MotionMorphBinding,
  frame: number
): Map<number, number> {
  const samples = binding.samples;
  const weights = new Map<number, number>();
  if (samples.length === 0) {
    return weights;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (frame <= first.frame) {
    weights.set(first.targetIndex, 1);
    return weights;
  }
  if (frame >= last.frame) {
    weights.set(last.targetIndex, 1);
    return weights;
  }
  for (let index = 0; index < samples.length - 1; index += 1) {
    const a = samples[index];
    const b = samples[index + 1];
    if (frame >= a.frame && frame <= b.frame) {
      if (a.interpolation === 'step' || b.frame === a.frame) {
        weights.set(a.targetIndex, 1);
      } else {
        const t = (frame - a.frame) / (b.frame - a.frame);
        weights.set(a.targetIndex, 1 - t);
        weights.set(b.targetIndex, t);
      }
      return weights;
    }
  }
  weights.set(last.targetIndex, 1);
  return weights;
}

/** Imported meshes plus glTF animation clips converted to app frames. */
export interface GlbImportResult {
  readonly nodes: MeshNode[];
  readonly cameras: CameraSnapshot[];
  readonly lights: LightSnapshot[];
  readonly clips: AnimationClipSnapshot[];
}

interface GlbCameraBinding {
  readonly object: PerspectiveCamera;
  readonly snapshot: CameraSnapshot;
}

interface GlbLightBinding {
  readonly object: DirectionalLight | PointLight;
  readonly snapshot: LightSnapshot;
}

interface GlbMeshBinding {
  readonly object: Mesh;
  readonly node: MeshNode;
  readonly restWorld: Matrix4;
  readonly restWeights: readonly number[];
  readonly shapeKeyIds: readonly string[];
}

/**
 * Import a binary glTF into DCEL nodes, scene cameras/lights, and clips.
 *
 * glTF is triangulated by definition. Per-corner UVs survive because each
 * triangle corner keeps its own attribute values. Material base colors become
 * the node's simple material palette. Transform channels are baked into
 * node-relative tracks; morph weights become shape-weight tracks. Camera
 * orientation is restored with a derived target because glTF stores no target
 * distance.
 */
export async function importGlb(
  data: ArrayBuffer,
  fps = 24
): Promise<GlbImportResult> {
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(data, '');
  gltf.scene.updateMatrixWorld(true);
  const nodes: MeshNode[] = [];
  const cameras: CameraSnapshot[] = [];
  const lights: LightSnapshot[] = [];
  const bindings: GlbMeshBinding[] = [];
  const cameraBindings: GlbCameraBinding[] = [];
  const lightBindings: GlbLightBinding[] = [];
  gltf.scene.traverse((object) => {
    if (object instanceof PerspectiveCamera) {
      const position = new Vector3()
        .setFromMatrixPosition(object.matrixWorld)
        .applyMatrix4(Y_UP_TO_Z_UP);
      const quaternion = new Quaternion();
      object.getWorldQuaternion(quaternion);
      const direction = appDirection(
        new Vector3(0, 0, -1).applyQuaternion(quaternion)
      );
      const target = position
        .clone()
        .addScaledVector(direction, IMPORTED_CAMERA_TARGET_DISTANCE);
      const snapshot: CameraSnapshot = {
        id: createCameraId(),
        name: normalizeName(object.name, cameras.length),
        position: [position.x, position.y, position.z],
        target: [target.x, target.y, target.z],
        fov: Math.max(5, Math.min(160, object.fov))
      };
      cameras.push(snapshot);
      cameraBindings.push({ object, snapshot });
      return;
    }
    if (object instanceof DirectionalLight || object instanceof PointLight) {
      const position = new Vector3()
        .setFromMatrixPosition(object.matrixWorld)
        .applyMatrix4(Y_UP_TO_Z_UP);
      const quaternion = new Quaternion();
      object.getWorldQuaternion(quaternion);
      const direction =
        object instanceof DirectionalLight
          ? appDirection(new Vector3(0, 0, -1).applyQuaternion(quaternion))
          : new Vector3(0, 0, -1);
      const snapshot: LightSnapshot = {
        id: createLightId(),
        name: normalizeName(object.name, lights.length),
        kind: object instanceof DirectionalLight ? 'directional' : 'point',
        color: `#${object.color.getHexString()}`,
        intensity: Math.max(0, object.intensity),
        enabled: true,
        castShadows: false,
        shadowSoftness: 0.35,
        position: [position.x, position.y, position.z],
        direction: [direction.x, direction.y, direction.z]
      };
      lights.push(snapshot);
      lightBindings.push({ object, snapshot });
      return;
    }
    if (!(object instanceof Mesh)) {
      return;
    }
    const geometry = object.geometry;
    const position = geometry.getAttribute('position');
    if (!position) {
      return;
    }
    const uv = geometry.getAttribute('uv');
    const index = geometry.getIndex();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const palette = materials.map((material) =>
      colorHex((material as { color?: { getHexString(): string } }).color)
    );
    const groups =
      geometry.groups.length > 0
        ? geometry.groups
        : [
            {
              start: 0,
              count: index ? index.count : position.count,
              materialIndex: 0
            }
          ];
    const faces: MeshFaceSpec[] = [];
    const matrix = object.matrixWorld
      .clone()
      .premultiply(Y_UP_TO_Z_UP);
    for (const group of groups) {
      const end = Math.min(
        group.start + group.count,
        index ? index.count : position.count
      );
      for (let cursor = group.start; cursor + 2 < end; cursor += 3) {
        const corners: MeshCornerSpec[] = [];
        for (let offset = 0; offset < 3; offset += 1) {
          const element = cursor + offset;
          const vertex = index ? index.getX(element) : element;
          const point = new Vector3(
            position.getX(vertex),
            position.getY(vertex),
            position.getZ(vertex)
          ).applyMatrix4(matrix);
          const u = uv ? uv.getX(vertex) : 0;
          const v = uv ? uv.getY(vertex) : 0;
          corners.push({
            position: [point.x, point.y, point.z],
            uv: [u, v]
          });
        }
        faces.push({
          corners,
          material: Math.max(0, group.materialIndex)
        });
      }
    }
    if (faces.length === 0) {
      return;
    }
    try {
      const mesh = HalfEdgeMesh.fromPolygons(faces);
      const node = new MeshNode(
        mesh,
        'imported',
        normalizeName(object.name, nodes.length)
      );
      node.setMaterialPalette(palette);
      const morphTargets = geometry.morphAttributes.position ?? [];
      if (morphTargets.length > 0) {
        const linear = new Matrix3().setFromMatrix4(matrix);
        const vertexByPosition = new Map<string, number>();
        const positionKey = (x: number, y: number, z: number): string =>
          `${x.toFixed(5)}|${y.toFixed(5)}|${z.toFixed(5)}`;
        for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
          const key = positionKey(
            mesh.positions[vertex * 3],
            mesh.positions[vertex * 3 + 1],
            mesh.positions[vertex * 3 + 2]
          );
          vertexByPosition.set(key, vertex);
        }
        const names = Object.entries(object.morphTargetDictionary ?? {});
        morphTargets.forEach((target: BufferAttributeType, shapeIndex: number) => {
          const targetPositions = mesh.positions.slice();
          const seenVertices = new Set<number>();
          const baseWorld = new Vector3();
          for (let vertex = 0; vertex < position.count; vertex += 1) {
            const localBase = new Vector3(
              position.getX(vertex),
              position.getY(vertex),
              position.getZ(vertex)
            );
            baseWorld.copy(localBase).applyMatrix4(matrix);
            const dcelVertex = vertexByPosition.get(
              positionKey(baseWorld.x, baseWorld.y, baseWorld.z)
            );
            if (dcelVertex === undefined || seenVertices.has(dcelVertex)) {
              continue;
            }
            seenVertices.add(dcelVertex);
            const delta = new Vector3(
              target.getX(vertex),
              target.getY(vertex),
              target.getZ(vertex)
            );
            if (!geometry.morphTargetsRelative) {
              delta.sub(localBase);
            }
            delta.applyMatrix3(linear);
            targetPositions[dcelVertex * 3] = mesh.positions[dcelVertex * 3] + delta.x;
            targetPositions[dcelVertex * 3 + 1] =
              mesh.positions[dcelVertex * 3 + 1] + delta.y;
            targetPositions[dcelVertex * 3 + 2] =
              mesh.positions[dcelVertex * 3 + 2] + delta.z;
          }
          const name =
            names.find(([, index]) => index === shapeIndex)?.[0] ??
            `Shape ${shapeIndex + 1}`;
          const key = node.addShapeKey(name);
          key.targetPositions.set(targetPositions);
          key.weight = object.morphTargetInfluences?.[shapeIndex] ?? 0;
        });
        node.shapeKeys.forEach((key) => {
          if (key.targetPositions.length !== mesh.positions.length) {
            throw new Error('GLB morph target does not match the mesh vertex count.');
          }
        });
      }
      nodes.push(node);
      bindings.push({
        object,
        node,
        restWorld: object.matrixWorld.clone(),
        restWeights: object.morphTargetInfluences?.slice() ?? [],
        shapeKeyIds: node.shapeKeys.map((key) => key.id)
      });
    } catch (error) {
      throw new Error(
        `GLB mesh "${object.name}" is not importable as manifold DCEL topology: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });
  if (nodes.length === 0 && cameras.length === 0 && lights.length === 0) {
    throw new Error('The GLB contains no importable meshes, cameras, or lights.');
  }
  const clips = importGlbAnimation(
    gltf.animations,
    bindings,
    cameraBindings,
    lightBindings,
    fps,
    gltf.scene
  );
  return { nodes, cameras, lights, clips };
}

/** Convert glTF animation clips into app integer-frame clips. */
function importGlbAnimation(
  animations: readonly import('three').AnimationClip[],
  bindings: readonly GlbMeshBinding[],
  cameraBindings: readonly GlbCameraBinding[],
  lightBindings: readonly GlbLightBinding[],
  fps: number,
  scene: Object3D
): AnimationClipSnapshot[] {
  if (
    animations.length === 0 ||
    (bindings.length === 0 &&
      cameraBindings.length === 0 &&
      lightBindings.length === 0)
  ) {
    return [];
  }
  const rate = Math.max(1, Math.min(120, Math.round(fps)));
  const mixer = new AnimationMixer(scene);
  const clips: AnimationClipSnapshot[] = [];
  for (const gltfClip of animations) {
    const duration = Math.max(
      gltfClip.duration,
      ...gltfClip.tracks.map((track) =>
        track.times.length > 0 ? track.times[track.times.length - 1] : 0
      )
    );
    const endFrame = Math.max(0, Math.min(2400, Math.ceil(duration * rate)));
    const action = mixer.clipAction(gltfClip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.reset().play();
    const transforms = new Map<
      string,
      {
        position: [number, number, number];
        rotation: [number, number, number];
        scale: [number, number, number];
      }[]
    >();
    const sampledWeights = bindings.map(() => [] as number[][]);
    const sampledCameras = cameraBindings.map(
      () =>
        [] as {
          position: [number, number, number];
          target: [number, number, number];
        }[]
    );
    const sampledLights = lightBindings.map(
      () =>
        [] as {
          position: [number, number, number];
          direction: [number, number, number];
        }[]
    );
    for (let frame = 0; frame <= endFrame; frame += 1) {
      mixer.setTime(frame / rate);
      scene.updateMatrixWorld(true);
      for (let bindingIndex = 0; bindingIndex < bindings.length; bindingIndex += 1) {
        const binding = bindings[bindingIndex];
        const delta = new Matrix4()
          .multiplyMatrices(
            binding.object.matrixWorld,
            binding.restWorld.clone().invert()
          )
          .premultiply(Y_UP_TO_Z_UP)
          .multiply(Z_UP_TO_Y_UP);
        const position = new Vector3();
        const rotation = new Quaternion();
        const scale = new Vector3();
        delta.decompose(position, rotation, scale);
        const euler = new Euler().setFromQuaternion(rotation, 'XYZ');
        const samples = transforms.get(binding.node.id) ?? [];
        samples.push({
          position: [position.x, position.y, position.z],
          rotation: [
            (euler.x * 180) / Math.PI,
            (euler.y * 180) / Math.PI,
            (euler.z * 180) / Math.PI
          ],
          scale: [scale.x, scale.y, scale.z]
        });
        transforms.set(binding.node.id, samples);
        sampledWeights[bindingIndex].push(
          binding.shapeKeyIds.map(
            (_id, index) => binding.object.morphTargetInfluences?.[index] ?? 0
          )
        );
      }
      for (let index = 0; index < cameraBindings.length; index += 1) {
        const binding = cameraBindings[index];
        const position = new Vector3()
          .setFromMatrixPosition(binding.object.matrixWorld)
          .applyMatrix4(Y_UP_TO_Z_UP);
        const quaternion = new Quaternion();
        binding.object.getWorldQuaternion(quaternion);
        const direction = appDirection(
          new Vector3(0, 0, -1).applyQuaternion(quaternion)
        );
        const target = position
          .clone()
          .addScaledVector(direction, IMPORTED_CAMERA_TARGET_DISTANCE);
        sampledCameras[index].push({
          position: [position.x, position.y, position.z],
          target: [target.x, target.y, target.z]
        });
      }
      for (let index = 0; index < lightBindings.length; index += 1) {
        const binding = lightBindings[index];
        const position = new Vector3()
          .setFromMatrixPosition(binding.object.matrixWorld)
          .applyMatrix4(Y_UP_TO_Z_UP);
        const quaternion = new Quaternion();
        binding.object.getWorldQuaternion(quaternion);
        const direction =
          binding.object instanceof DirectionalLight
            ? appDirection(new Vector3(0, 0, -1).applyQuaternion(quaternion))
            : new Vector3(0, 0, -1);
        sampledLights[index].push({
          position: [position.x, position.y, position.z],
          direction: [direction.x, direction.y, direction.z]
        });
      }
    }
    action.stop();
    mixer.uncacheAction(gltfClip);
    const tracks: AnimationTrackSnapshot[] = [];
    for (const [nodeId, samples] of transforms) {
      const changed = samples.some(
        (sample) =>
          Math.abs(sample.position[0]) > 1e-6 ||
          Math.abs(sample.position[1]) > 1e-6 ||
          Math.abs(sample.position[2]) > 1e-6 ||
          Math.abs(sample.rotation[0]) > 1e-4 ||
          Math.abs(sample.rotation[1]) > 1e-4 ||
          Math.abs(sample.rotation[2]) > 1e-4 ||
          Math.abs(sample.scale[0] - 1) > 1e-6 ||
          Math.abs(sample.scale[1] - 1) > 1e-6 ||
          Math.abs(sample.scale[2] - 1) > 1e-6
      );
      if (!changed) {
        continue;
      }
      const keyframes = samples.map((sample, frame) => ({
        frame,
        transform: {
          position: sample.position,
          rotation: sample.rotation,
          scale: sample.scale
        },
        interpolation: 'linear' as const
      }));
      tracks.push({
        id: createAnimationTrackId(),
        targetId: nodeId,
        targetKind: 'node',
        keyframes
      });
    }
    const weightTracks: ShapeWeightTrackSnapshot[] = [];
    for (let bindingIndex = 0; bindingIndex < bindings.length; bindingIndex += 1) {
      const binding = bindings[bindingIndex];
      for (let shapeIndex = 0; shapeIndex < binding.shapeKeyIds.length; shapeIndex += 1) {
        const values = sampledWeights[bindingIndex].map(
          (sample) => sample[shapeIndex] ?? 0
        );
        const rest = binding.restWeights[shapeIndex] ?? 0;
        const changed = values.some((value) => Math.abs(value - rest) > 1e-6);
        if (!changed) {
          continue;
        }
        weightTracks.push({
          id: createShapeWeightTrackId(),
          targetId: binding.node.id,
          shapeKeyId: binding.shapeKeyIds[shapeIndex],
          keyframes: values.map((weight, frame) => ({
            frame,
            weight: Math.max(0, Math.min(1, weight)),
            interpolation: 'linear'
          }))
        });
      }
    }
    const cameraTracks: CameraAnimationTrackSnapshot[] = [];
    for (let index = 0; index < cameraBindings.length; index += 1) {
      const binding = cameraBindings[index];
      const samples = sampledCameras[index];
      const rest = binding.snapshot;
      const changed = samples.some(
        (sample) =>
          Math.abs(sample.position[0] - rest.position[0]) > 1e-6 ||
          Math.abs(sample.position[1] - rest.position[1]) > 1e-6 ||
          Math.abs(sample.position[2] - rest.position[2]) > 1e-6 ||
          Math.abs(sample.target[0] - rest.target[0]) > 1e-6 ||
          Math.abs(sample.target[1] - rest.target[1]) > 1e-6 ||
          Math.abs(sample.target[2] - rest.target[2]) > 1e-6
      );
      if (!changed) {
        continue;
      }
      cameraTracks.push({
        id: createCameraAnimationTrackId(),
        targetId: rest.id,
        keyframes: samples.map((sample, frame) => ({
          frame,
          position: sample.position,
          target: sample.target,
          fov: rest.fov,
          interpolation: 'linear' as const
        }))
      });
    }
    const lightTracks: LightAnimationTrackSnapshot[] = [];
    for (let index = 0; index < lightBindings.length; index += 1) {
      const binding = lightBindings[index];
      const samples = sampledLights[index];
      const rest = binding.snapshot;
      const changed = samples.some(
        (sample) =>
          Math.abs(sample.position[0] - rest.position[0]) > 1e-6 ||
          Math.abs(sample.position[1] - rest.position[1]) > 1e-6 ||
          Math.abs(sample.position[2] - rest.position[2]) > 1e-6 ||
          Math.abs(sample.direction[0] - rest.direction[0]) > 1e-6 ||
          Math.abs(sample.direction[1] - rest.direction[1]) > 1e-6 ||
          Math.abs(sample.direction[2] - rest.direction[2]) > 1e-6
      );
      if (!changed) {
        continue;
      }
      lightTracks.push({
        id: createLightAnimationTrackId(),
        targetId: rest.id,
        keyframes: samples.map((sample, frame) => ({
          frame,
          position: sample.position,
          direction: sample.direction,
          intensity: rest.intensity,
          interpolation: 'linear' as const
        }))
      });
    }
    const end = Math.max(0, endFrame);
    if (
      tracks.length === 0 &&
      weightTracks.length === 0 &&
      cameraTracks.length === 0 &&
      lightTracks.length === 0
    ) {
      continue;
    }
    clips.push({
      id: createAnimationClipId(),
      name: gltfClip.name || `Animation ${clips.length + 1}`,
      startFrame: 0,
      endFrame: end <= 0 ? 1 : end,
      tracks,
      weightTracks,
      ...(cameraTracks.length > 0 ? { cameraTracks } : {}),
      ...(lightTracks.length > 0 ? { lightTracks } : {})
    });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(mixer.getRoot());
  return clips;
}

/** One embedded PNG texture for a GLB export. */
export interface GlbTextureFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

function makeMaterial(color: string, textured: boolean): MeshBasicMaterial {
  // Baked illumination is already in the texture. An unlit basic material keeps
  // a viewer from adding a second PBR highlight or metallic response.
  return new MeshBasicMaterial({
    color: textured ? 0xffffff : color,
    toneMapped: false
  });
}

/** Export visible nodes as a binary GLB with textures and animation clips. */
export async function exportGlb(
  nodes: readonly MeshNode[],
  groups: readonly SceneGroup[],
  textures: ReadonlyMap<string, GlbTextureFile> = new Map(),
  animation?: GlbAnimationExportOptions
): Promise<Uint8Array> {
  const textureCache = new Map<string, Texture>();
  const textureImages: ImageBitmap[] = [];
  for (const [id, file] of textures) {
    const image = await createImageBitmap(
      new Blob([file.bytes.slice().buffer as ArrayBuffer], {
        type: 'image/png'
      })
    );
    const texture = new Texture(image);
    texture.name = file.name;
    texture.colorSpace = SRGBColorSpace;
    texture.flipY = true;
    texture.needsUpdate = true;
    textureCache.set(id, texture);
    textureImages.push(image);
  }
  const scene = new Scene();
  scene.name = 'loupoli';
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const nodeContexts = new Map<string, NodeGlbAnimationContext>();
  const usedRootNames = new Set<string>();
  const motionTracksByNode = new Map<
    string,
    { clipId: string; track: MeshMotionTrack }[]
  >();
  if (animation) {
    for (const clip of animation.clips) {
      for (const track of clip.meshTracks) {
        const entries = motionTracksByNode.get(track.targetId) ?? [];
        entries.push({ clipId: clip.id, track });
        motionTracksByNode.set(track.targetId, entries);
      }
    }
  }
  let objectIndex = 0;
  for (const node of nodes) {
    if (!node.visible) {
      continue;
    }
    const evaluated = node.getEvaluatedMesh();
    if (evaluated.error) {
      throw new Error(`${node.name}: ${evaluated.error}`);
    }
    const animationBase = animation !== undefined && !evaluated.modifiersActive;
    const mesh = animationBase ? node.mesh : evaluated.mesh;
    const morphKeys = mesh === node.mesh ? node.shapeKeys : [];
    if (mesh.triangleVertexCount === 0) {
      continue;
    }
    for (const key of morphKeys) {
      if (key.targetPositions.length !== mesh.positions.length) {
        throw new Error(
          `Shape key "${key.name}" does not match the mesh vertex count.`
        );
      }
    }
    const parent = node.parentId ? groupById.get(node.parentId) : null;
    const world = transformMatrix(
      worldTransformForNode(node.transform, parent?.transform ?? null)
    );
    const root = new Object3D();
    const rootBase =
      node.name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'Object';
    let rootName = rootBase;
    let rootSuffix = 2;
    while (usedRootNames.has(rootName)) {
      rootName = `${rootBase}_${rootSuffix}`;
      rootSuffix += 1;
    }
    usedRootNames.add(rootName);
    root.name = rootName;
    root.matrix.copy(world).premultiply(Z_UP_TO_Y_UP);
    root.matrix.decompose(root.position, root.quaternion, root.scale);
    root.matrixAutoUpdate = true;
    root.updateMatrixWorld(true);
    const palette = node.materialPalette.length
      ? node.materialPalette
      : ['#c8c2ad'];
    const vertexCount = mesh.triangleVertexCount;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    mesh.writeTriangleData(positions, normals, uvs);
    const baseVertexByRender = new Uint32Array(vertexCount);
    {
      let renderCursor = 0;
      for (let face = 0; face < mesh.faceCount; face += 1) {
        const loop: number[] = [];
        const first = mesh.faceHalfEdge[face];
        let halfEdge = first;
        do {
          loop.push(mesh.heOrigin[halfEdge]);
          halfEdge = mesh.heNext[halfEdge];
        } while (halfEdge !== first);
        const renderCount = mesh.renderTriangleCountForFace(face);
        const total = renderCount * 3;
        if (loop.length === 4 && renderCount > 2) {
          baseVertexByRender.fill(loop[0], renderCursor, renderCursor + total);
        } else {
          let cursor = renderCursor;
          for (let i = 1; i < loop.length - 1; i += 1) {
            baseVertexByRender[cursor] = loop[0];
            baseVertexByRender[cursor + 1] = loop[i];
            baseVertexByRender[cursor + 2] = loop[i + 1];
            cursor += 3;
          }
          while (cursor < renderCursor + total) {
            baseVertexByRender[cursor] = loop[0];
            cursor += 1;
          }
        }
        renderCursor += total;
      }
    }
    const fullMorphTargets = morphKeys.map((key) => {
      const data = new Float32Array(vertexCount * 3);
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const base = baseVertexByRender[vertex];
        data[vertex * 3] =
          key.targetPositions[base * 3] - mesh.positions[base * 3];
        data[vertex * 3 + 1] =
          key.targetPositions[base * 3 + 1] - mesh.positions[base * 3 + 1];
        data[vertex * 3 + 2] =
          key.targetPositions[base * 3 + 2] - mesh.positions[base * 3 + 2];
      }
      return data;
    });
    const morphNames: string[] = [];
    const usedMorphNames = new Set<string>();
    const uniqueMorphName = (base: string): string => {
      const clean = base.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'Morph';
      let name = clean;
      let suffix = 2;
      while (usedMorphNames.has(name)) {
        name = `${clean}_${suffix}`;
        suffix += 1;
      }
      usedMorphNames.add(name);
      return name;
    };
    for (const key of morphKeys) {
      morphNames.push(uniqueMorphName(key.name));
    }
    const motionTracks = animationBase
      ? (motionTracksByNode.get(node.id) ?? [])
      : [];
    const motionTargetData: Float32Array[] = [];
    const motionBindings: MotionMorphBinding[] = [];
    let motionTargetCursor = morphKeys.length;
    for (const { clipId, track } of motionTracks) {
      const samples: MotionMorphSample[] = [];
      const vertexPositions = new Map<number, number>();
      track.vertexIndices.forEach((vertex, position) => {
        vertexPositions.set(vertex, position);
      });
      for (const key of track.keyframes) {
        const target = new Float32Array(vertexCount * 3);
        for (let vertex = 0; vertex < vertexCount; vertex += 1) {
          const base = baseVertexByRender[vertex];
          const position = vertexPositions.get(base);
          if (position === undefined) {
            continue;
          }
          target[vertex * 3] = key.values[position * 3];
          target[vertex * 3 + 1] = key.values[position * 3 + 1];
          target[vertex * 3 + 2] = key.values[position * 3 + 2];
        }
        motionTargetData.push(target);
        morphNames.push(
          uniqueMorphName(`Motion_${clipId.slice(-4)}_${key.frame}`)
        );
        samples.push({
          frame: key.frame,
          targetIndex: motionTargetCursor,
          interpolation: key.interpolation
        });
        motionTargetCursor += 1;
      }
      if (samples.length > 0) {
        motionBindings.push({ clipId, samples });
      }
    }
    const allMorphTargets = [...fullMorphTargets, ...motionTargetData];
    if (allMorphTargets.length > 16) {
      throw new Error(
        `${node.name}: GLB animation supports at most 16 morph targets (shape keys plus Mesh Motion keys).`
      );
    }
    const nodeMeshes: Mesh[] = [];

    const materialFaces = new Map<number, number[]>();
    for (let face = 0; face < mesh.faceCount; face += 1) {
      const material = mesh.faceMaterial[face];
      const list = materialFaces.get(material) ?? [];
      list.push(face);
      materialFaces.set(material, list);
    }
    for (const [materialIndex, faces] of materialFaces) {
      const triangleCount = faces.reduce(
        (sum, face) => sum + mesh.renderTriangleCountForFace(face),
        0
      );
      const subsetPositions = new Float32Array(triangleCount * 3 * 3);
      const subsetNormals = new Float32Array(triangleCount * 3 * 3);
      const subsetUvs = new Float32Array(triangleCount * 3 * 2);
      let sourceVertex = 0;
      let targetVertex = 0;
      for (let face = 0; face < mesh.faceCount; face += 1) {
        const count = mesh.renderTriangleCountForFace(face) * 3;
        if (faces.includes(face)) {
          subsetPositions.set(
            positions.subarray(sourceVertex * 3, (sourceVertex + count) * 3),
            targetVertex * 3
          );
          subsetNormals.set(
            normals.subarray(sourceVertex * 3, (sourceVertex + count) * 3),
            targetVertex * 3
          );
          subsetUvs.set(
            uvs.subarray(sourceVertex * 2, (sourceVertex + count) * 2),
            targetVertex * 2
          );
          targetVertex += count;
        }
        sourceVertex += count;
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(subsetPositions, 3));
      geometry.setAttribute('normal', new BufferAttribute(subsetNormals, 3));
      geometry.setAttribute('uv', new BufferAttribute(subsetUvs, 2));
      const indices = new Uint32Array(triangleCount * 3);
      for (let index = 0; index < indices.length; index += 1) {
        indices[index] = index;
      }
      geometry.setIndex(new BufferAttribute(indices, 1));
      if (allMorphTargets.length > 0) {
        const morphAttributes: BufferAttribute[] = [];
        let source = 0;
        for (const morph of allMorphTargets) {
          const subset = new Float32Array(triangleCount * 3 * 3);
          let target = 0;
          for (let face = 0; face < mesh.faceCount; face += 1) {
            const count = mesh.renderTriangleCountForFace(face) * 3;
            if (faces.includes(face)) {
              subset.set(
                morph.subarray(source * 3, (source + count) * 3),
                target * 3
              );
              target += count;
            }
            source += count;
          }
          source = 0;
          morphAttributes.push(new BufferAttribute(subset, 3));
        }
        geometry.morphAttributes.position = morphAttributes;
        geometry.morphTargetsRelative = true;
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const texture = node.textureId
        ? textureCache.get(node.textureId) ?? null
        : null;
      const material = makeMaterial(
        palette[materialIndex] ?? palette[0],
        texture !== null
      );
      material.name = `${node.name}_mat${materialIndex}`;
      material.map = texture;
      const meshObject = new Mesh(geometry, material);
      meshObject.name = `${rootName}_${objectIndex}`;
      nodeMeshes.push(meshObject);
      if (allMorphTargets.length > 0) {
        meshObject.morphTargetInfluences = [
          ...morphKeys.map((key) => key.weight),
          ...motionTargetData.map(() => 0)
        ];
        meshObject.morphTargetDictionary = Object.fromEntries(
          morphNames.map((name, index) => [name, index] as const)
        );
      }
      objectIndex += 1;
      root.add(meshObject);
    }
    if (animation) {
      nodeContexts.set(node.id, {
        node,
        parent: parent ?? null,
        root,
        meshes: nodeMeshes,
        morphNames,
        shapeKeyIds: morphKeys.map((key) => key.id),
        motionBindings,
        motionTargetCount: motionTargetData.length
      });
    }
    scene.add(root);
  }
  const cameraContexts: CameraGlbAnimationContext[] = [];
  const lightContexts: LightGlbAnimationContext[] = [];
  const uniqueSceneName = (value: string, fallback: string): string => {
    const base = value.replace(/[^a-zA-Z0-9_-]+/g, '_') || fallback;
    let name = base;
    let suffix = 2;
    while (usedRootNames.has(name)) {
      name = `${base}_${suffix}`;
      suffix += 1;
    }
    usedRootNames.add(name);
    return name;
  };
  for (const camera of animation?.cameras ?? []) {
    const object = new PerspectiveCamera(
      Math.max(5, Math.min(160, camera.fov)),
      16 / 9,
      0.01,
      1000
    );
    object.name = uniqueSceneName(camera.name, 'Camera');
    const position = yUpPoint(camera.position);
    const target = yUpPoint(camera.target);
    object.position.copy(position);
    object.quaternion.copy(cameraQuaternion(position, target));
    object.updateMatrixWorld(true);
    scene.add(object);
    cameraContexts.push({ camera, object });
  }
  for (const light of animation?.lights ?? []) {
    if (!light.enabled) {
      continue;
    }
    const object =
      light.kind === 'directional'
        ? new DirectionalLight(light.color, light.intensity)
        : new PointLight(light.color, light.intensity, 0);
    object.name = uniqueSceneName(light.name, 'Light');
    object.position.copy(yUpPoint(light.position));
    if (object instanceof DirectionalLight) {
      object.quaternion.copy(lightQuaternion(light.direction));
      const target = new Object3D();
      target.position.set(0, 0, -1);
      object.add(target);
      object.target = target;
    }
    object.updateMatrixWorld(true);
    scene.add(object);
    lightContexts.push({ light, object });
  }

  if (scene.children.length === 0) {
    throw new Error('There are no visible objects to export.');
  }
  const threeClips: ThreeAnimationClip[] = [];
  if (animation) {
    for (const clip of animation.clips) {
      const frames: number[] = [];
      for (let frame = clip.startFrame; frame <= clip.endFrame; frame += 1) {
        frames.push(frame);
      }
      if (frames.length === 0) {
        continue;
      }
      const times = frames.map(
        (frame) => (frame - clip.startFrame) / Math.max(1, animation.fps)
      );
      const tracks: (VectorKeyframeTrack | QuaternionKeyframeTrack | NumberKeyframeTrack)[] = [];
      if (clip.tracks.length > 0) {
        for (const context of nodeContexts.values()) {
          const positions: number[] = [];
          const rotations: number[] = [];
          const scales: number[] = [];
          for (const frame of frames) {
            const pose = sampleClipTransformPose(clip, frame);
            const nodeTransform = pose.get(context.node.id) ?? context.node.transform;
            const parentTransform = context.parent
              ? (pose.get(context.parent.id) ?? context.parent.transform)
              : null;
            const matrix = transformMatrix(
              worldTransformForNode(nodeTransform, parentTransform)
            ).premultiply(Z_UP_TO_Y_UP);
            const position = new Vector3();
            const rotation = new Quaternion();
            const scale = new Vector3();
            matrix.decompose(position, rotation, scale);
            positions.push(position.x, position.y, position.z);
            rotations.push(rotation.x, rotation.y, rotation.z, rotation.w);
            scales.push(scale.x, scale.y, scale.z);
          }
          tracks.push(
            new VectorKeyframeTrack(
              `${context.root.name}.position`,
              times,
              positions
            ),
            new QuaternionKeyframeTrack(
              `${context.root.name}.quaternion`,
              times,
              rotations
            ),
            new VectorKeyframeTrack(
              `${context.root.name}.scale`,
              times,
              scales
            )
          );
        }
      }
      for (const context of cameraContexts) {
        const cameraTrack = clip.cameraTracks.find(
          (track) => track.targetId === context.camera.id
        );
        if (!cameraTrack) {
          continue;
        }
        const positions: number[] = [];
        const rotations: number[] = [];
        for (const frame of frames) {
          const pose = cameraTrack.evaluate(frame) ?? context.camera;
          const position = yUpPoint(pose.position);
          const target = yUpPoint(pose.target);
          const rotation = cameraQuaternion(position, target);
          positions.push(position.x, position.y, position.z);
          rotations.push(rotation.x, rotation.y, rotation.z, rotation.w);
        }
        tracks.push(
          new VectorKeyframeTrack(
            `${context.object.name}.position`,
            times,
            positions
          ),
          new QuaternionKeyframeTrack(
            `${context.object.name}.quaternion`,
            times,
            rotations
          )
        );
      }
      for (const context of lightContexts) {
        const lightTrack = clip.lightTracks.find(
          (track) => track.targetId === context.light.id
        );
        if (!lightTrack) {
          continue;
        }
        const positions: number[] = [];
        const rotations: number[] = [];
        const directional = context.object instanceof DirectionalLight;
        for (const frame of frames) {
          const pose = lightTrack.evaluate(frame) ?? context.light;
          positions.push(...yUpPoint(pose.position).toArray());
          if (directional) {
            const rotation = lightQuaternion(pose.direction);
            rotations.push(rotation.x, rotation.y, rotation.z, rotation.w);
          }
        }
        tracks.push(
          new VectorKeyframeTrack(
            `${context.object.name}.position`,
            times,
            positions
          )
        );
        if (directional) {
          tracks.push(
            new QuaternionKeyframeTrack(
              `${context.object.name}.quaternion`,
              times,
              rotations
            )
          );
        }
      }
      for (const context of nodeContexts.values()) {
        const shapeCount = context.shapeKeyIds.length;
        for (const weightTrack of clip.weightTracks) {
          if (weightTrack.targetId !== context.node.id) {
            continue;
          }
          const shapeIndex = context.shapeKeyIds.indexOf(weightTrack.shapeKeyId);
          if (shapeIndex < 0) {
            continue;
          }
          const fallback =
            context.node.shapeKeys.find((key) => key.id === weightTrack.shapeKeyId)
              ?.weight ?? 0;
          const values = frames.map(
            (frame) => weightTrack.evaluate(frame) ?? fallback
          );
          for (const mesh of context.meshes) {
            tracks.push(
              new NumberKeyframeTrack(
                `${mesh.name}.morphTargetInfluences[${context.morphNames[shapeIndex]}]`,
                times,
                values
              )
            );
          }
        }
        const binding = context.motionBindings.find(
          (item) => item.clipId === clip.id
        );
        if (binding) {
          for (
            let offset = 0;
            offset < context.motionTargetCount;
            offset += 1
          ) {
            const targetIndex = shapeCount + offset;
            const values = frames.map(
              (frame) =>
                sampleMotionWeights(binding, frame).get(targetIndex) ?? 0
            );
            for (const mesh of context.meshes) {
              tracks.push(
                new NumberKeyframeTrack(
                  `${mesh.name}.morphTargetInfluences[${context.morphNames[targetIndex]}]`,
                  times,
                  values
                )
              );
            }
          }
        }
      }
      if (tracks.length > 0) {
        threeClips.push(
          new ThreeAnimationClip(
            clip.name,
            (clip.endFrame - clip.startFrame) / Math.max(1, animation.fps),
            tracks
          )
        );
      }
    }
  }
  try {
    const exporter = new GLTFExporter();
    const buffer = await exporter.parseAsync(scene, {
      binary: true,
      trs: true,
      animations: threeClips
    });
    return new Uint8Array(buffer);
  } finally {
    for (const texture of textureCache.values()) {
      texture.dispose();
    }
    for (const image of textureImages) {
      image.close();
    }
  }
}
