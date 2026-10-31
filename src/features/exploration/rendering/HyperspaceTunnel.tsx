import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, type Group, type ShaderMaterial } from 'three';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const vertex = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const fragment = /* glsl */ `
  uniform float uTime, uIntensity, uOpacity, uAspect; varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p), angle = atan(p.y, p.x);
    float waves = sin(18.0 * log(r + 0.035) - uTime * 8.0 + sin(angle * 5.0 + uTime) * 1.8);
    float spokes = pow(max(0.0, sin(angle * 29.0 + sin(r * 9.0 - uTime * 3.0))), 12.0);
    float core = exp(-r * 9.0);
    float veil = smoothstep(0.0, 0.25, r);
    vec3 color = mix(vec3(0.008, 0.015, 0.05), vec3(0.035, 0.18, 0.38), veil);
    color += vec3(0.09, 0.34, 0.62) * (waves * 0.5 + 0.5) * veil * uIntensity;
    color += vec3(0.17, 0.3, 0.8) * spokes * r * uIntensity;
    color += vec3(0.7, 0.9, 1.0) * core * uIntensity;
    gl_FragColor = vec4(color * 0.35, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function syncUniforms(
  material: ShaderMaterial | null,
  time: number,
  intensity: number,
  opacity: number,
) {
  if (!material) return;
  if (material.uniforms.uTime) material.uniforms.uTime.value = time;
  if (material.uniforms.uIntensity) material.uniforms.uIntensity.value = intensity;
  if (material.uniforms.uOpacity) material.uniforms.uOpacity.value = opacity;
}

/** Camera-relative GPU tunnel and 650 streaks. Visual state never moves the spacecraft. */
export function HyperspaceTunnel({ session }: { session: FlightSession }) {
  const group = useRef<Group>(null);
  const tunnelMaterial = useRef<ShaderMaterial>(null);
  const streakMaterial = useRef<ShaderMaterial>(null);
  const reduced = useReducedMotion();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uOpacity: { value: 0 },
      uAspect: { value: 1 },
    }),
    [],
  );
  const particles = useMemo(() => {
    const seeds = new Float32Array(650 * 2 * 3);
    const ends = new Float32Array(650 * 2);
    let seed = 1201;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let index = 0; index < 650; index += 1) {
      const angle = random() * Math.PI * 2,
        radius = 9 + random() * 130,
        depth = random() * 500;
      for (let endpoint = 0; endpoint < 2; endpoint += 1) {
        const offset = (index * 2 + endpoint) * 3;
        seeds[offset] = Math.cos(angle) * radius;
        seeds[offset + 1] = Math.sin(angle) * radius;
        seeds[offset + 2] = depth;
        ends[index * 2 + endpoint] = endpoint;
      }
    }
    return { seeds, ends };
  }, []);
  useFrame(({ camera, size }, delta) => {
    const jump = session.exploration.jump;
    if (!group.current) return;
    group.current.visible = jump.busy;
    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.quaternion);
    if (!session.exploration.isSuspended && !reduced)
      uniforms.uTime.value += Math.min(delta, 0.1) * (0.2 + jump.intensity * 2);
    uniforms.uIntensity.value = reduced ? jump.intensity * 0.35 : jump.intensity;
    uniforms.uOpacity.value = jump.coverage;
    const aspect = tunnelMaterial.current?.uniforms.uAspect;
    if (aspect) aspect.value = size.width / Math.max(1, size.height);
    syncUniforms(
      tunnelMaterial.current,
      uniforms.uTime.value,
      uniforms.uIntensity.value,
      uniforms.uOpacity.value,
    );
    syncUniforms(
      streakMaterial.current,
      uniforms.uTime.value,
      uniforms.uIntensity.value,
      uniforms.uOpacity.value,
    );
  });
  return (
    <group ref={group} visible={false}>
      <mesh renderOrder={100} frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={tunnelMaterial}
          vertexShader={vertex}
          fragmentShader={fragment}
          uniforms={uniforms}
          transparent
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <lineSegments renderOrder={101} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles.seeds, 3]} />
          <bufferAttribute attach="attributes-aEnd" args={[particles.ends, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={streakMaterial}
          uniforms={uniforms}
          transparent
          blending={AdditiveBlending}
          depthTest={false}
          depthWrite={false}
          vertexShader={`uniform float uTime, uIntensity; attribute float aEnd; varying float vFade;
          void main() { vec3 p = position; p.z = -mod(position.z - uTime * 110.0, 500.0) - 4.0;
            vFade = clamp(-p.z / 80.0, 0.0, 1.0); p.z = min(-2.0, p.z + aEnd * (0.7 + uIntensity * 65.0));
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`}
          fragmentShader={`uniform float uIntensity; varying float vFade; void main() { gl_FragColor = vec4(mix(vec3(0.4,0.6,1.0), vec3(0.85,0.98,1.0), uIntensity), uIntensity * vFade * 0.85); }`}
        />
      </lineSegments>
    </group>
  );
}
