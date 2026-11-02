import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
  type Raycaster
} from 'three';
import type { Theme } from '../../design/theme';
import type { TransformMode } from '../editor/types';
import {
  GIZMO_AXES,
  GIZMO_AXIS_VECTORS,
  type GizmoAxis
} from './gizmoMath';

/** Transform tools that display handles (select is handled separately). */
export type GizmoMode = Exclude<TransformMode, 'select'>;

/** A picked gizmo handle. */
export interface GizmoHit {
  readonly mode: GizmoMode;
  readonly axis: GizmoAxis;
}

const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);

/**
 * Object-space translate, rotate, and scale handles drawn in screen-constant
 * size. The gizmo never owns document state; it only reports hits and is
 * positioned by the renderer from the active node's world transform.
 */
export class ObjectGizmo {
  readonly group = new Group();

  private readonly modeGroups: Record<GizmoMode, Group> = {
    translate: new Group(),
    rotate: new Group(),
    scale: new Group()
  };
  private readonly materials: Record<GizmoAxis, MeshBasicMaterial>;
  private readonly hitMaterial: MeshBasicMaterial;

  private readonly shaftGeometry = new CylinderGeometry(0.012, 0.012, 0.8, 8);
  private readonly coneGeometry = new ConeGeometry(0.055, 0.16, 10);
  private readonly boxGeometry = new BoxGeometry(0.11, 0.11, 0.11);
  private readonly ringGeometry = new TorusGeometry(0.8, 0.014, 6, 48);
  private readonly hitCylinderGeometry = new CylinderGeometry(0.13, 0.13, 1, 8);
  private readonly hitRingGeometry = new TorusGeometry(0.8, 0.12, 6, 32);

  private mode: TransformMode = 'select';

  constructor(theme: Theme) {
    this.group.name = 'loupoli-transform-gizmo';
    this.materials = {
      x: axisMaterial(theme.axisX.color.getHex()),
      y: axisMaterial(theme.axisY.color.getHex()),
      z: axisMaterial(theme.axisZ.color.getHex())
    };
    this.hitMaterial = new MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      transparent: false
    });

    for (const mode of ['translate', 'rotate', 'scale'] as const) {
      const modeGroup = this.modeGroups[mode];
      modeGroup.name = `loupoli-gizmo-${mode}`;
      modeGroup.visible = false;
      this.group.add(modeGroup);
    }

    this.buildTranslate();
    this.buildRotate();
    this.buildScale();
    this.group.visible = false;
  }

  /** Show the handles for one transform tool. */
  setMode(mode: TransformMode): void {
    this.mode = mode;
    this.group.visible = mode !== 'select';
    for (const key of ['translate', 'rotate', 'scale'] as const) {
      this.modeGroups[key].visible = key === mode;
    }
  }

  /** Position the gizmo at the active object's world frame. */
  update(origin: Vector3, quaternion: Quaternion, size: number): void {
    this.group.position.copy(origin);
    this.group.quaternion.copy(quaternion);
    this.group.scale.setScalar(size);
    this.group.updateMatrixWorld(true);
  }

  /** Pick a visible handle under the current ray. */
  pick(raycaster: Raycaster): GizmoHit | null {
    if (this.mode === 'select') {
      return null;
    }
    this.group.updateMatrixWorld(true);
    const intersections = raycaster.intersectObject(this.group, true);
    for (const intersection of intersections) {
      const data = intersection.object.userData as {
        gizmoMode?: GizmoMode;
        gizmoAxis?: GizmoAxis;
      };
      if (
        data.gizmoMode === this.mode &&
        data.gizmoAxis &&
        GIZMO_AXES.includes(data.gizmoAxis)
      ) {
        return { mode: data.gizmoMode, axis: data.gizmoAxis };
      }
    }
    return null;
  }

  /** Release all gizmo-owned GPU resources. */
  dispose(): void {
    this.group.removeFromParent();
    this.group.clear();
    this.shaftGeometry.dispose();
    this.coneGeometry.dispose();
    this.boxGeometry.dispose();
    this.ringGeometry.dispose();
    this.hitCylinderGeometry.dispose();
    this.hitRingGeometry.dispose();
    this.hitMaterial.dispose();
    for (const material of Object.values(this.materials)) {
      material.dispose();
    }
  }

  private markVisible(mesh: Mesh, mode: GizmoMode, axis: GizmoAxis): void {
    mesh.userData = { gizmoMode: mode, gizmoAxis: axis };
    mesh.renderOrder = 1000;
    mesh.frustumCulled = false;
  }

  private buildTranslate(): void {
    const group = this.modeGroups.translate;
    for (const axis of GIZMO_AXES) {
      const axisGroup = this.axisGroup(axis, GIZMO_AXIS_VECTORS[axis]);
      const material = this.materials[axis];

      const shaft = new Mesh(this.shaftGeometry, material);
      shaft.position.y = 0.4;
      this.markVisible(shaft, 'translate', axis);
      axisGroup.add(shaft);

      const cone = new Mesh(this.coneGeometry, material);
      cone.position.y = 0.88;
      this.markVisible(cone, 'translate', axis);
      axisGroup.add(cone);

      this.addHitCylinder(axisGroup, axis, 'translate');
      group.add(axisGroup);
    }
  }

  private buildScale(): void {
    const group = this.modeGroups.scale;
    for (const axis of GIZMO_AXES) {
      const axisGroup = this.axisGroup(axis, GIZMO_AXIS_VECTORS[axis]);
      const material = this.materials[axis];

      const shaft = new Mesh(this.shaftGeometry, material);
      shaft.position.y = 0.45;
      this.markVisible(shaft, 'scale', axis);
      axisGroup.add(shaft);

      const box = new Mesh(this.boxGeometry, material);
      box.position.y = 0.92;
      this.markVisible(box, 'scale', axis);
      axisGroup.add(box);

      this.addHitCylinder(axisGroup, axis, 'scale');
      group.add(axisGroup);
    }
  }

  private buildRotate(): void {
    const group = this.modeGroups.rotate;
    for (const axis of GIZMO_AXES) {
      const quaternion = new Quaternion().setFromUnitVectors(
        Z_AXIS,
        GIZMO_AXIS_VECTORS[axis]
      );
      const ring = new Mesh(this.ringGeometry, this.materials[axis]);
      ring.quaternion.copy(quaternion);
      this.markVisible(ring, 'rotate', axis);
      group.add(ring);

      const hit = new Mesh(this.hitRingGeometry, this.hitMaterial);
      hit.quaternion.copy(quaternion);
      hit.userData = { gizmoMode: 'rotate', gizmoAxis: axis };
      group.add(hit);
    }
  }

  private axisGroup(axis: GizmoAxis, direction: Vector3): Group {
    const axisGroup = new Group();
    axisGroup.name = `loupoli-gizmo-${axis}`;
    axisGroup.quaternion.setFromUnitVectors(Y_AXIS, direction);
    return axisGroup;
  }

  private addHitCylinder(
    axisGroup: Group,
    axis: GizmoAxis,
    mode: GizmoMode
  ): void {
    const hit = new Mesh(this.hitCylinderGeometry, this.hitMaterial);
    hit.position.y = 0.5;
    hit.userData = { gizmoMode: mode, gizmoAxis: axis };
    axisGroup.add(hit);
  }
}

function axisMaterial(color: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    toneMapped: false
  });
}
