import {
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3
} from 'three';
import type { Theme } from '../../design/theme';

const ANNOTATION_RADIUS = 0.022;
const Y_AXIS = new Vector3(0, 1, 0);

/** World-space annotation strokes drawn as reliable thick tube segments. */
export class AnnotationOverlay {
  readonly group = new Group();
  private readonly geometry = new CylinderGeometry(1, 1, 1, 6);
  private readonly jointGeometry = new SphereGeometry(1, 8, 6);
  private readonly material: MeshBasicMaterial;
  private mesh: InstancedMesh;
  private joints: InstancedMesh;
  private capacity = 1;
  private jointCapacity = 1;
  private readonly matrix = new Matrix4();
  private readonly direction = new Vector3();
  private readonly midpoint = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3();

  constructor(theme: Theme) {
    this.group.name = 'loupoli-annotations';
    this.material = new MeshBasicMaterial({
      name: 'loupoli-annotation',
      color: theme.accent.color,
      transparent: false,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.mesh = new InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.name = 'loupoli-annotation-segments';
    this.mesh.renderOrder = 900;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.joints = new InstancedMesh(
      this.jointGeometry,
      this.material,
      this.jointCapacity
    );
    this.joints.name = 'loupoli-annotation-joints';
    this.joints.renderOrder = 901;
    this.joints.frustumCulled = false;
    this.joints.count = 0;
    this.group.add(this.mesh, this.joints);
    this.group.visible = false;
  }

  /** Replace all stroke segments. Positions are pairs of endpoints. */
  setSegments(positions: Float32Array | null): void {
    const count = positions ? Math.floor(positions.length / 6) : 0;
    if (count === 0 || !positions) {
      this.mesh.count = 0;
      this.joints.count = 0;
      this.mesh.visible = false;
      this.joints.visible = false;
      this.group.visible = false;
      return;
    }
    if (count > this.capacity) {
      this.group.remove(this.mesh);
      this.mesh.dispose();
      this.capacity = count;
      this.mesh = new InstancedMesh(
        this.geometry,
        this.material,
        this.capacity
      );
      this.mesh.name = 'loupoli-annotation-segments';
      this.mesh.renderOrder = 900;
      this.mesh.frustumCulled = false;
      this.group.add(this.mesh);
    }
    const jointCount = count * 2;
    if (jointCount > this.jointCapacity) {
      this.group.remove(this.joints);
      this.joints.dispose();
      this.jointCapacity = jointCount;
      this.joints = new InstancedMesh(
        this.jointGeometry,
        this.material,
        this.jointCapacity
      );
      this.joints.name = 'loupoli-annotation-joints';
      this.joints.renderOrder = 901;
      this.joints.frustumCulled = false;
      this.group.add(this.joints);
    }
    for (let index = 0; index < count; index += 1) {
      const offset = index * 6;
      const start = new Vector3(
        positions[offset],
        positions[offset + 1],
        positions[offset + 2]
      );
      const end = new Vector3(
        positions[offset + 3],
        positions[offset + 4],
        positions[offset + 5]
      );
      this.direction.copy(end).sub(start);
      const length = this.direction.length();
      if (length <= 1e-6) {
        this.mesh.setMatrixAt(index, this.matrix.makeScale(0, 0, 0));
        continue;
      }
      this.direction.normalize();
      this.midpoint.copy(start).add(end).multiplyScalar(0.5);
      this.quaternion.setFromUnitVectors(Y_AXIS, this.direction);
      this.scale.set(ANNOTATION_RADIUS, length, ANNOTATION_RADIUS);
      this.mesh.setMatrixAt(
        index,
        this.matrix.compose(this.midpoint, this.quaternion, this.scale)
      );
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    this.mesh.visible = true;
    for (let index = 0; index < jointCount; index += 1) {
      const offset = index * 3;
      this.matrix.makeScale(
        ANNOTATION_RADIUS,
        ANNOTATION_RADIUS,
        ANNOTATION_RADIUS
      );
      this.matrix.setPosition(
        positions[offset],
        positions[offset + 1],
        positions[offset + 2]
      );
      this.joints.setMatrixAt(index, this.matrix);
    }
    this.joints.count = jointCount;
    this.joints.instanceMatrix.needsUpdate = true;
    this.joints.computeBoundingSphere();
    this.joints.visible = true;
    this.group.visible = true;
  }

  /** Hide annotations for clean renders. */
  setVisible(visible: boolean): void {
    this.group.visible = visible && this.mesh.count > 0;
  }

  /** Release all annotation GPU resources. */
  dispose(): void {
    this.group.removeFromParent();
    this.group.clear();
    this.mesh.dispose();
    this.joints.dispose();
    this.geometry.dispose();
    this.jointGeometry.dispose();
    this.material.dispose();
  }
}
