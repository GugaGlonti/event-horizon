import { Quaternion, Vector3 } from '@/engine/math/linear';
import { orbitalOffset, type SystemRuntime } from '@/engine/world/SystemRuntime';
import type { DockingPortDefinition, StationDefinition } from './stationTypes';

export function stationPose(world: SystemRuntime, station: StationDefinition) {
  const position = new Vector3().fromArray(station.position);
  if (station.orbit) position.add(orbitalOffset(station.orbit, world.time, new Vector3()));
  if (station.parentId) {
    const parent = world.positions.get(station.parentId);
    if (parent) position.add(parent);
  }
  return { position, orientation: new Quaternion().fromArray(station.orientation) };
}
export function portPose(
  world: SystemRuntime,
  station: StationDefinition,
  port: DockingPortDefinition,
) {
  const pose = stationPose(world, station);
  return {
    position: new Vector3()
      .fromArray(port.position)
      .applyQuaternion(pose.orientation)
      .add(pose.position),
    approach: new Vector3()
      .fromArray(port.approach)
      .applyQuaternion(pose.orientation)
      .add(pose.position),
    orientation: pose.orientation.clone().multiply(new Quaternion().fromArray(port.orientation)),
  };
}
/** Continuous sphere/expanded oriented-box sweep, including initial overlaps. */
export function traceStation(
  world: SystemRuntime,
  start: Readonly<Vector3>,
  end: Readonly<Vector3>,
  radius: number,
) {
  let hit: { fraction: number; normal: Vector3; stationId: string } | null = null;
  for (const station of world.definition.stations ?? []) {
    const pose = stationPose(world, station),
      inverse = pose.orientation.clone().invert();
    const local = new Vector3().subVectors(start, pose.position).applyQuaternion(inverse);
    const delta = new Vector3().subVectors(end, start).applyQuaternion(inverse);
    for (const box of station.boxes) {
      const from = local.clone().sub(new Vector3().fromArray(box.center));
      const half = box.size.map((v) => v / 2 + radius);
      const coords = from.toArray(),
        motion = delta.toArray();
      let enter = 0,
        exit = 1,
        axis = -1,
        sign = 1,
        inside = true,
        depth = Infinity;
      let valid = true;
      for (let i = 0; i < 3; i++) {
        const p = coords[i] ?? 0,
          d = motion[i] ?? 0,
          h = half[i] ?? 0;
        if (Math.abs(p) > h) inside = false;
        if (h - Math.abs(p) < depth) {
          depth = h - Math.abs(p);
          if (inside) {
            axis = i;
            sign = Math.sign(p) || 1;
          }
        }
        if (Math.abs(d) < 1e-12) {
          if (Math.abs(p) > h) {
            valid = false;
            break;
          }
          continue;
        }
        const a = (-h - p) / d,
          b = (h - p) / d,
          near = Math.min(a, b),
          far = Math.max(a, b);
        if (near > enter) {
          enter = near;
          axis = i;
          sign = d > 0 ? -1 : 1;
        }
        exit = Math.min(exit, far);
        if (enter > exit) {
          valid = false;
          break;
        }
      }
      if (!valid || enter > 1 || exit < 0 || enter < 0 || axis < 0) continue;
      const normal = new Vector3()
        .fromArray([axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0])
        .applyQuaternion(pose.orientation);
      if (inside && delta.dot(new Vector3().copy(normal).applyQuaternion(inverse)) >= 0) continue;
      if (!hit || enter < hit.fraction) hit = { fraction: enter, normal, stationId: station.id };
    }
  }
  return hit;
}
