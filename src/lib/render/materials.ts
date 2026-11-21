import {
  CanvasTexture,
  Color,
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  LineBasicMaterial,
  MeshBasicMaterial,
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
  readonly contact: ContactShadowUniforms;
  readonly ps1: ShaderMaterial;
  readonly wire: LineBasicMaterial;
  readonly wireOverlay: LineBasicMaterial;
  readonly wireTube: MeshBasicMaterial;
  readonly wireOverlayTube: MeshBasicMaterial;
  readonly ps1Texture: Texture;
  readonly litTexture: Texture;
}

/** Shared uniforms for the screen-space contact-shadow prepass. */
export interface ContactShadowUniforms {
  readonly uContactDepth: { value: Texture | null };
  readonly uContactResolution: { value: Vector2 };
  readonly uContactNear: { value: number };
  readonly uContactFar: { value: number };
  readonly uContactRange: { value: number };
  readonly uContactBias: { value: number };
  readonly uContactRadius: { value: number };
  readonly uContactStrength: { value: number };
  readonly uContactEnabled: { value: number };
}

/** Create the shared contact-shadow uniforms sampled by every Lit material. */
export function createContactShadowUniforms(): ContactShadowUniforms {
  return {
    uContactDepth: { value: null },
    uContactResolution: { value: new Vector2(1, 1) },
    uContactNear: { value: 0.01 },
    uContactFar: { value: 500 },
    uContactRange: { value: 0.12 },
    uContactBias: { value: 0.02 },
    uContactRadius: { value: 2 },
    uContactStrength: { value: 0.45 },
    uContactEnabled: { value: 0 }
  };
}

/**
 * Patch a Lit material with a short-range screen-space contact darkening term.
 *
 * The depth prepass stores the visible surface depth before the main pass.
 * Pixels whose near neighbours are closer in view space are darkened. The
 * range is deliberately short so broad shadows stay entirely on the existing
 * PCF shadow map; this only closes contact seams where the depth buffer
 * crosses from one surface to another.
 */
export function attachContactShadows(
  material: MeshLambertMaterial,
  uniforms: ContactShadowUniforms
): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uContactDepth;
uniform vec2 uContactResolution;
uniform float uContactNear;
uniform float uContactFar;
uniform float uContactRange;
uniform float uContactBias;
uniform float uContactRadius;
uniform float uContactStrength;
uniform float uContactEnabled;

float loupoliLinearDepth( float depth ) {
  float z = depth * 2.0 - 1.0;
  return 2.0 * uContactNear * uContactFar /
    ( uContactFar + uContactNear - z * ( uContactFar - uContactNear ) );
}

float loupoliContactVisibility() {
  if ( uContactEnabled < 0.5 ) {
    return 1.0;
  }
  vec2 uv = gl_FragCoord.xy / uContactResolution;
  float centerDepth = texture2D( uContactDepth, uv ).x;
  if ( centerDepth >= 0.99999 ) {
    return 1.0;
  }
  float center = loupoliLinearDepth( centerDepth );
  float dzdx = dFdx( center );
  float dzdy = dFdy( center );
  float occlusion = 0.0;
  for ( int i = 0; i < 8; i ++ ) {
    float radial = sqrt( ( float( i ) + 0.5 ) / 8.0 ) * uContactRadius;
    float angle = float( i ) * 2.3999632297;
    vec2 pixelOffset = vec2( cos( angle ), sin( angle ) ) * radial;
    vec2 offset = pixelOffset / uContactResolution;
    float neighbour = loupoliLinearDepth(
      texture2D( uContactDepth, uv + offset ).x
    );
    float rawGap = center - neighbour;
    if ( rawGap <= 0.0 ) {
      continue;
    }
    float expected = center + dzdx * pixelOffset.x + dzdy * pixelOffset.y;
    float gap = expected - neighbour;
    if ( gap > uContactBias && gap < uContactRange ) {
      occlusion = max( occlusion, 1.0 - gap / uContactRange );
    }
  }
  return 1.0 - occlusion * uContactStrength;
}`
      )
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;\n\toutgoingLight *= loupoliContactVisibility();'
      );
  };
  material.customProgramCacheKey = () => 'loupoli-contact-shadow-v1';
  material.needsUpdate = true;
}

/** PS1-specific uniforms kept on the material for lightweight runtime toggles. */
export interface Ps1Uniforms {
  uMap: { value: Texture | null };
  uTint: { value: Color };
  uSnapResolution: { value: Vector2 };
  uSnapEnabled: { value: number };
  uAffineEnabled: { value: number };
  uAlphaCutoff: { value: number };
  uAlphaBlend: { value: number };
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
      varying vec3 vColor;
      attribute vec3 color;

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
        vColor = color;
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
      uniform float uAlphaCutoff;
      uniform float uAlphaBlend;

      varying vec2 vUv;
      varying vec2 vAffineUv;
      varying float vAffineW;
      varying vec3 vColor;

      void main() {
        vec2 uv = uAffineEnabled > 0.5 ? vAffineUv / vAffineW : vUv;
        vec4 texel = texture2D(uMap, uv);
        if (uAlphaCutoff > 0.0 && texel.a < uAlphaCutoff) {
          discard;
        }
        float outAlpha = uAlphaBlend > 0.5 ? texel.a : 1.0;
        gl_FragColor = vec4(texel.rgb * uTint * vColor, outAlpha);

        #include <colorspace_fragment>
      }
    `,
    uniforms: {
      uMap: { value: texture },
      uTint: { value: new Color(1, 1, 1) },
      uSnapResolution: { value: new Vector2(320, 240) },
      uSnapEnabled: { value: 0 },
      uAffineEnabled: { value: 0 },
      uAlphaCutoff: { value: 0 },
      uAlphaBlend: { value: 0 }
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
    vertexColors: true,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });

  const contact = createContactShadowUniforms();
  const lit = new MeshLambertMaterial({
    name: 'loupoli-lit',
    color: new Color(1, 1, 1),
    map: litTexture,
    vertexColors: true,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  attachContactShadows(lit, contact);

  const wire = new LineBasicMaterial({
    name: 'loupoli-wire',
    color: theme.wireframe.color,
    transparent: true,
    opacity: Math.max(theme.wireframe.alpha, 0.55),
    depthWrite: false,
    toneMapped: false
  });
  const wireOverlay = new LineBasicMaterial({
    name: 'loupoli-wire-front',
    color: theme.wireframe.color,
    transparent: true,
    opacity: Math.max(theme.wireframe.alpha, 0.7),
    depthTest: true,
    depthWrite: false,
    toneMapped: false
  });
  const wireTube = new MeshBasicMaterial({
    name: 'loupoli-wire-tube',
    color: theme.wireframe.color,
    transparent: true,
    opacity: Math.max(theme.wireframe.alpha, 0.55),
    depthWrite: false,
    toneMapped: false
  });
  const wireOverlayTube = new MeshBasicMaterial({
    name: 'loupoli-wire-front-tube',
    color: theme.wireframe.color,
    transparent: true,
    opacity: Math.max(theme.wireframe.alpha, 0.7),
    depthTest: true,
    depthWrite: false,
    toneMapped: false
  });


  return {
    solid,
    lit,
    contact,
    ps1: createPs1Material(ps1Texture),
    wire,
    wireOverlay,
    wireTube,
    wireOverlayTube,
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
  materials.wireTube.dispose();
  materials.wireOverlayTube.dispose();
  materials.ps1Texture.dispose();
  materials.litTexture.dispose();
}
