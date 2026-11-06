import {
  BufferAttribute,
  type BufferAttribute as BufferAttributeType,
  BufferGeometry,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  HalfEdgeMesh,
  type MeshCornerSpec,
  type MeshFaceSpec
} from '../geometry/HalfEdgeMesh';
import { MeshNode } from '../scene/MeshNode';
import type { SceneGroup } from '../scene/SceneGroup';
import { transformMatrix, worldTransformForNode } from '../editor/groupTransforms';

/** Three's Y-up conversion for app Z-up coordinates. */
const Y_UP_TO_Z_UP = new Matrix4().makeRotationX(Math.PI / 2);
const Z_UP_TO_Y_UP = new Matrix4().makeRotationX(-Math.PI / 2);

function colorHex(color: { getHexString(): string } | null | undefined): string {
  return `#${color?.getHexString() ?? 'c8c2ad'}`;
}

function normalizeName(value: string, index: number): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : `Imported ${index + 1}`;
}

/**
 * Import a binary glTF into world-baked DCEL nodes.
 *
 * glTF is triangulated by definition. Per-corner UVs survive because each
 * triangle corner keeps its own attribute values. Material base colors become
 * the node's simple material palette.
 */
export async function importGlb(data: ArrayBuffer): Promise<MeshNode[]> {
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(data, '');
  gltf.scene.updateMatrixWorld(true);
  const nodes: MeshNode[] = [];
  gltf.scene.traverse((object) => {
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
    } catch (error) {
      throw new Error(
        `GLB mesh "${object.name}" is not importable as manifold DCEL topology: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });
  if (nodes.length === 0) {
    throw new Error('The GLB contains no triangle meshes.');
  }
  return nodes;
}

/** One embedded PNG texture for a GLB export. */
export interface GlbTextureFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

function makeMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0
  });
}

/** Export visible evaluated nodes as a binary GLB with embedded textures. */
export async function exportGlb(
  nodes: readonly MeshNode[],
  groups: readonly SceneGroup[],
  textures: ReadonlyMap<string, GlbTextureFile> = new Map()
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
  let objectIndex = 0;
  for (const node of nodes) {
    if (!node.visible) {
      continue;
    }
    const evaluated = node.getEvaluatedMesh();
    if (evaluated.error) {
      throw new Error(`${node.name}: ${evaluated.error}`);
    }
    const mesh = evaluated.mesh;
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
    root.name = node.name;
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
        data[vertex * 3] = key.targetPositions[base * 3] - mesh.positions[base * 3];
        data[vertex * 3 + 1] =
          key.targetPositions[base * 3 + 1] - mesh.positions[base * 3 + 1];
        data[vertex * 3 + 2] =
          key.targetPositions[base * 3 + 2] - mesh.positions[base * 3 + 2];
      }
      return data;
    });
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
      if (fullMorphTargets.length > 0) {
        const morphAttributes: BufferAttribute[] = [];
        let source = 0;
        for (const morph of fullMorphTargets) {
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
      const material = makeMaterial(palette[materialIndex] ?? palette[0]);
      material.name = `${node.name}_mat${materialIndex}`;
      material.map = node.textureId
        ? textureCache.get(node.textureId) ?? null
        : null;
      const meshObject = new Mesh(geometry, material);
      meshObject.name = `${node.name}_${objectIndex}`;
      if (morphKeys.length > 0) {
        meshObject.morphTargetInfluences = morphKeys.map((key) => key.weight);
        meshObject.morphTargetDictionary = Object.fromEntries(
          morphKeys.map((key, index) => [key.name, index])
        );
      }
      objectIndex += 1;
      root.add(meshObject);
    }
    scene.add(root);
  }
  if (scene.children.length === 0) {
    throw new Error('There are no visible objects to export.');
  }
  try {
    const exporter = new GLTFExporter();
    const buffer = await exporter.parseAsync(scene, { binary: true, trs: true });
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
