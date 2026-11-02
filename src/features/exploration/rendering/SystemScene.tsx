import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type DirectionalLight, type HemisphereLight, SphereGeometry, Vector3 } from 'three';
import type { FlightSession } from '@/features/flight/FlightSession';
import { CelestialBody } from '@/features/planets/components/CelestialBody';
import { AtmosphericSky } from '@/features/planets/rendering/AtmosphericSky';
import { CityScene } from '@/features/planets/rendering/CityScene';
import { PlanetGeneration } from '@/features/planets/rendering/PlanetGeneration';
import { PlanetTerrain } from '@/features/planets/rendering/PlanetTerrain';
import { SurfaceFacilities } from '@/features/planets/rendering/SurfaceFacilities';
import { SurfaceInfrastructure } from '@/features/planets/rendering/SurfaceInfrastructure';
import { WeatherEffects } from '@/features/planets/rendering/WeatherEffects';
import { FlightEnvironment } from '@/features/space/components/FlightEnvironment';
import { SpaceBackdrop } from '@/features/space/components/SpaceBackdrop';
import { StationScene } from '@/features/stations/StationScene';

export function SystemScene({ session }: { session: FlightSession }) {
  const world = session.exploration.world;
  const [generation] = useState(() => new PlanetGeneration());
  useEffect(() => {
    generation.start();
    return () => generation.dispose();
  }, [generation]);
  const nearestTerrain = () => {
    const nearest = world.definition.bodies
      .filter((b) => b.terrain)
      .map((body) => ({
        body,
        distance:
          (world.positions.get(body.id)?.distanceTo(session.position) ?? Infinity) / body.radius,
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    return nearest && nearest.distance < 2.5 ? nearest.body.id : null;
  };
  const [detailedBodyId, setDetailedBodyId] = useState<string | null>(nearestTerrain);
  useEffect(() => {
    const update = () => {
      const nearest = world.definition.bodies
        .filter((b) => b.terrain)
        .map((body) => ({
          body,
          distance:
            (world.positions.get(body.id)?.distanceTo(session.position) ?? Infinity) / body.radius,
        }))
        .sort((a, b) => a.distance - b.distance)[0];
      setDetailedBodyId(nearest && nearest.distance < 2.5 ? nearest.body.id : null);
    };
    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [session, world]);
  const [readyBodyId, setReadyBodyId] = useState<string | null>(null);
  useEffect(() => {
    if (detailedBodyId) setReadyBodyId(null);
  }, [detailedBodyId]);
  const geometry = useMemo(() => new SphereGeometry(1, 64, 40), []);
  const light = useRef<DirectionalLight>(null);
  const skyFill = useRef<HemisphereLight>(null);
  const up = useMemo(() => new Vector3(), []);
  const direction = useMemo(() => new Vector3(), []);
  const star = world.definition.bodies.find((body) => body.kind === 'star');
  // Primitive geometry attachments are shared external resources. This component owns disposal.
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    if (!detailedBodyId || readyBodyId === detailedBodyId)
      session.exploration.markArrivalReady(world.definition.id);
    const readout = session.planetaryReadout,
      bodyCenter = readout.bodyId ? world.positions.get(readout.bodyId) : null;
    if (skyFill.current) {
      if (bodyCenter && star) {
        up.copy(session.position).sub(bodyCenter).normalize();
        direction
          .copy(world.positions.get(star.id) ?? bodyCenter)
          .sub(bodyCenter)
          .normalize();
        skyFill.current.position.copy(up);
        skyFill.current.intensity =
          Math.sqrt(readout.density) * (0.12 + Math.max(0, up.dot(direction)) * 0.85);
      } else skyFill.current.intensity = 0;
    }
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
      <hemisphereLight ref={skyFill} color="#c7dbea" groundColor="#737660" intensity={0} />
      {world.definition.bodies.map((body) => (
        <CelestialBody
          key={body.id}
          body={body}
          world={world}
          origin={session.origin}
          geometry={geometry}
          generation={generation}
          detailed={body.id === detailedBodyId}
          surfaceVisible={body.id !== detailedBodyId || readyBodyId !== body.id}
        />
      ))}
      {world.definition.bodies
        .filter((body) => body.id === detailedBodyId)
        .map((body) => (
          <PlanetTerrain
            key={body.id}
            body={body}
            session={session}
            generation={generation}
            onReady={() => setReadyBodyId(body.id)}
          />
        ))}
      {world.definition.bodies
        .filter((body) => body.landingZones?.length)
        .map((body) => (
          <SurfaceFacilities key={body.id} body={body} session={session} />
        ))}
      {world.definition.bodies
        .filter((body) => body.id === detailedBodyId && body.settlements?.length)
        .map((body) => (
          <SurfaceInfrastructure
            key={body.id}
            body={body}
            session={session}
            generation={generation}
          />
        ))}
      <CityScene session={session} />
      <StationScene session={session} />
      <AtmosphericSky session={session} />
      <WeatherEffects session={session} />
      <FlightEnvironment world={world} origin={session.origin} />
    </>
  );
}
