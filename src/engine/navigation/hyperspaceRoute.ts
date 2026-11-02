import { Quaternion, quaternionFromBasis, Vector3 } from '@/engine/math/linear';
import { HYPERSPACE_TIMING, hyperspaceDuration } from '@/engine/navigation/HyperspaceController';
import { maximumTerrainHeight } from '@/engine/planetary/terrain';
import { stationExtent, stationPose, traceStation } from '@/engine/stations/stationGeometry';
import type { StationDefinition } from '@/engine/stations/stationTypes';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import type { CelestialDefinition, StarSystemDefinition } from '@/engine/world/worldTypes';

export function travelDistance(source: StarSystemDefinition, destination: StarSystemDefinition) {
  return new Vector3()
    .fromArray(source.galacticPosition)
    .distanceTo(new Vector3().fromArray(destination.galacticPosition));
}

/** The source remains rendered until commit, including a delayed destination preparation. */
export function departureWindow(source: StarSystemDefinition, destination: StarSystemDefinition) {
  return (
    HYPERSPACE_TIMING.ALIGNMENT +
    HYPERSPACE_TIMING.ACCELERATING +
    Math.max(
      HYPERSPACE_TIMING.preparationTimeout,
      hyperspaceDuration(travelDistance(source, destination)),
    ) +
    1
  );
}

/** Include every ancestor's orbital speed, even for moons of an orbiting planet. */
function orbitalMotion(world: SystemRuntime, body: CelestialDefinition, seconds: number) {
  let motion = 0;
  let ancestor: CelestialDefinition | undefined = body;
  while (ancestor) {
    if (ancestor.orbit) motion += (Math.PI * 2 * ancestor.orbit.radius) / ancestor.orbit.period;
    const parentId: string | undefined = ancestor.parentId;
    ancestor = world.definition.bodies.find((candidate) => candidate.id === parentId);
  }
  return motion * seconds;
}

export function jumpBodyRadius(world: SystemRuntime, body: CelestialDefinition, seconds: number) {
  return (
    Math.max(
      body.radius + maximumTerrainHeight(body),
      body.radius * (body.rings?.outer ?? 1),
      body.radius * (body.atmosphere?.scale ?? 1),
      body.radius + (body.atmosphere?.height ?? 0),
    ) +
    orbitalMotion(world, body, seconds) +
    200
  );
}

/** A moving facility stays within this sphere even while its boxes rotate. */
export function jumpStationBounds(
  world: SystemRuntime,
  station: StationDefinition,
  seconds: number,
) {
  const pose = stationPose(world, station);
  const extent = stationExtent(station);
  const parent = world.definition.bodies.find((body) => body.id === station.parentId);
  let motion = parent ? orbitalMotion(world, parent, seconds) : 0;
  if (station.orbit)
    motion += ((Math.PI * 2 * station.orbit.radius) / station.orbit.period) * seconds;
  if (station.surfaceAnchor && parent)
    motion +=
      Math.abs(parent.rotation.speed) *
      (parent.radius + station.surfaceAnchor.elevation + extent) *
      seconds;
  return { center: pose.position, radius: extent + motion + 80, moving: motion > 0 };
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
  seconds = HYPERSPACE_TIMING.ALIGNMENT + HYPERSPACE_TIMING.ACCELERATING,
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
  if (stationHit) {
    const station = world.definition.stations?.find(
      (candidate) => candidate.id === stationHit.stationId,
    );
    if (station) return { ...station, kind: 'station' as const };
  }
  for (const station of world.definition.stations ?? []) {
    const bounds = jumpStationBounds(world, station, seconds);
    if (!bounds.moving) continue;
    const along = Math.max(
      0,
      Math.min(distance, offset.copy(bounds.center).sub(start).dot(direction)),
    );
    if (
      closest.copy(start).addScaledVector(direction, along).distanceToSquared(bounds.center) <
      bounds.radius ** 2
    )
      return { ...station, kind: 'station' as const };
  }
  return null;
}

/** Prefer the galactic bearing, then bounded outward cones for a clear real-space launch. */
export function planDepartureDirection(
  world: SystemRuntime,
  start: Readonly<Vector3>,
  route: Readonly<Vector3>,
  distance: number,
  horizon: number,
) {
  if (!departureObstruction(world, start, route, distance, horizon))
    return new Vector3().copy(route);
  // A heading cannot clear an atmosphere/facility that already contains the launch point.
  if (departureObstruction(world, start, route, 0, horizon)) return null;
  const orientation = routeOrientation(route);
  const right = new Vector3(1, 0, 0).applyQuaternion(orientation);
  const up = new Vector3(0, 1, 0).applyQuaternion(orientation);
  const direction = new Vector3();
  for (let cone = 1; cone <= 5; cone += 1) {
    const angle = (cone * Math.PI) / 6;
    for (let spoke = 0; spoke < 8; spoke += 1) {
      const around = (spoke * Math.PI) / 4;
      direction
        .copy(route)
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(right, Math.sin(angle) * Math.cos(around))
        .addScaledVector(up, Math.sin(angle) * Math.sin(around))
        .normalize();
      if (!departureObstruction(world, start, direction, distance, horizon)) return direction;
    }
  }
  direction.copy(route).negate();
  return departureObstruction(world, start, direction, distance, horizon) ? null : direction;
}

/** Final pose near the anchor; the entire incoming coast is checked behind this endpoint. */
export function routeArrival(
  world: SystemRuntime,
  direction: { readonly x: number; readonly y: number; readonly z: number },
  coastDistance: number,
  horizon = HYPERSPACE_TIMING.EXITING + HYPERSPACE_TIMING.preparationTimeout,
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
    const distance = Math.max(4800, anchor.radius * 0.55) + attempt * 2200;
    position.copy(center).addScaledVector(direction, -distance);
    const lateralClearance = jumpBodyRadius(world, anchor, horizon) + 22000;
    position.addScaledVector(right, lateralClearance);
    position.addScaledVector(up, 2500 + attempt * 500);
    // Both offline and multiplayer present the lead-in behind this final holding point.
    const start = position.clone().addScaledVector(direction, -coastDistance);
    if (!departureObstruction(world, start, direction, coastDistance + 1000, horizon))
      return { position, orientation };
  }
  throw new Error('No clear arrival corridor was found.');
}
