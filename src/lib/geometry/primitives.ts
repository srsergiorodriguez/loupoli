import {
  HalfEdgeMesh,
  type MeshCornerSpec,
  type MeshFaceSpec,
  type Vec2,
  type Vec3
} from './HalfEdgeMesh';

const QUAD_UVS: readonly Vec2[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1]
];

/** Primitive types exposed by the Phase 2 editor. */
export type PrimitiveKind = 'quadsphere' | 'cylinder' | 'grid';

/** Human-readable labels for the primitive palette. */
export const PRIMITIVE_KINDS: readonly PrimitiveKind[] = [
  'quadsphere',
  'cylinder',
  'grid'
];

/** Human-readable labels for the primitive palette. */
export const PRIMITIVE_LABELS: Readonly<Record<PrimitiveKind, string>> = {
  quadsphere: 'QuadSphere',
  cylinder: 'Cylinder',
  grid: 'Grid'
};

function validatePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}

function validateSegments(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

/**
 * Build a centered quad cube as a closed half-edge mesh.
 *
 * The six faces share the eight corner vertices and all twelve edges. This is
 * the approved Phase 1 topology seed used to exercise shading, picking, and
 * undo against real DCEL data.
 */
export function createCubeMesh(size = 2): HalfEdgeMesh {
  validatePositive(size, 'Cube size');

  const h = size / 2;
  const positions: Vec3[] = [
    [-h, -h, -h],
    [h, -h, -h],
    [h, h, -h],
    [-h, h, -h],
    [-h, -h, h],
    [h, -h, h],
    [h, h, h],
    [-h, h, h]
  ];

  // Counter-clockwise from outside, producing outward Newell normals.
  const faceIndices: readonly (readonly number[])[] = [
    [0, 3, 2, 1], // bottom, -Z
    [4, 5, 6, 7], // top, +Z
    [0, 1, 5, 4], // front, -Y
    [1, 2, 6, 5], // right, +X
    [2, 3, 7, 6], // back, +Y
    [3, 0, 4, 7] // left, -X
  ];

  const faces: MeshFaceSpec[] = faceIndices.map((indices) => ({
    corners: indices.map((vertexIndex, cornerIndex) => ({
      position: positions[vertexIndex],
      uv: QUAD_UVS[cornerIndex]
    })),
    material: 0
  }));

  return HalfEdgeMesh.fromPolygons(faces);
}

/**
 * Build a closed cube-sphere with all-quad topology.
 *
 * Each cube face is subdivided into a grid and normalized onto a sphere. Grid
 * vertices are generated from integer cube coordinates before normalization,
 * so the six patches share exactly the same edge vertices.
 */
export function createQuadSphereMesh(radius = 1.25, subdivisions = 2): HalfEdgeMesh {
  validatePositive(radius, 'QuadSphere radius');
  validateSegments(subdivisions, 'QuadSphere subdivisions');

  const n = subdivisions;
  const faces: MeshFaceSpec[] = [];
  const faceFrames: ReadonlyArray<{
    readonly normal: Vec3;
    readonly u: Vec3;
    readonly v: Vec3;
  }> = [
    { normal: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { normal: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
    { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { normal: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] }
  ];

  const point = (
    frame: (typeof faceFrames)[number],
    u: number,
    v: number
  ): Vec3 => {
    const cube: Vec3 = [
      frame.normal[0] * n + frame.u[0] * u + frame.v[0] * v,
      frame.normal[1] * n + frame.u[1] * u + frame.v[1] * v,
      frame.normal[2] * n + frame.u[2] * u + frame.v[2] * v
    ];
    const length = Math.hypot(cube[0], cube[1], cube[2]);
    return [
      (cube[0] / length) * radius,
      (cube[1] / length) * radius,
      (cube[2] / length) * radius
    ];
  };

  for (const frame of faceFrames) {
    for (let row = 0; row < n; row += 1) {
      for (let column = 0; column < n; column += 1) {
        const u0 = -n + column * 2;
        const v0 = -n + row * 2;
        const u1 = u0 + 2;
        const v1 = v0 + 2;
        const corners: MeshCornerSpec[] = [
          {
            position: point(frame, u0, v0),
            uv: [column / n, row / n]
          },
          {
            position: point(frame, u1, v0),
            uv: [(column + 1) / n, row / n]
          },
          {
            position: point(frame, u1, v1),
            uv: [(column + 1) / n, (row + 1) / n]
          },
          {
            position: point(frame, u0, v1),
            uv: [column / n, (row + 1) / n]
          }
        ];
        faces.push({ corners, material: 0 });
      }
    }
  }

  return HalfEdgeMesh.fromPolygons(faces);
}

/**
 * Build a closed capped cylinder with quad sides and n-gon caps.
 *
 * The side wall is quad-first; the two caps exercise n-gon fan triangulation
 * and arbitrary face sizes in the shared DCEL.
 */
export function createCylinderMesh(
  radius = 1,
  height = 2,
  segments = 12
): HalfEdgeMesh {
  validatePositive(radius, 'Cylinder radius');
  validatePositive(height, 'Cylinder height');
  if (!Number.isInteger(segments) || segments < 3) {
    throw new Error('Cylinder segments must be an integer of at least 3.');
  }

  const halfHeight = height / 2;
  const bottom: Vec3[] = [];
  const top: Vec3[] = [];
  const faces: MeshFaceSpec[] = [];

  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    bottom.push([x, y, -halfHeight]);
    top.push([x, y, halfHeight]);
  }

  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    faces.push({
      corners: [
        { position: bottom[i], uv: [i / segments, 0] },
        { position: bottom[next], uv: [next / segments, 0] },
        { position: top[next], uv: [next / segments, 1] },
        { position: top[i], uv: [i / segments, 1] }
      ],
      material: 0
    });
  }

  const topCap = top.map((position, i): MeshCornerSpec => {
    const angle = (i / segments) * Math.PI * 2;
    return {
      position,
      uv: [0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5]
    };
  });
  faces.push({ corners: topCap, material: 0 });

  const bottomCap: MeshCornerSpec[] = [];
  for (let i = 0; i < segments; i += 1) {
    const index = (segments - i) % segments;
    const position = bottom[index];
    const angle = (index / segments) * Math.PI * 2;
    bottomCap.push({
      position,
      uv: [0.5 + Math.cos(angle) * 0.5, 0.5 - Math.sin(angle) * 0.5]
    });
  }
  faces.push({ corners: bottomCap, material: 0 });

  return HalfEdgeMesh.fromPolygons(faces);
}

/**
 * Build an open XY grid with shared vertices and explicit boundary loops.
 *
 * The grid is the boundary-case primitive: every edge at the perimeter has a
 * real boundary half-edge and no face.
 */
export function createGridMesh(size = 4, subdivisions = 4): HalfEdgeMesh {
  validatePositive(size, 'Grid size');
  validateSegments(subdivisions, 'Grid subdivisions');

  const n = subdivisions;
  const half = size / 2;
  const point = (column: number, row: number): Vec3 => [
    -half + (column / n) * size,
    -half + (row / n) * size,
    0
  ];
  const faces: MeshFaceSpec[] = [];

  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column < n; column += 1) {
      faces.push({
        corners: [
          {
            position: point(column, row),
            uv: [column / n, row / n]
          },
          {
            position: point(column + 1, row),
            uv: [(column + 1) / n, row / n]
          },
          {
            position: point(column + 1, row + 1),
            uv: [(column + 1) / n, (row + 1) / n]
          },
          {
            position: point(column, row + 1),
            uv: [column / n, (row + 1) / n]
          }
        ],
        material: 0
      });
    }
  }

  return HalfEdgeMesh.fromPolygons(faces);
}

/** Create a mesh by primitive kind with the editor's default dimensions. */
export function createPrimitiveMesh(kind: PrimitiveKind): HalfEdgeMesh {
  switch (kind) {
    case 'quadsphere':
      return createQuadSphereMesh();
    case 'cylinder':
      return createCylinderMesh();
    case 'grid':
      return createGridMesh();
  }
}
