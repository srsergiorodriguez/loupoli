import {
  BufferGeometry,
  CanvasTexture,
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
  readonly arrow: Line | null;
  readonly texture: CanvasTexture;
  readonly material: SpriteMaterial;
  readonly arrowMaterial: LineBasicMaterial | null;
  readonly arrowGeometry: BufferGeometry | null;
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
      if (marker.arrow) {
        marker.arrow.visible = light.kind === 'directional' && light.enabled;
      }
    }
  }

  /** Raycast a light marker and return its stable id. */
  pick(raycaster: import('three').Raycaster): string | null {
    if (!this.visible) {
      return null;
    }
    const hits = raycaster.intersectObjects(
      [...this.markers.values()].map((marker) => marker.hit),
      false
    );
    return (hits[0]?.object.userData.lightId as string | undefined) ?? null;
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

    let arrow: Line | null = null;
    let arrowMaterial: LineBasicMaterial | null = null;
    let arrowGeometry: BufferGeometry | null = null;
    if (light.kind === 'directional') {
      arrowGeometry = new BufferGeometry().setFromPoints([
        new Vector3(0, 0, 0),
        new Vector3(
          light.direction[0] * 1.5,
          light.direction[1] * 1.5,
          light.direction[2] * 1.5
        )
      ]);
      arrowMaterial = new LineBasicMaterial({
        color: new Color(light.color),
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        depthTest: false,
        toneMapped: false
      });
      arrow = new Line(arrowGeometry, arrowMaterial);
      arrow.renderOrder = 19;
      group.add(arrow);
    }

    return {
      group,
      sprite,
      hit,
      arrow,
      texture,
      material,
      arrowMaterial,
      arrowGeometry,
      hitMaterial,
      hitGeometry
    };
  }

  private removeMarker(marker: LightMarker): void {
    marker.group.removeFromParent();
    marker.texture.dispose();
    marker.material.dispose();
    marker.arrowGeometry?.dispose();
    marker.arrowMaterial?.dispose();
    marker.hitGeometry.dispose();
    marker.hitMaterial.dispose();
    marker.group.clear();
  }
}
