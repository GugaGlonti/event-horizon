import { Vector3 } from '@/engine/math/linear';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import { surfaceDirection } from './coordinates';

const smooth = (t: number) => t * t * (3 - 2 * t);
function hash(x: number, y: number, z: number, seed: number) {
  let value = Math.imul(x ^ seed, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, z: number, seed: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const tx = smooth(x - ix),
    ty = smooth(y - iy),
    tz = smooth(z - iz);
  let sum = 0;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let c = 0; c < 2; c++)
        sum +=
          hash(ix + a, iy + b, iz + c, seed) *
          (a ? tx : 1 - tx) *
          (b ? ty : 1 - ty) *
          (c ? tz : 1 - tz);
  return sum;
}
/** Same bounded continuous 3D field on every cube face and on the authority. */
export function terrainHeight(body: CelestialDefinition, direction: Readonly<Vector3>) {
  const terrain = body.terrain;
  if (!terrain) return 0;
  let amplitude = 1,
    frequency = terrain.frequency,
    sum = 0,
    weight = 0;
  for (let octave = 0; octave < terrain.octaves; octave++) {
    const value = noise(
      direction.x * frequency,
      direction.y * frequency,
      direction.z * frequency,
      terrain.seed + octave * 1013,
    );
    sum += (value * 2 - 1) * amplitude;
    weight += amplitude;
    amplitude *= 0.48;
    frequency *= 2;
  }
  let height = terrain.relief * (0.42 + (sum / weight) * 0.58);
  for (const zone of body.landingZones ?? []) {
    const center = surfaceDirection(zone.latitude, zone.longitude);
    const distance = center.distanceTo(direction) * body.radius;
    const blend = smooth(Math.max(0, Math.min(1, (distance - zone.radius) / zone.radius)));
    height = zone.elevation + (height - zone.elevation) * blend;
  }
  return height;
}
export function terrainPoint(
  body: CelestialDefinition,
  direction: Readonly<Vector3>,
  out = new Vector3(),
) {
  return out.copy(direction).multiplyScalar(body.radius + terrainHeight(body, direction));
}
/** Central differences sample the same field across face and patch boundaries. */
export function terrainNormal(
  body: CelestialDefinition,
  direction: Readonly<Vector3>,
  out = new Vector3(),
) {
  const tangent = new Vector3().crossVectors(new Vector3(0, 1, 0), direction);
  if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
  tangent.normalize();
  const bitangent = new Vector3().crossVectors(direction, tangent).normalize();
  const epsilon = 2 / body.radius;
  const a = terrainPoint(
    body,
    new Vector3().copy(direction).addScaledVector(tangent, epsilon).normalize(),
  );
  const b = terrainPoint(
    body,
    new Vector3().copy(direction).addScaledVector(tangent, -epsilon).normalize(),
  );
  const c = terrainPoint(
    body,
    new Vector3().copy(direction).addScaledVector(bitangent, epsilon).normalize(),
  );
  const d = terrainPoint(
    body,
    new Vector3().copy(direction).addScaledVector(bitangent, -epsilon).normalize(),
  );
  out.crossVectors(a.sub(b), c.sub(d)).normalize();
  if (out.dot(direction) < 0) out.negate();
  return out;
}
export function atmosphericDensity(body: CelestialDefinition, altitude: number) {
  const atmosphere = body.atmosphere;
  if (!atmosphere?.height || altitude >= atmosphere.height) return 0;
  const h = Math.max(0, altitude);
  const edge = Math.max(0, Math.min(1, (atmosphere.height - h) / (atmosphere.height * 0.15)));
  return (
    (atmosphere.density ?? 1) *
    Math.exp(-h / (atmosphere.scaleHeight ?? atmosphere.height / 4)) *
    smooth(edge)
  );
}
export function gravityAcceleration(body: CelestialDefinition, distance: number) {
  const gravity = body.gravity;
  if (!gravity || distance >= gravity.influenceRadius) return 0;
  const fade = Math.max(
    0,
    Math.min(1, (gravity.influenceRadius - distance) / (gravity.influenceRadius * 0.2)),
  );
  return (
    gravity.surfaceAcceleration *
    (body.radius / Math.max(body.radius, distance)) ** 2 *
    smooth(fade)
  );
}
