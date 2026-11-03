import { describe, expect, it } from 'vitest';
import { MeshNode } from '../scene/MeshNode';
import { SceneDocument } from '../scene/SceneDocument';
import { createCylinderMesh, createGridMesh } from '../geometry/primitives';
import {
  decodeLpoly,
  encodeLpoly,
  encodeLpolyV2,
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

describe('.lpoly v1', () => {
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


  it('round-trips v2 texture metadata and PNG chunks', () => {
    const document = makeDocument();
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    const bytes = encodeLpolyV2(document, SETTINGS, {
      width: 64,
      height: 64,
      activeId: 'texlayer-1',
      layers: [
        {
          id: 'texlayer-1',
          name: 'Base',
          visible: true,
          opacity: 1,
          color: '#c8c2ad',
          pattern: 'checker',
          blendMode: 'normal',
          png
        }
      ]
    });
    const decoded = decodeLpoly(bytes);
    expect(decoded.textures?.width).toBe(64);
    expect(decoded.textures?.layers).toHaveLength(1);
    expect(decoded.textures?.layers[0].png).toEqual(png);
    expect(decoded.textures?.layers[0].blendMode).toBe('normal');
    expect(decoded.textures?.activeId).toBe('texlayer-1');
    expect(decoded.document.nodes[0].name).toBe('QuadSphere');
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

  it('round-trips an empty scene', () => {
    const empty = new SceneDocument();
    const bytes = encodeLpoly(empty, SETTINGS);
    const decoded = decodeLpoly(bytes);
    expect(decoded.document.nodes).toHaveLength(0);
  });
});
