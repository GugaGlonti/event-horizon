import { Matrix4, Quaternion, Vector3 } from 'three';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import type { StarSystemDefinition } from '@/engine/world/worldTypes';

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
export function routeOrientation(direction: Readonly<Vector3>, out = new Quaternion()) {
  const up = Math.abs(direction.y) > 0.99 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  return out.setFromRotationMatrix(new Matrix4().lookAt(new Vector3(), direction, up));
}

/** Swept corridor including rings, atmosphere and six seconds of possible moon displacement. */
export function departureObstruction(
  world: SystemRuntime,
  start: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  distance: number,
) {
  const offset = new Vector3();
  const closest = new Vector3();
  for (const body of world.definition.bodies) {
    const center = world.positions.get(body.id);
    if (!center) continue;
    const extent = body.radius * Math.max(body.rings?.outer ?? 1, body.atmosphere?.scale ?? 1);
    const orbitalTravel = body.orbit
      ? (Math.PI * 2 * body.orbit.radius * 6) / body.orbit.period
      : 0;
    const radius = extent + orbitalTravel + 180;
    offset.copy(center).sub(start);
    const along = Math.max(0, Math.min(distance, offset.dot(direction)));
    closest.copy(start).addScaledVector(direction, along);
    if (closest.distanceToSquared(center) < radius * radius) return body;
  }
  return null;
}

/** Approach from the source-facing side. A lateral offset keeps the destination off the reticle. */
export function routeArrival(
  world: SystemRuntime,
  direction: Readonly<Vector3>,
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
    const distance = Math.max(4800, anchor.radius * 7) + attempt * 2200;
    position.copy(center).addScaledVector(direction, -distance);
    const lateralClearance = anchor.radius * Math.max(1.7, (anchor.rings?.outer ?? 1) * 1.25);
    position.addScaledVector(right, lateralClearance);
    position.addScaledVector(up, anchor.radius * 0.45 + attempt * 500);
    if (!departureObstruction(world, position, direction, coastDistance + 1000))
      return { position, orientation };
  }
  throw new Error('No clear arrival corridor was found.');
}
