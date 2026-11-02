import type { EngineMount, HullLighting } from './spacecraftLighting';

export const PARTICLES_PER_ENGINE = 18;
export const PLUME_LAYERS = 4;
export const TRAIL_LAYERS = 8;
export const MAX_ENGINE_POWER = 5;

export function visualEnginePower(power: number) {
  return Number.isFinite(power) ? Math.min(MAX_ENGINE_POWER, Math.max(0, power)) : 0;
}

export function particleReach(power: number) {
  return 2.5 + visualEnginePower(power) * 2.5;
}

/** Normal throttle spans 0..1; boost has a distinct, brighter exhaust envelope. */
export function engineEffectPower(throttle: number, boosting: boolean) {
  const power = Math.min(1, visualEnginePower(throttle));
  return boosting ? 1.4 + power : power;
}

/** Fixed-capacity sprite instances; particle seeds never depend on frame time or randomness. */
export function createShipEffectAttributes(
  engines: readonly EngineMount[],
  lighting: HullLighting,
) {
  const count =
    engines.length * (2 + PLUME_LAYERS + PARTICLES_PER_ENGINE + TRAIL_LAYERS) +
    lighting.markers.length;
  const origins = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const parameters = new Float32Array(count * 4);
  let index = 0;
  const add = (
    x: number,
    y: number,
    z: number,
    radius: number,
    kind: number,
    seed = 0,
    angle = 0,
  ) => {
    origins.set([x, y, z], index * 3);
    lighting.color.toArray(colors, index * 3);
    parameters.set([radius, kind, seed, angle], index * 4);
    index++;
  };
  for (const [engine, mount] of engines.entries()) {
    // Kind 4 is a physical nozzle disc; kind 0 is its camera-facing optical halo.
    add(mount.x, mount.y, mount.z + 0.025, mount.radius * 0.94, 4);
    add(mount.x, mount.y, mount.z + 0.06, mount.radius * 3.8, 0);
    for (let layer = 0; layer < PLUME_LAYERS; layer++) {
      add(mount.x, mount.y, mount.z, mount.radius * 1.4, 2, (layer + 0.5) / PLUME_LAYERS);
    }
    for (let layer = 0; layer < TRAIL_LAYERS; layer++) {
      add(mount.x, mount.y, mount.z, mount.radius * 0.9, 5, (layer + 0.5) / TRAIL_LAYERS);
    }
    for (let particle = 0; particle < PARTICLES_PER_ENGINE; particle++) {
      add(
        mount.x,
        mount.y,
        mount.z,
        mount.radius * 0.23,
        3,
        (particle + engine * 0.37) / PARTICLES_PER_ENGINE,
        particle * 2.399963229728653 + engine * 1.7,
      );
    }
  }
  for (const { position } of lighting.markers) {
    add(position.x, position.y, position.z, 0.46, 1);
  }
  return { count, origins, colors, parameters };
}

