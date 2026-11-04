import {
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  SphereGeometry,
  Color,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  Vector3
} from 'three';
import type { LightSummary } from '../scene/SceneLight';

interface LightMarker {
  readonly group: Group;
  readonly sprite: Sprite;
  readonly hit: Mesh;
  readonly arrow: Group | null;
  readonly shaft: Line | null;
  readonly head: Mesh | null;
  readonly directionHandle: Mesh | null;
  readonly texture: CanvasTexture;
  readonly material: SpriteMaterial;
  readonly arrowMaterial: LineBasicMaterial | null;
  readonly headMaterial: MeshBasicMaterial | null;
  readonly handleMaterial: MeshBasicMaterial | null;
  readonly headGeometry: ConeGeometry | null;
  readonly handleGeometry: BufferGeometry | null;
  readonly hitMaterial: MeshBasicMaterial;
  readonly hitGeometry: BufferGeometry;
}

function makeTexture(light: LightSummary, active: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, 96, 96);
    context.beginPath();
    context.arc(48, 48, 30, 0, Math.PI * 2);
    context.fillStyle = 'rgba(18, 18, 22, 0.92)';
    context.fill();
    context.lineWidth = active ? 5 : 3;
    context.strokeStyle = active ? '#c8f078' : light.color;
    context.stroke();
    context.strokeStyle = light.color;
    context.fillStyle = light.color;
    context.lineWidth = 3;
    if (light.kind === 'directional') {
      context.beginPath();
      context.arc(48, 48, 9, 0, Math.PI * 2);
      context.fill();
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        context.beginPath();
        context.moveTo(
          48 + Math.cos(angle) * 17,
          48 + Math.sin(angle) * 17
        );
        context.lineTo(
          48 + Math.cos(angle) * 25,
          48 + Math.sin(angle) * 25
        );
        context.stroke();
      }
    } else {
      context.beginPath();
      context.arc(48, 45, 11, Math.PI, 0);
      context.lineTo(59, 58);
      context.lineTo(37, 58);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(48, 58);
      context.lineTo(48, 68);
      context.stroke();
    }
  }
  return new CanvasTexture(canvas);
}

export class LightGizmos {
  readonly group = new Group();
  private markers = new Map<string, LightMarker>();
  private visible = false;

  constructor() {
    this.group.name = 'loupoli-light-gizmos';
    this.group.visible = false;
  }

  /** Rebuild markers from document light summaries. */
  sync(
    lights: readonly LightSummary[],
    activeLightId: string | null,
    visible: boolean
  ): void {
    this.visible = visible;
    this.group.visible = visible;
    const incoming = new Set(lights.map((light) => light.id));
    for (const [id, marker] of this.markers) {
      if (!incoming.has(id)) {
        this.removeMarker(marker);
        this.markers.delete(id);
      }
    }
    if (!visible) {
      return;
    }
    for (const light of lights) {
      let marker = this.markers.get(light.id);
      if (!marker) {
        marker = this.createMarker(light, light.id === activeLightId);
        this.markers.set(light.id, marker);
        this.group.add(marker.group);
      }
      const active = light.id === activeLightId;
      marker.group.position.set(
        light.position[0],
        light.position[1],
        light.position[2]
      );
      marker.group.visible = light.enabled;
      marker.sprite.scale.setScalar(active ? 0.75 : 0.52);
      marker.hit.scale.setScalar(active ? 1.35 : 1);
      marker.sprite.material.color.set(active ? '#ffffff' : '#d8d4c8');
      if (marker.arrow && marker.shaft && marker.head && marker.directionHandle) {
        const visible = light.kind === 'directional' && light.enabled;
        marker.arrow.visible = visible;
        if (visible) {
          const direction = new Vector3(...light.direction).normalize();
          const tip = direction.clone().multiplyScalar(1.72);
          marker.shaft.geometry.setFromPoints([
            new Vector3(0, 0, 0),
            direction.clone().multiplyScalar(1.18)
          ]);
          marker.head.position.copy(direction.clone().multiplyScalar(1.3));
          marker.head.quaternion.setFromUnitVectors(
            new Vector3(0, 1, 0),
            direction
          );
          marker.directionHandle.position.copy(tip);
          const arrowColor = active ? '#c8f078' : light.color;
          marker.arrowMaterial?.color.set(arrowColor);
          marker.headMaterial?.color.set(arrowColor);
          marker.handleMaterial?.color.set(arrowColor);
          const arrowScale = active ? 1.1 : 1;
          marker.head.scale.setScalar(arrowScale);
          marker.directionHandle.scale.setScalar(active ? 1.1 : 0.9);
        }
      }
    }
  }

