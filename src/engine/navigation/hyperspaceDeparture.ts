import { Quaternion, Vector3 } from '@/engine/math/linear';
import { HYPERSPACE_TIMING } from '@/engine/navigation/HyperspaceController';
import {
  departureObstruction,
  jumpBodyRadius,
  routeOrientation,
} from '@/engine/navigation/hyperspaceRoute';
import { stationPose, traceStation } from '@/engine/stations/stationGeometry';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';

/** Find the shortest clear local escape among bounded capsule-boundary candidates.
 * A launch point is outside every obstacle swept backwards along the departure lane.
 * Suggestions never steer or move the ship, and the actual launch is revalidated.
 */
export function findDepartureWaypoint(
  world: SystemRuntime,
  start: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  distance: number,
) {
  const horizon = HYPERSPACE_TIMING.CHARGING + HYPERSPACE_TIMING.ACCELERATING;
  const volumes = world.definition.bodies.flatMap((body) => {
    const center = world.positions.get(body.id);
    return center ? [{ center, radius: jumpBodyRadius(world, body, horizon) + 150 }] : [];
  });
  for (const station of world.definition.stations ?? []) {
    const pose = stationPose(world, station);
    const extent = Math.max(
      0,
      ...station.boxes.map(
        (box) =>
          new Vector3().fromArray(box.center).length() +
          new Vector3().fromArray(box.size).length() / 2,
      ),
    );
    volumes.push({
      center: pose.position,
      radius: extent + pose.velocity.length() * horizon + 230,
    });
  }
  const orientation = routeOrientation(direction);
  const right = new Vector3(1, 0, 0).applyQuaternion(orientation);
  const up = new Vector3(0, 1, 0).applyQuaternion(orientation);
  const closest = new Vector3();
  const outward = new Vector3();
  let best: Vector3 | null = null;
  let shortest = Infinity;
  for (let seed = 0; seed < 10; seed++) {
    const point = new Vector3().copy(start);
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (const volume of volumes) {
        const along = Math.max(
          0,
          Math.min(distance, new Vector3().subVectors(volume.center, point).dot(direction)),
        );
        closest.copy(volume.center).addScaledVector(direction, -along);
        outward.subVectors(point, closest);
        if (outward.lengthSq() >= volume.radius ** 2) continue;
        if (seed === 1) outward.copy(direction).negate();
        else if (seed > 1) {
          outward
            .normalize()
            .addScaledVector(right, Math.cos((seed * Math.PI) / 4) * 0.6)
            .addScaledVector(up, Math.sin((seed * Math.PI) / 4) * 0.6);
        }
        if (outward.lengthSq() < 1e-9) outward.copy(direction).negate();
        point.copy(closest).addScaledVector(outward.normalize(), volume.radius + 1);
        moved = true;
      }
      if (!moved) break;
    }
    const length = point.distanceTo(start);
    if (length >= shortest || departureObstruction(world, point, direction, distance)) continue;
    const delta = new Vector3().subVectors(point, start);
    const heading = delta.clone().normalize();
    const clear = volumes.every(({ center, radius }) => {
      const offset = new Vector3().subVectors(start, center);
      // A pilot already within the atmosphere can leave it continuously.
      if (offset.lengthSq() < radius ** 2) return offset.dot(delta) >= 0;
      const along = Math.max(0, Math.min(length, -offset.dot(heading)));
      return (
        closest.copy(start).addScaledVector(heading, along).distanceToSquared(center) >= radius ** 2
      );
    });
    if (!clear || traceStation(world, start, point, 20)) continue;
    shortest = length;
    best = point;
  }
  return best;
}

export function departureBearing(
  start: Readonly<Vector3>,
  orientation: Readonly<Quaternion>,
  waypoint: Readonly<Vector3>,
) {
  const local = new Vector3()
    .subVectors(waypoint, start)
    .normalize()
    .applyQuaternion(new Quaternion().copy(orientation).invert());
  let x = local.x / Math.max(0.12, -local.z);
  const y = -local.y / Math.max(0.12, -local.z);
  if (local.z > 0 && Math.abs(x) + Math.abs(y) < 0.001) x = 1;
  const edge = Math.max(1, Math.abs(x), Math.abs(y));
  return { bearingX: x / edge, bearingY: y / edge, behind: local.z > 0 };
}
