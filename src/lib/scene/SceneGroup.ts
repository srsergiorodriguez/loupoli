import { createNodeId, type NodeTransform } from './MeshNode';

/** A named scene container with an identity-by-default local transform. */
export class SceneGroup {
  readonly id: string;
  name: string;
  visible = true;
  transform: NodeTransform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  };

  constructor(name: string, id = createNodeId()) {
    this.name = name;
    this.id = id;
  }

  /** Commit a complete group transform, copying every vector. */
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

/** Small immutable view of a group for the reactive scene outliner. */
export interface GroupSummary {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
}
