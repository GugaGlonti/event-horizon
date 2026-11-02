import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, type ShaderMaterial, Vector2, Vector3 } from 'three';
import {
  jumpKick,
  jumpStarTravel,
  jumpStarVisibility,
  jumpStretch,
} from '@/features/exploration/hyperspaceVisuals';
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
    const brightness = random();
    const size = 0.65 + random() ** 3 * 1.15;
    const distance = radius * (0.35 + random() ** 0.7 * 0.65);
    const horizontal = Math.sqrt(1 - y * y) * distance;
    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = i * 4 + corner;
      positions.set(
        [Math.cos(angle) * horizontal, y * distance, Math.sin(angle) * horizontal],
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
      uCrossing: { value: 0 },
      uVisibility: { value: 1 },
      uTravel: { value: 0 },
      uForegroundDepth: { value: 0 },
      uAtmosphere: { value: 0 },
      uRadius: { value: radius },
      uDirection: { value: new Vector3(0, 0, -1) },
      uViewport: { value: new Vector2(1000, 1000) },
      uVanishing: { value: new Vector2() },
    }),
    [radius],
  );
  useFrame(({ camera, size }) => {
    const target = material.current?.uniforms;
    if (!target) return;
    const jump = session.exploration.jump;
    if (target.uStretch) target.uStretch.value = reduced ? 0 : jumpStretch(jump);
    if (target.uCrossing) target.uCrossing.value = reduced ? 0 : jumpKick(jump);
    if (target.uVisibility)
      target.uVisibility.value = reduced ? 1 - jump.coverage : jumpStarVisibility(jump);
    if (target.uAtmosphere)
      target.uAtmosphere.value = jump.busy
        ? 0
        : Math.min(1, session.planetaryReadout.density * 1.4);
    if (target.uTravel) target.uTravel.value = reduced ? 0 : jumpStarTravel(jump);
    if (target.uForegroundDepth)
      target.uForegroundDepth.value = (2 * Math.log2(81)) / Math.log2(camera.far + 1) - 1;
    uniforms.uViewport.value.set(size.width, size.height);
    if (jump.busy) {
      uniforms.uDirection.value.copy(session.journey.direction);
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
          uniform float uStretch, uTravel, uRadius, uForegroundDepth, uCrossing;
          uniform vec3 uDirection;
          uniform vec2 uViewport, uVanishing;
          attribute vec2 aCorner; attribute float aSeed, aSize;
          varying vec2 vCorner; varying float vBrightness, vAlong, vTrailLength, vSize;
          void main() {
            vec3 travelAxis = (viewMatrix * vec4(uDirection, 0.0)).xyz;
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            view.xyz -= travelAxis * uTravel * uRadius * 0.55;
            vec4 clip = projectionMatrix * view;
            vec2 ndc = clip.xy / max(clip.w, 0.001);
            vec2 radial = ndc - uVanishing;
            vec2 pixelDirection = normalize(radial * uViewport + vec2(0.001));
            vec2 normal = vec2(-pixelDirection.y, pixelDirection.x);
            // Project a finite exposure along the route. Depth controls each star's streak.
            vec3 exposed = view.xyz - travelAxis * uStretch * uRadius * (0.18 + aSeed * 0.42);
            exposed.z = min(exposed.z, view.z * 0.12);
            vec4 exposedClip = projectionMatrix * vec4(exposed, 1.0);
            vec2 exposedNdc = exposedClip.xy / max(exposedClip.w, 0.001);
            float trail = min(length((exposedNdc - ndc) * uViewport * 0.5), length(uViewport) * 1.5);
            // Keep the original point footprint fixed; extend only its outward endpoint.
            float outward = (aCorner.x + 1.0) * 0.5;
            float proximity = clamp(uRadius / max(-view.z, uRadius * 0.1), 1.0, 4.0);
            float width = aSize * (1.0 + uStretch * (0.8 + proximity * 0.45))
              * (1.0 + uCrossing * 0.18);
            float along = aCorner.x * aSize * 2.0 + outward * trail;
            vec2 offset = (pixelDirection * along + normal * aCorner.y * width * 5.0) * 2.0 / uViewport;
            clip.xy = (ndc + offset) * clip.w;
            // Normal stars remain celestial. Stretched exposures become an optical foreground
            // at the same logarithmic 80 m boundary as the tunnel, behind the hull/cockpit.
            clip.z = clip.w * mix(0.9999999, uForegroundDepth, smoothstep(0.05, 0.85, uStretch));
            gl_Position = view.z < -1.0 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
            vCorner = aCorner;
            vBrightness = (0.3 + pow(aSeed, 2.0) * 0.7) * mix(1.0, smoothstep(0.2, 0.7, aSeed), uStretch);
            vAlong = along; vTrailLength = trail; vSize = aSize;
          }
        `}
        fragmentShader={`
          uniform float uStretch, uVisibility, uAtmosphere, uCrossing;
          varying vec2 vCorner; varying float vBrightness, vAlong, vTrailLength, vSize;
          void main() {
            float head = exp(-pow(vAlong / vSize, 2.0) * 0.9);
            float tail = step(0.0, vAlong) * (1.0 - smoothstep(0.0, max(1.0, vTrailLength), vAlong));
            float shape = max(head, tail * uStretch);
            float core = exp(-vCorner.y * vCorner.y * mix(55.0, 30.0, uStretch));
            float shoulder = exp(-vCorner.y * vCorner.y * 10.0) * uStretch;
            float glow = exp(-vCorner.y * vCorner.y * 3.0) * uStretch;
            vec3 color = vec3(0.9, 0.96, 1.0) * core * (1.0 + uStretch * 0.2 + uCrossing * 0.6)
              + vec3(0.26, 0.58, 1.0) * shoulder * 0.3
              + vec3(0.08, 0.27, 0.7) * glow * (0.08 + uCrossing * 0.16);
            float fade = uVisibility * (1.0 - uAtmosphere);
            gl_FragColor = vec4(color, min(1.0, shape * vBrightness * (1.0 + uStretch * 0.9)) * fade);
          }
        `}
      />
    </mesh>
  );
}
