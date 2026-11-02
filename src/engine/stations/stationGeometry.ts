import { Quaternion, Vector3 } from '@/engine/math/linear';
import { sweepSphere } from '@/engine/physics/spheres';
import { bodyRotation, surfaceDirection, tangentFrame } from '@/engine/planetary/coordinates';
import { orbitalOffset, type SystemRuntime } from '@/engine/world/SystemRuntime';
import type { DockingPortDefinition, StationDefinition } from './stationTypes';

export function stationPose(world: SystemRuntime, station: StationDefinition) {
  const position = new Vector3().fromArray(station.position);
  if (station.orbit) position.add(orbitalOffset(station.orbit, world.time, new Vector3()));
  if (station.parentId) {
    const parent = world.positions.get(station.parentId);
    if (parent) position.add(parent);
  }
  const velocity = new Vector3(),
    angularVelocity = new Vector3();
  let orientation = new Quaternion().fromArray(station.orientation);
  if (station.surfaceAnchor) {
    const body = world.definition.bodies.find((b) => b.id === station.parentId);
    const center = body && world.positions.get(body.id);
    if (body && center) {
      const local = surfaceDirection(
        station.surfaceAnchor.latitude,
        station.surfaceAnchor.longitude,
      );
      const rotation = bodyRotation(body, world.time);
      position
        .copy(local)
        .multiplyScalar(body.radius + station.surfaceAnchor.elevation)
        .applyQuaternion(rotation)
        .add(center);
      orientation = rotation.clone().multiply(tangentFrame(local)).multiply(orientation);
      angularVelocity
        .set(0, body.rotation.speed, 0)
        .applyQuaternion(
          new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), body.rotation.tilt),
        );
      velocity.crossVectors(angularVelocity, new Vector3().subVectors(position, center));
    }
  }
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
  return { position, velocity, orientation, angularVelocity };
}
export function portPose(
  world: SystemRuntime,
  station: StationDefinition,
  port: DockingPortDefinition,
) {
  const pose = stationPose(world, station);
  return {
    velocity: pose.velocity.add(
      new Vector3().crossVectors(
        pose.angularVelocity,
        new Vector3().fromArray(port.position).applyQuaternion(pose.orientation),
      ),
    ),
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
    boxes: {
      center: Vector3;
      half: Vector3;
      rotation: Quaternion;
      inverse: Quaternion;
      bounds: Vector3;
      padding: Vector3;
    }[];
  }
>();
function colliders(station: StationDefinition) {
  const existing = colliderCache.get(station);
  if (existing) return existing;
  const boxes = station.boxes.map((box) => {
    const rotation = new Quaternion().fromArray(box.orientation ?? [0, 0, 0, 1]);
    const half = new Vector3().fromArray(box.size).multiplyScalar(0.5);
    const east = new Vector3(1, 0, 0).applyQuaternion(rotation),
      up = new Vector3(0, 1, 0).applyQuaternion(rotation),
      south = new Vector3(0, 0, 1).applyQuaternion(rotation);
    const bounds = new Vector3(
      Math.abs(east.x) * half.x + Math.abs(up.x) * half.y + Math.abs(south.x) * half.z,
      Math.abs(east.y) * half.x + Math.abs(up.y) * half.y + Math.abs(south.y) * half.z,
      Math.abs(east.z) * half.x + Math.abs(up.z) * half.y + Math.abs(south.z) * half.z,
    );
    const padding = new Vector3(
      Math.abs(east.x) + Math.abs(up.x) + Math.abs(south.x),
      Math.abs(east.y) + Math.abs(up.y) + Math.abs(south.y),
      Math.abs(east.z) + Math.abs(up.z) + Math.abs(south.z),
    );
    return {
      center: new Vector3().fromArray(box.center),
      half,
      bounds,
      padding,
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
export function stationExtent(station: StationDefinition) {
  return colliders(station).extent;
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
    const minX = Math.min(local.x, local.x + delta.x),
      maxX = Math.max(local.x, local.x + delta.x);
    const minY = Math.min(local.y, local.y + delta.y),
      maxY = Math.max(local.y, local.y + delta.y);
    const minZ = Math.min(local.z, local.z + delta.z),
      maxZ = Math.max(local.z, local.z + delta.z);
    for (const box of data.boxes) {
      // Bounds include the existing expanded OBB's rotated corner padding, not just a sphere.
      const hx = box.bounds.x + box.padding.x * radius + 1e-6,
        hy = box.bounds.y + box.padding.y * radius + 1e-6,
        hz = box.bounds.z + box.padding.z * radius + 1e-6;
      if (
        minX > box.center.x + hx ||
        maxX < box.center.x - hx ||
        minY > box.center.y + hy ||
        maxY < box.center.y - hy ||
        minZ > box.center.z + hz ||
        maxZ < box.center.z - hz
      )
        continue;
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
