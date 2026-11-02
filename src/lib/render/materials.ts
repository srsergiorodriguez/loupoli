import {
  CanvasTexture,
  Color,
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  LineBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  type Texture
} from 'three';
import type { Theme } from '../../design/theme';

/** Materials shared by the Phase 1 viewport. */
export interface ViewportMaterials {
  readonly solid: MeshLambertMaterial;
  readonly lit: MeshLambertMaterial;
  readonly ps1: ShaderMaterial;
  readonly wire: LineBasicMaterial;
  readonly wireOverlay: LineBasicMaterial;
  readonly ps1Texture: Texture;
  readonly litTexture: Texture;
}

/** PS1-specific uniforms kept on the material for lightweight runtime toggles. */
export interface Ps1Uniforms {
  uMap: { value: Texture | null };
  uTint: { value: Color };
  uSnapResolution: { value: Vector2 };
  uSnapEnabled: { value: number };
  uAffineEnabled: { value: number };
}

/**
 * Build the procedural checker used by the viewport material fixture.
 *
 * This is a viewport material fixture, not a document texture. The later
 * texture stack will replace it with authored layers. A visible checker is
 * important because it makes affine UV swimming and nearest-filter crunch
 * observable while moving the camera.
 */
function createCheckerTexture(theme: Theme, nearest: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create the checker texture canvas.');
  }

  const cells = 4;
  const cellSize = canvas.width / cells;
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      context.fillStyle =
        (x + y) % 2 === 0 ? theme.textureA.css : theme.textureB.css;
      context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.name = nearest ? 'loupoli-checker-ps1' : 'loupoli-checker-lit';
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 1;
  if (nearest) {
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
  } else {
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
  }
  texture.needsUpdate = true;
  return texture;
}

/**
 * The custom PS1 unlit shader.
 *
 * Vertices are snapped to a virtual low-resolution raster after projection but
 * before the perspective divide is committed, and affine UVs are reconstructed
 * manually because GLSL ES 3.00 has no `noperspective` qualifier.
 */
function createPs1Material(texture: Texture): ShaderMaterial {
  const material = new ShaderMaterial({
    name: 'loupoli-ps1-unlit',
    side: FrontSide,    transparent: false,
    toneMapped: false,
    vertexShader: /* glsl */ `
      uniform vec2 uSnapResolution;
      uniform float uSnapEnabled;

      varying vec2 vUv;
      varying vec2 vAffineUv;
      varying float vAffineW;

      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

        // Quantize in normalized device coordinates, then reconstruct clip
        // space with the original w. Keeping w untouched preserves clipping and
        // depth while giving the characteristic PS1 vertex wobble.
        if (uSnapEnabled > 0.5) {
          vec2 halfResolution = max(uSnapResolution * 0.5, vec2(1.0));
          vec2 ndc = clip.xy / max(clip.w, 0.00001);
          ndc = floor(ndc * halfResolution + 0.5) / halfResolution;
          clip.xy = ndc * clip.w;
        }

        vUv = uv;
        // Dividing these two perspective-correct varyings in the fragment
        // shader cancels perspective correction and yields affine UV mapping.
        vAffineUv = uv * clip.w;
        vAffineW = clip.w;

        gl_Position = clip;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uTint;
      uniform float uAffineEnabled;

      varying vec2 vUv;
      varying vec2 vAffineUv;
      varying float vAffineW;

      void main() {
        vec2 uv = uAffineEnabled > 0.5 ? vAffineUv / vAffineW : vUv;
        vec4 texel = texture2D(uMap, uv);
        gl_FragColor = vec4(texel.rgb * uTint, 1.0);

        #include <colorspace_fragment>
      }
    `,
    uniforms: {
      uMap: { value: texture },
      uTint: { value: new Color(1, 1, 1) },
      uSnapResolution: { value: new Vector2(320, 240) },
      uSnapEnabled: { value: 0 },
      uAffineEnabled: { value: 0 }
    } satisfies Ps1Uniforms & Record<string, unknown>
  });

  return material;
}

/** Construct the four viewport material paths plus their shared helpers. */
export function createViewportMaterials(theme: Theme): ViewportMaterials {
  const ps1Texture = createCheckerTexture(theme, true);
  const litTexture = createCheckerTexture(theme, false);

  const solid = new MeshLambertMaterial({
    name: 'loupoli-solid',
    color: theme.solidMaterial.color,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });

  const lit = new MeshLambertMaterial({
    name: 'loupoli-lit',
    color: new Color(1, 1, 1),
    map: litTexture,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });

  const wire = new LineBasicMaterial({
    name: 'loupoli-wire',
    color: theme.wireframe.color,
    transparent: true,
    opacity: Math.max(theme.wireframe.alpha, 0.55),
    depthWrite: false,
    toneMapped: false
  });
  const wireOverlay = new LineBasicMaterial({
    name: 'loupoli-wire-overlay',
    color: theme.accent.color,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });

  return {
    solid,
    lit,
    ps1: createPs1Material(ps1Texture),
    wire,
    wireOverlay,
    ps1Texture,
    litTexture
  };
}

/** Dispose every material/texture produced by the factory. */
export function disposeViewportMaterials(materials: ViewportMaterials): void {
  materials.solid.dispose();
  materials.lit.dispose();
  materials.ps1.dispose();
  materials.wire.dispose();
  materials.wireOverlay.dispose();
  materials.ps1Texture.dispose();
  materials.litTexture.dispose();
}
