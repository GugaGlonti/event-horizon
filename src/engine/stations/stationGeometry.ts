import { Quaternion, Vector3 } from '@/engine/math/linear';
import { sweepSphere } from '@/engine/physics/spheres';
import { orbitalOffset, type SystemRuntime } from '@/engine/world/SystemRuntime';
import type { DockingPortDefinition, StationDefinition } from './stationTypes';

export function stationPose(world: SystemRuntime, station: StationDefinition) {
  const position = new Vector3().fromArray(station.position);
  if (station.orbit) position.add(orbitalOffset(station.orbit, world.time, new Vector3()));
  if (station.parentId) {
    const parent = world.positions.get(station.parentId);
    if (parent) position.add(parent);
  }
  const velocity = new Vector3();
  const addOrbit = (orbit: NonNullable<StationDefinition['orbit']>) => {
    const angle = orbit.phase + (world.time * Math.PI * 2) / orbit.period,
      rate = (orbit.radius * Math.PI * 2) / orbit.period;
    velocity.add(
      new Vector3(
        -Math.sin(angle) * rate,
        Math.cos(angle) * rate * Math.sin(orbit.inclination),
        Math.cos(angle) * rate * Math.cos(orbit.inclination),
      ),
    );
  };
  if (station.orbit) addOrbit(station.orbit);
  let parent = station.parentId;
  while (parent) {
    const body = world.definition.bodies.find((b) => b.id === parent);
    if (body?.orbit) addOrbit(body.orbit);
    parent = body?.parentId;
  }
  return { position, velocity, orientation: new Quaternion().fromArray(station.orientation) };
}
export function portPose(
  world: SystemRuntime,
  station: StationDefinition,
  port: DockingPortDefinition,
) {
  const pose = stationPose(world, station);
  return {
    velocity: pose.velocity,
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
const colliderCache = new WeakMap<
  StationDefinition,
  {
    extent: number;
    boxes: { center: Vector3; half: Vector3; rotation: Quaternion; inverse: Quaternion }[];
  }
>();
function colliders(station: StationDefinition) {
  const existing = colliderCache.get(station);
  if (existing) return existing;
  const boxes = station.boxes.map((box) => {
    const rotation = new Quaternion().fromArray(box.orientation ?? [0, 0, 0, 1]);
    return {
      center: new Vector3().fromArray(box.center),
      half: new Vector3().fromArray(box.size).multiplyScalar(0.5),
      rotation,
      inverse: rotation.clone().invert(),
    };
  });
  const data = {
    extent: Math.max(...boxes.map((box) => box.center.length() + box.half.length())),
    boxes,
  };
  colliderCache.set(station, data);
  return data;
}
/** Continuous sphere/expanded oriented-box sweep. Cached shapes, no per-box allocation. */
export function traceStation(
  world: SystemRuntime,
  start: Readonly<Vector3>,
  end: Readonly<Vector3>,
  radius: number,
  dt = 0,
) {
  let hit: { fraction: number; normal: Vector3; stationId: string; velocity: Vector3 } | null =
    null;
  const from = new Vector3(),
    boxDelta = new Vector3(),
    normal = new Vector3();
  for (const station of world.definition.stations ?? []) {
    const pose = stationPose(world, station),
      inverse = pose.orientation.clone().invert(),
      data = colliders(station);
    const local = new Vector3()
      .subVectors(start, pose.position)
      .addScaledVector(pose.velocity, dt)
      .applyQuaternion(inverse);
    const delta = new Vector3()
      .subVectors(end, start)
      .addScaledVector(pose.velocity, -dt)
      .applyQuaternion(inverse);
    if (
      sweepSphere(local.x, local.y, local.z, delta.x, delta.y, delta.z, data.extent + radius) ===
      null
    )
      continue;
    for (const box of data.boxes) {
      from.copy(local).sub(box.center).applyQuaternion(box.inverse);
      boxDelta.copy(delta).applyQuaternion(box.inverse);
      let enter = 0,
        exit = 1,
        axis = -1,
        sign = 1,
        inside = true,
        nearest = Infinity,
        nearestAxis = 0,
        nearestSign = 1,
        valid = true;
      for (let i = 0; i < 3; i++) {
        const p = i === 0 ? from.x : i === 1 ? from.y : from.z;
        const d = i === 0 ? boxDelta.x : i === 1 ? boxDelta.y : boxDelta.z;
        const h = (i === 0 ? box.half.x : i === 1 ? box.half.y : box.half.z) + radius;
        if (Math.abs(p) > h) inside = false;
        if (h - Math.abs(p) < nearest) {
          nearest = h - Math.abs(p);
          nearestAxis = i;
          nearestSign = Math.sign(p) || 1;
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
      if (!valid || enter > 1 || exit < 0 || enter < 0) continue;
      if (inside) {
        axis = nearestAxis;
        sign = nearestSign;
        const motion = axis === 0 ? boxDelta.x : axis === 1 ? boxDelta.y : boxDelta.z;
        if (motion * sign >= -1e-10) continue;
      }
      if (axis < 0 || (hit && enter >= hit.fraction)) continue;
      normal
        .set(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0)
        .applyQuaternion(box.rotation)
        .applyQuaternion(pose.orientation);
      hit = {
        fraction: enter,
        normal: normal.clone(),
        stationId: station.id,
        velocity: pose.velocity,
      };
    }
  }
  return hit;
}
