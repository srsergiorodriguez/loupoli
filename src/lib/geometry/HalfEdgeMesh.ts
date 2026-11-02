/** A position or scale vector in world/local space. */
export type Vec3 = [number, number, number];

/** A two-component texture coordinate. */
export type Vec2 = [number, number];

/**
 * Rendering resolution for a non-planar quad.
 *
 * Quads are the editable primitive, but a bent quad cannot be represented by a
 * single plane. A 4 × 4 bilinear render patch avoids the long texture crease
 * that two independent triangle panels otherwise produce, while keeping the
 * render cost bounded to 32 triangles for a bent quad.
 */
const NON_PLANAR_QUAD_SEGMENTS = 4;

/**
 * Relative tetrahedral-volume tolerance for deciding whether a quad is planar.
 * Planar quads keep the cheap two-triangle path.
 */
const PLANARITY_EPSILON = 1e-4;

/** One corner of a polygon: a topological position and its per-corner UV. */
export interface MeshCornerSpec {
  readonly position: Vec3;
  readonly uv: Vec2;
}

/**
 * A polygon supplied to the mesh builder.
 *
 * Corners must be ordered counter-clockwise when viewed from the outside.
 * Boundary edges are generated automatically, so open surfaces are valid as
 * long as their boundary loops are manifold and do not cross at a vertex.
 */
export interface MeshFaceSpec {
  readonly corners: readonly MeshCornerSpec[];
  readonly material?: number;
}

/** Explicit DCEL columns used by imports and the persistence codec. */
export interface HalfEdgeColumns {
  readonly positions: Float32Array;
  readonly vertexOut: Int32Array;
  readonly heOrigin: Uint32Array;
  readonly heTwin: Uint32Array;
  readonly heNext: Uint32Array;
  readonly heFace: Int32Array;
  readonly heEdge: Uint32Array;
  readonly heUv: Float32Array;
  readonly edgeHalfEdge: Uint32Array;
  readonly edgeFlags: Uint8Array;
  readonly faceHalfEdge: Uint32Array;
  readonly faceMaterial: Int32Array;
  readonly vertexCount: number;
  readonly halfEdgeCount: number;
  readonly edgeCount: number;
  readonly faceCount: number;
}

/**
 * A compact, columnar half-edge mesh.
 *
 * Positions and topology live in typed arrays. The editable source of truth is
 * this DCEL, never the derived triangle buffers used by Three.js. This initial
 * implementation accepts closed manifold polygon soups and supports local
 * vertex moves. It is intentionally the seed for the Phase 2 topology kernel:
 * invariants, fan triangulation, and buffer writers are shared.
 */
export class HalfEdgeMesh {
  /** Interleaved xyz positions, one vertex per three floats. */
  readonly positions: Float32Array;
  /** One outgoing half-edge per vertex. */
  readonly vertexOut: Int32Array;
  /** Tail vertex of each half-edge. */
  readonly heOrigin: Uint32Array;
  /** Opposite half-edge. */
  readonly heTwin: Uint32Array;
  /** Next half-edge in the same face or boundary loop. */
  readonly heNext: Uint32Array;
  /** Owning face, or -1 for a boundary loop. */
  readonly heFace: Int32Array;
  /** Owning undirected edge. */
  readonly heEdge: Uint32Array;
  /** Per-corner uv coordinates. */
  readonly heUv: Float32Array;
  /** Canonical half-edge per undirected edge. */
  readonly edgeHalfEdge: Uint32Array;
  /** Bit flags per edge. Currently reserved for seams. */
  readonly edgeFlags: Uint8Array;
  /** One representative half-edge per face. */
  readonly faceHalfEdge: Uint32Array;
  /** Material slot per face. */
  readonly faceMaterial: Int32Array;

  readonly vertexCount: number;
  readonly halfEdgeCount: number;
  readonly edgeCount: number;
  readonly faceCount: number;
  /** Number of boundary edges (equal to boundary half-edge count). */
  readonly boundaryEdgeCount: number;

