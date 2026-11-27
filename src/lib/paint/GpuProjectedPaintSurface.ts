import type { PaintSettings } from './types';
import type { StrokeDab } from './StrokeSampler';
import type { ProjectedPaintMesh } from '../render/PaintProjection';

/** Texture-space bounds for one projected paint update. */
export interface ProjectedPaintBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

interface ScreenBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const DAB_VERTEX_SHADER = `#version 300 es
in vec2 aCenter;
in float aRadius;
in float aAngle;
in float aAspect;
in float aFlow;
in vec2 aCorner;
uniform vec2 uResolution;
out vec2 vCorner;
out float vFlow;
void main() {
  float c = cos(aAngle);
  float s = sin(aAngle);
  vec2 local = vec2(aCorner.x, aCorner.y * aAspect);
  local = mat2(c, -s, s, c) * local;
  vec2 pixel = aCenter + local * aRadius;
  vec2 clip = vec2(
    pixel.x / uResolution.x * 2.0 - 1.0,
    1.0 - pixel.y / uResolution.y * 2.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
  vCorner = aCorner;
  vFlow = aFlow;
}`;

const DAB_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vCorner;
in float vFlow;
uniform float uHardness;
out vec4 outColor;
void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  float core = min(uHardness * uHardness, 0.999);
  float exponent = 1.0 + (1.0 - uHardness) * 2.0;
  float edge = smoothstep(core, 1.0, d);
  float alpha = (uHardness >= 0.995 ? 1.0 : pow(max(0.0, 1.0 - edge), exponent)) * vFlow;
  outColor = vec4(alpha);
}`;

const PROJECT_VERTEX_SHADER = `#version 300 es
in vec2 aUv;
in vec3 aScreen;
in float aWeight;
out vec3 vScreenWeighted;
out float vWeight;
void main() {
  vScreenWeighted = aScreen * aWeight;
  vWeight = aWeight;
  gl_Position = vec4(aUv * 2.0 - 1.0, 0.0, 1.0);
}`;

const VIEW_DEPTH_VERTEX_SHADER = `#version 300 es
in vec3 aScreen;
void main() {
  gl_Position = vec4(aScreen, 1.0);
}`;

const VIEW_DEPTH_FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 outColor;
void main() {
  float scaled = gl_FragCoord.z * 255.0;
  float high = floor(scaled) / 255.0;
  float low = fract(scaled);
  outColor = vec4(high, low, 0.0, 1.0);
}`;

const PROJECT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vScreenWeighted;
in float vWeight;
uniform sampler2D uBrush;
uniform sampler2D uViewDepth;
out vec4 outColor;
void main() {
  if (vWeight <= 0.0) {
    discard;
  }
  vec3 screen = vScreenWeighted / vWeight;
  vec2 screenUv = screen.xy * 0.5 + 0.5;
  if (any(lessThan(screenUv, vec2(0.0))) || any(greaterThan(screenUv, vec2(1.0)))) {
    discard;
  }
  float alpha = texture(uBrush, screenUv).a;
  if (alpha <= 0.002) {
    discard;
  }
  vec2 encoded = texture(uViewDepth, screenUv).rg;
  float sceneDepth = encoded.x + encoded.y / 255.0;
  float depth = screen.z * 0.5 + 0.5;
  if (depth > sceneDepth + 0.00005) {
    discard;
  }
  gl_FragDepth = depth;
  outColor = vec4(alpha);
}`;

const DISPLAY_VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vUv = aPosition * 0.5 + 0.5;
}`;

