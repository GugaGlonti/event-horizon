import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  type AmbientLight,
  type Group,
  type PointLight,
  type ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { jumpExposure, jumpStretch } from '@/features/exploration/hyperspaceVisuals';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9985, 1.0); }
`;
const fragment = /* glsl */ `
  uniform float uTime, uOpacity, uExposure, uStarlight;
  uniform vec2 uLens;
  varying vec2 vUv;
  float hash(vec3 p) {
    p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    vec2 ray = (vUv * 2.0 - 1.0) * uLens;
    float radius = max(length(ray), 0.025);
    vec2 radial = ray / radius;
    vec3 color = vec3(0.003, 0.009, 0.035);
    // Three bounded depth shells sample a 3D cloud field; no angular rotation or seam.
    for (int layer = 0; layer < 3; layer++) {
      float shell = 3.0 + float(layer) * 3.5;
      float depth = min(240.0, shell / radius);
      float z = depth - uTime * (22.0 + float(layer) * 9.0);
      vec2 bend = vec2(sin(depth * 0.09 + 0.6), cos(depth * 0.06)) * vec2(0.5, 0.35);
      vec3 p = vec3(radial * (2.6 + float(layer) * 0.7) + bend, z * 0.1 + float(layer) * 19.0);
      float broad = noise(p * 0.65);
      float detail = noise(p * 2.3 + broad * 0.8);
      float cloud = smoothstep(0.25, 0.83, broad * 0.72 + detail * 0.28);
      float wisps = smoothstep(0.48, 0.82, detail) * (0.3 + cloud * 0.7);
      float depthFade = exp(-depth * 0.008);
      color += mix(vec3(0.004, 0.012, 0.04), vec3(0.04, 0.14, 0.38), cloud * cloud) * depthFade * 0.55;
      color += vec3(0.09, 0.28, 0.58) * wisps * wisps * depthFade * 0.3;
    }
    float mist = noise(vec3(ray * 8.0, uTime * 0.45));
    color += mix(vec3(0.03, 0.08, 0.2), vec3(0.2, 0.32, 0.5), mist) * exp(-radius * 5.0) * 0.55;
    color *= 1.0 - smoothstep(0.55, 1.7, radius) * 0.2;
    color = mix(vec3(0.025, 0.10, 0.24), color, smoothstep(0.0, 0.85, uOpacity));
    color = mix(color, vec3(0.82, 0.93, 1.0), uExposure);
    gl_FragColor = vec4(color, max(max(uOpacity, uExposure * 0.8), uStarlight * 0.22));
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
  const fill = useRef<PointLight>(null);
  const right = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(), []);
  const reduced = useReducedMotion();
  const clock = useRef(0);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uExposure: { value: 0 },
      uStarlight: { value: 0 },
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
    if (target?.uStarlight) target.uStarlight.value = reduced ? 0 : jumpStretch(jump);
    uniforms.uLens.value.set(
      1 / camera.projectionMatrix.elements[0],
      1 / camera.projectionMatrix.elements[5],
    );
    if (light.current)
      light.current.intensity =
        jump.coverage * 1.8 + (reduced ? 0 : jumpStretch(jump) * 0.6) + exposure * 2;
    if (reflection.current) {
      const wave = reduced
        ? 0
        : Math.sin(clock.current * 3.1) * 0.65 + Math.sin(clock.current * 5.7) * 0.35;
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      reflection.current.position
        .copy(camera.position)
        .addScaledVector(right, wave * 1.6)
        .addScaledVector(up, 0.4);
      reflection.current.color.setRGB(0.4 + exposure * 0.5, 0.7 + exposure * 0.25, 1);
      reflection.current.intensity =
        jump.coverage * (18 + wave * 6) + (reduced ? 0 : jumpStretch(jump) * 8) + exposure * 35;
      if (fill.current) {
        fill.current.position
          .copy(camera.position)
          .addScaledVector(right, -wave * 2 - 1.5)
          .addScaledVector(up, -0.5);
        fill.current.intensity = jump.coverage * (5 - wave * 2) + exposure * 8;
      }
    }
  });
  return (
    <group ref={group} visible={false}>
      <ambientLight ref={light} color="#649de3" intensity={0} />
      <pointLight ref={reflection} color="#8bcaff" intensity={0} distance={80} />
      <pointLight ref={fill} color="#4267db" intensity={0} distance={40} />
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
