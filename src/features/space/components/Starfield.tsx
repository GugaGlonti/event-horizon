import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, type ShaderMaterial, Vector2, Vector3 } from 'three';
import { jumpStarTravel, jumpStretch } from '@/features/exploration/hyperspaceVisuals';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useSceneStore } from '@/stores/sceneStore';

const STAR_COUNT = 12000;

/** Each star is one billboard: its original point stretches into its own radial trail. */
function createStars(radius: number) {
  const positions = new Float32Array(STAR_COUNT * 4 * 3);
  const corners = new Float32Array(STAR_COUNT * 4 * 2);
  const seeds = new Float32Array(STAR_COUNT * 4);
  const sizes = new Float32Array(STAR_COUNT * 4);
  const indices = new Uint16Array(STAR_COUNT * 6);
  // The distant galactic sky persists across local systems and their masked handoff.
  let value = 1201;
  const random = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const y = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const horizontal = Math.sqrt(1 - y * y) * radius;
    const brightness = random();
    const size = 0.65 + random() ** 3 * 1.15;
    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = i * 4 + corner;
      positions.set(
        [Math.cos(angle) * horizontal, y * radius, Math.sin(angle) * horizontal],
        vertex * 3,
      );
      corners.set([corner === 0 || corner === 3 ? -1 : 1, corner < 2 ? -1 : 1], vertex * 2);
      seeds[vertex] = brightness;
      sizes[vertex] = size;
    }
    indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  return { positions, corners, seeds, sizes, indices };
}

export function Starfield({ radius, session }: { radius: number; session: FlightSession }) {
  const field = useMemo(() => createStars(radius), [radius]);
  const material = useRef<ShaderMaterial>(null);
  const visible = useSceneStore((state) => state.starsVisible);
  const reduced = useReducedMotion();
  const axis = useMemo(() => new Vector3(), []);
  const uniforms = useMemo(
    () => ({
      uStretch: { value: 0 },
      uCoverage: { value: 0 },
      uTravel: { value: 0 },
      uViewport: { value: new Vector2(1000, 1000) },
      uVanishing: { value: new Vector2() },
    }),
    [],
  );
  useFrame(({ camera, size }) => {
    const target = material.current?.uniforms;
    if (!target) return;
    const jump = session.exploration.jump;
    if (target.uStretch) target.uStretch.value = reduced ? 0 : jumpStretch(jump);
    if (target.uCoverage) target.uCoverage.value = jump.coverage;
    if (target.uTravel) target.uTravel.value = reduced ? 0 : jumpStarTravel(jump);
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
        <bufferAttribute attach="attributes-aSeed" args={[field.seeds, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[field.sizes, 1]} />
        <bufferAttribute attach="index" args={[field.indices, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        vertexShader={`
          uniform float uStretch, uCoverage, uTravel;
          uniform vec2 uViewport, uVanishing;
          attribute vec2 aCorner; attribute float aSeed, aSize;
          varying vec2 vCorner; varying float vBrightness, vAlong, vTrailLength, vSize;
          void main() {
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            vec4 clip = projectionMatrix * view;
            vec2 ndc = clip.xy / max(clip.w, 0.001);
            vec2 radial = ndc - uVanishing;
            ndc = uVanishing + radial * exp(uTravel * 2.2);
            vec2 pixelDirection = normalize(radial * uViewport + vec2(0.001));
            vec2 normal = vec2(-pixelDirection.y, pixelDirection.x);
            float trail = uStretch * (10.0 + pow(min(length(radial), 2.0), 1.1) * uViewport.y * 1.6) * (0.2 + 1.8 * pow(aSeed, 3.0));
            // Keep the original point footprint fixed; extend only its outward endpoint.
            float outward = (aCorner.x + 1.0) * 0.5;
            float width = aSize * (1.0 + uStretch * (0.5 + aSeed));
            float along = aCorner.x * aSize * 2.0 + outward * trail;
            vec2 offset = (pixelDirection * along + normal * aCorner.y * width * 5.0) * 2.0 / uViewport;
            clip.xy = (ndc + offset) * clip.w;
            clip.z = mix(clip.z, clip.w * 0.998, uCoverage);
            gl_Position = view.z < -1.0 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
            vCorner = aCorner; vBrightness = 0.3 + pow(aSeed, 2.0) * 0.7;
            vAlong = along; vTrailLength = trail; vSize = aSize;
          }
        `}
        fragmentShader={`
          uniform float uStretch, uCoverage;
          varying vec2 vCorner; varying float vBrightness, vAlong, vTrailLength, vSize;
          void main() {
            float head = exp(-pow(vAlong / vSize, 2.0) * 0.9);
            float tail = step(0.0, vAlong) * (1.0 - smoothstep(0.0, max(1.0, vTrailLength), vAlong));
            float shape = max(head, tail * uStretch);
            float core = exp(-vCorner.y * vCorner.y * 55.0);
            float shoulder = exp(-vCorner.y * vCorner.y * 14.0) * uStretch;
            float glow = exp(-vCorner.y * vCorner.y * 4.5) * uStretch;
            vec3 color = vec3(0.9, 0.96, 1.0) * core
              + vec3(0.12, 0.38, 0.7) * shoulder * 0.35
              + vec3(0.025, 0.16, 0.45) * glow * 0.28;
            float fade = 1.0 - smoothstep(0.25, 1.0, uCoverage);
            gl_FragColor = vec4(color, shape * vBrightness * (1.0 + uStretch * 0.45) * fade);
          }
        `}
      />
    </mesh>
  );
}
