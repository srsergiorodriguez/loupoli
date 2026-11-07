import { describe, expect, it } from 'vitest';
import { exportGlb, importGlb } from './gltf';
import { createCubeMesh } from '../geometry/primitives';
import { MeshNode } from '../scene/MeshNode';
import { AnimationClip } from '../scene/SceneAnimation';
import { SceneGroup } from '../scene/SceneGroup';

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