  private revision = 0;

  private constructor(columns: HalfEdgeColumns) {
    this.positions = columns.positions;
    this.vertexOut = columns.vertexOut;
    this.heOrigin = columns.heOrigin;
    this.heTwin = columns.heTwin;
    this.heNext = columns.heNext;
    this.heFace = columns.heFace;
    this.heEdge = columns.heEdge;
    this.heUv = columns.heUv;
    this.edgeHalfEdge = columns.edgeHalfEdge;
    this.edgeFlags = columns.edgeFlags;
    this.faceHalfEdge = columns.faceHalfEdge;
    this.faceMaterial = columns.faceMaterial;
    this.vertexCount = columns.vertexCount;
    this.halfEdgeCount = columns.halfEdgeCount;
    this.edgeCount = columns.edgeCount;
    this.faceCount = columns.faceCount;
    let boundaryEdges = 0;
    for (let h = 0; h < this.heFace.length; h += 1) {
      if (this.heFace[h] === -1) {
        boundaryEdges += 1;
      }
    }
    this.boundaryEdgeCount = boundaryEdges;
  }

  /**
   * Build a manifold DCEL from polygons.
   *
   * Positions are welded by exact component identity. Edges without an
   * opposite directed half-edge receive an explicit boundary half-edge, so
   * closed and open surfaces share the same topology representation.
   */
  static fromPolygons(faces: readonly MeshFaceSpec[]): HalfEdgeMesh {
    if (faces.length === 0) {
      throw new Error('A half-edge mesh requires at least one face.');
    }

    const positions: number[] = [];
    const vertexByPosition = new Map<string, number>();
    const heOrigin: number[] = [];
    const heNext: number[] = [];
    const heFace: number[] = [];
    const heUv: number[] = [];
    const faceHalfEdge: number[] = [];
    const faceMaterial: number[] = [];
    const vertexOut: number[] = [];
    const directed = new Map<string, number>();

    const vertexIndexFor = (position: Vec3): number => {
      if (!position.every(Number.isFinite)) {
        throw new Error('Mesh positions must be finite.');
      }
      const key = `${position[0]}|${position[1]}|${position[2]}`;
      const existing = vertexByPosition.get(key);
      if (existing !== undefined) {
        return existing;
      }
      const index = positions.length / 3;
      positions.push(position[0], position[1], position[2]);
      vertexByPosition.set(key, index);
      vertexOut.push(-1);
      return index;
    };

    faces.forEach((face, faceIndex) => {
      if (face.corners.length < 3) {
        throw new Error(`Face ${faceIndex} has fewer than three corners.`);
      }

      const base = heOrigin.length;
      faceHalfEdge[faceIndex] = base;
      faceMaterial[faceIndex] = face.material ?? 0;

      face.corners.forEach((corner, cornerIndex) => {
        const origin = vertexIndexFor(corner.position);
        if (vertexOut[origin] === -1) {
          vertexOut[origin] = base + cornerIndex;
        }
        if (!corner.uv.every(Number.isFinite)) {
          throw new Error(`Face ${faceIndex} contains a non-finite UV.`);
        }

        heOrigin.push(origin);
        heNext.push(base + ((cornerIndex + 1) % face.corners.length));
        heFace.push(faceIndex);
        heUv.push(corner.uv[0], corner.uv[1]);
      });
    });

    const vertexCount = positions.length / 3;
    const halfEdgeCount = heOrigin.length;

    for (let h = 0; h < halfEdgeCount; h += 1) {
      const origin = heOrigin[h];
      const destination = heOrigin[heNext[h]];
      const key = `${origin}:${destination}`;
      if (directed.has(key)) {
        throw new Error(
          `Non-manifold directed edge ${key}; each directed edge may occur once.`
        );
      }
      directed.set(key, h);
    }

    const heTwin: number[] = new Array<number>(halfEdgeCount).fill(0);
    const boundaryByOrigin = new Map<number, number>();
    const boundaryFaceHalfEdges: number[] = [];

    for (let h = 0; h < halfEdgeCount; h += 1) {
      const origin = heOrigin[h];
      const destination = heOrigin[heNext[h]];
      const twin = directed.get(`${destination}:${origin}`);
      if (twin !== undefined) {
        heTwin[h] = twin;
        continue;
      }

      // Every unmatched face edge gets one explicit boundary half-edge in the
      // opposite direction. A manifold boundary loop has exactly one outgoing
      // boundary edge per boundary vertex; duplicates mean two holes touch.
      if (boundaryByOrigin.has(destination)) {
        throw new Error(
          `Non-manifold boundary at vertex ${destination}; boundary loops may not share a vertex.`
        );
      }

      const boundary = heOrigin.length;
      boundaryByOrigin.set(destination, boundary);
      boundaryFaceHalfEdges.push(h);
      heOrigin.push(destination);
      heNext.push(-1);
      heFace.push(-1);
      heUv.push(0, 0);
      heTwin.push(-1);
    }

    const totalHalfEdges = heOrigin.length;
    // Link boundary half-edges into closed loops. For a boundary twin b of face
    // edge h, b runs from destination(h) to origin(h); its successor starts at
    // origin(h), which is exactly the next outgoing boundary edge.
    for (const h of boundaryFaceHalfEdges) {
      const boundary = boundaryByOrigin.get(heOrigin[heNext[h]]);
      const successor = boundaryByOrigin.get(heOrigin[h]);
      if (boundary === undefined || successor === undefined) {
        throw new Error(`Boundary loop at face half-edge ${h} is not closed.`);
      }
      heTwin[h] = boundary;
      heTwin[boundary] = h;
      heNext[boundary] = successor;
    }

    if (heTwin.length !== totalHalfEdges) {
      throw new Error('Boundary twin table has the wrong length.');
    }

    const edgeHalfEdge: number[] = [];
    const heEdge = new Uint32Array(totalHalfEdges);
    for (let h = 0; h < totalHalfEdges; h += 1) {
      if (heTwin[h] > h) {
        const edge = edgeHalfEdge.length;
        edgeHalfEdge.push(h);
        heEdge[h] = edge;
        heEdge[heTwin[h]] = edge;
      }
    }

    const mesh = new HalfEdgeMesh({
      positions: new Float32Array(positions),
      vertexOut: new Int32Array(vertexOut),
      heOrigin: new Uint32Array(heOrigin),
      heTwin: new Uint32Array(heTwin),
      heNext: new Uint32Array(heNext),
      heFace: new Int32Array(heFace),
      heEdge,
      heUv: new Float32Array(heUv),
      edgeHalfEdge: new Uint32Array(edgeHalfEdge),
      edgeFlags: new Uint8Array(edgeHalfEdge.length),
      faceHalfEdge: new Uint32Array(faceHalfEdge),
      faceMaterial: new Int32Array(faceMaterial),
      vertexCount,
      halfEdgeCount: totalHalfEdges,
      edgeCount: edgeHalfEdge.length,
      faceCount: faces.length
    });

    mesh.validate();
    return mesh;
  }