  /** Raycast a light marker and return its stable id. */
  pick(raycaster: import('three').Raycaster): string | null {
    if (!this.visible) {
      return null;
    }
    const hits = raycaster.intersectObjects(
      [...this.markers.values()]
        .filter((marker) => marker.group.visible)
        .map((marker) => marker.hit),
      false
    );
    return (hits[0]?.object.userData.lightId as string | undefined) ?? null;
  }

  /** Pick a directional arrow tip for direction editing. */
  pickDirection(raycaster: import('three').Raycaster): string | null {
    if (!this.visible) {
      return null;
    }
    const handles = [...this.markers.values()]
      .filter((marker) => marker.arrow?.visible)
      .map((marker) => marker.directionHandle)
      .filter((handle): handle is Mesh => handle !== null);
    const hits = raycaster.intersectObjects(handles, false);
    return (hits[0]?.object.userData.lightDirectionId as string | undefined) ?? null;
  }

  /** Release every marker resource. */
  dispose(): void {
    for (const marker of this.markers.values()) {
      this.removeMarker(marker);
    }
    this.markers.clear();
    this.group.clear();
  }

  private createMarker(light: LightSummary, active: boolean): LightMarker {
    const group = new Group();
    group.name = `loupoli-light-${light.id}`;
    const texture = makeTexture(light, active);
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const sprite = new Sprite(material);
    sprite.scale.setScalar(active ? 0.75 : 0.52);
    sprite.renderOrder = 20;
    group.add(sprite);

    const hitGeometry = new SphereGeometry(0.42, 12, 8);
    const hitMaterial = new MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide
    });
    const hit = new Mesh(hitGeometry, hitMaterial);
    hit.userData.lightId = light.id;
    hit.renderOrder = 21;
    group.add(hit);

    let arrow: Group | null = null;
    let shaft: Line | null = null;
    let head: Mesh | null = null;
    let directionHandle: Mesh | null = null;
    let arrowMaterial: LineBasicMaterial | null = null;
    let headMaterial: MeshBasicMaterial | null = null;
    let handleMaterial: MeshBasicMaterial | null = null;
    let headGeometry: ConeGeometry | null = null;
    let handleGeometry: BufferGeometry | null = null;
    if (light.kind === 'directional') {
      arrow = new Group();
      arrow.name = `loupoli-light-arrow-${light.id}`;
      arrowMaterial = new LineBasicMaterial({
        color: new Color(light.color),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: false,
        toneMapped: false
      });
      shaft = new Line(
        new BufferGeometry().setFromPoints([
          new Vector3(0, 0, 0),
          new Vector3(0, 0, 0)
        ]),
        arrowMaterial
      );
      shaft.renderOrder = 19;
      arrow.add(shaft);

      headGeometry = new ConeGeometry(0.17, 0.4, 12);
      headMaterial = new MeshBasicMaterial({
        color: new Color(light.color),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        depthTest: false,
        toneMapped: false
      });
      head = new Mesh(headGeometry, headMaterial);
      head.renderOrder = 19;
      arrow.add(head);

      handleGeometry = new SphereGeometry(0.13, 10, 8);
      handleMaterial = new MeshBasicMaterial({
        color: new Color(light.color),
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: false,
        toneMapped: false
      });
      directionHandle = new Mesh(handleGeometry, handleMaterial);
      directionHandle.userData.lightDirectionId = light.id;
      directionHandle.renderOrder = 22;
      arrow.add(directionHandle);
      group.add(arrow);
    }

    return {
      group,
      sprite,
      hit,
      arrow,
      shaft,
      head,
      directionHandle,
      texture,
      material,
      arrowMaterial,
      headMaterial,
      handleMaterial,
      headGeometry,
      handleGeometry,
      hitMaterial,
      hitGeometry
    };
  }

  private removeMarker(marker: LightMarker): void {
    marker.group.removeFromParent();
    marker.texture.dispose();
    marker.material.dispose();
    marker.shaft?.geometry.dispose();
    marker.headGeometry?.dispose();
    marker.headMaterial?.dispose();
    marker.handleGeometry?.dispose();
    marker.handleMaterial?.dispose();
    marker.arrowMaterial?.dispose();
    marker.hitGeometry.dispose();
    marker.hitMaterial.dispose();
    marker.group.clear();
  }
}
