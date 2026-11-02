import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, type Mesh } from 'three';
import { bodyRotation } from '@/engine/planetary/coordinates';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import type { FlightSession } from '@/features/flight/FlightSession';
import type { PlanetGeneration } from './PlanetGeneration';

export function SurfaceInfrastructure({
  body,
  session,
  generation,
}: {
  body: CelestialDefinition;
  session: FlightSession;
  generation: PlanetGeneration;
}) {
  const mesh = useRef<Mesh>(null),
    geometry = useMemo(() => new BufferGeometry(), []);
  useEffect(() => {
    let disposed = false;
    const cancel = generation.request(
      `${body.id}/roads`,
      6,
      { kind: 'roads', body },
      (response) => {
        if (disposed || response.result.kind !== 'roads') return;
        geometry.setAttribute('position', new BufferAttribute(response.result.vertices, 3));
        geometry.setIndex(new BufferAttribute(response.result.triangles, 1));
        geometry.computeBoundingSphere();
      },
    );
    return () => {
      disposed = true;
      cancel();
      geometry.dispose();
    };
  }, [body, geometry, generation]);
  useFrame(() => {
    const center = session.exploration.world.positions.get(body.id);
    if (!mesh.current || !center) return;
    mesh.current.position.copy(center).sub(session.origin.position);
    bodyRotation(body, session.exploration.world.time, mesh.current.quaternion);
  });
  return (
    <mesh ref={mesh}>
      <primitive object={geometry} attach="geometry" />
      <meshBasicMaterial color="#484d45" side={DoubleSide} />
    </mesh>
  );
}