  /**
   * Rebuild a mesh from explicit serialized columns.
   *
   * Lengths are checked before the constructor so corrupt imports fail before
   * any indexing can go out of bounds. Full structural validation still runs.
   */
  static fromColumns(columns: HalfEdgeColumns): HalfEdgeMesh {
    const { vertexCount: v, halfEdgeCount: h, edgeCount: e, faceCount: f } = columns;
    const valid =
      Number.isInteger(v) &&
      Number.isInteger(h) &&
      Number.isInteger(e) &&
      Number.isInteger(f) &&
      v > 0 &&
      h > 0 &&
      f > 0 &&
      columns.positions.length === v * 3 &&
      columns.vertexOut.length === v &&
      columns.heOrigin.length === h &&
      columns.heTwin.length === h &&
      columns.heNext.length === h &&
      columns.heFace.length === h &&
      columns.heEdge.length === h &&
      columns.heUv.length === h * 2 &&
      columns.edgeHalfEdge.length === e &&
      columns.edgeFlags.length === e &&
      columns.faceHalfEdge.length === f &&
      columns.faceMaterial.length === f;
    if (!valid) {
      throw new Error('Half-edge columns do not match their declared counts.');
    }
    const mesh = new HalfEdgeMesh(columns);
    mesh.validate();
    return mesh;
  }

