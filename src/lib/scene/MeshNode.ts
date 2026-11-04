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

/** One editable mesh object in the scene document. */
export class MeshNode {
  readonly id: string;
  mesh: HalfEdgeMesh;
  readonly primitive: PrimitiveKind;
  name: string;
  visible = true;
  parentId: string | null = null;
  textureId: string | null;
  modifiers: Modifier[] = [];
  private modifierRevision = 0;
  private evaluationBase: HalfEdgeMesh | null = null;
  private evaluationBaseRevision = -1;
  private evaluationModifierRevision = -1;
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
    textureId: string | null = null
  ) {
    this.mesh = mesh;
    this.primitive = primitive;
    this.name = name;
    this.id = id;
    this.textureId = textureId;
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
    this.mesh = mesh;
    this.evaluation = null;
  }

  /** Replace the ordered modifier stack with copied definitions. */
  setModifiers(modifiers: readonly Modifier[]): void {
    this.modifiers = cloneModifiers(modifiers);
    this.modifierRevision += 1;
    this.evaluation = null;
  }

  /** Evaluate the current stack, caching by base revision and modifier edits. */
  getEvaluatedMesh(): EvaluatedMesh {
    const modifiersActive = hasEnabledModifier(this.modifiers);
    if (!modifiersActive) {
      return {
        mesh: this.mesh,
        provenance: null,
        error: null,
        modifiersActive: false
      };
    }
    if (
      this.evaluation !== null &&
      this.evaluationBase === this.mesh &&
      this.evaluationBaseRevision === this.mesh.meshRevision &&
      this.evaluationModifierRevision === this.modifierRevision
    ) {
      return this.evaluation;
    }

    let evaluated: EvaluatedMesh;
    try {
      const result = evaluateModifiersWithProvenance(
        this.mesh,
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
        mesh: this.mesh,
        provenance: null,
        error: error instanceof Error ? error.message : String(error),
        modifiersActive: true
      };
    }
    this.evaluationBase = this.mesh;
    this.evaluationBaseRevision = this.mesh.meshRevision;
    this.evaluationModifierRevision = this.modifierRevision;
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
