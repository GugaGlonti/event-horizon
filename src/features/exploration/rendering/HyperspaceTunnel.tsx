import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  type AmbientLight,
  type Group,
  type PointLight,
  type ShaderMaterial,
  Vector2,
} from 'three';
import { jumpExposure, jumpStretch } from '@/features/exploration/hyperspaceVisuals';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9985, 1.0); }
`;
const fragment = /* glsl */ `
  uniform float uTime, uOpacity, uExposure;
  uniform vec2 uLens;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  void main() {
    vec2 ray = (vUv * 2.0 - 1.0) * uLens;
    float radius = max(length(ray), 0.025), angle = atan(ray.y, ray.x);
    vec3 color = vec3(0.025, 0.045, 0.12);
    // Broad, soft cloud walls flow past the eye; stars supply every entry streak.
    for (int layer = 0; layer < 3; layer++) {
      float shell = 7.0 + float(layer) * 5.0;
      float depth = min(420.0, shell / radius);
      float z = depth - uTime * (42.0 + float(layer) * 12.0);
      float twist = angle + sin(depth * 0.025 - uTime * 0.35) * 0.25 + depth * 0.006;
      vec2 circle = vec2(cos(twist), sin(twist));
      vec2 p = circle * 2.2 + vec2(z * 0.025, z * 0.017 + float(layer) * 21.0);
      float cloud = noise(p) * 0.65 + noise(p * 2.1) * 0.25 + noise(p * 4.3) * 0.1;
      float depthFade = exp(-depth * 0.005);
      color += mix(vec3(0.016, 0.027, 0.09), vec3(0.2, 0.43, 0.8), cloud * cloud) * depthFade * 0.85;
    }
    float core = exp(-radius * 4.5);
    color += vec3(0.42, 0.62, 0.9) * core;
    color *= 1.0 - smoothstep(0.55, 1.7, radius) * 0.3;
    color = mix(color * 0.25, vec3(0.82, 0.93, 1.0), uExposure);
    gl_FragColor = vec4(color, max(uOpacity, uExposure * 0.8));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** A depth-tested mask preserves the nearby ship/cockpit while occluding the distant world. */
export function HyperspaceTunnel({ session }: { session: FlightSession }) {
  const group = useRef<Group>(null);
  const material = useRef<ShaderMaterial>(null);
  const light = useRef<AmbientLight>(null);
  const reflection = useRef<PointLight>(null);
  const reduced = useReducedMotion();
  const clock = useRef(0);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uExposure: { value: 0 },
      uLens: { value: new Vector2(1, 1) },
    }),
    [],
  );
  useFrame(({ camera }, delta) => {
    const jump = session.exploration.jump;
    if (!group.current) return;
    group.current.visible = jump.busy;
    if (!session.exploration.isSuspended && !reduced)
      clock.current += Math.min(delta, 0.1) * jump.intensity;
    const target = material.current?.uniforms;
    if (target?.uTime) target.uTime.value = clock.current;
    if (target?.uOpacity) target.uOpacity.value = jump.coverage;
    const exposure = reduced ? 0 : jumpExposure(jump);
    if (target?.uExposure) target.uExposure.value = exposure;
    uniforms.uLens.value.set(
      1 / camera.projectionMatrix.elements[0],
      1 / camera.projectionMatrix.elements[5],
    );
    if (light.current)
      light.current.intensity =
        jump.coverage * 1.8 + (reduced ? 0 : jumpStretch(jump) * 0.6) + exposure * 2;
    if (reflection.current) {
      reflection.current.position.copy(camera.position);
      reflection.current.intensity =
        jump.coverage * 18 + (reduced ? 0 : jumpStretch(jump) * 8) + exposure * 35;
    }
  });
  return (
    <group ref={group} visible={false}>
      <ambientLight ref={light} color="#649de3" intensity={0} />
      <pointLight ref={reflection} color="#8bcaff" intensity={0} distance={80} />
      <mesh renderOrder={10} frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={material}
          vertexShader={vertex}
          fragmentShader={fragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