  /** Number of non-indexed triangle vertices produced by the adaptive renderer. */
  get triangleVertexCount(): number {
    let count = 0;
    for (let face = 0; face < this.faceCount; face += 1) {
      count += this.faceRenderTriangleCount(face) * 3;
    }
    return count;
  }

  /** Number of derived render triangles. */
  get triangleCount(): number {
    return this.triangleVertexCount / 3;
  }

  /**
   * Number of triangles in the editable topology, before adaptive render
   * tessellation. This is the count shown to the modeler; it stays stable when a
   * quad bends and the renderer expands it into a bilinear patch.
   */
  get topologyTriangleCount(): number {
    let count = 0;
    for (let face = 0; face < this.faceCount; face += 1) {
      count += this.faceVertexCount(face) - 2;
    }
    return count;
  }

  /** Monotonic revision incremented whenever positions change. */
  get meshRevision(): number {
    return this.revision;
  }

  /** Return the number of corners in a face. */
  faceVertexCount(face: number): number {
    const start = this.faceHalfEdge[face];
    let count = 0;
    let current = start;
    do {
      count += 1;
      current = this.heNext[current];
      if (count > this.halfEdgeCount) {
        throw new Error(`Face ${face} contains a broken cycle.`);
      }
    } while (current !== start);
    return count;
  }

  /** Return the destination vertex of a half-edge. */
  halfEdgeDestination(halfEdge: number): number {
    return this.heOrigin[this.heNext[halfEdge]];
  }

  /** Return the two endpoint vertices of an undirected edge. */
  getEdgeVertices(edge: number): [number, number] {
    if (edge < 0 || edge >= this.edgeCount) {
      throw new RangeError(`Edge ${edge} is outside the mesh.`);
    }
    const halfEdge = this.edgeHalfEdge[edge];
    return [this.heOrigin[halfEdge], this.halfEdgeDestination(halfEdge)];
  }

  /** Return the vertex indices of a face in winding order. */
  getFaceVertices(face: number): number[] {
    if (face < 0 || face >= this.faceCount) {
      throw new RangeError(`Face ${face} is outside the mesh.`);
    }
    const vertices: number[] = [];
    const start = this.faceHalfEdge[face];
    let current = start;
    do {
      vertices.push(this.heOrigin[current]);
      current = this.heNext[current];
    } while (current !== start);
    return vertices;
  }

  /** Return the half-edge indices of a face in winding order. */
  getFaceHalfEdges(face: number): number[] {
    if (face < 0 || face >= this.faceCount) {
      throw new RangeError(`Face ${face} is outside the mesh.`);
    }
    const halfEdges: number[] = [];
    const start = this.faceHalfEdge[face];
    let current = start;
    do {
      halfEdges.push(current);
      current = this.heNext[current];
    } while (current !== start);
    return halfEdges;
  }

  /** Map a non-indexed render triangle index back to its source DCEL face. */
  faceFromRenderTriangle(triangle: number): number {
    if (!Number.isInteger(triangle) || triangle < 0) {
      throw new RangeError(`Triangle ${triangle} is invalid.`);
    }
    let cursor = 0;
    for (let face = 0; face < this.faceCount; face += 1) {
      cursor += this.faceRenderTriangleCount(face);
      if (triangle < cursor) {
        return face;
      }
    }
    throw new RangeError(`Triangle ${triangle} is outside the render mesh.`);
  }