const DISPLAY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uMask;
uniform vec3 uColor;
uniform float uOpacity;
out vec4 outColor;
void main() {
  float alpha = texture(uMask, vUv).r * uOpacity;
  outColor = vec4(uColor * alpha, alpha);
}`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Unable to create projected paint shader.');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message =
      gl.getShaderInfoLog(shader) ?? 'Unknown projected paint shader error.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  bindings: Readonly<Record<string, number>>
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Unable to create projected paint program.');
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  for (const [name, location] of Object.entries(bindings)) {
    gl.bindAttribLocation(program, location, name);
  }
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message =
      gl.getProgramInfoLog(program) ?? 'Unknown projected paint link error.';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function colorRgb(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  if (hex.length !== 6) {
    return [1, 1, 1];
  }
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255
  ];
}

function dabBounds(dab: StrokeDab): ScreenBounds {
  const extent = dab.radius * Math.max(1, dab.aspect) + 2;
  return {
    minX: dab.x - extent,
    minY: dab.y - extent,
    maxX: dab.x + extent,
    maxY: dab.y + extent
  };
}

function includeScreenBounds(
  a: ScreenBounds | null,
  b: ScreenBounds
): ScreenBounds {
  if (!a) {
    return { ...b };
  }
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
}

/**
 * Projected paint rasterizer.
 *
 * The brush is first rasterized into a screen-space mask. The active mesh is
 * then rasterized in UV space with a depth-tested screen-position varying, and
 * every texel samples that screen mask. This is the standard projection-paint
 * pass: seams do not need texture-space continuity because adjacent triangles
 * sample the same screen coverage.
 *
 * One surface is shared by every projected gesture to keep the extra WebGL
 * context and its render targets bounded.
 */
export class GpuProjectedPaintSurface {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly dabProgram: WebGLProgram;
  private readonly depthProgram: WebGLProgram;
  private readonly projectProgram: WebGLProgram;
  private readonly displayProgram: WebGLProgram;
  private readonly dabVao: WebGLVertexArrayObject;
  private readonly dabBuffer: WebGLBuffer;
  private readonly meshVao: WebGLVertexArrayObject;
  private readonly meshBuffer: WebGLBuffer;
  private readonly fullscreenVao: WebGLVertexArrayObject;
  private readonly fullscreenBuffer: WebGLBuffer;
  private screenTexture: WebGLTexture | null = null;
  private screenFramebuffer: WebGLFramebuffer | null = null;
  private viewDepthColorTexture: WebGLTexture | null = null;
  private viewDepthRenderbuffer: WebGLRenderbuffer | null = null;
  private viewDepthFramebuffer: WebGLFramebuffer | null = null;
  private maskTexture: WebGLTexture | null = null;
  private maskFramebuffer: WebGLFramebuffer | null = null;
  private depthBuffer: WebGLRenderbuffer | null = null;
  private width = 0;
  private height = 0;
  private viewWidth = 1;
  private viewHeight = 1;
  private meshCount = 0;
  private meshData: Float32Array | null = null;
  private color: [number, number, number] = [1, 1, 1];
  private opacity = 1;
  private hardness = 0.7;
  private screenDirty: ScreenBounds | null = null;
  private lost = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      depth: false,
      stencil: false
    });
    if (!gl) {
      throw new Error('WebGL2 is not available for projected paint.');
    }
    this.gl = gl;
    this.dabProgram = createProgram(
      gl,
      DAB_VERTEX_SHADER,
      DAB_FRAGMENT_SHADER,
      {
        aCenter: 0,
        aRadius: 1,
        aAngle: 2,
        aAspect: 3,
        aFlow: 4,
        aCorner: 5
      }
    );
    this.depthProgram = createProgram(
      gl,
      VIEW_DEPTH_VERTEX_SHADER,
      VIEW_DEPTH_FRAGMENT_SHADER,
      { aScreen: 1 }
    );
    this.projectProgram = createProgram(
      gl,
      PROJECT_VERTEX_SHADER,
      PROJECT_FRAGMENT_SHADER,
      { aUv: 0, aScreen: 1, aWeight: 2 }
    );
    this.displayProgram = createProgram(
      gl,
      DISPLAY_VERTEX_SHADER,
      DISPLAY_FRAGMENT_SHADER,
      { aPosition: 0 }
    );
    const dabVao = gl.createVertexArray();
    const dabBuffer = gl.createBuffer();
    const meshVao = gl.createVertexArray();
    const meshBuffer = gl.createBuffer();
    const fullscreenVao = gl.createVertexArray();
    const fullscreenBuffer = gl.createBuffer();
    if (
      !dabVao ||
      !dabBuffer ||
      !meshVao ||
      !meshBuffer ||
      !fullscreenVao ||
      !fullscreenBuffer
    ) {
      throw new Error('Unable to allocate projected paint buffers.');
    }
    this.dabVao = dabVao;
    this.dabBuffer = dabBuffer;
    this.meshVao = meshVao;
    this.meshBuffer = meshBuffer;
    this.fullscreenVao = fullscreenVao;
    this.fullscreenBuffer = fullscreenBuffer;

    gl.bindVertexArray(this.dabVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dabBuffer);
    const dabStride = 8 * 4;
    this.bindAttribute(0, 2, dabStride, 0);
    this.bindAttribute(1, 1, dabStride, 2 * 4);
    this.bindAttribute(2, 1, dabStride, 3 * 4);
    this.bindAttribute(3, 1, dabStride, 4 * 4);
    this.bindAttribute(4, 1, dabStride, 5 * 4);
    this.bindAttribute(5, 2, dabStride, 6 * 4);

    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 6 * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 6 * 4, 2 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 6 * 4, 5 * 4);

    gl.bindVertexArray(this.fullscreenVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fullscreenBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
    });
  }

  /**
   * Start a projected stroke at the texture size, viewport size, and evaluated
   * render mesh. The mesh is uploaded once; the camera must remain fixed while
   * the gesture is active.
   */
  begin(
    width: number,
    height: number,
    viewWidth: number,
    viewHeight: number,
    settings: PaintSettings,
    mesh: ProjectedPaintMesh
  ): boolean {
    if (this.lost) {
      return false;
    }
    const gl = this.gl;
    const nextWidth = Math.max(1, Math.min(4096, Math.round(width)));
    const nextHeight = Math.max(1, Math.min(4096, Math.round(height)));
    const nextViewWidth = Math.max(1, Math.ceil(viewWidth));
    const nextViewHeight = Math.max(1, Math.ceil(viewHeight));
    if (
      this.width !== nextWidth ||
      this.height !== nextHeight ||
      this.viewWidth !== nextViewWidth ||
      this.viewHeight !== nextViewHeight
    ) {
      this.width = nextWidth;
      this.height = nextHeight;
      this.viewWidth = nextViewWidth;
      this.viewHeight = nextViewHeight;
      this.allocateTargets();
    }
    if (
      !this.screenTexture ||
      !this.screenFramebuffer ||
      !this.viewDepthColorTexture ||
      !this.viewDepthRenderbuffer ||
      !this.viewDepthFramebuffer ||
      !this.maskTexture ||
      !this.maskFramebuffer ||
      !this.depthBuffer
    ) {
      return false;
    }
    if (
      this.canvas.width !== this.width ||
      this.canvas.height !== this.height
    ) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }
    this.color = colorRgb(settings.color);
    this.opacity = Math.min(
      1,
      Math.max(0, settings.opacity * settings.colorAlpha)
    );
    this.hardness = Math.min(1, Math.max(0, settings.hardness));
    this.meshCount = Math.max(0, Math.floor(mesh.vertexCount));
    this.meshData = mesh.data;
    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    this.renderViewDepth();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.screenFramebuffer);
    gl.viewport(0, 0, this.viewWidth, this.viewHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFramebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.screenDirty = null;
    return true;
  }

  /** Add screen-space brush dabs to the current stroke mask. */
  addDabs(dabs: readonly StrokeDab[]): void {
    if (this.lost || dabs.length === 0 || !this.screenFramebuffer) {
      return;
    }
    const gl = this.gl;
    const data = new Float32Array(dabs.length * 6 * 8);
    let offset = 0;
    const corners = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [-1, 1],
      [1, -1],
      [1, 1]
    ] as const;
    for (const dab of dabs) {
      this.screenDirty = includeScreenBounds(this.screenDirty, dabBounds(dab));
      for (const [cx, cy] of corners) {
        data[offset++] = dab.x;
        data[offset++] = dab.y;
        data[offset++] = dab.radius;
        data[offset++] = dab.angle;
        data[offset++] = dab.aspect;
        data[offset++] = dab.flow;
        data[offset++] = cx;
        data[offset++] = cy;
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.screenFramebuffer);
    gl.viewport(0, 0, this.viewWidth, this.viewHeight);
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.dabProgram);
    gl.uniform2f(
      gl.getUniformLocation(this.dabProgram, 'uResolution'),
      this.viewWidth,
      this.viewHeight
    );
    gl.uniform1f(
      gl.getUniformLocation(this.dabProgram, 'uHardness'),
      this.hardness
    );
    gl.bindVertexArray(this.dabVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dabBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, dabs.length * 6);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Rasterize the mesh in UV space and sample the accumulated screen mask.
   * Only triangles whose screen bounds touch the new dabs are considered for
   * the returned dirty rectangle.
   */
  render(): ProjectedPaintBounds | null {
    if (
      this.lost ||
      !this.screenDirty ||
      this.meshCount === 0 ||
      !this.maskFramebuffer ||
      !this.maskTexture ||
      !this.screenTexture ||
      !this.depthBuffer
    ) {
      return null;
    }
    const gl = this.gl;
    const bounds = this.affectedUvBounds();
    this.screenDirty = null;
    if (!bounds) {
      return null;
    }
    const left = Math.max(0, Math.floor(bounds.minX));
    const top = Math.max(0, Math.floor(bounds.minY));
    const right = Math.min(this.width, Math.ceil(bounds.maxX));
    const bottom = Math.min(this.height, Math.ceil(bounds.maxY));
    if (right <= left || bottom <= top) {
      return null;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFramebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(left, this.height - bottom, right - left, bottom - top);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.projectProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.screenTexture);
    gl.uniform1i(gl.getUniformLocation(this.projectProgram, 'uBrush'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.viewDepthColorTexture);
    gl.uniform1i(gl.getUniformLocation(this.projectProgram, 'uViewDepth'), 1);
    gl.bindVertexArray(this.meshVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.meshCount);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { minX: left, minY: top, maxX: right, maxY: bottom };
  }

  /** Colorize the accumulated texture mask into the output canvas. */
  present(bounds: ProjectedPaintBounds | null = null): HTMLCanvasElement | null {
    if (
      this.lost ||
      !this.maskTexture ||
      !this.maskFramebuffer ||
      this.width === 0 ||
      this.height === 0
    ) {
      return null;
    }
    const gl = this.gl;
    const left = bounds ? Math.max(0, Math.floor(bounds.minX)) : 0;
    const top = bounds ? Math.max(0, Math.floor(bounds.minY)) : 0;
    const right = bounds
      ? Math.min(this.width, Math.ceil(bounds.maxX))
      : this.width;
    const bottom = bounds
      ? Math.min(this.height, Math.ceil(bounds.maxY))
      : this.height;
    if (right <= left || bottom <= top) {
      return null;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(left, this.height - bottom, right - left, bottom - top);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.displayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.uniform1i(gl.getUniformLocation(this.displayProgram, 'uMask'), 0);
    gl.uniform3f(
      gl.getUniformLocation(this.displayProgram, 'uColor'),
      this.color[0],
      this.color[1],
      this.color[2]
    );
    gl.uniform1f(
      gl.getUniformLocation(this.displayProgram, 'uOpacity'),
      this.opacity
    );
    gl.bindVertexArray(this.fullscreenVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.disable(gl.SCISSOR_TEST);
    return this.canvas;
  }

  /** Clear both masks for cancellation or a new gesture. */
  reset(): void {
    if (
      this.lost ||
      !this.screenFramebuffer ||
      !this.maskFramebuffer
    ) {
      return;
    }
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.screenFramebuffer);
    gl.viewport(0, 0, this.viewWidth, this.viewHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFramebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.screenDirty = null;
  }

  private renderViewDepth(): void {
    if (!this.viewDepthFramebuffer || !this.viewDepthColorTexture) {
      return;
    }
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.viewDepthFramebuffer);
    gl.viewport(0, 0, this.viewWidth, this.viewHeight);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(this.depthProgram);
    gl.bindVertexArray(this.meshVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.meshCount);
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private affectedUvBounds(): ProjectedPaintBounds | null {
    const dirty = this.screenDirty;
    if (!dirty) {
      return null;
    }
    const data = this.meshData;
    if (!data) {
      return null;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let index = 0; index + 17 < data.length; index += 18) {
      let triMinX = Infinity;
      let triMinY = Infinity;
      let triMaxX = -Infinity;
      let triMaxY = -Infinity;
      let uMin = Infinity;
      let uMax = -Infinity;
      let vMin = Infinity;
      let vMax = -Infinity;
      for (let corner = 0; corner < 3; corner += 1) {
        const offset = index + corner * 6;
        const u = data[offset];
        const v = data[offset + 1];
        const screenX = (data[offset + 2] * 0.5 + 0.5) * this.viewWidth;
        const screenY = (1 - (data[offset + 3] * 0.5 + 0.5)) * this.viewHeight;
        triMinX = Math.min(triMinX, screenX);
        triMinY = Math.min(triMinY, screenY);
        triMaxX = Math.max(triMaxX, screenX);
        triMaxY = Math.max(triMaxY, screenY);
        uMin = Math.min(uMin, u);
        uMax = Math.max(uMax, u);
        vMin = Math.min(vMin, v);
        vMax = Math.max(vMax, v);
      }
      if (
        triMaxX < dirty.minX - 1 ||
        triMinX > dirty.maxX + 1 ||
        triMaxY < dirty.minY - 1 ||
        triMinY > dirty.maxY + 1
      ) {
        continue;
      }
      minX = Math.min(minX, uMin * this.width);
      maxX = Math.max(maxX, uMax * this.width);
      minY = Math.min(minY, (1 - vMax) * this.height);
      maxY = Math.max(maxY, (1 - vMin) * this.height);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return null;
    }
    return {
      minX: Math.max(0, minX),
      minY: Math.max(0, minY),
      maxX: Math.min(this.width, maxX),
      maxY: Math.min(this.height, maxY)
    };
  }

  private allocateTargets(): void {
    const gl = this.gl;
    if (this.screenTexture) gl.deleteTexture(this.screenTexture);
    if (this.screenFramebuffer) gl.deleteFramebuffer(this.screenFramebuffer);
    if (this.viewDepthColorTexture) gl.deleteTexture(this.viewDepthColorTexture);
    if (this.viewDepthRenderbuffer) gl.deleteRenderbuffer(this.viewDepthRenderbuffer);
    if (this.viewDepthFramebuffer) gl.deleteFramebuffer(this.viewDepthFramebuffer);
    if (this.maskTexture) gl.deleteTexture(this.maskTexture);
    if (this.maskFramebuffer) gl.deleteFramebuffer(this.maskFramebuffer);
    if (this.depthBuffer) gl.deleteRenderbuffer(this.depthBuffer);
    this.screenTexture = null;
    this.screenFramebuffer = null;
    this.viewDepthColorTexture = null;
    this.viewDepthRenderbuffer = null;
    this.viewDepthFramebuffer = null;
    this.maskTexture = null;
    this.maskFramebuffer = null;
    this.depthBuffer = null;

    const screenTexture = gl.createTexture();
    const screenFramebuffer = gl.createFramebuffer();
    const maskTexture = gl.createTexture();
    const maskFramebuffer = gl.createFramebuffer();
    const depthBuffer = gl.createRenderbuffer();
    if (
      !screenTexture ||
      !screenFramebuffer ||
      !maskTexture ||
      !maskFramebuffer ||
      !depthBuffer
    ) {
      return;
    }
    gl.bindTexture(gl.TEXTURE_2D, screenTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      this.viewWidth,
      this.viewHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, screenFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      screenTexture,
      0
    );

    const viewDepthColorTexture = gl.createTexture();
    const viewDepthRenderbuffer = gl.createRenderbuffer();
    const viewDepthFramebuffer = gl.createFramebuffer();
    if (!viewDepthColorTexture || !viewDepthRenderbuffer || !viewDepthFramebuffer) {
      gl.deleteTexture(screenTexture);
      gl.deleteFramebuffer(screenFramebuffer);
      return;
    }
    gl.bindTexture(gl.TEXTURE_2D, viewDepthColorTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      this.viewWidth,
      this.viewHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, viewDepthFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      viewDepthColorTexture,
      0
    );
    gl.bindRenderbuffer(gl.RENDERBUFFER, viewDepthRenderbuffer);
    gl.renderbufferStorage(
      gl.RENDERBUFFER,
      gl.DEPTH_COMPONENT16,
      this.viewWidth,
      this.viewHeight
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      viewDepthRenderbuffer
    );

    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      this.width,
      this.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, maskFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      maskTexture,
      0
    );
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(
      gl.RENDERBUFFER,
      gl.DEPTH_COMPONENT16,
      this.width,
      this.height
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      depthBuffer
    );
    const maskComplete =
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, screenFramebuffer);
    const screenComplete =
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, viewDepthFramebuffer);
    const depthComplete =
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!maskComplete || !screenComplete || !depthComplete) {
      gl.deleteTexture(screenTexture);
      gl.deleteFramebuffer(screenFramebuffer);
      gl.deleteTexture(viewDepthColorTexture);
      gl.deleteRenderbuffer(viewDepthRenderbuffer);
      gl.deleteFramebuffer(viewDepthFramebuffer);
      gl.deleteTexture(maskTexture);
      gl.deleteFramebuffer(maskFramebuffer);
      gl.deleteRenderbuffer(depthBuffer);
      return;
    }
    this.screenTexture = screenTexture;
    this.screenFramebuffer = screenFramebuffer;
    this.viewDepthColorTexture = viewDepthColorTexture;
    this.viewDepthRenderbuffer = viewDepthRenderbuffer;
    this.viewDepthFramebuffer = viewDepthFramebuffer;
    this.maskTexture = maskTexture;
    this.maskFramebuffer = maskFramebuffer;
    this.depthBuffer = depthBuffer;
    this.meshData = null;
  }

  private bindAttribute(
    location: number,
    size: number,
    stride: number,
    offset: number
  ): void {
    const gl = this.gl;
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
  }
}

let sharedSurface: GpuProjectedPaintSurface | null = null;

/** Lazily create the one GPU projected-paint surface. */
export function getGpuProjectedPaintSurface(): GpuProjectedPaintSurface | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (sharedSurface) {
    return sharedSurface;
  }
  try {
    sharedSurface = new GpuProjectedPaintSurface();
    return sharedSurface;
  } catch {
    sharedSurface = null;
    return null;
  }
}
