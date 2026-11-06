import { Vector3 } from 'three';
import {
  HalfEdgeMesh,
  type MeshCornerSpec,
  type MeshFaceSpec,
  type Vec3
} from '../geometry/HalfEdgeMesh';
import { MeshNode } from '../scene/MeshNode';
import type { SceneGroup } from '../scene/SceneGroup';
import { transformMatrix, worldTransformForNode } from '../editor/groupTransforms';

/** Source up-axis handling for OBJ interchange. */
export type ObjUpAxis = 'y' | 'z';

/** Options for an OBJ import. */
export interface ObjImportOptions {
  readonly upAxis: ObjUpAxis;
  readonly scale: number;
}

/** One OBJ object ready to become a scene node. */
export interface ObjImportedObject {
  readonly name: string;
  readonly faces: readonly MeshFaceSpec[];
  readonly materialPalette: readonly string[];
}

/** Which document objects an OBJ export includes. */
export type ObjExportScope = 'active' | 'scene';

/** One binary texture file to place beside the MTL. */
export interface ObjTextureFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** Options for an OBJ export. */
export interface ObjExportOptions {
  readonly upAxis: ObjUpAxis;
  readonly mtlName: string;
  readonly includeTextures?: boolean;
  readonly textures?: ReadonlyMap<string, ObjTextureFile>;
}

/** Generated OBJ/MTL text and any referenced texture files. */
export interface ObjExportResult {
  readonly obj: string;
  readonly mtl: string;
  readonly textures: readonly ObjTextureFile[];
}