  /** Read a vertex position without exposing a mutable view into the buffer. */
  getVertexPosition(vertex: number): Vec3 {
    const offset = vertex * 3;
    return [
      this.positions[offset],
      this.positions[offset + 1],
      this.positions[offset + 2]
    ];
  }

  /**
   * Move a single vertex.
   *
   * DCEL topology does not change. Derived render tessellation can change when
   * an adjacent quad moves in or out of plane; the renderer treats that as a
   * derived-buffer rebuild, never as a topology edit.
   */
  setVertexPosition(vertex: number, position: Vec3): void {
    if (vertex < 0 || vertex >= this.vertexCount) {
      throw new RangeError(`Vertex ${vertex} is outside the mesh.`);
    }
    if (!position.every(Number.isFinite)) {
      throw new Error('Vertex positions must be finite.');
    }
    const offset = vertex * 3;
    this.positions[offset] = position[0];
    this.positions[offset + 1] = position[1];
    this.positions[offset + 2] = position[2];
    this.revision += 1;
  }

  /**
   * Write flat-shaded triangle data into caller-owned buffers.
   *
   * Planar faces use a cheap fan. Non-planar quads are rendered as a bilinear
   * grid so the texture does not fold along an arbitrary hidden diagonal when
   * a vertex is pulled out of the quad plane. The editable topology remains a
   * quad; tessellation is a render-only concern.
   */
  writeTriangleData(
    outPositions: Float32Array,
    outNormals: Float32Array,
    outUvs: Float32Array
  ): void {
    const required = this.triangleVertexCount;
    if (
      outPositions.length !== required * 3 ||
      outNormals.length !== required * 3 ||
      outUvs.length !== required * 2
    ) {
      throw new Error('Triangle output buffers do not match mesh capacity.');
    }

    let vertexCursor = 0;
    for (let face = 0; face < this.faceCount; face += 1) {
      const normal = this.computeFaceNormal(face);
      const start = this.faceHalfEdge[face];
      const faceSize = this.faceVertexCount(face);

      if (faceSize === 4 && this.isNonPlanarQuad(face)) {
        // Render the bent quad as a smooth, render-only bilinear patch. This
        // avoids the long diagonal texture crease produced by two independent
        // triangle panels while the DCEL continues to expose one quad face.
        vertexCursor = this.writeBilinearQuad(
          start,
          normal,
          outPositions,
          outNormals,
          outUvs,
          vertexCursor
        );
        continue;
      }

      let a = start;
      let b = this.heNext[a];
      for (let corner = 2; corner < faceSize; corner += 1) {
        const c = this.heNext[b];

        for (const halfEdge of [a, b, c]) {
          const vertex = this.heOrigin[halfEdge];
          const positionOffset = vertex * 3;
          const uvOffset = halfEdge * 2;
          const outOffset = vertexCursor * 3;

          outPositions[outOffset] = this.positions[positionOffset];
          outPositions[outOffset + 1] = this.positions[positionOffset + 1];
          outPositions[outOffset + 2] = this.positions[positionOffset + 2];
          outNormals[outOffset] = normal[0];
          outNormals[outOffset + 1] = normal[1];
          outNormals[outOffset + 2] = normal[2];
          outUvs[vertexCursor * 2] = this.heUv[uvOffset];
          outUvs[vertexCursor * 2 + 1] = this.heUv[uvOffset + 1];
          vertexCursor += 1;
        }

        b = c;
      }
    }
  }

  /**
   * Emit a non-planar quad as a bilinear grid.
   *
   * Positions and UVs are interpolated in the quad's own (u, v) parameter
   * space. Every grid cell uses the face's flat normal, so this smooths the
   * texture and silhouette without pretending the editable quad became four
   * topological faces.
   */
  private writeBilinearQuad(
    start: number,
    normal: Vec3,
    outPositions: Float32Array,
    outNormals: Float32Array,
    outUvs: Float32Array,
    startCursor: number
  ): number {
    const px = [0, 0, 0, 0];
    const py = [0, 0, 0, 0];
    const pz = [0, 0, 0, 0];
    const uu = [0, 0, 0, 0];
    const vv = [0, 0, 0, 0];

    let halfEdge = start;
    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = this.heOrigin[halfEdge];
      const positionOffset = vertex * 3;
      px[corner] = this.positions[positionOffset];
      py[corner] = this.positions[positionOffset + 1];
      pz[corner] = this.positions[positionOffset + 2];
      uu[corner] = this.heUv[halfEdge * 2];
      vv[corner] = this.heUv[halfEdge * 2 + 1];
      halfEdge = this.heNext[halfEdge];
    }

