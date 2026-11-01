import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type BufferAttribute, DoubleSide, type Group, type Points, Vector3 } from 'three';
import type { RenderOrigin } from '@/engine/world/RenderOrigin';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import { usePlanetaryStore } from '@/stores/planetaryStore';

/** Periodic world-anchored dust and approach beacons remain bounded across origin shifts. */
export function FlightEnvironment({
  world,
  origin,
}: {
  world: SystemRuntime;
  origin: RenderOrigin;
}) {
  const dustObject = useRef<Points>(null);
  const beacons = useRef<Group>(null);
  const dust = useRef<BufferAttribute>(null);
  const arrival = useMemo(() => new Vector3().fromArray(world.arrival().position), [world]);
  const lastOrigin = useMemo(() => new Vector3(Number.NaN, 0, 0), []);
  const field = useMemo(() => {
    let seed = world.definition.environment.seed;
    return Float32Array.from({ length: 2100 }, () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed / 4294967296) * 4000;
    });
  }, [world]);
  const positions = useMemo(() => new Float32Array(field.length), [field]);
  useFrame(() => {
    if (dustObject.current)
      dustObject.current.visible = (usePlanetaryStore.getState().readout?.density ?? 0) < 0.1;
    if (beacons.current) {
      origin.toRender(arrival, beacons.current.position);
      beacons.current.visible = beacons.current.position.lengthSq() < 60000 ** 2;
      if (!beacons.current.visible) beacons.current.position.set(0, 0, 0);
    }
    if (lastOrigin.equals(origin.position) || !dust.current) return;
    for (let index = 0; index < field.length; index += 3) {
      positions[index] =
        (((((field[index] ?? 0) - origin.position.x) % 4000) + 4000) % 4000) - 2000;
      positions[index + 1] =
        (((((field[index + 1] ?? 0) - origin.position.y) % 4000) + 4000) % 4000) - 2000;
      positions[index + 2] =
        (((((field[index + 2] ?? 0) - origin.position.z) % 4000) + 4000) % 4000) - 2000;
    }
    dust.current.needsUpdate = true;
    lastOrigin.copy(origin.position);
  });
  return (
    <>
      <points ref={dustObject} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute ref={dust} attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#b9d9e9" size={0.85} transparent opacity={0.3} depthWrite={false} />
      </points>
      <group ref={beacons}>
        {[180, 400, 680].map((distance) => (
          <mesh key={distance} position={[0, 0, -distance]}>
            <ringGeometry args={[23.8, 24, 64]} />
            <meshBasicMaterial
              color={world.definition.environment.accent}
              transparent
              opacity={0.2}
              side={DoubleSide}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </>
  );
}
