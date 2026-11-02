import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  type AmbientLight,
  type Group,
  type Mesh,
  Object3D,
  type PointLight,
  type ShaderMaterial,
  type SpotLight,
  Vector2,
  Vector3,
} from 'three';
import {
  sampleTunnelLights,
  type TunnelLightSample,
} from '@/features/exploration/hyperspaceLighting';
import {
  sampleTunnelMotion,
  type TunnelMotionSample,
} from '@/features/exploration/hyperspaceTunnelMotion';
import {
  jumpExposure,
  jumpFlash,
  jumpStretch,
  jumpTurbulence,
} from '@/features/exploration/hyperspaceVisuals';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const vertex = /* glsl */ `
  varying vec2 vUv;
  uniform float uMaskDepth;
  void main() { vUv = uv; gl_Position = vec4(position.xy, uMaskDepth, 1.0); }
`;
const fragment = /* glsl */ `
  uniform float uFlowTime, uOpacity, uExposure, uMotion;
  uniform vec2 uLens, uDrift, uLightDirection, uPulse, uSpin;
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
    vec2 ray = (vUv * 2.0 - 1.0 + uDrift) * uLens;
    float radius = max(length(ray), 0.025);
    vec2 radial = ray / radius;
    vec2 turning = mat2(uSpin.x, uSpin.y, -uSpin.y, uSpin.x) * radial;
    vec3 color = vec3(0.002, 0.006, 0.025);
    float keyPool = pow(max(0.0, dot(radial, normalize(uLightDirection))), 3.0);
    float fillPool = pow(max(0.0, dot(radial, -normalize(uLightDirection))), 2.0);
    // Far-to-near shells: broad folds, creased wisps and fine luminous filaments.
    for (int layer = 0; layer < 3; layer++) {
      float shell = 10.0 - float(layer) * 3.5;
      float depth = min(240.0, shell / radius);
      // Negative flowTime brings fixed cloud features to smaller depth and larger screen radius.
      float z = depth - uFlowTime * (22.0 + float(layer) * 9.0);
      // Independent shearing folds keep the corridor from reading as one rotating image.
      float twist = -uFlowTime * (float(layer) - 1.0) * 0.045
        + sin(z * 0.035 + float(layer) * 1.7) * 0.16;
      vec2 wallRay = mat2(cos(twist), sin(twist), -sin(twist), cos(twist)) * turning;
      vec2 bend = vec2(sin(z * 0.09 + 0.6), cos(z * 0.06)) * vec2(0.5, 0.35);
      vec3 p = vec3(wallRay * (2.6 + float(layer) * 0.7) + bend, z * 0.1 + float(layer) * 19.0);
      float broad = noise(p * 0.65);
      float detail = noise(p * 2.3 + broad * 0.8);
      float fine = noise(p * 7.0 + vec3(detail, broad, detail) * 1.5);
      float cloud = smoothstep(0.25, 0.8, broad * 0.55 + detail * 0.3 + fine * 0.15);
      float wisps = pow(1.0 - abs(detail * 2.0 - 1.0), 7.0) * smoothstep(0.3, 0.7, broad);
      float filaments = pow(smoothstep(0.45, 0.83, fine), 3.0) * wisps;
      float depthFade = exp(-depth * 0.008);
      float light = 0.3 + keyPool * (0.45 + uPulse.x * 1.8) + fillPool * uPulse.y * 0.6;
      vec3 wall = mix(vec3(0.003, 0.012, 0.045), vec3(0.025, 0.15, 0.43), cloud * cloud);
      wall += vec3(0.045, 0.32, 0.67) * wisps * light;
      wall += vec3(0.3, 0.82, 1.0) * filaments * light * 1.6;
      color = mix(color, wall * depthFade, 0.55 + cloud * 0.3);
    }
    float mist = noise(vec3(ray * 8.0, uFlowTime * 0.45));
    color += mix(vec3(0.015, 0.05, 0.12), vec3(0.09, 0.28, 0.42), mist) * exp(-radius * 5.0) * 0.65;
    color *= 1.0 - smoothstep(0.55, 1.7, radius) * 0.2;
    // One spatial wipe runs forward on entry and backward on exit, beneath the white peak.
    // Both endpoints are exact, preserving the opaque handoff.
    float screenRadius = clamp(length(vUv * 2.0 - 1.0) / 1.414214, 0.0, 1.0);
    float mask = mix(uOpacity, smoothstep(screenRadius * 0.76, screenRadius * 0.76 + 0.24, uOpacity), uMotion);
    float crest = 4.0 * mask * (1.0 - mask);
    color += vec3(0.12, 0.38, 0.7) * crest * uExposure * 1.4;
    color *= 1.0 + uExposure * 0.65;
    gl_FragColor = vec4(color, mask);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** A depth-tested mask preserves the nearby ship/cockpit while occluding the distant world. */
export function HyperspaceTunnel({ session }: { session: FlightSession }) {
  const group = useRef<Group>(null);
  const material = useRef<ShaderMaterial>(null);
  const flash = useRef<Mesh>(null);
  const flashMaterial = useRef<ShaderMaterial>(null);
  const light = useRef<AmbientLight>(null);
  const reflection = useRef<SpotLight>(null);
  const fill = useRef<PointLight>(null);
  const right = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(), []);
  const back = useMemo(() => new Vector3(), []);
  const aim = useMemo(() => new Object3D(), []);
  const lamps = useMemo<TunnelLightSample>(() => ({ x: 8, y: 2.4, z: 5, pulse: 0, fill: 0 }), []);
  const motion = useMemo<TunnelMotionSample>(() => ({ flowTime: 0, spinCos: 1, spinSin: 0 }), []);
  const reduced = useReducedMotion();
  const flashUniforms = useMemo(() => ({ uExposure: { value: 0 } }), []);
  const uniforms = useMemo(
    () => ({
      uFlowTime: { value: 0 },
      uSpin: { value: new Vector2(1, 0) },
      uMaskDepth: { value: -0.477 },
      uOpacity: { value: 0 },
      uMotion: { value: 1 },
      uExposure: { value: 0 },
      uLens: { value: new Vector2(1, 1) },
      uDrift: { value: new Vector2() },
      uLightDirection: { value: new Vector2(1, 0) },
      uPulse: { value: new Vector2() },
    }),
    [],
  );
  useFrame(({ camera }) => {
    const jump = session.exploration.jump;
    if (!group.current) return;
    group.current.visible = jump.busy;
    if (!jump.busy) return;
    const time = reduced ? 0 : jump.flightElapsed + (jump.variation % 1000) * 0.1;
    sampleTunnelLights(time, reduced, lamps);
    sampleTunnelMotion(time, reduced, motion);
    const target = material.current?.uniforms;
    // Match the logarithmic depth of an 80 m foreground boundary.
    if (target?.uMaskDepth)
      target.uMaskDepth.value = (2 * Math.log2(81)) / Math.log2(camera.far + 1) - 1;
    if (target?.uFlowTime) target.uFlowTime.value = motion.flowTime;
    if (target?.uSpin) target.uSpin.value.set(motion.spinCos, motion.spinSin);
    if (target?.uLightDirection) target.uLightDirection.value.set(lamps.x, lamps.y);
    if (target?.uPulse) target.uPulse.value.set(lamps.pulse, lamps.fill);
    if (target?.uDrift)
      target.uDrift.value.set(
        reduced ? 0 : jumpTurbulence(jump, 0) * 0.035,
        reduced ? 0 : jumpTurbulence(jump, 1) * 0.035,
      );
    if (target?.uOpacity) target.uOpacity.value = jump.coverage;
    if (target?.uMotion) target.uMotion.value = reduced ? 0 : 1;
    const exposure = jumpExposure(jump, reduced);
    const crossingFlash = jumpFlash(jump, reduced);
    if (target?.uExposure) target.uExposure.value = crossingFlash;
    if (flash.current) flash.current.visible = crossingFlash > 0;
    if (flashMaterial.current?.uniforms.uExposure)
      flashMaterial.current.uniforms.uExposure.value = crossingFlash;
    uniforms.uLens.value.set(
      1 / camera.projectionMatrix.elements[0],
      1 / camera.projectionMatrix.elements[5],
    );
    if (light.current) {
      light.current.color.setRGB(0.13 + exposure * 0.87, 0.34 + exposure * 0.66, 1);
      light.current.intensity =
        jump.coverage * 0.12 +
        (1 - jump.coverage) * (reduced ? 0 : jumpStretch(jump) * 0.6) +
        exposure * 1.8;
    }
    if (reflection.current) {
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      back.set(0, 0, 1).applyQuaternion(camera.quaternion);
      aim.position.copy(session.renderPosition).addScaledVector(up, 0.4);
      aim.updateMatrixWorld();
      reflection.current.position
        .copy(session.renderPosition)
        .addScaledVector(right, lamps.x)
        .addScaledVector(up, lamps.y)
        .addScaledVector(back, lamps.z);
      const blueRed = 0.2 + lamps.pulse * 0.15;
      const blueGreen = 0.52 + lamps.pulse * 0.18;
      reflection.current.color.setRGB(
        blueRed + (1 - blueRed) * exposure,
        blueGreen + (1 - blueGreen) * exposure,
        1,
      );
      reflection.current.intensity =
        jump.coverage * (180 + lamps.pulse * 900) +
        (reduced ? 0 : jumpStretch(jump) * 18) +
        exposure * 1400;
      reflection.current.shadow.needsUpdate = !session.exploration.isSuspended;
      if (fill.current) {
        fill.current.position
          .copy(session.renderPosition)
          .addScaledVector(right, -lamps.x * 0.7)
          .addScaledVector(up, -lamps.y * 0.5)
          .addScaledVector(back, 2);
        fill.current.intensity = jump.coverage * (10 + lamps.fill * 35) + exposure * 120;
      }
    }
  });
  return (
    <group ref={group} visible={false}>
      <ambientLight ref={light} color="#649de3" intensity={0} />
      <primitive object={aim} />
      <spotLight
        ref={reflection}
        target={aim}
        color="#8bcaff"
        intensity={0}
        distance={32}
        angle={1.05}
        penumbra={0.9}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-camera-near={0.5}
        shadow-camera-far={32}
        shadow-bias={-0.0002}
        shadow-normalBias={0.018}
        shadow-autoUpdate={false}
      />
      <pointLight ref={fill} color="#326de8" intensity={0} distance={28} />
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
      <mesh ref={flash} renderOrder={40} frustumCulled={false} visible={false}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={flashMaterial}
          uniforms={flashUniforms}
          transparent
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          vertexShader={`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`}
          fragmentShader={`
            uniform float uExposure;
            void main() {
              // A brief crossing flash seals the thick beams' gaps and overexposes the hull.
              // Beam buildup stays in the star shader; the world mask remains independent.
              gl_FragColor = vec4(vec3(1.0), uExposure);
            }
          `}
        />
      </mesh>
    </group>
  );
}