    let cursor = startCursor;
    const writePoint = (u: number, v: number): void => {
      const w0 = (1 - u) * (1 - v);
      const w1 = u * (1 - v);
      const w2 = u * v;
      const w3 = (1 - u) * v;
      const out3 = cursor * 3;
      const out2 = cursor * 2;

      outPositions[out3] = px[0] * w0 + px[1] * w1 + px[2] * w2 + px[3] * w3;
      outPositions[out3 + 1] =
        py[0] * w0 + py[1] * w1 + py[2] * w2 + py[3] * w3;
      outPositions[out3 + 2] =
        pz[0] * w0 + pz[1] * w1 + pz[2] * w2 + pz[3] * w3;
      outNormals[out3] = normal[0];
      outNormals[out3 + 1] = normal[1];
      outNormals[out3 + 2] = normal[2];
      outUvs[out2] = uu[0] * w0 + uu[1] * w1 + uu[2] * w2 + uu[3] * w3;
      outUvs[out2 + 1] =
        vv[0] * w0 + vv[1] * w1 + vv[2] * w2 + vv[3] * w3;
      cursor += 1;
    };

    const segments = NON_PLANAR_QUAD_SEGMENTS;
    for (let row = 0; row < segments; row += 1) {
      const v0 = row / segments;
      const v1 = (row + 1) / segments;
      for (let column = 0; column < segments; column += 1) {
        const u0 = column / segments;
        const u1 = (column + 1) / segments;

        writePoint(u0, v0);
        writePoint(u1, v0);
        writePoint(u1, v1);

        writePoint(u0, v0);
        writePoint(u1, v1);
        writePoint(u0, v1);
      }
    }

