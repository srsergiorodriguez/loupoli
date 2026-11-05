import { describe, expect, it } from 'vitest';
import { MeshNode } from '../scene/MeshNode';
import { SceneDocument } from '../scene/SceneDocument';
import { createCylinderMesh, createGridMesh } from '../geometry/primitives';
import {
  decodeLpoly,
  encodeLpoly,
  restoreNode,
  snapshotGroup,
  snapshotNode,
  type ProjectSettings
} from './lpoly';

const SETTINGS: ProjectSettings = {
  shading: 'unlit',
  ps1Snap: false,
  ps1Affine: false
};

function makeDocument(): SceneDocument {
  const document = SceneDocument.createDefault();
  const sphere = document.nodes[0];
  sphere.mesh.setVertexPosition(0, [0.4, 0.2, 1.1]);

  const cylinder = new MeshNode(createCylinderMesh(0.8, 2.5, 8), 'cylinder', 'Fuel Tank');
  cylinder.setPosition([3.2, 0, 0]);
  cylinder.transform.rotation = [0.15, -0.25, 0.4];
  cylinder.transform.scale = [1.1, 0.9, 1.3];
  cylinder.mesh.edgeFlags[0] = 1;
  cylinder.mesh.edgeFlags[3] = 2;
  cylinder.mesh.faceMaterial[2] = 4;
  document.insertNode(cylinder);

  const grid = new MeshNode(createGridMesh(4, 4), 'grid', 'Ground');
  grid.setPosition([7.5, 0, -0.4]);
  document.insertNode(grid);

  return document;
}

