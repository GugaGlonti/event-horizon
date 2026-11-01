import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type Group, Quaternion, Vector3 } from 'three';
import { bodyRotation, surfaceDirection, tangentFrame } from '@/engine/planetary/coordinates';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import type { FlightSession } from '@/features/flight/FlightSession';

function SurfacePad({
  body,
  zoneId,
  session,
}: {
  body: CelestialDefinition;
  zoneId: string;
  session: FlightSession;
}) {
  const group = useRef<Group>(null);
  const pose = useMemo(() => ({ position: new Vector3(), orientation: new Quaternion() }), []);
  useFrame(() => {
    const zone = body.landingZones?.find((z) => z.id === zoneId),
      center = session.exploration.world.positions.get(zoneId);
    if (!group.current || !zone || !center) return;
    const up = surfaceDirection(zone.latitude, zone.longitude).applyQuaternion(
      bodyRotation(body, session.exploration.world.time),
    );
    pose.orientation.copy(tangentFrame(up));
    pose.position
      .set(center.x - up.x * 1.85, center.y - up.y * 1.85, center.z - up.z * 1.85)
      .sub(session.origin.position);
    group.current.position.copy(pose.position);
    group.current.quaternion.copy(pose.orientation);
    group.current.visible = center.distanceTo(session.position) < 30000;
  });
  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[45, 47, 64]} />
        <meshBasicMaterial color="#a7cebb" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7, 8, 32]} />
        <meshBasicMaterial color="#d9c980" />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
          <mesh position={[0, 0, 28]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2, 14]} />
            <meshBasicMaterial color="#b4d7c5" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
export function SurfaceFacilities({
  body,
  session,
}: {
  body: CelestialDefinition;
  session: FlightSession;
}) {
  return (
    <>
      {body.landingZones?.map((zone) => (
        <SurfacePad key={zone.id} body={body} zoneId={zone.id} session={session} />
      ))}
    </>
  );
}
