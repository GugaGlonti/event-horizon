import { useFrame } from '@react-three/fiber';
import { type RefObject, useMemo, useRef } from 'react';
import { type Group, Quaternion, type ShaderMaterial, Vector3 } from 'three';
import { jumpExposure, jumpStretch } from '@/features/exploration/hyperspaceVisuals';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type Point = readonly [number, number, number];

function CanopyRib({ from, to, width = 0.065 }: { from: Point; to: Point; width?: number }) {
  const pose = useMemo(() => {
    const start = new Vector3(...from),
      end = new Vector3(...to);
    const direction = end.clone().sub(start);
    return {
      position: start.add(end).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        direction.clone().normalize(),
      ),
      length: direction.length(),
    };
  }, [from, to]);
  return (
    <mesh position={pose.position} quaternion={pose.quaternion}>
      <boxGeometry args={[width, pose.length, width * 1.4]} />
      <meshStandardMaterial color="#344653" metalness={0.35} roughness={0.32} />
    </mesh>
  );
}

export function CockpitFrame({
  frameRef,
  visible,
  session,
}: {
  frameRef: RefObject<Group | null>;
  visible: boolean;
  session: FlightSession;
}) {
  const glass = useRef<ShaderMaterial>(null);
  const reduced = useReducedMotion();
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uLight: { value: 0 } }), []);
  useFrame(() => {
    const target = glass.current?.uniforms;
    const jump = session.exploration.jump;
    if (target?.uTime) target.uTime.value = reduced ? 0 : session.exploration.world.time;
    if (target?.uLight)
      target.uLight.value =
        jump.coverage * 0.65 + (reduced ? 0 : jumpStretch(jump) * 0.25 + jumpExposure(jump) * 0.8);
  });
  return (
    <group ref={frameRef} visible={visible}>
      {[-1, 1].map((side) => (
        <group key={side}>
          <CanopyRib
            from={[side * 1.35, -1.0, -1.55]}
            to={[side * 1.25, 0.5, -1.95]}
            width={0.085}
          />
          <CanopyRib from={[side * 1.25, 0.5, -1.95]} to={[side * 0.83, 1.02, -2.1]} />
          <CanopyRib from={[side * 0.83, 1.02, -2.1]} to={[0, 1.15, -2.15]} />
          <CanopyRib from={[side * 1.25, 0.5, -1.95]} to={[side * 2.4, 0.4, -1.55]} width={0.045} />
          <mesh position={[side * 1.25, 0.5, -1.9]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.025, 12]} />
            <meshStandardMaterial color="#52616b" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[side * 0.83, -0.91, -1.5]} rotation={[-0.22, 0, side * 0.08]}>
            <boxGeometry args={[0.65, 0.16, 0.58]} />
            <meshStandardMaterial color="#17242d" metalness={0.3} roughness={0.45} />
          </mesh>
          <mesh position={[side * 0.83, -0.815, -1.47]} rotation={[-Math.PI / 2 - 0.22, 0, 0]}>
            <planeGeometry args={[0.42, 0.27]} />
            <meshBasicMaterial color={side < 0 ? '#174c51' : '#3b3b27'} toneMapped={false} />
          </mesh>
          {[0, 1, 2, 3].map((index) => (
            <mesh
              key={index}
              position={[side * 0.83 - 0.15 + index * 0.1, -0.79, -1.37]}
              rotation={[-Math.PI / 2 - 0.22, 0, 0]}
            >
              <planeGeometry args={[0.022, 0.09 + index * 0.024]} />
              <meshBasicMaterial color={side < 0 ? '#73c9c5' : '#d3b16b'} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
      <CanopyRib from={[0, 1.55, -0.4]} to={[0, 1.15, -2.15]} width={0.045} />
      <mesh position={[0, -1.08, -1.5]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[2.8, 0.2, 0.5]} />
        <meshStandardMaterial color="#172129" roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[0, -0.96, -1.45]}>
        <boxGeometry args={[0.5, 0.012, 0.04]} />
        <meshBasicMaterial color="#74c9bf" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.05, -2.18]} renderOrder={25}>
        <planeGeometry args={[3.4, 2.6]} />
        <shaderMaterial
          ref={glass}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          toneMapped={false}
          vertexShader={`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
          fragmentShader={`
            uniform float uTime, uLight; varying vec2 vUv;
            void main() {
              float edge = smoothstep(0.18, 0.5, abs(vUv.x - 0.5));
              float sweep = exp(-pow((vUv.x + vUv.y * 0.25 - sin(uTime * 0.65) * 0.65 - 0.5) * 9.0, 2.0));
              float instruments = exp(-pow((vUv.y - 0.14) * 28.0, 2.0)) * edge;
              float highlight = (sweep * edge * 0.055 + edge * 0.008) * uLight;
              gl_FragColor = vec4(vec3(0.25, 0.64, 1.0), highlight + instruments * 0.022);
            }
          `}
        />
      </mesh>
    </group>
  );
}
