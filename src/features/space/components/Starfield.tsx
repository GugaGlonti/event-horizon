import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type ShaderMaterial, Vector2, Vector3 } from 'three';
import { jumpStretch } from '@/features/exploration/hyperspaceVisuals';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useSceneStore } from '@/stores/sceneStore';

const STAR_COUNT = 2400;

/** Each star is one billboard: its original point stretches into its own radial trail. */
function createStars(radius: number, seed: number) {
  const positions = new Float32Array(STAR_COUNT * 4 * 3);
  const corners = new Float32Array(STAR_COUNT * 4 * 2);
  const tunnel = new Float32Array(STAR_COUNT * 4 * 3);
  const seeds = new Float32Array(STAR_COUNT * 4);
  const indices = new Uint16Array(STAR_COUNT * 6);
  let value = seed;
  let tunnelSeed = 1201;
  const random = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const tunnelRandom = () => {
    tunnelSeed = (tunnelSeed * 1664525 + 1013904223) >>> 0;
    return tunnelSeed / 4294967296;
  };
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const y = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const horizontal = Math.sqrt(1 - y * y) * radius;
    const brightness = tunnelRandom();
    const tunnelAngle = tunnelRandom() * Math.PI * 2;
    const tunnelRadius = radius * Math.sqrt(tunnelRandom());
    const tunnelDepth = -radius * (0.3 + tunnelRandom() * 0.7);
    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = i * 4 + corner;
      positions.set(
        [Math.cos(angle) * horizontal, y * radius, Math.sin(angle) * horizontal],
        vertex * 3,
      );
      corners.set([corner === 0 || corner === 3 ? -1 : 1, corner < 2 ? -1 : 1], vertex * 2);
      seeds[vertex] = brightness;
      tunnel.set(
        [Math.cos(tunnelAngle) * tunnelRadius, Math.sin(tunnelAngle) * tunnelRadius, tunnelDepth],
        vertex * 3,
      );
    }
    indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  return { positions, corners, tunnel, seeds, indices };
}

export function Starfield({
  radius,
  seed,
  session,
}: {
  radius: number;
  seed: number;
  session: FlightSession;
}) {
  const field = useMemo(() => createStars(radius, seed), [radius, seed]);
  const material = useRef<ShaderMaterial>(null);
  const visible = useSceneStore((state) => state.starsVisible);
  const reduced = useReducedMotion();
  const axis = useMemo(() => new Vector3(), []);
  const clock = useRef(0);
  const uniforms = useMemo(
    () => ({
      uStretch: { value: 0 },
      uCoverage: { value: 0 },
      uMotion: { value: 1 },
      uTime: { value: 0 },
      uViewport: { value: new Vector2(1000, 1000) },
      uVanishing: { value: new Vector2() },
    }),
    [],
  );
  useFrame(({ camera, size }, delta) => {
    const target = material.current?.uniforms;
    if (!target) return;
    const jump = session.exploration.jump;
    if (jump.busy && !session.exploration.isSuspended && !reduced)
      clock.current += Math.min(delta, 0.1) * jump.intensity;
    if (target.uTime) target.uTime.value = clock.current;
    if (target.uStretch) target.uStretch.value = reduced ? 0 : jumpStretch(jump);
    if (target.uCoverage) target.uCoverage.value = jump.coverage;
    if (target.uMotion) target.uMotion.value = reduced ? 0 : 1;
    uniforms.uViewport.value.set(size.width, size.height);
    if (jump.busy) {
      axis
        .copy(session.renderPosition)
        .addScaledVector(session.journey.direction, radius)
        .project(camera);
      uniforms.uVanishing.value.set(axis.x, axis.y);
    } else uniforms.uVanishing.value.set(0, 0);
  });
  return (
    <mesh visible={visible} renderOrder={20} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[field.positions, 3]} />
        <bufferAttribute attach="attributes-aCorner" args={[field.corners, 2]} />
        <bufferAttribute attach="attributes-aTunnel" args={[field.tunnel, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[field.seeds, 1]} />
        <bufferAttribute attach="index" args={[field.indices, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        toneMapped={false}
        vertexShader={`
          uniform float uStretch, uCoverage, uTime, uMotion;
          uniform vec2 uViewport, uVanishing;
          attribute vec2 aCorner; attribute float aSeed;
          attribute vec3 aTunnel;
          varying vec2 vCorner; varying float vBrightness, vAlong, vTrailLength;
          void main() {
            float flow = smoothstep(0.35, 1.0, uCoverage) * uMotion;
            vec4 view = mix(modelViewMatrix * vec4(position, 1.0), vec4(aTunnel, 1.0), flow);
            vec4 clip = projectionMatrix * view;
            vec2 ndc = clip.xy / max(clip.w, 0.001);
            vec2 radial = ndc - uVanishing;
            float cycle = fract(aSeed + uTime * 0.6);
            ndc = uVanishing + radial * mix(1.0, exp((cycle - aSeed) * 2.5), flow);
            vec2 pixelDirection = normalize(radial * uViewport + vec2(0.001));
            vec2 normal = vec2(-pixelDirection.y, pixelDirection.x);
            float trail = uStretch * (16.0 + pow(min(length(radial), 2.0), 1.15) * 1020.0) * mix(1.0, 0.12, uCoverage);
            // Keep the original point footprint fixed; extend only its outward endpoint.
            float outward = (aCorner.x + 1.0) * 0.5;
            float along = aCorner.x * 0.7 + outward * trail;
            vec2 offset = (pixelDirection * along + normal * aCorner.y * (0.6 + aSeed * 0.4)) * 2.0 / uViewport;
            clip.xy = (ndc + offset) * clip.w;
            clip.z = mix(clip.z, clip.w * 0.998, uCoverage);
            gl_Position = view.z < -1.0 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
            vCorner = aCorner; vBrightness = 0.35 + aSeed * 0.65;
            vAlong = along; vTrailLength = trail;
          }
        `}
        fragmentShader={`
          uniform float uStretch, uCoverage, uMotion;
          varying vec2 vCorner; varying float vBrightness, vAlong, vTrailLength;
          void main() {
            float head = 1.0 - smoothstep(0.175, 0.7, abs(vAlong));
            float tail = step(0.0, vAlong) * (1.0 - smoothstep(0.0, max(0.7, vTrailLength), max(0.0, vAlong)));
            float shape = pow(max(0.0, 1.0 - abs(vCorner.y)), 1.3) * max(head, tail * 0.85);
            vec3 color = mix(vec3(0.72, 0.81, 0.95), vec3(0.78, 0.93, 1.0), uStretch);
            gl_FragColor = vec4(color, shape * vBrightness * mix(0.85, 0.3, uCoverage) * (1.0 - uCoverage * (1.0 - uMotion)));
          }
        `}
      />
    </mesh>
  );
}
