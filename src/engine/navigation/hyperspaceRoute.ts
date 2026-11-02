import { Quaternion, quaternionFromBasis, Vector3 } from '@/engine/math/linear';
import { HYPERSPACE_TIMING } from '@/engine/navigation/HyperspaceController';
import { maximumTerrainHeight } from '@/engine/planetary/terrain';
import { traceStation } from '@/engine/stations/stationGeometry';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import type { CelestialDefinition, StarSystemDefinition } from '@/engine/world/worldTypes';

export function travelDistance(source: StarSystemDefinition, destination: StarSystemDefinition) {
  return new Vector3()
    .fromArray(source.galacticPosition)
    .distanceTo(new Vector3().fromArray(destination.galacticPosition));
}

/** Include every ancestor's orbital speed, even for moons of an orbiting planet. */
export function jumpBodyRadius(world: SystemRuntime, body: CelestialDefinition, seconds: number) {
  let motion = 0;
  let ancestor: CelestialDefinition | undefined = body;
  while (ancestor) {
    if (ancestor.orbit) motion += (Math.PI * 2 * ancestor.orbit.radius) / ancestor.orbit.period;
    const parentId: string | undefined = ancestor.parentId;
    ancestor = world.definition.bodies.find((candidate) => candidate.id === parentId);
  }
  return (
    Math.max(
      body.radius + maximumTerrainHeight(body),
      body.radius * (body.rings?.outer ?? 1),
      body.radius * (body.atmosphere?.scale ?? 1),
      body.radius + (body.atmosphere?.height ?? 0),
    ) +
    motion * seconds +
    200
  );
}

export function travelDirection(
  source: StarSystemDefinition,
  destination: StarSystemDefinition,
  out = new Vector3(),
) {
  out.fromArray(destination.galacticPosition).sub(new Vector3().fromArray(source.galacticPosition));
  if (out.lengthSq() < 1e-12) throw new Error('The flight plan needs distinct galactic positions.');
  return out.normalize();
}

/** Stable, level orientation with local forward -Z, including near-vertical routes. */
export function routeOrientation(
  direction: { readonly x: number; readonly y: number; readonly z: number },
  out = new Quaternion(),
) {
  const up = Math.abs(direction.y) > 0.99 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const z = new Vector3().copy(direction).normalize().negate();
  const x = new Vector3().crossVectors(up, z).normalize();
  const y = new Vector3().crossVectors(z, x);
  return quaternionFromBasis(out, x, y, z);
}

/** A conservative sweep covers the whole cinematic, its camera, terrain and moving ancestors. */
export function departureObstruction(
  world: SystemRuntime,
  start: Readonly<Vector3>,
  direction: { readonly x: number; readonly y: number; readonly z: number },
  distance: number,
  seconds = HYPERSPACE_TIMING.CHARGING + HYPERSPACE_TIMING.ACCELERATING,
) {
  const offset = new Vector3();
  const closest = new Vector3();
  for (const body of world.definition.bodies) {
    const center = world.positions.get(body.id);
    if (!center) continue;
    const radius = jumpBodyRadius(world, body, seconds);
    offset.copy(center).sub(start);
    const along = Math.max(0, Math.min(distance, offset.dot(direction)));
    closest.copy(start).addScaledVector(direction, along);
    if (closest.distanceToSquared(center) < radius * radius) return body;
  }
  const stationHit = traceStation(
    world,
    start,
    new Vector3().copy(start).addScaledVector(direction, distance),
    80,
  );
  const movingHit =
    stationHit ??
    traceStation(
      world,
      start,
      new Vector3().copy(start).addScaledVector(direction, distance),
      80,
      seconds,
    );
  if (movingHit) {
    const station = world.definition.stations?.find(
      (candidate) => candidate.id === movingHit.stationId,
    );
    if (station) return { ...station, kind: 'station' as const };
  }
  return null;
}

/** Approach from the source-facing side. A lateral offset keeps the destination off the reticle. */
export function routeArrival(
  world: SystemRuntime,
  direction: { readonly x: number; readonly y: number; readonly z: number },
  coastDistance: number,
) {
  const anchor = world.definition.bodies.find(
    (body) => body.id === world.definition.defaultTargetId,
  );
  const center = anchor && world.positions.get(anchor.id);
  if (!anchor || !center) throw new Error('The destination has no arrival anchor.');
  const orientation = routeOrientation(direction);
  const right = new Vector3(1, 0, 0).applyQuaternion(orientation);
  const up = new Vector3(0, 1, 0).applyQuaternion(orientation);
  const position = new Vector3();
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const distance = Math.max(4800, coastDistance + 3000) + attempt * 2200;
    position.copy(center).addScaledVector(direction, -distance);
    const horizon = HYPERSPACE_TIMING.EXITING + HYPERSPACE_TIMING.preparationTimeout;
    const lateralClearance = jumpBodyRadius(world, anchor, horizon) + 22000;
    position.addScaledVector(right, lateralClearance);
    position.addScaledVector(up, 2500 + attempt * 500);
    // Multiplayer presents the lead-in *behind* its authoritative holding point.
    const start = position.clone().addScaledVector(direction, -coastDistance);
    if (!departureObstruction(world, start, direction, coastDistance * 2 + 1000, horizon))
      return { position, orientation };
  }
  throw new Error('No clear arrival corridor was found.');
}
