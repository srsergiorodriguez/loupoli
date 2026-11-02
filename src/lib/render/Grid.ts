import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments
} from 'three';
import type { Theme } from '../../design/theme';

const GRID_EXTENT = 12;
const GRID_STEP = 1;
const MAJOR_EVERY = 5;

/**
 * XY grid drawn on the Z-up floor plane.
 *
 * Three's GridHelper is XZ-oriented, so the grid is built explicitly. Minor,
 * major, and axis lines are separate draw calls for cheap alpha/color control.
 */
export class ViewportGrid {
  readonly group = new Group();

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: LineBasicMaterial[] = [];

  constructor(theme: Theme) {
    this.group.name = 'viewport-grid';
    this.group.renderOrder = -10;

    const minor: number[] = [];
    const major: number[] = [];

    for (let value = -GRID_EXTENT; value <= GRID_EXTENT; value += GRID_STEP) {
      if (value === 0) {
        continue;
      }
      const target = value % MAJOR_EVERY === 0 ? major : minor;
      target.push(
        value,
        -GRID_EXTENT,
        0,
        value,
        GRID_EXTENT,
        0,
        -GRID_EXTENT,
        value,
        0,
        GRID_EXTENT,
        value,
        0
      );
    }

    this.addLines(
      minor,
      theme.gridMinor.color,
      theme.gridMinor.alpha,
      -9
    );
    this.addLines(
      major,
      theme.gridMajor.color,
      theme.gridMajor.alpha,
      -8
    );

    // The X/Y axes extend beyond the grid so they remain readable at the edge.
    const axisExtent = GRID_EXTENT + 1;
    const axisPositions = new Float32Array([
      -axisExtent, 0, 0, axisExtent, 0, 0,
      0, -axisExtent, 0, 0, axisExtent, 0,
      0, 0, 0, 0, 0, 2.5
    ]);
    const axisColors: number[] = [
      theme.axisX.color.r, theme.axisX.color.g, theme.axisX.color.b,
      theme.axisX.color.r, theme.axisX.color.g, theme.axisX.color.b,
      theme.axisY.color.r, theme.axisY.color.g, theme.axisY.color.b,
      theme.axisY.color.r, theme.axisY.color.g, theme.axisY.color.b,
      theme.axisZ.color.r, theme.axisZ.color.g, theme.axisZ.color.b,
      theme.axisZ.color.r, theme.axisZ.color.g, theme.axisZ.color.b
    ];

    const axisGeometry = new BufferGeometry();
    axisGeometry.setAttribute('position', new BufferAttribute(axisPositions, 3));
    axisGeometry.setAttribute('color', new Float32BufferAttribute(axisColors, 3));
    const axisMaterial = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      toneMapped: false
    });
    const axisLines = new LineSegments(axisGeometry, axisMaterial);
    axisLines.name = 'grid-axes';
    axisLines.renderOrder = -7;
    axisLines.frustumCulled = false;

    this.group.add(axisLines);
    this.geometries.push(axisGeometry);
    this.materials.push(axisMaterial);
  }

  /** Remove all line geometry and materials from the GPU. */
  dispose(): void {
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
    this.group.clear();
    this.geometries.length = 0;
    this.materials.length = 0;
  }

  private addLines(
    positions: number[],
    color: Color,
    alpha: number,
    renderOrder: number
  ): void {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: alpha,
      depthWrite: false,
      toneMapped: false
    });
    const lines = new LineSegments(geometry, material);
    lines.name = renderOrder === -9 ? 'grid-minor' : 'grid-major';
    lines.renderOrder = renderOrder;
    lines.frustumCulled = false;
    this.group.add(lines);
    this.geometries.push(geometry);
    this.materials.push(material);
  }
}
