import type { PaintSettings } from './types';
import type { StrokeDab } from './StrokeSampler';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const MASK_VERTEX_SHADER = `#version 300 es
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

const MASK_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vCorner;
in float vFlow;
uniform float uHardness;
out vec4 outColor;
void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  float edge = smoothstep(uHardness, 1.0, d);
  float alpha = (1.0 - edge) * vFlow;
  outColor = vec4(alpha, 0.0, 0.0, alpha);
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
    throw new Error('Unable to create paint shader.');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown paint shader error.';
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
    throw new Error('Unable to create paint program.');
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
    const message = gl.getProgramInfoLog(program) ?? 'Unknown paint link error.';
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

function dabBounds(dab: StrokeDab): Bounds {
  const extent = dab.radius * Math.max(1, dab.aspect) + 2;
  return {
    minX: dab.x - extent,
    minY: dab.y - extent,
    maxX: dab.x + extent,
    maxY: dab.y + extent
  };
}

function includeBounds(a: Bounds | null, b: Bounds): Bounds {
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
 * GPU coverage-mask rasterizer for brush and eraser dabs.
 *
 * Dabs are drawn into an R/G/B/A mask with MAX blending so overlapping dabs
 * do not darken each other. The mask is colorized once per frame at stroke
 * opacity and then composited by the caller into the scratch texture layer.
 * One surface is reused for all paint gestures to avoid creating WebGL contexts
 * per stroke.
 */
export class GpuStampSurface {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly maskProgram: WebGLProgram;
  private readonly displayProgram: WebGLProgram;
  private readonly dabVao: WebGLVertexArrayObject;
  private readonly dabBuffer: WebGLBuffer;
  private readonly fullscreenVao: WebGLVertexArrayObject;
  private readonly fullscreenBuffer: WebGLBuffer;
  private maskTexture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private width = 0;
  private height = 0;
  private color: [number, number, number] = [1, 1, 1];
  private opacity = 1;
  private hardness = 0.7;
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
      throw new Error('WebGL2 is not available for the paint surface.');
    }
    this.gl = gl;
    this.maskProgram = createProgram(
      gl,
      MASK_VERTEX_SHADER,
      MASK_FRAGMENT_SHADER,
      {
        aCenter: 0,
        aRadius: 1,
        aAngle: 2,
        aAspect: 3,
        aFlow: 4,
        aCorner: 5
      }
    );
    this.displayProgram = createProgram(
      gl,
      DISPLAY_VERTEX_SHADER,
      DISPLAY_FRAGMENT_SHADER,
      { aPosition: 0 }
    );
    const dabVao = gl.createVertexArray();
    const dabBuffer = gl.createBuffer();
    const fullscreenVao = gl.createVertexArray();
    const fullscreenBuffer = gl.createBuffer();
    if (!dabVao || !dabBuffer || !fullscreenVao || !fullscreenBuffer) {
      throw new Error('Unable to allocate paint buffers.');
    }
    this.dabVao = dabVao;
    this.dabBuffer = dabBuffer;
    this.fullscreenVao = fullscreenVao;
    this.fullscreenBuffer = fullscreenBuffer;
    gl.bindVertexArray(this.dabVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dabBuffer);
    const stride = 8 * 4;
    this.bindAttribute(0, 2, stride, 0);
    this.bindAttribute(1, 1, stride, 2 * 4);
    this.bindAttribute(2, 1, stride, 3 * 4);
    this.bindAttribute(3, 1, stride, 4 * 4);
    this.bindAttribute(4, 1, stride, 5 * 4);
    this.bindAttribute(5, 2, stride, 6 * 4);
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
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
    });
  }

  /** Prepare a texture-sized stroke mask and its color/opacity uniforms. */
  begin(width: number, height: number, settings: PaintSettings): boolean {
    if (this.lost) {
      return false;
    }
    const gl = this.gl;
    const w = Math.max(1, Math.min(4096, Math.round(width)));
    const h = Math.max(1, Math.min(4096, Math.round(height)));
    if (this.width !== w || this.height !== h) {
      this.width = w;
      this.height = h;
      this.canvas.width = w;
      this.canvas.height = h;
      this.allocateMask();
    }
    if (!this.maskTexture || !this.framebuffer) {
      return false;
    }
    this.color = colorRgb(settings.color);
    this.opacity = Math.min(1, Math.max(0, settings.opacity * settings.colorAlpha));
    this.hardness = Math.min(0.99, Math.max(0.01, settings.hardness));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return true;
  }

  /** Rasterize dabs into the coverage mask and return their dirty bounds. */
  addDabs(dabs: readonly StrokeDab[]): Bounds | null {
    if (this.lost || dabs.length === 0 || !this.framebuffer) {
      return null;
    }
    const gl = this.gl;
    let bounds: Bounds | null = null;
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
      bounds = includeBounds(bounds, dabBounds(dab));
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.maskProgram);
    gl.uniform2f(
      gl.getUniformLocation(this.maskProgram, 'uResolution'),
      this.width,
      this.height
    );
    gl.uniform1f(
      gl.getUniformLocation(this.maskProgram, 'uHardness'),
      this.hardness
    );
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.dabVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dabBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, dabs.length * 6);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return bounds;
  }

  /** Colorize the dirty mask region into the reusable WebGL canvas. */
  present(bounds: Bounds | null): HTMLCanvasElement | null {
    if (this.lost || !this.maskTexture || !bounds) {
      return null;
    }
    const gl = this.gl;
    const minX = Math.max(0, Math.floor(bounds.minX));
    const minY = Math.max(0, Math.floor(bounds.minY));
    const maxX = Math.min(this.width, Math.ceil(bounds.maxX));
    const maxY = Math.min(this.height, Math.ceil(bounds.maxY));
    if (maxX <= minX || maxY <= minY) {
      return null;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(minX, this.height - maxY, maxX - minX, maxY - minY);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.displayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.uniform1i(
      gl.getUniformLocation(this.displayProgram, 'uMask'),
      0
    );
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

  /** Drop the current mask; used by cancel and by the next begin. */
  reset(): void {
    if (!this.maskTexture || !this.framebuffer || this.lost) {
      return;
    }
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private allocateMask(): void {
    const gl = this.gl;
    if (this.maskTexture) {
      gl.deleteTexture(this.maskTexture);
    }
    if (this.framebuffer) {
      gl.deleteFramebuffer(this.framebuffer);
    }
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      this.maskTexture = null;
      this.framebuffer = null;
      return;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
    const complete =
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      this.maskTexture = null;
      this.framebuffer = null;
      return;
    }
    this.maskTexture = texture;
    this.framebuffer = framebuffer;
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

let sharedSurface: GpuStampSurface | null = null;

/** Lazily create the one GPU paint surface used by every paint gesture. */
export function getGpuStampSurface(): GpuStampSurface | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (sharedSurface) {
    return sharedSurface;
  }
  try {
    sharedSurface = new GpuStampSurface();
    return sharedSurface;
  } catch {
    sharedSurface = null;
    return null;
  }
}
