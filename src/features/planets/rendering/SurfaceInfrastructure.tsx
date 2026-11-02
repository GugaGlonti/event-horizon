import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, type Mesh } from 'three';
import { bodyRotation } from '@/engine/planetary/coordinates';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import type { FlightSession } from '@/features/flight/FlightSession';

export function SurfaceInfrastructure({
  body,
  session,
}: {
  body: CelestialDefinition;
  session: FlightSession;
}) {
  const mesh = useRef<Mesh>(null),
    geometry = useMemo(() => new BufferGeometry(), []);
  useEffect(() => {
    const worker = new Worker(new URL('./infrastructureWorker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (
      event: MessageEvent<{ vertices: Float32Array; triangles: Uint16Array }>,
    ) => {
      geometry.setAttribute('position', new BufferAttribute(event.data.vertices, 3));
      geometry.setIndex(new BufferAttribute(event.data.triangles, 1));
      geometry.computeBoundingSphere();
      worker.terminate();
    };
    worker.postMessage(body);
    return () => {
      worker.terminate();
      geometry.dispose();
    };
  }, [body, geometry]);
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