describe('.lpoli v4', () => {
  it('round-trips multiple closed and open meshes byte-for-byte', () => {
    const document = makeDocument();
    const bytes = encodeLpoly(document, SETTINGS);
    const decoded = decodeLpoly(bytes);

    expect(decoded.document.nodes).toHaveLength(3);
    expect(decoded.settings).toEqual(SETTINGS);
    expect(decoded.document.nodes.map((node) => node.name)).toEqual([
      'QuadSphere',
      'Fuel Tank',
      'Ground'
    ]);
    expect(decoded.document.nodes[0].mesh.getVertexPosition(0)[0]).toBeCloseTo(0.4);
    expect(decoded.document.nodes[2].mesh.boundaryEdgeCount).toBe(16);
    expect(decoded.document.nodes[2].transform.position[0]).toBe(7.5);
    expect(decoded.document.nodes[1].transform.rotation[2]).toBeCloseTo(0.4);
    expect(decoded.document.nodes[1].transform.scale).toEqual([1.1, 0.9, 1.3]);
    expect(decoded.document.nodes[1].mesh.edgeFlags[0]).toBe(1);
    expect(decoded.document.nodes[1].mesh.edgeFlags[3]).toBe(2);
    expect(decoded.document.nodes[1].mesh.faceMaterial[2]).toBe(4);

    const second = encodeLpoly(decoded.document, decoded.settings);
    expect(Array.from(second)).toEqual(Array.from(bytes));
  });


  it('round-trips texture assets and node bindings', () => {
    const document = makeDocument();
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    document.nodes[0].textureId = 'texasset-1';
    const bytes = encodeLpoly(document, SETTINGS, [
      {
        id: 'texasset-1',
        name: 'Atlas',
        width: 64,
        height: 64,
        filter: 'nearest',
        alphaMode: 'cutout',
        activeId: 'texlayer-1',
        layers: [
          {
            id: 'texlayer-1',
            name: 'Base',
            visible: true,
            opacity: 1,
            color: '#c8c2ad',
            pattern: 'transparent',
            blendMode: 'normal',
            kind: 'fill',
            role: 'color',
            png
          }
        ]
      }
    ]);
    const decoded = decodeLpoly(bytes);
    expect(decoded.textures).toHaveLength(1);
    expect(decoded.textures?.[0].width).toBe(64);
    expect(decoded.textures?.[0].filter).toBe('nearest');
    expect(decoded.textures?.[0].alphaMode).toBe('cutout');
    expect(decoded.textures?.[0].layers[0].pattern).toBe('transparent');
    expect(decoded.textures?.[0].layers).toHaveLength(1);
    expect(decoded.textures?.[0].layers[0].png).toEqual(png);
    expect(decoded.textures?.[0].layers[0].blendMode).toBe('normal');
    expect(decoded.textures?.[0].activeId).toBe('texlayer-1');
    expect(decoded.document.nodes[0].textureId).toBe('texasset-1');
    expect(decoded.document.nodes[0].name).toBe('QuadSphere');
  });

  it('round-trips a full eight-layer texture asset', () => {
    const document = makeDocument();
    document.nodes[0].textureId = 'texasset-heavy';
    const layers = Array.from({ length: 8 }, (_, index) => ({
      id: `texlayer-${index + 1}`,
      name: `Layer ${index + 1}`,
      visible: index !== 3,
      opacity: 1 - index * 0.05,
      color: '#c8c2ad',
      pattern: index === 0 ? ('transparent' as const) : ('solid' as const),
      blendMode: index === 6 ? ('multiply' as const) : ('normal' as const),
      kind: 'fill' as const,
      role: index === 7 ? ('lighting' as const) : ('color' as const),
      png: new Uint8Array([137, 80, 78, 71, index, index + 1])
    }));
    const bytes = encodeLpoly(document, SETTINGS, [
      {
        id: 'texasset-heavy',
        name: 'Heavy atlas',
        width: 512,
        height: 512,
        filter: 'linear',
        alphaMode: 'blend',
        activeId: 'texlayer-8',
        layers
      }
    ]);
    const decoded = decodeLpoly(bytes);
    const asset = decoded.textures?.[0];
    expect(asset?.alphaMode).toBe('blend');
    expect(asset?.filter).toBe('linear');
    expect(asset?.layers).toHaveLength(8);
    expect(asset?.activeId).toBe('texlayer-8');
    expect(asset?.layers.map((layer) => layer.png)).toEqual(
      layers.map((layer) => layer.png)
    );
    expect(asset?.layers[3].visible).toBe(false);
    expect(asset?.layers[6].blendMode).toBe('multiply');
    expect(asset?.layers[7].role).toBe('lighting');
  });

  it('round-trips render cameras', () => {
    const document = makeDocument();
    const camera = document.cameras[0];
    camera.name = 'Hero';
    camera.position = [3, -5, 6];
    camera.target = [0.5, 0, 1];
    camera.fov = 55;
    const decoded = decodeLpoly(encodeLpoly(document, SETTINGS));
    expect(decoded.document.cameras).toHaveLength(1);
    expect(decoded.document.cameras[0].name).toBe('Hero');
    expect(decoded.document.cameras[0].position).toEqual([3, -5, 6]);
    expect(decoded.document.cameras[0].target).toEqual([0.5, 0, 1]);
    expect(decoded.document.cameras[0].fov).toBe(55);
  });

  it('round-trips animation tracks and keys', () => {
    const document = makeDocument();
    const track = document.animation.ensureTrack(document.nodes[0].id, 'node');
    track.setKey(0, document.nodes[0].transform, 'linear');
    track.setKey(12, {
      position: [3, 0, 1],
      rotation: [0, 0.4, 0],
      scale: [1, 1, 1]
    }, 'step');
    const decoded = decodeLpoly(encodeLpoly(document, SETTINGS));
    const restored = decoded.document.animation.getTrack(document.nodes[0].id);
    expect(restored?.keyframes).toHaveLength(2);
    expect(restored?.keyframes[1].frame).toBe(12);
    expect(restored?.keyframes[1].interpolation).toBe('step');
    expect(restored?.keyframes[1].transform.position).toEqual([3, 0, 1]);
  });

  it('round-trips shape-weight animation tracks', () => {
    const document = makeDocument();
    const node = document.nodes[0];
    const key = node.addShapeKey('Smile');
    const track = document.animation.ensureWeightTrack(node.id, key.id);
    track.setKey(0, 0, 'step');
    track.setKey(24, 1, 'step');
    const decoded = decodeLpoly(encodeLpoly(document, SETTINGS));
    const restored = decoded.document.animation.getWeightTrack(node.id, key.id);
    expect(restored?.keyframes).toHaveLength(2);
    expect(restored?.evaluate(12)).toBe(0);
    expect(restored?.evaluate(24)).toBe(1);
    expect(restored?.keyframes[1].interpolation).toBe('step');
  });

  it('round-trips shape keys and evaluates weights', () => {
    const document = makeDocument();
    const node = document.nodes[0];
    const key = node.addShapeKey('Smile');
    key.weight = 0.75;
    key.targetPositions[0] += 2;
    const decoded = decodeLpoly(encodeLpoly(document, SETTINGS));
    const restored = decoded.document.nodes[0];
    expect(restored.shapeKeys).toHaveLength(1);
    expect(restored.shapeKeys[0].name).toBe('Smile');
    expect(restored.shapeKeys[0].weight).toBe(0.75);
    expect(restored.getEvaluatedMesh().mesh.positions[0]).toBeCloseTo(
      node.mesh.positions[0] + 1.5
    );
  });

  it('round-trips shape-key visibility and list order', () => {
    const document = makeDocument();
    const node = document.nodes[0];
    const first = node.addShapeKey('First');
    const second = node.addShapeKey('Second');
    second.targetPositions[0] += 2;
    second.weight = 1;
    first.visible = false;
    node.reorderShapeKeys(second.id, first.id, false);
    const decoded = decodeLpoly(encodeLpoly(document, SETTINGS)).document.nodes[0];
    expect(decoded.shapeKeys.map((key) => key.name)).toEqual(['Second', 'First']);
    expect(decoded.shapeKeys[1].visible).toBe(false);
    expect(decoded.shapeKeys[0].visible).toBe(true);
    expect(decoded.shapeKeys[1].weight).toBe(0);
  });

  it('excludes hidden shape keys from evaluation', () => {
    const document = makeDocument();
    const node = document.nodes[0];
    const key = node.addShapeKey('Hidden');
    key.targetPositions[0] += 2;
    key.weight = 1;
    key.visible = false;
    expect(node.getEvaluatedMesh().mesh.positions[0]).toBeCloseTo(
      node.mesh.positions[0]
    );
    key.visible = true;
    expect(node.getEvaluatedMesh().mesh.positions[0]).toBeCloseTo(
      node.mesh.positions[0] + 2
    );
  });

  it('round-trips simple node material palettes', () => {
    const document = makeDocument();
    const node = document.nodes[0];
    node.setMaterialPalette(['#cc331a', '#1a33cc']);
    node.mesh.faceMaterial[0] = 1;
    const decoded = decodeLpoly(encodeLpoly(document, SETTINGS));
    expect(decoded.document.nodes[0].materialPalette).toEqual([
      '#cc331a',
      '#1a33cc'
    ]);
    expect(decoded.document.nodes[0].mesh.faceMaterial[0]).toBe(1);
  });

  it('round-trips document lights and ambient settings', () => {
    const document = makeDocument();
    document.ambientColor = '#20242c';
    document.ambientIntensity = 0.4;
    const point = document.createLight('point');
    point.name = 'Warm lamp';
    point.color = '#ff8844';
    point.intensity = 3.2;
    point.position = [2, -1, 3];
    point.castShadows = false;
    point.shadowSoftness = 0.72;
    document.insertLight(point);
    const decoded = decodeLpoly(encodeLpoly(document, SETTINGS));
    expect(decoded.document.ambientColor).toBe('#20242c');
    expect(decoded.document.ambientIntensity).toBe(0.4);
    expect(decoded.document.lights).toHaveLength(2);
    expect(decoded.document.lights[1].name).toBe('Warm lamp');
    expect(decoded.document.lights[1].position).toEqual([2, -1, 3]);
    expect(decoded.document.lights[1].kind).toBe('point');
    expect(decoded.document.lights[1].castShadows).toBe(false);
    expect(decoded.document.lights[1].shadowSoftness).toBeCloseTo(0.72);
  });

  it('round-trips a modifier stack', () => {
    const document = makeDocument();
    const node = document.nodes[0];
    node.setModifiers([
      { id: 'm1', type: 'mirror', enabled: true, axis: 'y' },
      {
        id: 'm2',
        type: 'grid-array',
        enabled: false,
        countX: 3,
        countY: 1,
        spacingX: 2.5,
        spacingY: 1.5
      },
      { id: 'm3', type: 'radial-array', enabled: true, axis: 'z', count: 8 }
    ]);
    const bytes = encodeLpoly(document, SETTINGS);
    const decoded = decodeLpoly(bytes);
    expect(decoded.document.nodes[0].modifiers).toEqual(node.modifiers);
    const second = encodeLpoly(decoded.document, decoded.settings);
    expect(Array.from(second)).toEqual(Array.from(bytes));
  });

  it('round-trips groups and node parentage', () => {
    const document = makeDocument();
    const group = document.createGroup();
    group.setTransform({
      position: [2.5, 0.5, 0],
      rotation: [0, 0, 0.25],
      scale: [1, 1, 1]
    });
    document.insertGroup(group);
    document.nodes[0].parentId = group.id;
    document.nodes[2].parentId = group.id;

    const bytes = encodeLpoly(document, SETTINGS);
    const decoded = decodeLpoly(bytes);
    expect(decoded.document.groups).toHaveLength(1);
    expect(decoded.document.groups[0].name).toBe(group.name);
    expect(decoded.document.groups[0].transform.position).toEqual([
      2.5, 0.5, 0
    ]);
    expect(decoded.document.nodes[0].parentId).toBe(group.id);
    expect(decoded.document.nodes[1].parentId).toBeNull();
    expect(decoded.document.nodes[2].parentId).toBe(group.id);
    expect(snapshotGroup(decoded.document.groups[0])).toEqual(
      snapshotGroup(group)
    );

    const second = encodeLpoly(decoded.document, decoded.settings);
    expect(Array.from(second)).toEqual(Array.from(bytes));
  });


  it('round-trips the Texture + Wire shading setting', () => {
    const document = makeDocument();
    const bytes = encodeLpoly(document, {
      ...SETTINGS,
      shading: 'texture-wire'
    });
    const decoded = decodeLpoly(bytes);
    expect(decoded.settings.shading).toBe('texture-wire');
  });

  it('rejects corrupt checksums and foreign files', () => {
    const bytes = encodeLpoly(makeDocument(), SETTINGS);
    const corrupt = bytes.slice();
    corrupt[corrupt.length - 1] ^= 0xff;
    expect(() => decodeLpoly(corrupt)).toThrow(/checksum|manifest|payload/i);

    const foreign = bytes.slice();
    foreign[0] = 0;
    expect(() => decodeLpoly(foreign)).toThrow(/not a loupoli/i);
  });

  it('preserves a node snapshot across storage boundaries', () => {
    const node = new MeshNode(createGridMesh(2, 3), 'grid', 'Ground Patch');
    node.setPosition([1, 2, 3]);
    node.visible = false;
    const snapshot = snapshotNode(node);
    const restored = restoreNode(snapshot);
    expect(restored.name).toBe('Ground Patch');
    expect(restored.visible).toBe(false);
    expect(restored.transform.position).toEqual([1, 2, 3]);
    expect(restored.mesh.vertexCount).toBe(node.mesh.vertexCount);
    expect(Array.from(restored.mesh.positions)).toEqual(
      Array.from(node.mesh.positions)
    );
    expect(restored.mesh.boundaryEdgeCount).toBe(node.mesh.boundaryEdgeCount);
  });

  it('round-trips two texture assets with node bindings', () => {
    const document = makeDocument();
    document.nodes[0].textureId = 'texasset-1';
    document.nodes[1].textureId = 'texasset-2';
    const pngA = new Uint8Array([1, 2, 3, 4, 5]);
    const pngB = new Uint8Array([6, 7, 8, 9, 10, 11, 12]);
    const makeLayer = (id: string, png: Uint8Array) => ({
      id,
      name: 'Base',
      visible: true,
      opacity: 1,
      color: '#ffffff',
      pattern: 'solid' as const,
      blendMode: 'normal' as const,
      kind: 'fill' as const,
      role: 'color' as const,
      png
    });
    const bytes = encodeLpoly(document, SETTINGS, [
      {
        id: 'texasset-1',
        name: 'A',
        width: 64,
        height: 64,
        filter: 'nearest',
        alphaMode: 'opaque',
        activeId: 'texlayer-a',
        layers: [makeLayer('texlayer-a', pngA)]
      },
      {
        id: 'texasset-2',
        name: 'B',
        width: 128,
        height: 128,
        filter: 'linear',
        alphaMode: 'opaque',
        activeId: 'texlayer-b',
        layers: [makeLayer('texlayer-b', pngB)]
      }
    ]);
    const decoded = decodeLpoly(bytes);
    expect(decoded.textures).toHaveLength(2);
    expect(decoded.textures?.[0].layers[0].png).toEqual(pngA);
    expect(decoded.textures?.[1].layers[0].png).toEqual(pngB);
    expect(decoded.document.nodes[0].textureId).toBe('texasset-1');
    expect(decoded.document.nodes[1].textureId).toBe('texasset-2');
  });

  it('round-trips an empty scene', () => {
    const empty = new SceneDocument();
    const bytes = encodeLpoly(empty, SETTINGS);
    const decoded = decodeLpoly(bytes);
    expect(decoded.document.nodes).toHaveLength(0);
  });

  it('reads a v3 project with a default sun and v4-persisted lights', () => {
    const document = makeDocument();
    const v4 = encodeLpoly(document, SETTINGS);
    const view = new DataView(v4.buffer, v4.byteOffset, v4.byteLength);
    const manifestLength = view.getUint32(12, true);
    const payloadLength = view.getUint32(16, true);
    const manifest = JSON.parse(
      new TextDecoder().decode(v4.subarray(28, 28 + manifestLength))
    ) as Record<string, unknown>;
    delete manifest.lighting;
    manifest.version = 3;
    const nextManifest = new TextEncoder().encode(JSON.stringify(manifest));
    const payloadStart = (28 + manifestLength + 3) & ~3;
    const nextPayloadStart = (28 + nextManifest.byteLength + 3) & ~3;
    const next = new Uint8Array(nextPayloadStart + payloadLength);
    next.set(v4.subarray(0, 8));
    next.set(
      v4.subarray(payloadStart, payloadStart + payloadLength),
      nextPayloadStart
    );
    next.set(nextManifest, 28);
    const nextView = new DataView(next.buffer);
    nextView.setUint16(8, 3, true);
    nextView.setUint32(12, nextManifest.byteLength, true);
    nextView.setUint32(16, payloadLength, true);
    // Recompute the CRC for the v3-shaped file.
    const crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let value = i;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[i] = value >>> 0;
    }
    let crc = 0xffffffff;
    for (let i = 28; i < next.length; i += 1) {
      crc = crcTable[(crc ^ next[i]) & 0xff] ^ (crc >>> 8);
    }
    nextView.setUint32(20, (crc ^ 0xffffffff) >>> 0, true);
    const decoded = decodeLpoly(next);
    expect(decoded.document.lights).toHaveLength(1);
    expect(decoded.document.lights[0].name).toBe('Sun');
    expect(decoded.document.ambientIntensity).toBeCloseTo(0.22);
  });
});
