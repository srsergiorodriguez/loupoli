import {
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3
} from 'three';
import type { CameraSummary } from '../scene/SceneCamera';

interface CameraMarker {
  readonly group: Group;
  readonly sprite: Sprite;
  readonly lines: LineSegments;
  readonly arrow: Line;
  readonly arrowHead: Mesh;
  readonly hit: Mesh;
  readonly targetHandle: Mesh;
  readonly texture: CanvasTexture;
  readonly lineGeometry: BufferGeometry;
  readonly arrowGeometry: BufferGeometry;
  readonly arrowHeadGeometry: ConeGeometry;
  readonly hitGeometry: SphereGeometry;
  readonly targetGeometry: SphereGeometry;
  readonly lineMaterial: LineBasicMaterial;
  readonly spriteMaterial: SpriteMaterial;
  readonly arrowMaterial: LineBasicMaterial;
  readonly arrowHeadMaterial: MeshBasicMaterial;
  readonly hitMaterial: MeshBasicMaterial;
  readonly targetMaterial: MeshBasicMaterial;
}

function makeCameraTexture(active: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, 64, 64);
    context.beginPath();
    context.arc(32, 32, 21, 0, Math.PI * 2);
    context.fillStyle = 'rgba(18, 18, 22, 0.92)';
    context.fill();
    context.lineWidth = active ? 4 : 2;
    context.strokeStyle = active ? '#c8f078' : '#d8d4c8';
    context.stroke();
    context.fillStyle = active ? '#c8f078' : '#d8d4c8';
    context.fillRect(21, 25, 18, 14);
    context.beginPath();
    context.moveTo(39, 29);
    context.lineTo(47, 24);
    context.lineTo(47, 40);
    context.lineTo(39, 35);
    context.closePath();
    context.fill();
  }
  return new CanvasTexture(canvas);
}

/** Camera markers with Blender-style frustum wireframes. */
export class CameraGizmos {
  readonly group = new Group();
  private markers = new Map<string, CameraMarker>();

  constructor() {
    this.group.name = 'loupoli-camera-gizmos';
    this.group.visible = false;
  }

