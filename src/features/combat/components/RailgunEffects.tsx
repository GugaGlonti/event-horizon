import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import type { FlightSession } from '@/features/flight/FlightSession';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const segments = 24;
const capacity = 32 * segments;

/** A central charging coil and a straight, short-lived rail shot; no lightning branches. */
export function RailgunEffects({ session }: { session: FlightSession }) {
  const core = useRef<InstancedMesh>(null),
    glow = useRef<InstancedMesh>(null);
  const coil = useRef<Group>(null),
    ring = useRef<Mesh>(null);
  const ringMaterial = useRef<MeshBasicMaterial>(null),
    energy = useRef<MeshBasicMaterial>(null);
  const reducedMotion = useReducedMotion();
  const scratch = useMemo(
    () => ({
      object: new Object3D(),
      forward: new Vector3(0, 0, 1),
      start: new Vector3(),
      end: new Vector3(),
      direction: new Vector3(),
      color: new Color(),
      halo: new Color(),
      position: new Vector3(),
      orientation: new Quaternion(),
    }),
    [],
  );
  useFrame(({ camera }) => {
    if (!core.current || !glow.current) return;
    const { object, forward, start, end, direction, color, halo, position, orientation } = scratch;
    const simulation = session.combat.simulation;
    const hidden = session.exploration.jump.busy;
    const charge = simulation.player.railgunCharge / simulation.player.config.railgun.chargeTime;
    if (coil.current) {
      coil.current.visible = !hidden && charge > 0;
      coil.current.position
        .set(0, 0, -5.6)
        .applyQuaternion(session.orientation)
        .add(session.renderPosition);
      coil.current.quaternion.copy(session.orientation);
      coil.current.scale.setScalar(0.7 + charge * 0.7);
      if (ring.current) ring.current.rotation.z = reducedMotion ? 0 : simulation.time * 5;
      if (ringMaterial.current) ringMaterial.current.opacity = 0.3 + charge * 0.65;
      if (energy.current) energy.current.opacity = charge * 0.45;
    }
    let count = 0;
    if (!hidden)
      for (const tracer of simulation.tracers) {
        const owner = simulation.ships.get(tracer.owner);
        if (owner === simulation.player) {
          start.set(0, 0, -6).applyQuaternion(session.orientation).add(session.renderPosition);
        } else if (owner) {
          simulation.present(owner, position, orientation);
          start
            .set(0, 0, -6)
            .applyQuaternion(orientation)
            .add(position)
            .sub(session.origin.position);
        } else start.copy(tracer.start).sub(session.origin.position);
        end.copy(tracer.end).sub(session.origin.position);
        if (start.lengthSq() > 60000 ** 2) continue;
        direction.subVectors(end, start);
        const length = direction.length();
        if (length < 1e-6) continue;
        direction.divideScalar(length);
        object.quaternion.setFromUnitVectors(forward, direction);
        const fade = Math.min(1, (1 - tracer.age / tracer.lifetime) * 2);
        color.set('#e5fbff').multiplyScalar(fade);
        halo.set('#68c9ff').multiplyScalar(fade * 0.6);
        for (let index = 0; index < segments; index++) {
          object.position
            .copy(start)
            .addScaledVector(direction, (length * (index + 0.5)) / segments);
          const thickness = Math.max(1, object.position.distanceTo(camera.position));
          object.scale.set(thickness * 0.0015, thickness * 0.0015, length / segments);
          object.updateMatrix();
          core.current.setMatrixAt(count, object.matrix);
          core.current.setColorAt(count, color);
          object.scale.x = object.scale.y = thickness * 0.004;
          object.updateMatrix();
          glow.current.setMatrixAt(count, object.matrix);
          glow.current.setColorAt(count++, halo);
        }
      }
    core.current.count = glow.current.count = count;
    core.current.instanceMatrix.needsUpdate = true;
    glow.current.instanceMatrix.needsUpdate = true;
    if (core.current.instanceColor) core.current.instanceColor.needsUpdate = true;
    if (glow.current.instanceColor) glow.current.instanceColor.needsUpdate = true;
  });
  return (
    <>
      <group ref={coil} visible={false}>
        <mesh ref={ring}>
          <ringGeometry args={[0.55, 0.65, 24]} />
          <meshBasicMaterial
            ref={ringMaterial}
            color="#ffbd66"
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[0.45, 1]} />
          <meshBasicMaterial
            ref={energy}
            color="#b8efff"
            wireframe
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
      <instancedMesh ref={glow} args={[undefined, undefined, capacity]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          transparent
          opacity={0.65}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={core} args={[undefined, undefined, capacity]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          transparent
          opacity={0.95}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}
