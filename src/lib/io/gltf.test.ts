import { describe, expect, it } from 'vitest';
import { exportGlb, importGlb } from './gltf';
import { createCubeMesh } from '../geometry/primitives';
import { MeshNode } from '../scene/MeshNode';
import { AnimationClip } from '../scene/SceneAnimation';
import { SceneGroup } from '../scene/SceneGroup';
import { SceneCamera } from '../scene/SceneCamera';
import { SceneLight } from '../scene/SceneLight';

class TestFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
}

if (typeof globalThis.FileReader === 'undefined') {
  (globalThis as unknown as { FileReader: typeof TestFileReader }).FileReader =
    TestFileReader;
}

describe('GLB animation', () => {
  it('round-trips transform animation clips', async () => {
    const node = new MeshNode(createCubeMesh(1), 'cube', 'Animated', 'node-1');
    const clip = new AnimationClip('Move', 'clip-1', 0, 12);
    const track = clip.ensureTrack(node.id, 'node');
    track.setKey(0, {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    track.setKey(12, {
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    const second = new AnimationClip('Return', 'clip-2', 0, 12);
    second.ensureTrack(node.id, 'node').setKey(0, {
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    second.ensureTrack(node.id, 'node').setKey(12, {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    const bytes = await exportGlb([node], [], new Map(), {
      clips: [clip, second],
      fps: 24
    });
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const imported = await importGlb(buffer, 24);
    expect(imported.nodes).toHaveLength(1);
    expect(imported.clips).toHaveLength(2);
    expect(imported.clips.map((item) => item.name)).toEqual(['Move', 'Return']);
    expect(imported.clips[0].name).toBe('Move');
    expect(imported.clips[0].tracks).toHaveLength(1);
    const keys = imported.clips[0].tracks[0].keyframes;
    expect(keys[0].transform.position).toEqual([0, 0, 0]);
    expect(keys[keys.length - 1].transform.position[0]).toBeCloseTo(2);
  });

  it('bakes group animation into exported node motion', async () => {
    const group = new SceneGroup('Rig', 'group-1');
    const node = new MeshNode(createCubeMesh(1), 'cube', 'Child', 'node-4');
    node.parentId = group.id;
    const clip = new AnimationClip('Group', 'clip-4', 0, 8);
    const track = clip.ensureTrack(group.id, 'group');
    track.setKey(0, {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    track.setKey(8, {
      position: [3, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    });
    const bytes = await exportGlb([node], [group], new Map(), {
      clips: [clip],
      fps: 24
    });
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const imported = await importGlb(buffer, 24);
    const keys = imported.clips[0].tracks[0].keyframes;
    expect(keys[0].transform.position).toEqual([0, 0, 0]);
    expect(keys[keys.length - 1].transform.position[0]).toBeCloseTo(3);
  });

  it('exports Mesh Motion as morph animation', async () => {
    const node = new MeshNode(createCubeMesh(1), 'cube', 'Motion', 'node-3');
    const clip = new AnimationClip('Motion', 'clip-3', 0, 8);
    const track = clip.ensureMeshTrack(node.id);
    const base = node.mesh.positions.slice();
    const posed = base.slice();
    posed[0] += 0.25;
    track.setPoseKey(0, base, posed);
    const posedLater = base.slice();
    posedLater[0] += 0.5;
    track.setPoseKey(8, base, posedLater);
    const bytes = await exportGlb([node], [], new Map(), {
      clips: [clip],
      fps: 24
    });
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const imported = await importGlb(buffer, 24);
    expect(imported.nodes[0].shapeKeys.length).toBeGreaterThanOrEqual(2);
    expect(imported.clips[0].weightTracks?.length).toBeGreaterThanOrEqual(2);
    const weights = imported.clips[0].weightTracks?.[0].keyframes ?? [];
    expect(weights[0].weight).toBe(1);
  });

  it('round-trips shape-key weight animation', async () => {
    const node = new MeshNode(createCubeMesh(1), 'cube', 'Morph', 'node-2');
    const shape = node.addShapeKey('Lift');
    shape.targetPositions[1] += 1;
    const clip = new AnimationClip('Morph', 'clip-2', 0, 8);
    const track = clip.ensureWeightTrack(node.id, shape.id);
    track.setKey(0, 0);
    track.setKey(8, 1);
    const bytes = await exportGlb([node], [], new Map(), {
      clips: [clip],
      fps: 24
    });
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const imported = await importGlb(buffer, 24);
    expect(imported.nodes[0].shapeKeys).toHaveLength(1);
    expect(imported.clips).toHaveLength(1);
    expect(imported.clips[0].weightTracks).toHaveLength(1);
    const keys = imported.clips[0].weightTracks?.[0].keyframes ?? [];
    expect(keys[0].weight).toBe(0);
    expect(keys[keys.length - 1].weight).toBe(1);
  });
});


function readGlbJson(bytes: Uint8Array): {
  cameras?: unknown[];
  extensions?: { KHR_lights_punctual?: { lights?: unknown[] } };
  extensionsUsed?: string[];
  nodes?: { camera?: number; extensions?: unknown }[];
  animations?: { channels?: { target?: { node?: number } }[] }[];
} {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );
  const length = view.getUint32(12, true);
  return JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + length))
  ) as ReturnType<typeof readGlbJson>;
}

describe('GLB cameras and lights', () => {
  it('exports cameras, punctual lights, and their animation', async () => {
    const node = new MeshNode(createCubeMesh(1), 'cube', 'Body', 'node-10');
    const camera = new SceneCamera({
      id: 'camera-10',
      name: 'Shot Cam',
      position: [4, -6, 4],
      target: [0, 0, 0],
      fov: 35
    });
    const light = SceneLight.fromSnapshot({
      id: 'light-10',
      name: 'Key Sun',
      kind: 'directional',
      color: '#ffffff',
      intensity: 2,
      enabled: true,
      castShadows: true,
      shadowSoftness: 0.35,
      position: [2, 2, 4],
      direction: [-0.35, 0.25, -1]
    });
    const pointLight = SceneLight.fromSnapshot({
      id: 'light-11',
      name: 'Fill Point',
      kind: 'point',
      color: '#ffffff',
      intensity: 1,
      enabled: true,
      castShadows: false,
      shadowSoftness: 0,
      position: [0, 0, 2],
      direction: [0, 0, -1]
    });
    const clip = new AnimationClip('Camera and Light', 'clip-10', 0, 8);
    const cameraTrack = clip.ensureCameraTrack(camera.id);
    cameraTrack.setKey(0, {
      position: [4, -6, 4],
      target: [0, 0, 0],
      fov: 35
    });
    cameraTrack.setKey(8, {
      position: [0, -8, 3],
      target: [0, 0, 0],
      fov: 45
    });
    const lightTrack = clip.ensureLightTrack(light.id);
    lightTrack.setKey(0, {
      position: [2, 2, 4],
      direction: [-0.35, 0.25, -1],
      intensity: 2
    });
    lightTrack.setKey(8, {
      position: [3, 3, 5],
      direction: [-0.5, 0.5, -1],
      intensity: 4
    });
    const pointTrack = clip.ensureLightTrack(pointLight.id);
    pointTrack.setKey(0, {
      position: [0, 0, 2],
      direction: [0, 0, -1],
      intensity: 1
    });
    pointTrack.setKey(8, {
      position: [1, 1, 3],
      direction: [0, 0, -1],
      intensity: 2
    });
    const bytes = await exportGlb([node], [], new Map(), {
      clips: [clip],
      fps: 24,
      cameras: [camera.snapshot()],
      lights: [light.snapshot(), pointLight.snapshot()]
    });
    const json = readGlbJson(bytes);
    expect(json.cameras).toHaveLength(1);
    expect(json.extensionsUsed).toContain('KHR_lights_punctual');
    expect(
      json.extensions?.KHR_lights_punctual?.lights
    ).toHaveLength(2);
    expect(json.nodes?.some((item) => item.camera !== undefined)).toBe(true);
    expect(
      json.nodes?.some((item) => Boolean(item.extensions))
    ).toBe(true);
    const cameraNode = json.nodes?.findIndex(
      (item) => item.camera !== undefined
    );
    const lightNodes = new Set(
      json.nodes
        ?.map((item, index) => (item.extensions ? index : -1))
        .filter((index) => index >= 0)
    );
    const animatedNodes = new Set(
      json.animations?.[0]?.channels?.map((channel) => channel.target?.node)
    );
    expect(animatedNodes.has(cameraNode)).toBe(true);
    for (const lightNode of lightNodes) {
      expect(animatedNodes.has(lightNode)).toBe(true);
    }
    expect(json.animations?.[0]?.channels?.length).toBeGreaterThanOrEqual(5);

    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const imported = await importGlb(buffer, 24);
    expect(imported.cameras).toHaveLength(1);
    expect(imported.cameras[0].name).toBe('Shot_Cam');
    expect(imported.cameras[0].fov).toBeCloseTo(35);
    const importedCameraDirection = [
      imported.cameras[0].target[0] - imported.cameras[0].position[0],
      imported.cameras[0].target[1] - imported.cameras[0].position[1],
      imported.cameras[0].target[2] - imported.cameras[0].position[2]
    ];
    expect(importedCameraDirection[0]).toBeLessThan(0);
    expect(importedCameraDirection[1]).toBeGreaterThan(0);
    expect(importedCameraDirection[2]).toBeLessThan(0);
    expect(imported.lights).toHaveLength(2);
    expect(imported.lights.map((item) => item.kind).sort()).toEqual([
      'directional',
      'point'
    ]);
    const importedSun = imported.lights.find(
      (item) => item.kind === 'directional'
    );
    const sunDirection = importedSun?.direction ?? [0, 0, 0];
    expect(sunDirection[2]).toBeLessThan(-0.8);
    expect(imported.clips[0].cameraTracks).toHaveLength(1);
    expect(imported.clips[0].lightTracks).toHaveLength(2);
    const importedCameraTrack = imported.clips[0].cameraTracks?.[0];
    expect(importedCameraTrack?.targetId).toBe(imported.cameras[0].id);
    expect(importedCameraTrack?.keyframes[0].position[0]).toBeCloseTo(4, 1);
    expect(importedCameraTrack?.keyframes.at(-1)?.position[1]).toBeCloseTo(-8, 1);
    for (const track of imported.clips[0].lightTracks ?? []) {
      const target = imported.lights.find(
        (item) => item.id === track.targetId
      );
      expect(target).toBeDefined();
      expect(track.keyframes.length).toBeGreaterThan(1);
    }
  });

  it('imports a camera-only GLB without requiring triangle meshes', async () => {
    const camera = new SceneCamera({
      id: 'camera-11',
      name: 'Camera Only',
      position: [1, -2, 3],
      target: [0, 0, 0],
      fov: 40
    });
    const bytes = await exportGlb([], [], new Map(), {
      clips: [],
      fps: 24,
      cameras: [camera.snapshot()],
      lights: []
    });
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const imported = await importGlb(buffer, 24);
    expect(imported.nodes).toHaveLength(0);
    expect(imported.cameras).toHaveLength(1);
    expect(imported.cameras[0].fov).toBeCloseTo(40);
    expect(imported.lights).toHaveLength(0);
  });
});
