import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  type Group,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { portPose, stationPose } from '@/engine/stations/stationGeometry';
import type { StationDefinition } from '@/engine/stations/stationTypes';
import type { FlightSession } from '@/features/flight/FlightSession';

function Station({ station, session }: { station: StationDefinition; session: FlightSession }) {
  const group = useRef<Group>(null),
    details = useRef<Group>(null),
    hull = useRef<InstancedMesh>(null);
  const resources = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#061015';
      context.fillRect(0, 0, 512, 64);
      context.font = '32px monospace';
      context.fillStyle = '#8de8ec';
      context.textAlign = 'center';
      context.fillText(station.name.toUpperCase(), 256, 43);
    }
    const texture = new CanvasTexture(canvas);
    return {
      geometry: new BoxGeometry(1, 1, 1),
      material: new MeshStandardMaterial({ color: '#8e9ca7', metalness: 0.65, roughness: 0.62 }),
      texture,
    };
  }, [station]);
  useEffect(() => {
    if (hull.current) {
      const matrix = new Matrix4(),
        rotation = new Quaternion();
      for (let i = 0; i < station.boxes.length; i++) {
        const box = station.boxes[i];
        if (!box) continue;
        matrix.compose(
          new Vector3().fromArray(box.center),
          rotation.fromArray(box.orientation ?? [0, 0, 0, 1]),
          new Vector3().fromArray(box.size),
        );
        hull.current.setMatrixAt(i, matrix);
        hull.current.setColorAt(
          i,
          new Color(box.role === 'hangar' ? '#758c98' : box.role === 'arm' ? '#a58e65' : '#8992a2'),
        );
      }
      hull.current.instanceMatrix.needsUpdate = true;
      if (hull.current.instanceColor) hull.current.instanceColor.needsUpdate = true;
      hull.current.computeBoundingSphere();
    }
    return () => {
      resources.geometry.dispose();
      resources.material.dispose();
      resources.texture.dispose();
    };
  }, [station, resources]);
  useFrame(() => {
    const object = group.current;
    if (!object) return;
    const pose = stationPose(session.exploration.world, station);
    object.position.copy(pose.position).sub(session.origin.position);
    object.quaternion.copy(pose.orientation);
    const distance = pose.position.distanceTo(session.position);
    object.visible = distance < 500000;
    if (!object.visible) object.position.set(0, 0, 0);
    if (details.current) details.current.visible = distance < 12000;
  });
  return (
    <group ref={group}>
      <instancedMesh
        ref={hull}
        args={[resources.geometry, resources.material, station.boxes.length]}
        dispose={null}
      />
      {station.type === 'orbital' && (
        <mesh position={[0, 110, -230]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[260, 12, 8, 64]} />
          <meshStandardMaterial color="#7f95a0" metalness={0.7} roughness={0.5} />
        </mesh>
      )}
      <group ref={details}>
        <mesh position={[0, 100, station.type === 'orbital' ? 242 : 5]}>
          <planeGeometry args={[150, 19]} />
          <meshBasicMaterial map={resources.texture} />
        </mesh>
        {station.ports.map((port) => (
          <group key={port.id} position={[...port.position]} quaternion={[...port.orientation]}>
            <mesh position={[0, -4.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[10, 11, 32]} />
              <meshBasicMaterial color="#8de8ec" />
            </mesh>
            <mesh position={[-14, -4.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[2, 25]} />
              <meshBasicMaterial color="#eac76b" />
            </mesh>
            <mesh position={[14, -4.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[2, 25]} />
              <meshBasicMaterial color="#eac76b" />
            </mesh>
            {[0, 1, 2, 3].map((i) => (
              <mesh key={i} position={[(i % 2 ? 1 : -1) * 20, 12, Math.floor(i / 2) * 60]}>
                <boxGeometry args={[2, 2, 3]} />
                <meshBasicMaterial color="#f2c567" />
              </mesh>
            ))}
          </group>
        ))}
        {station.type === 'orbital' && (
          <>
            <mesh position={[-79, 65, 90]}>
              <boxGeometry args={[2, 2, 280]} />
              <meshBasicMaterial color="#93dcf2" />
            </mesh>
            <mesh position={[79, 65, 90]}>
              <boxGeometry args={[2, 2, 280]} />
              <meshBasicMaterial color="#93dcf2" />
            </mesh>
            <pointLight
              position={[0, 45, 110]}
              color="#b4dcef"
              intensity={18000}
              distance={180}
              decay={2}
            />
          </>
        )}
      </group>
    </group>
  );
}
function DockingGuide({ session }: { session: FlightSession }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    if (!group.current) return;
    const state = session.stationReadout,
      world = session.exploration.world;
    const station = world.definition.stations?.find((p) => p.id === state.stationId),
      port = station?.ports.find((p) => p.id === state.portId);
    group.current.visible = Boolean(
      station && port && ['approaching', 'aligning'].includes(state.phase),
    );
    if (!station || !port) return;
    const pose = portPose(world, station, port);
    group.current.position
      .fromArray(state.waypoint ?? pose.approach.toArray())
      .sub(session.origin.position);
    group.current.quaternion.copy(pose.orientation);
  });
  return (
    <group ref={group}>
      <mesh>
        <ringGeometry args={[16, 16.5, 4]} />
        <meshBasicMaterial color="#eac76b" transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  );
}
export function StationScene({ session }: { session: FlightSession }) {
  return (
    <>
      {session.exploration.world.definition.stations?.map((station) => (
        <Station key={station.id} station={station} session={session} />
      ))}
      <DockingGuide session={session} />
    </>
  );
}