  /** Reconcile camera markers with the document. */
  sync(
    cameras: readonly CameraSummary[],
    activeCameraId: string | null,
    visible: boolean,
    aspect = 16 / 9
  ): void {
    this.group.visible = visible;
    const incoming = new Set(cameras.map((camera) => camera.id));
    for (const [id, marker] of this.markers) {
      if (!incoming.has(id)) {
        this.removeMarker(marker);
        this.markers.delete(id);
      }
    }
    if (!visible) {
      return;
    }
    for (const camera of cameras) {
      let marker = this.markers.get(camera.id);
      if (!marker) {
        marker = this.createMarker();
        this.markers.set(camera.id, marker);
        this.group.add(marker.group);
      }
      const active = camera.id === activeCameraId;
      const position = new Vector3(...camera.position);
      const target = new Vector3(...camera.target);
      const direction = target.clone().sub(position);
      const distance = Math.max(0.5, direction.length());
      direction.normalize();
      const upHelper = Math.abs(direction.z) < 0.98 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
      const right = new Vector3().crossVectors(direction, upHelper).normalize();
      const up = new Vector3().crossVectors(right, direction).normalize();
      const halfHeight = Math.tan((camera.fov * Math.PI) / 360) * distance;
      const halfWidth = halfHeight * aspect;
      const center = target;
      const corners = [
        center.clone().addScaledVector(right, -halfWidth).addScaledVector(up, -halfHeight),
        center.clone().addScaledVector(right, halfWidth).addScaledVector(up, -halfHeight),
        center.clone().addScaledVector(right, halfWidth).addScaledVector(up, halfHeight),
        center.clone().addScaledVector(right, -halfWidth).addScaledVector(up, halfHeight)
      ];
      const points: Vector3[] = [];
      for (let i = 0; i < 4; i += 1) {
        points.push(position, corners[i]);
        points.push(corners[i], corners[(i + 1) % 4]);
      }
      marker.lineGeometry.setFromPoints(points);
      marker.lineMaterial.color.set(active ? '#c8f078' : '#8f938e');
      marker.lineMaterial.opacity = active ? 0.95 : 0.45;
      marker.arrowGeometry.setFromPoints([position, target]);
      marker.arrowMaterial.color.set(active ? '#c8f078' : '#8f938e');
      marker.arrowMaterial.opacity = active ? 0.95 : 0.45;
      marker.arrowHead.position
        .copy(position)
        .lerp(target, 0.62);
      marker.arrowHead.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        direction.clone().normalize()
      );
      marker.arrowHeadMaterial.color.set(active ? '#c8f078' : '#8f938e');
      marker.arrowHead.scale.setScalar(active ? 1.15 : 0.8);
      marker.group.position.set(0, 0, 0);
      marker.sprite.position.copy(position);
      marker.sprite.scale.setScalar(active ? 0.62 : 0.46);
      marker.spriteMaterial.color.set(active ? '#ffffff' : '#c8c4b8');
      marker.hit.position.copy(position);
      marker.hit.userData.cameraId = camera.id;
      marker.targetHandle.position.copy(target);
      marker.targetHandle.userData.cameraTargetId = camera.id;
    }
  }

  /** Pick a camera marker body. */
  pick(raycaster: import('three').Raycaster): string | null {
    if (!this.group.visible) {
      return null;
    }
    const hits = raycaster.intersectObjects(
      [...this.markers.values()].map((marker) => marker.hit),
      false
    );
    return (hits[0]?.object.userData.cameraId as string | undefined) ?? null;
  }

  /** Pick a camera target/arrow handle. */
  pickTarget(raycaster: import('three').Raycaster): string | null {
    if (!this.group.visible) {
      return null;
    }
    const hits = raycaster.intersectObjects(
      [...this.markers.values()].map((marker) => marker.targetHandle),
      false
    );
    return (hits[0]?.object.userData.cameraTargetId as string | undefined) ?? null;
  }

  /** Release all marker resources. */
  dispose(): void {
    for (const marker of this.markers.values()) {
      this.removeMarker(marker);
    }
    this.markers.clear();
    this.group.clear();
  }

  private createMarker(): CameraMarker {
    const group = new Group();
    const texture = makeCameraTexture(false);
    const spriteMaterial = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const sprite = new Sprite(spriteMaterial);
    sprite.scale.setScalar(0.46);
    sprite.renderOrder = 20;
    group.add(sprite);
    const lineGeometry = new BufferGeometry();
    const lineMaterial = new LineBasicMaterial({
      color: '#8f938e',
      transparent: true,
      opacity: 0.45,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const lines = new LineSegments(lineGeometry, lineMaterial);
    lines.renderOrder = 19;
    group.add(lines);
    const arrowGeometry = new BufferGeometry();
    const arrowMaterial = new LineBasicMaterial({
      color: '#8f938e',
      transparent: true,
      opacity: 0.45,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const arrow = new Line(arrowGeometry, arrowMaterial);
    arrow.renderOrder = 19;
    group.add(arrow);
    const arrowHeadGeometry = new ConeGeometry(0.28, 0.82, 10);
    const arrowHeadMaterial = new MeshBasicMaterial({
      color: '#8f938e',
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const arrowHead = new Mesh(arrowHeadGeometry, arrowHeadMaterial);
    arrowHead.renderOrder = 20;
    group.add(arrowHead);
    const hitGeometry = new SphereGeometry(0.42, 12, 8);
    const hitMaterial = new MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const hit = new Mesh(hitGeometry, hitMaterial);
    hit.renderOrder = 21;
    group.add(hit);
    const targetGeometry = new SphereGeometry(0.18, 10, 8);
    const targetMaterial = new MeshBasicMaterial({
      color: '#e8e4d8',
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const targetHandle = new Mesh(targetGeometry, targetMaterial);
    targetHandle.renderOrder = 21;
    group.add(targetHandle);
    return {
      group,
      sprite,
      lines,
      arrow,
      arrowHead,
      hit,
      targetHandle,
      texture,
      lineGeometry,
      arrowGeometry,
      arrowHeadGeometry,
      hitGeometry,
      targetGeometry,
      lineMaterial,
      spriteMaterial,
      arrowMaterial,
      arrowHeadMaterial,
      hitMaterial,
      targetMaterial
    };
  }

  private removeMarker(marker: CameraMarker): void {
    marker.group.removeFromParent();
    marker.texture.dispose();
    marker.spriteMaterial.dispose();
    marker.lineGeometry.dispose();
    marker.arrowGeometry.dispose();
    marker.arrowHeadGeometry.dispose();
    marker.hitGeometry.dispose();
    marker.targetGeometry.dispose();
    marker.lineMaterial.dispose();
    marker.arrowMaterial.dispose();
    marker.arrowHeadMaterial.dispose();
    marker.hitMaterial.dispose();
    marker.targetMaterial.dispose();
    marker.group.clear();
  }
}
