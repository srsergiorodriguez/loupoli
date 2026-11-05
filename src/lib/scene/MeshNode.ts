import type { HalfEdgeMesh, Vec3 } from '../geometry/HalfEdgeMesh';
import type { PrimitiveKind } from '../geometry/primitives';
import {
  cloneModifiers,
  evaluateModifiersWithProvenance,
  hasEnabledModifier,
  type Modifier,
  type ModifierProvenance
} from '../geometry/modifiers';

/** The three element selection modes exposed by the viewport. */
export type SelectionMode = 'vertex' | 'edge' | 'face';

/** Local transform stored with a mesh node. Rotations are XYZ Euler radians. */
export interface NodeTransform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

/** Evaluated render mesh plus an optional modifier failure. */
export interface EvaluatedMesh {
  readonly mesh: HalfEdgeMesh;
  readonly provenance: ModifierProvenance | null;
  readonly error: string | null;
  readonly modifiersActive: boolean;
}

/** One morph target with absolute vertex positions and a 0–1 weight. */
export interface ShapeKey {
  id: string;
  name: string;
  weight: number;
  readonly targetPositions: Float32Array;
}

let nextShapeKeyNumber = 1;

function createShapeKeyId(): string {
  const id = `shape-${nextShapeKeyNumber}`;
  nextShapeKeyNumber += 1;
  return id;
}

