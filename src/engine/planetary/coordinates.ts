import { Quaternion, quaternionFromBasis, Vector3 } from '@/engine/math/linear';
import type { CelestialDefinition } from '@/engine/world/worldTypes';

export function bodyRotation(body: CelestialDefinition, time: number, out = new Quaternion()) {
  return out
    .setFromAxisAngle(new Vector3(0, 0, 1), body.rotation.tilt)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), time * body.rotation.speed));
}
export function surfaceDirection(latitude: number, longitude: number, out = new Vector3()) {
  return out.set(
    Math.cos(latitude) * Math.cos(longitude),
    Math.sin(latitude),
    Math.cos(latitude) * Math.sin(longitude),
  );
}
export function surfaceCoordinates(direction: Readonly<Vector3>) {
  const length = direction.length() || 1;
  return {
    latitude: Math.asin(Math.max(-1, Math.min(1, direction.y / length))),
    longitude: Math.atan2(direction.z, direction.x),
  };
}
/** Stable at both poles. Columns east/up/south form the ship's local basis. */
export function tangentFrame(up: Readonly<Vector3>, heading = 0, out = new Quaternion()) {
  const east = new Vector3().crossVectors(new Vector3(0, 1, 0), up);
  if (east.lengthSq() < 1e-8) east.crossVectors(new Vector3(0, 0, 1), up);
  east.normalize();
  const south = new Vector3().crossVectors(east, up).normalize();
  quaternionFromBasis(out, east, up, south).normalize();
  return out.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), heading));
}
export function toTangent(
  point: Readonly<Vector3>,
  anchor: Readonly<Vector3>,
  frame: Readonly<Quaternion>,
  out = new Vector3(),
) {
  return out.subVectors(point, anchor).applyQuaternion(new Quaternion().copy(frame).invert());
}
export function fromTangent(
  point: Readonly<Vector3>,
  anchor: Readonly<Vector3>,
  frame: Readonly<Quaternion>,
  out = new Vector3(),
) {
  return out.copy(point).applyQuaternion(frame).add(anchor);
}
