import { Quaternion, Vector3 } from '@/engine/math/linear';
import type { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import { bodyRotation, surfaceDirection, tangentFrame } from '@/engine/planetary/coordinates';
import { terrainHeight } from '@/engine/planetary/terrain';
import { portPose, stationPose } from '@/engine/stations/stationGeometry';
export const verificationScenarios = [
  'deep',
  'orbit',
  'entry',
  'descent',
  'low',
  'land',
  'station',
  'hangar',
  'city',
  'city-pad',
  'coast',
  'forest',
  'ridge',
] as const;
export type VerificationScenario = (typeof verificationScenarios)[number];
/** Server-side test fixtures only. No client action can call this function. */
export function placeVerificationPilots(world: MultiplayerWorld, scenario: VerificationScenario) {
  const body =
    world.system.definition.bodies.find((p) => p.landable) ??
    world.system.definition.bodies.find((p) => p.id === world.system.definition.defaultTargetId);
  const zone = body?.landingZones?.[0],
    center = body && world.system.positions.get(body.id),
    station =
      scenario === 'city' || scenario === 'city-pad'
        ? world.system.definition.stations?.find(
            (s) => s.type === 'surface' && s.parentId === body?.id,
          )
        : world.system.definition.stations?.[0],
    port = station?.ports[0];
  if (!body || !center) return false;
  world.encounter.clear();
  for (const [id, ship] of world.simulation.ships)
    if (ship.team === 'hostile') world.simulation.ships.delete(id);
  let i = 0;
  for (const pilot of world.pilots.values()) {
    const ship = pilot.ship;
    world.simulation.stations?.remove(pilot.id);
    pilot.inputs.clear();
    const reference =
      scenario === 'coast'
        ? [-0.035, 2.27]
        : scenario === 'forest'
          ? [0.015, 2.26]
          : scenario === 'ridge'
            ? [0.025, 2.22]
            : null;
    const up = surfaceDirection(
        reference?.[0] ?? zone?.latitude ?? 0,
        reference?.[1] ?? zone?.longitude ?? 0,
      ),
      orientation = tangentFrame(up);
    const east = new Vector3(1, 0, 0).applyQuaternion(orientation),
      north = new Vector3(0, 0, -1).applyQuaternion(orientation);
    const altitude =
      scenario === 'coast'
        ? 400
        : scenario === 'forest'
          ? 120
          : scenario === 'ridge'
            ? 350
            : scenario === 'deep'
              ? 400000
              : scenario === 'orbit'
                ? 22000
                : scenario === 'descent'
                  ? 6000
                  : scenario === 'entry'
                    ? 13000
                    : scenario === 'low'
                      ? 120
                      : 5.01;
    const direction = up
      .clone()
      .multiplyScalar(body.radius)
      .addScaledVector(east, (i % 4) * 80)
      .addScaledVector(north, Math.floor(i / 4) * 80)
      .normalize();
    const rotation = bodyRotation(body, world.time);
    const point = direction
      .clone()
      .multiplyScalar(body.radius + terrainHeight(body, direction) + altitude)
      .applyQuaternion(rotation)
      .add(center);
    orientation.copy(rotation.clone().multiply(orientation.clone()));
    const angularVelocity = new Vector3(0, body.rotation.speed, 0).applyQuaternion(
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), body.rotation.tilt),
    );
    const velocity = new Vector3().crossVectors(angularVelocity, point.clone().sub(center));
    if (
      (scenario === 'station' ||
        scenario === 'hangar' ||
        scenario === 'city' ||
        scenario === 'city-pad') &&
      station &&
      port
    ) {
      const pose = portPose(world.system, station, port);
      point
        .copy(
          scenario === 'station' || scenario === 'city'
            ? pose.approach
            : pose.position.clone().add(new Vector3(0, 0, 20).applyQuaternion(pose.orientation)),
        )
        .add(new Vector3(i * 70, 0, 0).applyQuaternion(pose.orientation));
      orientation.copy(pose.orientation);
      const facility = stationPose(world.system, station);
      velocity
        .copy(facility.velocity)
        .add(
          new Vector3().crossVectors(
            facility.angularVelocity,
            point.clone().sub(facility.position),
          ),
        );
    }
    ship.controller.relocate(point, orientation);
    ship.controller.resolveMotion(point, velocity);
    ship.controller.landingGear =
      scenario === 'land' || scenario === 'low' || scenario === 'descent';
    if (scenario === 'land')
      ship.controller.resolveMotion(
        point,
        velocity.clone().addScaledVector(up.clone().applyQuaternion(rotation), -1),
      );
    ship.health.hull = 100;
    ship.health.shields = 100;
    ship.health.invulnerability = 120;
    ship.sync();
    ship.previous.copy(point);
    ship.previousOrientation.copy(orientation);
    if ((scenario === 'hangar' || scenario === 'city-pad') && station && port) {
      world.simulation.stations?.request(pilot.id, station.id, port.id);
      world.simulation.stations?.step(1 / 120);
    }
    i++;
  }
  return true;
}

/** Advance a rotating world to a reproducible night at its first settlement, then use city fixture. */
export function setVerificationNight(world: MultiplayerWorld) {
  const body = world.system.definition.bodies.find((body) => body.landable);
  const city = body?.settlements?.[0];
  const star = world.system.definition.bodies.find((body) => body.kind === 'star');
  if (!body || !city || !star || body.rotation.speed === 0) return false;
  const local = surfaceDirection(city.latitude, city.longitude),
    base = world.time,
    period = (Math.PI * 2) / Math.abs(body.rotation.speed);
  let best = Infinity,
    time = base;
  for (let i = 0; i < 128; i++) {
    const candidate = base + (period * i) / 128;
    world.system.update(candidate);
    const center = world.system.positions.get(body.id),
      sun = world.system.positions.get(star.id);
    if (!center || !sun) continue;
    const day = local
      .clone()
      .applyQuaternion(bodyRotation(body, candidate))
      .dot(sun.clone().sub(center).normalize());
    if (day < best) {
      best = day;
      time = candidate;
    }
  }
  world.traffic.clear();
  world.time = time;
  world.system.update(time);
  return placeVerificationPilots(world, 'city');
}
