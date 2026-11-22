import { ShaderChunk } from 'three';

let installed = false;

/**
 * Replace Three.js's basic shadow lookup with a small PCSS filter.
 *
 * The PCF footprint is the source of bright seams where a shadow boundary
 * crosses an intersecting surface. PCSS first finds the average blocker depth,
 * then scales the PCF radius by the receiver/blocker separation. At contact the
 * filter collapses to roughly one texel; farther from the caster it widens into
 * a soft penumbra, so the broad shadow stays soft without the contact light band.
 *
 * The renderer must use BasicShadowMap so the shader can read raw shadow-map
 * depth. Three.js's built-in PCF path uses a comparison sampler, which cannot
 * support a blocker search.
 */
export function installPcssShadowShader(): boolean {
  if (installed) {
    return true;
  }

  const chunk = ShaderChunk.shadowmap_pars_fragment;
  // Three's VSM branch precedes the basic branch; the basic getShadow is the
  // last 2D-shadow variant in the chunk.
  const functionStart = chunk.lastIndexOf(
    'float getShadow( sampler2D shadowMap'
  );
  if (functionStart < 0) {
    return false;
  }
  const functionEnd = chunk.indexOf('\n\t\t}', functionStart);
  if (functionEnd < 0) {
    return false;
  }

  const pcss = `float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {

  vec3 coords = shadowCoord.xyz / shadowCoord.w;
  #ifdef USE_REVERSED_DEPTH_BUFFER
    coords.z -= shadowBias;
  #else
    coords.z += shadowBias;
  #endif

  bool inFrustum = coords.x >= 0.0 && coords.x <= 1.0 && coords.y >= 0.0 && coords.y <= 1.0;
  if ( ! inFrustum || coords.z > 1.0 ) {
    return 1.0;
  }

  vec2 texel = vec2( 1.0 ) / shadowMapSize;
  float searchRadius = max( 2.0, shadowRadius * 3.0 );
  float receiver = coords.z;
  float blockerSum = 0.0;
  float blockerCount = 0.0;

  for ( int i = 0; i < 8; i ++ ) {
    float radius = sqrt( ( float( i ) + 0.5 ) / 8.0 ) * searchRadius;
    float angle = float( i ) * 2.3999632297;
    vec2 offset = vec2( cos( angle ), sin( angle ) ) * radius * texel;
    float depth = texture2D( shadowMap, coords.xy + offset ).r;
    if ( depth < receiver - 0.001 ) {
      blockerSum += depth;
      blockerCount += 1.0;
    }
  }

  if ( blockerCount < 0.5 ) {
    return 1.0;
  }

  float blocker = blockerSum / blockerCount;
  float penumbra = clamp( ( receiver - blocker ) / max( blocker, 0.01 ), 0.0, 1.0 );
  float filterRadius = mix( 1.0, searchRadius, sqrt( penumbra ) );
  float visible = 0.0;
  for ( int i = 0; i < 8; i ++ ) {
    float radius = sqrt( ( float( i ) + 0.5 ) / 8.0 ) * filterRadius;
    float angle = float( i ) * 2.3999632297;
    vec2 offset = vec2( cos( angle ), sin( angle ) ) * radius * texel;
    float depth = texture2D( shadowMap, coords.xy + offset ).r;
    visible += step( receiver, depth );
  }

  return mix( 1.0, visible / 8.0, shadowIntensity );
}`;

  let patched = chunk.slice(0, functionStart) + pcss + chunk.slice(functionEnd + 4);

  // Point lights use a cube map. They cannot share the 2D PCSS path, so keep a
  // small tap filter there rather than silently falling back to hard shadows.
  const pointStart = patched.lastIndexOf(
    'float getPointShadow( samplerCube shadowMap'
  );
  if (pointStart >= 0) {
    const pointEnd = patched.indexOf('\n\t}\n\t#endif', pointStart);
    if (pointEnd >= 0) {
      const pointPcf = `float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
  vec3 lightToPosition = shadowCoord.xyz;
  vec3 absVec = abs( lightToPosition );
  float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
  float shadow = 1.0;
  if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
    float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) /
      ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
    dp += shadowBias;
    vec3 bd3D = normalize( lightToPosition );
    vec3 up = abs( bd3D.y ) < 0.99 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
    vec3 tangent = normalize( cross( up, bd3D ) );
    vec3 bitangent = cross( bd3D, tangent );
    float spread = max( 0.0, shadowRadius ) * 0.0025;
    float visible = 0.0;
    for ( int i = 0; i < 8; i ++ ) {
      float angle = float( i ) * 2.3999632297;
      vec3 direction = normalize(
        bd3D + ( tangent * cos( angle ) + bitangent * sin( angle ) ) * spread
      );
      float depth = textureCube( shadowMap, direction ).r;
      #ifdef USE_REVERSED_DEPTH_BUFFER
        depth = 1.0 - depth;
      #endif
      visible += step( dp, depth );
    }
    shadow = visible / 8.0;
  }
  return mix( 1.0, shadow, shadowIntensity );
}`;
      patched =
        patched.slice(0, pointStart) +
        pointPcf +
        patched.slice(pointEnd + 3);
    }
  }

  ShaderChunk.shadowmap_pars_fragment = patched;
  installed = true;
  return true;
}
