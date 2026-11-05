import { describe, expect, it } from 'vitest';
import { exportObj, importObjNodes, parseMtl, parseObj } from './obj';

const CUBE_OBJ = `
mtllib cube.mtl
o Cube
usemtl Front
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 2 0 0
v 2 1 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
f 1/1 2/2 3/3 4/4
usemtl Side
f 2/1 5/2 6/3 3/4
`;

const CUBE_MTL = `
newmtl Front
Kd 0.8 0.2 0.1
newmtl Side
Kd 0.1 0.2 0.8
`;

describe('OBJ interchange', () => {
  it('parses quads, UVs, materials, and Y-up conversion', () => {
    const objects = parseObj(CUBE_OBJ, CUBE_MTL);
    expect(objects).toHaveLength(1);
    expect(objects[0].faces).toHaveLength(2);
    expect(objects[0].faces[0].corners).toHaveLength(4);
    expect(objects[0].faces[0].material).toBe(0);
    expect(objects[0].faces[1].material).toBe(1);
    expect(objects[0].materialPalette).toEqual(['#cc331a', '#1a33cc']);
    expect(objects[0].faces[0].corners[1].position[0]).toBe(1);
    expect(objects[0].faces[0].corners[1].position[1]).toBeCloseTo(0);
    expect(objects[0].faces[0].corners[1].position[2]).toBeCloseTo(0);
  });

  it('imports editable nodes and exports global OBJ indices', () => {
    const nodes = importObjNodes(CUBE_OBJ, CUBE_MTL);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].mesh.faceCount).toBe(2);
    expect(nodes[0].materialPalette).toEqual(['#cc331a', '#1a33cc']);
    const exported = exportObj(nodes, []);
    const roundTrip = importObjNodes(exported.obj, exported.mtl);
    expect(roundTrip).toHaveLength(1);
    expect(roundTrip[0].mesh.faceCount).toBe(2);
    expect(roundTrip[0].materialPalette).toEqual(['#cc331a', '#1a33cc']);
  });

  it('exports assigned textures as MTL map_Kd files', () => {
    const nodes = importObjNodes(CUBE_OBJ, CUBE_MTL);
    nodes[0].textureId = 'texture-1';
    const texture = {
      name: 'Cube-Texture.png',
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    };
    const exported = exportObj(nodes, [], {
      upAxis: 'y',
      mtlName: 'Cube.mtl',
      includeTextures: true,
      textures: new Map([['texture-1', texture]])
    });
    expect(exported.mtl).toContain('map_Kd Cube-Texture.png');
    expect(exported.textures).toEqual([texture]);
  });

  it('rejects malformed face indices', () => {
    expect(() =>
      parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 99')
    ).toThrow(/out of range/);
  });

  it('parses MTL diffuse colors', () => {
    expect(parseMtl(CUBE_MTL).get('Front')).toBe('#cc331a');
  });
});