    return cursor;
  }

  /** Render triangle count for one face, including adaptive quad tessellation. */
  private faceRenderTriangleCount(face: number): number {
    const faceSize = this.faceVertexCount(face);
    if (faceSize === 4 && this.isNonPlanarQuad(face)) {
      return NON_PLANAR_QUAD_SEGMENTS * NON_PLANAR_QUAD_SEGMENTS * 2;
    }
    return faceSize - 2;
  }

  /**
   * Detect a bent quad with the tetrahedron volume of its four corners.
   *
   * A zero tetrahedron volume means all four corners lie on one plane. The
   * tolerance is relative to the quad's longest pairwise distance so the test
   * behaves consistently at different scene scales.
   */
  private isNonPlanarQuad(face: number): boolean {
    if (this.faceVertexCount(face) !== 4) {
      return false;
    }

    const h0 = this.faceHalfEdge[face];
    const h1 = this.heNext[h0];
    const h2 = this.heNext[h1];
    const h3 = this.heNext[h2];
    const o0 = this.heOrigin[h0] * 3;
    const o1 = this.heOrigin[h1] * 3;
    const o2 = this.heOrigin[h2] * 3;
    const o3 = this.heOrigin[h3] * 3;

    const ax = this.positions[o1] - this.positions[o0];
    const ay = this.positions[o1 + 1] - this.positions[o0 + 1];
    const az = this.positions[o1 + 2] - this.positions[o0 + 2];
    const bx = this.positions[o2] - this.positions[o0];
    const by = this.positions[o2 + 1] - this.positions[o0 + 1];
    const bz = this.positions[o2 + 2] - this.positions[o0 + 2];
    const cx = this.positions[o3] - this.positions[o0];
    const cy = this.positions[o3 + 1] - this.positions[o0 + 1];
    const cz = this.positions[o3 + 2] - this.positions[o0 + 2];

    const crossX = ay * bz - az * by;
    const crossY = az * bx - ax * bz;
    const crossZ = ax * by - ay * bx;
    const volume = Math.abs(crossX * cx + crossY * cy + crossZ * cz);

    const pairs: Array<[number, number]> = [
      [o0, o1],
      [o1, o2],
      [o2, o3],
      [o3, o0],
      [o0, o2],
      [o1, o3]
    ];
    let maxDistanceSq = 0;
    for (const [a, b] of pairs) {
      const dx = this.positions[a] - this.positions[b];
      const dy = this.positions[a + 1] - this.positions[b + 1];
      const dz = this.positions[a + 2] - this.positions[b + 2];
      maxDistanceSq = Math.max(maxDistanceSq, dx * dx + dy * dy + dz * dz);
    }

    if (maxDistanceSq === 0) {
      return false;
    }
    const maxDistance = Math.sqrt(maxDistanceSq);
    return volume > PLANARITY_EPSILON * maxDistance * maxDistance * maxDistance;
  }

  /** Write all unique topological edges as line-segment endpoints. */
  writeEdgePositions(outPositions: Float32Array): void {
    if (outPositions.length !== this.edgeCount * 6) {
      throw new Error('Edge output buffer does not match mesh capacity.');
    }

    let cursor = 0;
    for (let edge = 0; edge < this.edgeCount; edge += 1) {
      const halfEdge = this.edgeHalfEdge[edge];
      const from = this.heOrigin[halfEdge] * 3;
      const to = this.halfEdgeDestination(halfEdge) * 3;
      outPositions[cursor] = this.positions[from];
      outPositions[cursor + 1] = this.positions[from + 1];
      outPositions[cursor + 2] = this.positions[from + 2];
      outPositions[cursor + 3] = this.positions[to];
      outPositions[cursor + 4] = this.positions[to + 1];
      outPositions[cursor + 5] = this.positions[to + 2];
      cursor += 6;
    }
  }

  /** Write all vertex positions for the selection handle overlay. */
  writeVertexPositions(outPositions: Float32Array): void {
    if (outPositions.length !== this.vertexCount * 3) {
      throw new Error('Vertex output buffer does not match mesh capacity.');
    }
    outPositions.set(this.positions);
  }

  /** Compute a polygon normal using Newell's method, preserving winding. */
  computeFaceNormal(face: number): Vec3 {
    const start = this.faceHalfEdge[face];
    let current = start;
    let nx = 0;
    let ny = 0;
    let nz = 0;

    do {
      const origin = this.heOrigin[current] * 3;
      const next = this.heOrigin[this.heNext[current]] * 3;
      const x1 = this.positions[origin];
      const y1 = this.positions[origin + 1];
      const z1 = this.positions[origin + 2];
      const x2 = this.positions[next];
      const y2 = this.positions[next + 1];
      const z2 = this.positions[next + 2];

      nx += (y1 - y2) * (z1 + z2);
      ny += (z1 - z2) * (x1 + x2);
      nz += (x1 - x2) * (y1 + y2);
      current = this.heNext[current];
    } while (current !== start);

    const length = Math.hypot(nx, ny, nz);
    if (length <= Number.EPSILON) {
      throw new Error(`Face ${face} is degenerate and has no stable normal.`);
    }
    return [nx / length, ny / length, nz / length];
  }

  /** Axis-aligned bounds used for camera framing. */
  getBounds(): { min: Vec3; max: Vec3 } {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];

    for (let vertex = 0; vertex < this.vertexCount; vertex += 1) {
      const offset = vertex * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = this.positions[offset + axis];
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }

    return { min, max };
  }

  /**
   * Validate structural invariants. Intended for tests, imports, and development
   * assertions; production hot paths should not scan the whole mesh.
   */
  validate(): void {
    if (this.vertexCount === 0 || this.faceCount === 0) {
      throw new Error('Mesh must contain vertices and faces.');
    }
    if (this.halfEdgeCount % 2 !== 0) {
      throw new Error('Half-edge count must be even.');
    }

    for (let vertex = 0; vertex < this.vertexCount; vertex += 1) {
      const offset = vertex * 3;
      if (
        !Number.isFinite(this.positions[offset]) ||
        !Number.isFinite(this.positions[offset + 1]) ||
        !Number.isFinite(this.positions[offset + 2])
      ) {
        throw new Error(`Vertex ${vertex} has a non-finite position.`);
      }
      const outgoing = this.vertexOut[vertex];
      if (outgoing < 0 || outgoing >= this.halfEdgeCount) {
        throw new Error(`Vertex ${vertex} has no valid outgoing half-edge.`);
      }
      if (this.heOrigin[outgoing] !== vertex) {
        throw new Error(`Vertex ${vertex} outgoing half-edge has the wrong origin.`);
      }
    }

    for (let h = 0; h < this.halfEdgeCount; h += 1) {
      const twin = this.heTwin[h];
      const next = this.heNext[h];
      if (twin >= this.halfEdgeCount || next >= this.halfEdgeCount) {
        throw new Error(`Half-edge ${h} references an invalid neighbour.`);
      }
      if (twin === h) {
        throw new Error(`Half-edge ${h} is its own twin.`);
      }
      if (this.heTwin[twin] !== h) {
        throw new Error(`Half-edge ${h} has an inconsistent twin.`);
      }
      if (this.heOrigin[next] !== this.halfEdgeDestination(h)) {
        throw new Error(`Half-edge ${h} breaks the next/origin invariant.`);
      }
      if (this.heEdge[h] >= this.edgeCount) {
        throw new Error(`Half-edge ${h} references an invalid edge.`);
      }
    }

    const visited = new Uint8Array(this.halfEdgeCount);
    for (let face = 0; face < this.faceCount; face += 1) {
      const start = this.faceHalfEdge[face];
      if (start >= this.halfEdgeCount) {
        throw new Error(`Face ${face} has an invalid representative half-edge.`);
      }
      let current = start;
      let corners = 0;
      do {
        if (this.heFace[current] !== face) {
          throw new Error(`Face ${face} includes a half-edge from another loop.`);
        }
        if (visited[current] !== 0) {
          throw new Error(`Half-edge ${current} is part of more than one loop.`);
        }
        visited[current] = 1;
        corners += 1;
        current = this.heNext[current];
        if (corners > this.halfEdgeCount) {
          throw new Error(`Face ${face} has a non-terminating cycle.`);
        }
      } while (current !== start);

      if (corners < 3) {
        throw new Error(`Face ${face} has fewer than three corners.`);
      }
    }

    // A boundary is legal in the data model even though Phase 1 builders do not
    // produce one. Validate those loops now so Phase 2 does not need two paths.
    for (let h = 0; h < this.halfEdgeCount; h += 1) {
      if (this.heFace[h] !== -1 || visited[h] !== 0) {
        continue;
      }
      let current = h;
      do {
        if (this.heFace[current] !== -1) {
          throw new Error('Boundary loop crosses into a face.');
        }
        visited[current] = 1;
        current = this.heNext[current];
      } while (current !== h);
    }

    for (let h = 0; h < this.halfEdgeCount; h += 1) {
      if (visited[h] === 0) {
        throw new Error(`Half-edge ${h} is not part of a face or boundary loop.`);
      }
    }

    for (let edge = 0; edge < this.edgeCount; edge += 1) {
      const halfEdge = this.edgeHalfEdge[edge];
      if (this.heEdge[halfEdge] !== edge) {
        throw new Error(`Edge ${edge} has an inconsistent canonical half-edge.`);
      }
      if (this.heEdge[this.heTwin[halfEdge]] !== edge) {
        throw new Error(`Edge ${edge} does not own both twins.`);
      }
    }
  }
}
