import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type AmbientLight, type Group, type ShaderMaterial, Vector2 } from 'three';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9985, 1.0); }
`;
const fragment = /* glsl */ `
  uniform float uTime, uOpacity;
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
    vec3 color = vec3(0.008, 0.025, 0.08);
    // Nested corridor walls: depth comes from ray/cylinder intersections, flowing toward the eye.
    for (int layer = 0; layer < 3; layer++) {
      float shell = 7.0 + float(layer) * 5.0;
      float depth = min(420.0, shell / radius);
      float z = depth - uTime * (42.0 + float(layer) * 12.0);
      float twist = angle + sin(depth * 0.05 - uTime * 0.7) * 0.35 + depth * 0.012;
      vec2 p = vec2(twist * 3.5 + float(layer) * 21.0, z * 0.08);
      float cloud = noise(p) * 0.65 + noise(p * 2.7) * 0.35;
      float filaments = pow(noise(vec2(twist * 15.0, z * 0.045)), 5.0);
      float depthFade = exp(-depth * 0.004);
      color += mix(vec3(0.006, 0.02, 0.07), vec3(0.1, 0.32, 0.68), cloud * cloud * cloud) * depthFade * 0.8;
      color += vec3(0.21, 0.5, 0.85) * filaments * depthFade * 0.6;
    }
    float core = exp(-radius * 7.0);
    color += vec3(0.35, 0.6, 0.95) * core;
    color *= 1.0 - smoothstep(0.55, 1.7, radius) * 0.55;
    gl_FragColor = vec4(color, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** A depth-tested mask preserves the nearby ship/cockpit while occluding the distant world. */
export function HyperspaceTunnel({ session }: { session: FlightSession }) {
  const group = useRef<Group>(null);
  const material = useRef<ShaderMaterial>(null);
  const light = useRef<AmbientLight>(null);
  const reduced = useReducedMotion();
  const clock = useRef(0);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
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
    uniforms.uLens.value.set(
      1 / camera.projectionMatrix.elements[0],
      1 / camera.projectionMatrix.elements[5],
    );
    if (light.current) light.current.intensity = jump.coverage * 1.5;
  });
  return (
    <group ref={group} visible={false}>
      <ambientLight ref={light} color="#649de3" intensity={0} />
      <mesh renderOrder={-5} frustumCulled={false}>
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
