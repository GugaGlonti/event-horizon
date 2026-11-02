import { Vector3 } from '@/engine/math/linear';
import type { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import { surfaceDirection, tangentFrame } from '@/engine/planetary/coordinates';
import { terrainHeight } from '@/engine/planetary/terrain';
import { portPose } from '@/engine/stations/stationGeometry';
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
    const up = surfaceDirection(zone?.latitude ?? 0, zone?.longitude ?? 0),
      orientation = tangentFrame(up);
    const east = new Vector3(1, 0, 0).applyQuaternion(orientation),
      north = new Vector3(0, 0, -1).applyQuaternion(orientation);
    const altitude =
      scenario === 'deep'
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
    const point = center
      .clone()
      .addScaledVector(direction, body.radius + terrainHeight(body, direction) + altitude);
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
    }
    ship.controller.relocate(point, orientation);
    ship.controller.landingGear =
      scenario === 'land' || scenario === 'low' || scenario === 'descent';
    if (scenario === 'land') ship.controller.resolveMotion(point, up.clone().multiplyScalar(-1));
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