/** Parse a Wavefront MTL file into simple diffuse colors. */
export function parseMtl(text: string): Map<string, string> {
  const materials = new Map<string, string>();
  let current = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts[0] === 'newmtl') {
      current = parts.slice(1).join(' ') || 'material';
      materials.set(current, '#c8c2ad');
    } else if (parts[0] === 'Kd' && current) {
      const r = Math.max(0, Math.min(255, Math.round(Number(parts[1]) * 255)));
      const g = Math.max(0, Math.min(255, Math.round(Number(parts[2]) * 255)));
      const b = Math.max(0, Math.min(255, Math.round(Number(parts[3]) * 255)));
      if ([r, g, b].every(Number.isFinite)) {
        materials.set(
          current,
          `#${r.toString(16).padStart(2, '0')}${g
            .toString(16)
            .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
        );
      }
    }
  }
  return materials;
}

function parseIndex(token: string, count: number, label: string): number {
  const value = Number(token);
  if (!Number.isInteger(value) || value === 0) {
    throw new Error(`Invalid OBJ ${label} index "${token}".`);
  }
  const index = value > 0 ? value - 1 : count + value;
  if (index < 0 || index >= count) {
    throw new Error(`OBJ ${label} index ${value} is out of range.`);
  }
  return index;
}

/** Parse OBJ geometry, preserving polygon faces and per-corner UVs. */
export function parseObj(
  objectText: string,
  materialText = '',
  options: ObjImportOptions = { upAxis: 'y', scale: 1 }
): ObjImportedObject[] {
  const positions: Vec3[] = [];
  const uvs: [number, number][] = [];
  const mtl = parseMtl(materialText);
  const materialNames: string[] = [];
  const materialIndex = new Map<string, number>();
  const objects = new Map<string, MeshFaceSpec[]>();
  let currentName = 'Imported';
  let currentMaterial = 'default';
  const ensureObject = (): MeshFaceSpec[] => {
    let faces = objects.get(currentName);
    if (!faces) {
      faces = [];
      objects.set(currentName, faces);
    }
    return faces;
  };
  const ensureMaterial = (name: string): number => {
    let index = materialIndex.get(name);
    if (index === undefined) {
      index = materialNames.length;
      materialNames.push(name);
      materialIndex.set(name, index);
    }
    return index;
  };
  const axis = options.upAxis;
  const scale = Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1;
  const toApp = (x: number, y: number, z: number): Vec3 =>
    axis === 'y'
      ? [x * scale, -z * scale, y * scale]
      : [x * scale, y * scale, z * scale];

  for (const rawLine of objectText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const parts = line.split(/\s+/);
    const head = parts[0];
    if (head === 'v') {
      if (parts.length < 4) {
        throw new Error('An OBJ vertex is missing coordinates.');
      }
      positions.push(
        toApp(Number(parts[1]), Number(parts[2]), Number(parts[3]))
      );
    } else if (head === 'vt') {
      uvs.push([Number(parts[1]), Number(parts[2] ?? 0)]);
    } else if (head === 'o' || head === 'g') {
      const name = parts.slice(1).join(' ').trim() || 'Imported';
      currentName = name;
      ensureObject();
    } else if (head === 'usemtl') {
      currentMaterial = parts.slice(1).join(' ') || 'default';
    } else if (head === 'f') {
      if (parts.length < 4) {
        throw new Error('An OBJ face has fewer than three vertices.');
      }
      const material = ensureMaterial(currentMaterial);
      const corners: MeshCornerSpec[] = parts.slice(1).map((token) => {
        const [vToken, vtToken] = token.split('/');
        const position = positions[parseIndex(vToken, positions.length, 'vertex')];
        const uv =
          vtToken !== undefined && vtToken !== ''
            ? uvs[parseIndex(vtToken, uvs.length, 'UV')]
            : ([0, 0] as const);
        return { position, uv: [uv[0], uv[1]] as const };
      });
      ensureObject().push({ corners, material });
    }
  }

  const palette = materialNames.map(
    (name, index) =>
      mtl.get(name) ??
      ['#c8c2ad', '#a8a8a8', '#d0b090', '#88a0b0'][index % 4]
  );
  return [...objects.entries()]
    .filter(([, faces]) => faces.length > 0)
    .map(([name, faces]) => ({
      name,
      faces,
      materialPalette: palette
    }));
}

/** Parse OBJ/MTL text and build editable mesh nodes. */
export function importObjNodes(
  objectText: string,
  materialText = '',
  options: ObjImportOptions = { upAxis: 'y', scale: 1 }
): MeshNode[] {
  const imported = parseObj(objectText, materialText, options);
  if (imported.length === 0) {
    throw new Error('The OBJ contains no polygonal faces.');
  }
  return imported.map((object) => {
    const mesh = HalfEdgeMesh.fromPolygons(object.faces);
    const node = new MeshNode(mesh, 'imported', object.name);
    node.setMaterialPalette(object.materialPalette);
    return node;
  });
}

function toObjPosition(value: Vec3, axis: ObjUpAxis): Vec3 {
  return axis === 'y' ? [value[0], value[2], -value[1]] : value;
}

function materialColor(palette: readonly string[], index: number): string {
  return palette[index] ?? palette[0] ?? '#c8c2ad';
}

/** Export visible objects as OBJ/MTL text with simple material colors. */
export function exportObj(
  nodes: readonly MeshNode[],
  groups: readonly SceneGroup[],
  options: ObjExportOptions = { upAxis: 'y', mtlName: 'materials.mtl' }
): ObjExportResult {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const obj: string[] = [
    '# loupoli OBJ export',
    `mtllib ${options.mtlName}`
  ];
  const mtl: string[] = ['# loupoli MTL export'];
  const usedNames = new Set<string>();
  const exportedTextures = new Map<string, ObjTextureFile>();
  let vertexBase = 0;
  let uvBase = 0;
  for (const node of nodes) {
    if (!node.visible) {
      continue;
    }
    const evaluated = node.getEvaluatedMesh();
    if (evaluated.error) {
      throw new Error(`${node.name}: ${evaluated.error}`);
    }
    const mesh = evaluated.mesh;
    if (mesh.faceCount === 0) {
      continue;
    }
    const parent = node.parentId ? groupById.get(node.parentId) : null;
    const matrix = transformMatrix(
      worldTransformForNode(node.transform, parent?.transform ?? null)
    );
    const nameBase = node.name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'Object';
    let objectName = nameBase;
    let suffix = 2;
    while (usedNames.has(objectName)) {
      objectName = `${nameBase}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(objectName);
    const palette = node.materialPalette.length
      ? node.materialPalette
      : ['#c8c2ad'];
    const materialNames = palette.map((_color, index) => `${objectName}_mat${index}`);
    const texture =
      options.includeTextures && node.textureId
        ? options.textures?.get(node.textureId) ?? null
        : null;
    if (texture) {
      exportedTextures.set(texture.name, texture);
    }
    obj.push(`o ${objectName}`);
    const positions = mesh.positions;
    for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
      const point = new Vector3(
        positions[vertex * 3],
        positions[vertex * 3 + 1],
        positions[vertex * 3 + 2]
      ).applyMatrix4(matrix);
      const out = toObjPosition([point.x, point.y, point.z], options.upAxis);
      obj.push(`v ${out[0]} ${out[1]} ${out[2]}`);
    }
    let uvIndex = uvBase;
    let activeMaterial = -1;
    for (let face = 0; face < mesh.faceCount; face += 1) {
      const material = mesh.faceMaterial[face];
      if (material !== activeMaterial) {
        activeMaterial = material;
        obj.push(`usemtl ${materialNames[material] ?? materialNames[0]}`);
      }
      const first = mesh.faceHalfEdge[face];
      const tokens: string[] = [];
      let halfEdge = first;
      do {
        const vertex = mesh.heOrigin[halfEdge];
        uvIndex += 1;
        obj.push(
          `vt ${mesh.heUv[halfEdge * 2]} ${mesh.heUv[halfEdge * 2 + 1]}`
        );
        tokens.push(`${vertexBase + vertex + 1}/${uvIndex}`);
        halfEdge = mesh.heNext[halfEdge];
      } while (halfEdge !== first);
      obj.push(`f ${tokens.join(' ')}`);
    }
    vertexBase += mesh.vertexCount;
    uvBase = uvIndex;
    materialNames.forEach((materialName, index) => {
      const hex = materialColor(palette, index).slice(1);
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      // A textured MTL must not tint the baked image; use white diffuse.
      const kd = texture ? '1 1 1' : `${r} ${g} ${b}`;
      mtl.push(
        `newmtl ${materialName}`,
        `Ka 0 0 0`,
        `Kd ${kd}`,
        `Ks 0 0 0`,
        `Ns 0`,
        'd 1',
        'illum 1'
      );
      if (texture) {
        mtl.push(`map_Kd ${texture.name}`);
      }
    });
  }
  return {
    obj: obj.join('\n') + '\n',
    mtl: mtl.join('\n') + '\n',
    textures: [...exportedTextures.values()]
  };
}