/** One editable mesh object in the scene document. */
export class MeshNode {
  readonly id: string;
  mesh: HalfEdgeMesh;
  readonly primitive: PrimitiveKind;
  name: string;
  visible = true;
  parentId: string | null = null;
  textureId: string | null;
  materialPalette: string[] = [];
  modifiers: Modifier[] = [];
  shapeKeys: ShapeKey[] = [];
  shapeBasePositions: Float32Array | null = null;
  private shapeWeightOverrides: ReadonlyMap<string, number> | null = null;
  private modifierRevision = 0;
  private shapeKeyRevision = 0;
  private evaluationBase: HalfEdgeMesh | null = null;
  private evaluationBaseRevision = -1;
  private evaluationModifierRevision = -1;
  private evaluationShapeRevision = -1;
  private evaluation: EvaluatedMesh | null = null;
  transform: NodeTransform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };

  constructor(
    mesh: HalfEdgeMesh,
    primitive: PrimitiveKind,
    name: string,
    id = createNodeId(),
    textureId: string | null = null,
    materialPalette: readonly string[] = []
  ) {
    this.mesh = mesh;
    this.primitive = primitive;
    this.name = name;
    this.id = id;
    this.textureId = textureId;
    this.setMaterialPalette(materialPalette);
  }

  /** Replace the simple per-face color palette. */
  setMaterialPalette(colors: readonly string[]): void {
    if (colors.length > 64) {
      throw new Error('A node supports at most 64 material colors.');
    }
    for (const color of colors) {
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
        throw new Error('Material colors must be six-digit hex values.');
      }
    }
    this.materialPalette = colors.map((color) => color.toLowerCase());
  }

  /** Replace the document-space transform in one operation. */
  setPosition(position: Vec3): void {
    this.transform.position = [position[0], position[1], position[2]];
  }

  /** Attach or detach this node from a scene group. */
  setParentId(parentId: string | null): void {
    this.parentId = parentId;
  }

  /** Replace this node's mesh after a destructive topology command. */
  setMesh(mesh: HalfEdgeMesh): void {
    if (this.shapeKeys.length > 0) {
      throw new Error('Remove shape keys before changing topology.');
    }
    this.mesh = mesh;
    this.evaluation = null;
  }

  /** Replace the ordered modifier stack with copied definitions. */
  setModifiers(modifiers: readonly Modifier[]): void {
    this.modifiers = cloneModifiers(modifiers);
    this.modifierRevision += 1;
    this.evaluation = null;
  }

  /** Add an identity shape key captured from the current base mesh. */
  addShapeKey(name = `Shape ${this.shapeKeys.length + 1}`): ShapeKey {
    if (this.shapeKeys.length >= 16) {
      throw new Error('A node supports at most 16 shape keys.');
    }
    if (this.shapeBasePositions === null) {
      this.shapeBasePositions = this.mesh.positions.slice();
    }
    const key: ShapeKey = {
      id: createShapeKeyId(),
      name,
      weight: 0,
      targetPositions: this.mesh.positions.slice()
    };
    this.shapeKeys.push(key);
    this.invalidateShapeKeys();
    return key;
  }

  /** Replace the full shape-key collection. */
  setShapeKeys(keys: readonly ShapeKey[]): void {
    this.shapeKeys = keys.map((key) => ({
      id: key.id,
      name: key.name,
      weight: Math.max(0, Math.min(1, key.weight)),
      targetPositions: key.targetPositions.slice()
    }));
    if (this.shapeKeys.length === 0) {
      this.shapeBasePositions = null;
    } else if (this.shapeBasePositions === null) {
      this.shapeBasePositions = this.mesh.positions.slice();
    }
    this.invalidateShapeKeys();
  }

  /** Remove one shape key. */
  removeShapeKey(id: string): void {
    const index = this.shapeKeys.findIndex((key) => key.id === id);
    if (index >= 0) {
      this.shapeKeys.splice(index, 1);
      this.invalidateShapeKeys();
    }
  }

  /** Set one shape key weight. */
  setShapeKeyWeight(id: string, weight: number): void {
    const key = this.shapeKeys.find((item) => item.id === id);
    if (!key) {
      return;
    }
    key.weight = Math.max(0, Math.min(1, weight));
    this.invalidateShapeKeys();
  }

  /** Rename one shape key. */
  renameShapeKey(id: string, name: string): void {
    const key = this.shapeKeys.find((item) => item.id === id);
    if (!key) {
      return;
    }
    key.name = name.trim().slice(0, 64) || key.name;
    this.invalidateShapeKeys();
  }

  /** Capture the current base positions into one shape key. */
  updateShapeKeyFromMesh(id: string): void {
    const index = this.shapeKeys.findIndex((key) => key.id === id);
    if (index < 0) {
      return;
    }
    this.shapeKeys[index] = {
      ...this.shapeKeys[index],
      targetPositions: this.mesh.positions.slice()
    };
    this.invalidateShapeKeys();
  }

  /** Capture the current base mesh into a key and restore the original base. */
  captureShapeKeyFromMesh(id: string): void {
    const index = this.shapeKeys.findIndex((item) => item.id === id);
    if (index < 0) {
      return;
    }
    if (this.shapeBasePositions === null) {
      this.shapeBasePositions = this.mesh.positions.slice();
    }
    const captured = this.mesh.positions.slice();
    this.mesh = this.mesh.withPositions(this.shapeBasePositions);
    this.shapeKeys[index] = {
      ...this.shapeKeys[index],
      targetPositions: captured,
      weight: 0
    };
    this.invalidateShapeKeys();
  }

  /** Restore a base mesh while shape keys remain active (internal capture path). */
  replaceBaseMesh(mesh: HalfEdgeMesh): void {
    this.mesh = mesh;
    this.evaluation = null;
  }

  /** Apply session-only animated weight overrides without changing key values. */
  setShapeWeightOverrides(overrides: ReadonlyMap<string, number> | null): void {
    this.shapeWeightOverrides = overrides;
    this.invalidateShapeKeys();
  }

  /** Effective weight for one shape key (animated override wins). */
  shapeKeyWeight(key: ShapeKey): number {
    return this.shapeWeightOverrides?.get(key.id) ?? key.weight;
  }

  /** Whether any shape key currently contributes to the evaluated mesh. */
  get shapeKeysActive(): boolean {
    return this.shapeKeys.some((key) => this.shapeKeyWeight(key) > 0);
  }

  private invalidateShapeKeys(): void {
    this.shapeKeyRevision += 1;
    this.evaluation = null;
  }

  private shapeKeyMesh(): HalfEdgeMesh {
    if (!this.shapeKeysActive) {
      return this.mesh;
    }
    const positions = this.mesh.positions.slice();
    for (const key of this.shapeKeys) {
      const weight = this.shapeKeyWeight(key);
      if (weight <= 0) {
        continue;
      }
      if (key.targetPositions.length !== positions.length) {
        continue;
      }
      for (let i = 0; i < positions.length; i += 1) {
        positions[i] += (key.targetPositions[i] - this.mesh.positions[i]) * weight;
      }
    }
    return this.mesh.withPositions(positions);
  }

  /** Evaluate the current stack, caching by base revision and modifier edits. */
  getEvaluatedMesh(): EvaluatedMesh {
    const modifiersActive = hasEnabledModifier(this.modifiers);
    const shapeActive = this.shapeKeysActive;
    const shapeMesh = shapeActive ? this.shapeKeyMesh() : this.mesh;
    if (!modifiersActive) {
      return {
        mesh: shapeMesh,
        provenance: null,
        error: null,
        modifiersActive: false
      };
    }
    if (
      this.evaluation !== null &&
      this.evaluationBase === this.mesh &&
      this.evaluationBaseRevision === this.mesh.meshRevision &&
      this.evaluationModifierRevision === this.modifierRevision &&
      this.evaluationShapeRevision === this.shapeKeyRevision
    ) {
      return this.evaluation;
    }

    let evaluated: EvaluatedMesh;
    try {
      const result = evaluateModifiersWithProvenance(
        shapeMesh,
        this.modifiers
      );
      evaluated = {
        mesh: result.mesh,
        provenance: result.provenance,
        error: null,
        modifiersActive: true
      };
    } catch (error) {
      evaluated = {
        mesh: shapeMesh,
        provenance: null,
        error: error instanceof Error ? error.message : String(error),
        modifiersActive: true
      };
    }
    this.evaluationBase = this.mesh;
    this.evaluationBaseRevision = this.mesh.meshRevision;
    this.evaluationModifierRevision = this.modifierRevision;
    this.evaluationShapeRevision = this.shapeKeyRevision;
    this.evaluation = evaluated;
    return evaluated;
  }

  /** Commit a complete node transform, copying every vector. */
  setTransform(transform: NodeTransform): void {
    this.transform = {
      position: [
        transform.position[0],
        transform.position[1],
        transform.position[2]
      ],
      rotation: [
        transform.rotation[0],
        transform.rotation[1],
        transform.rotation[2]
      ],
      scale: [transform.scale[0], transform.scale[1], transform.scale[2]]
    };
  }
}

let idCounter = 0;

/** Generate a stable node id without adding a runtime dependency. */
export function createNodeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `node-${idCounter}`;
}

/** Small immutable view of a node for the reactive UI snapshot. */
export interface NodeSummary {
  readonly id: string;
  readonly name: string;
  readonly primitive: PrimitiveKind;
  readonly visible: boolean;
  readonly parentId: string | null;
  readonly textureId: string | null;
}
