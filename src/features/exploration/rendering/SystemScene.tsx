import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type DirectionalLight, SphereGeometry, Vector3 } from 'three';
import type { FlightSession } from '@/features/flight/FlightSession';
import { CelestialBody } from '@/features/planets/components/CelestialBody';
import { AtmosphericSky } from '@/features/planets/rendering/AtmosphericSky';
import { PlanetTerrain } from '@/features/planets/rendering/PlanetTerrain';
import { SurfaceFacilities } from '@/features/planets/rendering/SurfaceFacilities';
import { FlightEnvironment } from '@/features/space/components/FlightEnvironment';
import { SpaceBackdrop } from '@/features/space/components/SpaceBackdrop';
import { StationScene } from '@/features/stations/StationScene';

export function SystemScene({ session }: { session: FlightSession }) {
  const world = session.exploration.world;
  const geometry = useMemo(() => new SphereGeometry(1, 64, 40), []);
  const light = useRef<DirectionalLight>(null);
  const direction = useMemo(() => new Vector3(), []);
  const star = world.definition.bodies.find((body) => body.kind === 'star');
  // Primitive geometry attachments are shared external resources. This component owns disposal.
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    session.exploration.markArrivalReady(world.definition.id);
    if (!light.current || !star) return;
    direction
      .copy(world.positions.get(star.id) ?? direction)
      .sub(session.position)
      .normalize();
    light.current.position.copy(session.renderPosition).addScaledVector(direction, 1000);
    light.current.target.position.copy(session.renderPosition);
    light.current.target.updateMatrixWorld();
  });
  return (
    <>
      <SpaceBackdrop environment={world.definition.environment} />
      <ambientLight color="#a9bbde" intensity={world.definition.environment.ambient} />
      <directionalLight ref={light} color={star?.surface.palette[0] ?? '#ffffff'} intensity={2.3} />
      <directionalLight position={[0, 2000, 5000]} color="#7eafce" intensity={0.25} />
      {world.definition.bodies.map((body) => (
        <CelestialBody
          key={body.id}
          body={body}
          world={world}
          origin={session.origin}
          geometry={geometry}
        />
      ))}
      {world.definition.bodies
        .filter((body) => body.terrain)
        .map((body) => (
          <PlanetTerrain key={body.id} body={body} session={session} />
        ))}
      {world.definition.bodies
        .filter((body) => body.landingZones?.length)
        .map((body) => (
          <SurfaceFacilities key={body.id} body={body} session={session} />
        ))}
      <StationScene session={session} />
      <AtmosphericSky session={session} />
      <FlightEnvironment world={world} origin={session.origin} />
    </>
  );
}
