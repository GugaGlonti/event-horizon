import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, type InstancedMesh, Object3D, Vector3 } from 'three';
import type { FlightSession } from '@/features/flight/FlightSession';
import { RailgunEffects } from './RailgunEffects';

/** Attached exhaust flares and short-lived rail traces use fixed-capacity buffers. */
export function WeaponEffects({ session }: { session: FlightSession }) {
  const missiles = useRef<InstancedMesh>(null),
    flares = useRef<InstancedMesh>(null);
  const scratch = useMemo(
    () => ({
      object: new Object3D(),
      up: new Vector3(0, 1, 0),
      direction: new Vector3(),
    }),
    [],
  );
  useFrame(() => {
    if (!missiles.current || !flares.current) return;
    const simulation = session.combat.simulation;
    const { object, up, direction } = scratch;
    let missileCount = 0;
    if (!session.exploration.jump.busy) {
      for (const shot of simulation.projectiles) {
        if (shot.kind !== 'missile') continue;
        object.position
          .lerpVectors(shot.previous, shot.position, simulation.alpha)
          .sub(session.origin.position);
        if (object.position.lengthSq() > 60000 ** 2) continue;
        direction.copy(shot.heading);
        object.quaternion.setFromUnitVectors(up, direction);
        object.scale.set(1, 1, 1);
        object.updateMatrix();
        missiles.current.setMatrixAt(missileCount, object.matrix);
        // A long amber flare and a bright missile body stay legible without particle emitters.
        object.position.addScaledVector(direction, -8);
        direction.negate();
        object.quaternion.setFromUnitVectors(up, direction);
        object.scale.set(1, 14, 1);
        object.updateMatrix();
        flares.current.setMatrixAt(missileCount++, object.matrix);
      }
    }
    missiles.current.count = flares.current.count = missileCount;
    missiles.current.instanceMatrix.needsUpdate = true;
    flares.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={missiles} args={[undefined, undefined, 192]} frustumCulled={false}>
        <coneGeometry args={[0.65, 3.5, 6]} />
        <meshBasicMaterial color="#fff1cf" toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={flares}
        args={[undefined, undefined, 192]}
        frustumCulled={false}
        renderOrder={30}
      >
        <coneGeometry args={[1.2, 1, 8]} />
        <meshBasicMaterial
          color="#ff9b42"
          blending={AdditiveBlending}
          transparent
          opacity={0.85}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <RailgunEffects session={session} />
    </>
  );
}
