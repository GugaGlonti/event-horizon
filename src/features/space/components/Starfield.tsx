import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, type ShaderMaterial, Vector2, Vector3 } from 'three';
import { jumpStarVisibility, jumpStretch } from '@/features/exploration/hyperspaceVisuals';
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
      uVisibility: { value: 1 },
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
    if (target.uVisibility)
      target.uVisibility.value = reduced ? 1 - jump.coverage : jumpStarVisibility(jump);
    if (target.uAtmosphere)
      target.uAtmosphere.value = jump.busy
        ? 0
        : Math.min(1, session.planetaryReadout.density * 1.4);
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
          uniform float uStretch, uRadius, uForegroundDepth;
          uniform vec3 uDirection;
          uniform vec2 uViewport, uVanishing;
          attribute vec2 aCorner; attribute float aSeed, aSize;
          varying vec2 vCorner; varying float vBrightness, vAlong, vTrailLength, vSize, vWidth, vAcross;
          void main() {
            vec3 travelAxis = (viewMatrix * vec4(uDirection, 0.0)).xyz;
            // The source is always the original star. Only its exposed endpoint moves closer.
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            vec4 clip = projectionMatrix * view;
            vec2 ndc = clip.xy / max(clip.w, 0.001);
            vec2 radialPixels = (ndc - uVanishing) * uViewport * 0.5;
            float headRadius = length(radialPixels);
            vec2 direction = headRadius > 0.001 ? radialPixels / headRadius : vec2(0.0, 1.0);
            vec2 normal = vec2(-direction.y, direction.x);
            vec3 exposed = view.xyz - travelAxis * uStretch * uRadius * (0.18 + aSeed * 0.42);
            exposed.z = min(exposed.z, view.z * 0.12);
            vec4 exposedClip = projectionMatrix * vec4(exposed, 1.0);
            vec2 exposedNdc = exposedClip.xy / max(exposedClip.w, 0.001);
            // Signed distance rejects any projection toward the vanishing point.
            float trail = clamp(dot((exposedNdc - ndc) * uViewport * 0.5, direction),
              0.0, length(uViewport) * 1.5);
            float outward = (aCorner.x + 1.0) * 0.5;
            float width = aSize * 2.35 + min(uViewport.x, uViewport.y) * 0.05 * uStretch
              * (0.45 + aSeed * 0.55);
            // A circular source halo has room to bloom around the star. The ray itself starts
            // at zero and has no negative-length segment.
            float sourceExtent = mix(aSize * 2.0, width * 2.5, uStretch);
            float along = mix(-sourceExtent, trail + aSize * 2.0, outward);
            float perspective = mix(1.0,
              clamp(1.0 + max(0.0, along) / max(1.0, headRadius), 1.0, 3.0), uStretch);
            vec2 offset = (direction * along + normal * aCorner.y * width * perspective)
              * 2.0 / uViewport;
            clip.xy = (ndc + offset) * clip.w;
            // Match the tunnel's logarithmic 80 m boundary while retaining foreground depth.
            clip.z = clip.w * mix(0.9999999, uForegroundDepth, smoothstep(0.05, 0.85, uStretch));
            gl_Position = view.z < -1.0 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
            vCorner = aCorner;
            vBrightness = 0.3 + pow(aSeed, 2.0) * 0.7;
            vAlong = along; vTrailLength = trail; vSize = aSize;
            vWidth = width; vAcross = aCorner.y * width * perspective;
          }
        `}
        fragmentShader={`
          uniform float uStretch, uVisibility, uAtmosphere;
          varying vec2 vCorner; varying float vBrightness, vAlong, vTrailLength, vSize, vWidth, vAcross;
          void main() {
            if (uVisibility < 0.001) discard;
            float across = abs(vCorner.y);
            float feather = 1.0 - smoothstep(0.7, 1.0, across);
            float sourceRadius = mix(vSize * 0.85, vWidth * 0.35, uStretch);
            float sourceDistance = vAlong * vAlong + vAcross * vAcross;
            float source = exp(-sourceDistance / (sourceRadius * sourceRadius) * 0.9);
            float sourceHalo = exp(-sourceDistance / (vWidth * vWidth * 2.25)) * uStretch
              * (1.0 - smoothstep(2.0, 2.5, -vAlong / vWidth)) * feather;
            float tail = 1.0 - smoothstep(0.5, 1.0, max(0.0, vAlong) / max(1.0, vTrailLength));
            float beam = step(0.001, vTrailLength) * smoothstep(0.0, max(1.0, vWidth * 0.5), vAlong)
              * tail * feather;
            // Soft white cores and pale cyan bloom merge through width, without hard borders.
            float core = exp(-across * across * 20.0);
            float edge = exp(-across * across * 5.5);
            float halo = exp(-across * across * 1.4);
            vec3 beamColor = vec3(2.2) * core + vec3(0.42, 0.72, 1.0) * edge * 0.42
              + vec3(0.18, 0.45, 0.8) * halo * 0.18;
            vec3 color = max(vec3(0.9, 0.96, 1.0) * source, beamColor * beam)
              + vec3(0.2, 0.48, 0.72) * sourceHalo * 0.35;
            float fade = uVisibility * (1.0 - uAtmosphere);
            gl_FragColor = vec4(color, vBrightness * fade);
          }
        `}
      />
    </mesh>
  );
}