export const shipEffectVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uTime, uPower, uReach, uMotion, uPhase, uViewportHeight;
  attribute vec3 aOrigin, aColor;
  attribute vec4 aParameters;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vKind, vGain;
  void main() {
    vUv = position.xy;
    vColor = aColor;
    vKind = aParameters.y;
    vGain = 1.0;
    vec3 origin = aOrigin;
    float radius = aParameters.x;
    float kind = aParameters.y;
    if (kind > 4.5) {
      float along = aParameters.z;
      origin.z += 0.5 + along * uReach;
      radius *= (0.9 + uPower * 0.3) * (1.0 - along * 0.8);
      vGain = uMotion * uPower * 0.14 * pow(1.0 - along, 1.6);
    } else if (kind > 3.5) {
      vGain = 0.16 + uPower * 0.55;
    } else if (kind > 1.5 && kind < 2.5) {
      float along = aParameters.z;
      origin.z += 0.12 + along * (0.55 + uPower * 1.1);
      radius *= (1.0 - along * 0.75);
      vGain = (uPower * 0.5) * (1.0 - along);
    } else if (kind > 2.5 && kind < 3.5) {
      float age = fract(uTime * 1.75 + aParameters.z + uPhase);
      float angle = aParameters.w;
      origin.xy += vec2(cos(angle), sin(angle)) * age * (0.1 + uPower * 0.08);
      origin.z += 0.15 + age * uReach;
      radius *= 1.0 - age * 0.65;
      vGain = uMotion * (uPower * 0.65)
        * smoothstep(0.0, 0.08, age) * pow(1.0 - age, 1.6);
    } else if (kind < 0.5) {
      radius *= 0.65 + uPower * 0.3;
      vGain = 0.08 + uPower * 0.42;
    }
    vec4 center = modelViewMatrix * vec4(origin, 1.0);
    float depth = max(0.1, -center.z);
    float unitsPerPixel = 2.0 * depth / (projectionMatrix[1][1] * uViewportHeight);
    float pixels = kind < 0.5 ? 3.2 : (kind < 1.5 ? 2.1 : 0.0);
    // Optical halos retain a small distant footprint, with a bounded physical envelope.
    radius = max(radius, min(8.0, unitsPerPixel * pixels));
    if (kind > 3.5 && kind < 4.5) {
      center = modelViewMatrix * vec4(origin + vec3(position.xy * radius, 0.0), 1.0);
    } else if (kind > 4.5) {
      vec2 aft = (modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xy;
      float projectedFlow = length(aft);
      vec2 direction = projectedFlow > 0.001 ? aft / projectedFlow : vec2(0.0, 1.0);
      vec2 across = vec2(-direction.y, direction.x);
      radius = min(radius, unitsPerPixel * 12.0);
      float length = radius + projectedFlow * uReach / 8.0;
      center.xy += across * position.x * radius + direction * position.y * length;
    } else if (kind > 2.5) {
      // Keep ions small even when a boost tail approaches the chase camera.
      radius = min(radius, unitsPerPixel * 1.25);
      vec2 aft = (modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xy;
      float projectedFlow = length(aft);
      vec2 direction = projectedFlow > 0.001 ? aft / projectedFlow : vec2(0.0, 1.0);
      vec2 across = vec2(-direction.y, direction.x);
      float stretch = 1.0 + projectedFlow * (1.0 + min(uPower, 2.0));
      center.xy += (across * position.x + direction * position.y * stretch) * radius;
    } else if (kind > 1.5) {
      vec2 aft = (modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xy;
      float projectedFlow = length(aft);
      vec2 direction = projectedFlow > 0.001 ? aft / projectedFlow : vec2(0.0, 1.0);
      vec2 across = vec2(-direction.y, direction.x);
      float plumeLength = radius + projectedFlow * (0.55 + uPower * 1.1) * 0.28;
      center.xy += across * position.x * radius + direction * position.y * plumeLength;
    } else {
      center.xy += position.xy * radius;
    }
    vGain *= 1.0 - smoothstep(1800.0, 4500.0, depth);
    if (kind > 2.5 && (kind < 3.5 || kind > 4.5)) vGain *= 1.0 - smoothstep(220.0, 900.0, depth);
    gl_Position = center.z < -0.1 ? projectionMatrix * center : vec4(2.0, 2.0, 2.0, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

export const shipEffectFragment = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vKind, vGain;
  void main() {
    #include <logdepthbuf_fragment>
    float r2 = dot(vUv, vUv);
    if (r2 > 1.0 || vGain < 0.002) discard;
    float edge = 1.0 - smoothstep(0.65, 1.0, r2);
    float halo = exp(-r2 * 5.0);
    float core = exp(-r2 * 42.0);
    vec3 radiance = vColor * halo * 0.8 + vec3(0.82, 0.95, 1.0) * core * 1.6;
    if (vKind > 3.5 && vKind < 4.5) {
      float rim = smoothstep(0.40, 0.56, r2) * (1.0 - smoothstep(0.70, 0.95, r2));
      radiance = mix(vec3(2.0), vColor * 2.0, smoothstep(0.05, 0.55, r2)) + rim * vColor;
    } else if (vKind > 2.5) {
      radiance = mix(vColor, vec3(1.0), core) * exp(-r2 * 3.0);
    } else if (vKind > 1.5) {
      radiance = vColor * exp(-r2 * 3.0) * 0.9 + vec3(0.9, 0.97, 1.0) * core * 0.45;
    }
    gl_FragColor = vec4(radiance, edge * vGain);
    #include <colorspace_fragment>
  }
`;
