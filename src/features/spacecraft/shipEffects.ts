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
    // Keep navigation lamps faction-colored; combustion is blue on every hull.
    if (kind === 1) lighting.color.toArray(colors, index * 3);
    else colors.set([0.018, 0.18, 1], index * 3);
    parameters.set([radius, kind, seed, angle], index * 4);
    index++;
  };
  for (const [engine, mount] of engines.entries()) {
    // Kind 4 is a physical nozzle disc; kind 0 is its camera-facing optical halo.
    add(mount.x, mount.y, mount.z + 0.025, mount.radius * 0.94, 4);
    add(mount.x, mount.y, mount.z + 0.06, mount.radius * 2.6, 0);
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
  varying float vKind, vGain, vSeed;
  void main() {
    vUv = position.xy;
    vColor = aColor;
    vKind = aParameters.y;
    vSeed = aParameters.z + uPhase;
    vGain = 1.0;
    vec3 origin = aOrigin;
    float radius = aParameters.x;
    float kind = aParameters.y;
    bool ribbon = (kind > 1.5 && kind < 2.5) || kind > 4.5;
    float time = uTime * uMotion;
    float flameLength = min(6.8, 0.8 + uPower * 1.8);
    float reach = min(uReach, 10.0);
    if (kind > 4.5) {
      float along = aParameters.z;
      origin.z += 0.1 + along * reach;
      // A narrow, advecting wake overlaps the flame and breaks into blue wisps aft.
      origin.xy += vec2(sin(along * 11.0 - time * 5.0 + uPhase),
        cos(along * 9.0 - time * 4.0 + uPhase)) * along * 0.12 * uMotion;
      radius *= (0.65 + uPower * 0.18) * pow(1.0 - along, 0.65);
      vGain = uMotion * uPower * 0.32 * pow(1.0 - along, 1.2);
    } else if (kind > 3.5) {
      vGain = 0.12 + min(uPower, 2.4) * 0.32;
    } else if (kind > 2.5) {
      float age = fract(uTime * 1.75 + vSeed);
      float angle = aParameters.w;
      origin.xy += vec2(cos(angle), sin(angle)) * age * (0.1 + uPower * 0.08);
      origin.z += 0.15 + age * reach;
      radius *= 1.0 - age * 0.65;
      vGain = uMotion * uPower * 0.45
        * smoothstep(0.0, 0.08, age) * pow(1.0 - age, 1.6);
    } else if (kind > 1.5) {
      radius *= 0.8 + min(uPower, 2.4) * 0.14;
      vGain = min(uPower, 3.0) * 0.24;
    } else if (kind < 0.5) {
      radius *= 0.6 + min(uPower, 2.4) * 0.2;
      vGain = 0.04 + min(uPower, 2.4) * 0.12;
    }
    vec4 center = modelViewMatrix * vec4(origin, 1.0);
    float depth = max(0.1, -center.z);
    float unitsPerPixel = 2.0 * depth / (projectionMatrix[1][1] * uViewportHeight);
    float pixels = kind < 0.5 ? 3.2 : (kind < 1.5 ? 2.1 : 0.0);
    radius = max(radius, min(8.0, unitsPerPixel * pixels));
    if (kind > 3.5 && kind < 4.5) {
      center = modelViewMatrix * vec4(origin + vec3(position.xy * radius, 0.0), 1.0);
    } else if (ribbon) {
      // Axial ribbons keep the fire attached to the nozzle in 3D instead of stacking discs.
      vec3 aft = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
      vec3 side = cross(aft, normalize(-center.xyz));
      side = dot(side, side) > 0.0001 ? normalize(side) : vec3(1.0, 0.0, 0.0);
      float length = kind > 4.5 ? reach * 0.18 : flameLength * (0.7 + aParameters.z * 0.3);
      float along = position.y * 0.5 + 0.5;
      center.xyz += aft * along * length + side * position.x * radius;
    } else if (kind > 2.5) {
      radius = min(radius, unitsPerPixel * 1.25);
      vec2 aft = (modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xy;
      float projectedFlow = length(aft);
      vec2 direction = projectedFlow > 0.001 ? aft / projectedFlow : vec2(0.0, 1.0);
      vec2 across = vec2(-direction.y, direction.x);
      float stretch = 1.0 + projectedFlow * (1.0 + min(uPower, 2.4));
      center.xy += (across * position.x + direction * position.y * stretch) * radius;
    } else {
      center.xy += position.xy * radius;
    }
    if (ribbon) vGain *= smoothstep(0.6, 1.8, -center.z);
    vGain *= 1.0 - smoothstep(1800.0, 4500.0, depth);
    if (kind > 2.5 && (kind < 3.5 || kind > 4.5))
      vGain *= 1.0 - smoothstep(220.0, 900.0, depth);
    // Let hardware clip ribbons crossing the near plane; moving individual vertices offscreen
    // would turn a close flyby into a stretched triangle across the view.
    gl_Position = ribbon || center.z < -0.1 ? projectionMatrix * center : vec4(2.0, 2.0, 2.0, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

export const shipEffectFragment = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform float uTime, uMotion;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vKind, vGain, vSeed;
  void main() {
    #include <logdepthbuf_fragment>
    if (vGain < 0.002) discard;
    float time = uTime * uMotion;
    if ((vKind > 1.5 && vKind < 2.5) || vKind > 4.5) {
      float along = vUv.y * 0.5 + 0.5;
      float phase = vSeed * 6.283185;
      float flow = along * 19.0 - time * 11.0 + phase;
      float eddies = sin(flow) * 0.55 + sin(flow * 1.83 + vUv.x * 5.0) * 0.3;
      float bend = sin(along * 8.0 - time * 7.0 + phase) * along * 0.12;
      float width = pow(max(0.0, 1.0 - along), 0.65) * (0.72 + eddies * 0.16);
      float radial = abs(vUv.x - bend) / max(0.015, width);
      float body = 1.0 - smoothstep(0.35, 1.0, radial);
      float core = exp(-radial * radial * 16.0) * pow(1.0 - along, 2.0);
      float tongues = 0.75 + eddies * 0.25;
      float alpha = body * tongues * smoothstep(0.0, 0.045, along)
        * (1.0 - smoothstep(0.72, 1.0, along)) * vGain;
      vec3 radiance = mix(vec3(0.002, 0.015, 1.0), vec3(0.008, 0.09, 1.2), body);
      if (vKind > 4.5) {
        radiance = vColor * 1.5;
        alpha *= 0.65;
      } else {
        radiance += vec3(0.06, 0.22, 0.75) * core * 0.45;
      }
      if (alpha < 0.002) discard;
      gl_FragColor = vec4(radiance, alpha);
    } else {
      float r2 = dot(vUv, vUv);
      if (r2 > 1.0) discard;
      float edge = 1.0 - smoothstep(0.65, 1.0, r2);
      float halo = exp(-r2 * 5.0);
      float core = exp(-r2 * 42.0);
      vec3 radiance = vColor * halo * 0.8 + vec3(0.82, 0.95, 1.0) * core * 1.6;
      if (vKind > 3.5) {
        float rim = smoothstep(0.40, 0.56, r2) * (1.0 - smoothstep(0.70, 0.95, r2));
        radiance = mix(vec3(0.45, 0.8, 1.2), vColor * 1.3, smoothstep(0.05, 0.55, r2))
          + rim * vColor * 0.45;
      } else if (vKind > 2.5) {
        radiance = mix(vColor * 1.5, vec3(0.25, 0.65, 1.1), core) * exp(-r2 * 3.0);
      }
      gl_FragColor = vec4(radiance, edge * vGain);
    }
    #include <colorspace_fragment>
  }
`;
