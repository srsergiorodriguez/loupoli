import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial
} from 'three';
import type { Theme } from '../../design/theme';

/** Screen-readable world-space annotation lines and sample points. */
export class AnnotationOverlay {
  readonly group = new Group();
  private readonly geometry = new BufferGeometry();
  private readonly lines: LineSegments;
  private readonly points: Points;
  private readonly lineMaterial: LineBasicMaterial;
  private readonly pointMaterial: PointsMaterial;
  private readonly positions = new Float32Array(0);

  constructor(theme: Theme) {
    this.group.name = 'loupoli-annotations';
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3)
    );
    this.geometry.setDrawRange(0, 0);
    this.lineMaterial = new LineBasicMaterial({
      name: 'loupoli-annotation-line',
      color: theme.accent.color,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.pointMaterial = new PointsMaterial({
      name: 'loupoli-annotation-point',
      color: theme.accent.color,
      size: 5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.lines = new LineSegments(this.geometry, this.lineMaterial);
    this.lines.renderOrder = 900;
    this.lines.frustumCulled = false;
    this.points = new Points(this.geometry, this.pointMaterial);
    this.points.renderOrder = 901;
    this.points.frustumCulled = false;
    this.group.add(this.lines, this.points);
    this.group.visible = false;
  }

  /** Replace all stroke segments. Positions are pairs of endpoints. */
  setSegments(positions: Float32Array | null): void {
    if (!positions || positions.length < 6) {
      this.group.visible = false;
      this.geometry.setDrawRange(0, 0);
      return;
    }
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(positions, 3)
    );
    this.geometry.setDrawRange(0, positions.length / 3);
    this.geometry.computeBoundingSphere();
    this.group.visible = true;
  }

  /** Hide annotations for clean renders. */
  setVisible(visible: boolean): void {
    this.group.visible =
      visible && this.geometry.drawRange.count !== 0;
  }

  /** Release all annotation GPU resources. */
  dispose(): void {
    this.group.removeFromParent();
    this.group.clear();
    this.geometry.dispose();
    this.lineMaterial.dispose();
    this.pointMaterial.dispose();
  }
}
