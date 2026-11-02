import { Vector3 } from '@/engine/math/linear';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import { surfaceDirection } from './coordinates';

import { foundationRadius } from './foundations';
import { clamp01, surfaceNoise as noise, range, smooth } from './surfaceNoise';

/** Bounded spherical field: continental shelves, warped ridge belts and regional detail. */
export function naturalTerrainHeight(body: CelestialDefinition, direction: Readonly<Vector3>) {
  const terrain = body.terrain;
  if (!terrain) return 0;
  const { x, y, z } = direction,
    seed = terrain.seed,
    relief = terrain.relief;
  const continent = noise(x * 2.4, y * 2.4, z * 2.4, seed + 901);
  const warp = terrain.octaves >= 2 ? noise(x * 5, y * 5, z * 5, seed + 37) - 0.5 : 0;
  const regional =
    terrain.octaves >= 3 ? noise(x * 13 + warp, y * 13, z * 13 - warp, seed + 71) : continent;
  const ridge =
    terrain.octaves >= 4
      ? 1 - Math.abs(noise(x * 24 + warp * 2, y * 19, z * 24, seed + 107) * 2 - 1)
      : 1 - Math.abs(regional * 2 - 1);
  const detail =
    terrain.octaves >= 5
      ? noise(
          x * terrain.frequency * 4,
          y * terrain.frequency * 4,
          z * terrain.frequency * 4,
          seed + 211,
        ) - 0.5
      : 0;
  const fine =
    terrain.octaves >= 6
      ? noise(
          x * terrain.frequency * 12,
          y * terrain.frequency * 12,
          z * terrain.frequency * 12,
          seed + 503,
        ) - 0.5
      : 0;
  const belt = range(0.48, 0.76, regional);
  let value = 0.1 + continent * 0.42 + belt * ridge ** 4 * 0.32 + detail * 0.07 + fine * 0.018;
  for (let octave = 6; octave < terrain.octaves; octave++) {
    const frequency = terrain.frequency * 12 * 2 ** (octave - 5);
    value +=
      (noise(x * frequency, y * frequency, z * frequency, seed + octave * 1013) - 0.5) *
      0.008 *
      0.5 ** (octave - 6);
  }
  switch (body.archetype) {
    case 'temperate':
      value -= 0.12;
      break;
    case 'oceanic':
      value -= 0.23;
      break;
    case 'desert':
      value += Math.sin(x * 210 + z * 90 + warp * 12) * 0.025;
      value -= Math.exp(-Math.abs(regional - 0.48) * 75) * 0.14;
      break;
    case 'frozen':
      value += 0.12 - Math.exp(-Math.abs(regional - 0.5) * 100) * 0.14;
      break;
    case 'volcanic':
      value += ridge ** 6 * 0.2;
      break;
    case 'barren': {
      const crater = Math.abs(regional - 0.46);
      value +=
        Math.exp(-((crater - 0.045) ** 2) * 4000) * 0.13 - Math.exp(-crater * crater * 1800) * 0.13;
      break;
    }
  }
  let height = relief * value;
  // Authored reference region joins coast, lowlands and the existing Western Ridge.
  if (body.id === 'pelagos') {
    const latitude = Math.asin(Math.max(-1, Math.min(1, y))),
      longitude = Math.atan2(z, x);
    const east = (longitude - 2.25) * body.radius,
      north = (latitude - 0.02) * body.radius;
    const distance = Math.hypot(east, north);
    if (distance < 32000) {
      const ridgeEast = east + 5600 + north * 0.18;
      const mountain = Math.exp(-((ridgeEast / 1500) ** 2)) * Math.exp(-((north / 11000) ** 4));
      const reference =
        (body.ocean?.level ?? 300) + 120 + north * 0.012 + (regional - 0.5) * 90 + mountain * 850;
      height += (reference - height) * (1 - range(22000, 32000, distance));
    }
  }
  for (const landmark of body.pointsOfInterest ?? []) {
    if (!landmark.landform || (body.id === 'pelagos' && landmark.id === 'pelagos-ridge')) continue;
    const center = surfaceDirection(landmark.latitude, landmark.longitude);
    const distance2 = Math.max(0, 2 - 2 * center.dot(direction)) * body.radius ** 2;
    if (distance2 > 18000 ** 2) continue;
    const east =
      (-Math.sin(landmark.longitude) * x + Math.cos(landmark.longitude) * z) * body.radius;
    const north =
      (y * Math.cos(landmark.latitude) -
        (x * Math.cos(landmark.longitude) + z * Math.sin(landmark.longitude)) *
          Math.sin(landmark.latitude)) *
      body.radius;
    const elongated = Math.exp(-(((east + north * 0.25) / 1800) ** 2) - (north / 10000) ** 4);
    const distance = Math.sqrt(distance2) / 6500;
    switch (landmark.landform) {
      case 'mountain':
        height += relief * elongated * 0.52;
        break;
      case 'canyon':
      case 'fracture':
        height -= relief * elongated * 0.35;
        break;
      case 'crater':
      case 'caldera':
        height +=
          relief *
          (Math.exp(-((distance - 0.8) ** 2) * 35) * 0.3 -
            Math.exp(-distance * distance * 3) * 0.25);
        break;
      case 'archipelago':
        height += relief * Math.exp(-distance * distance * 2) * ridge ** 3 * 0.35;
        break;
    }
  }
  return relief * clamp01(height / relief);
}
/** Authority and terrain workers share the same engineered foundations and shorelines. */
export function terrainHeight(body: CelestialDefinition, direction: Readonly<Vector3>) {
  let height = naturalTerrainHeight(body, direction);
  for (const city of body.settlements ?? []) {
    const cosineLatitude = Math.cos(city.latitude),
      cosineLongitude = Math.cos(city.longitude),
      sineLongitude = Math.sin(city.longitude);
    const cosine = Math.max(
      0.01,
      direction.x * cosineLatitude * cosineLongitude +
        direction.y * Math.sin(city.latitude) +
        direction.z * cosineLatitude * sineLongitude,
    );
    const distance = Math.sqrt(Math.max(0, 2 - 2 * cosine)) * body.radius;
    if (distance > city.radius * 1.3) continue;
    const east = -sineLongitude * direction.x + cosineLongitude * direction.z;
    const south =
      Math.sin(city.latitude) * (cosineLongitude * direction.x + sineLongitude * direction.z) -
      cosineLatitude * direction.y;
    const radius = foundationRadius(city, Math.atan2(south, east));
    const blend = smooth(clamp01((distance - radius) / (radius * 0.28)));
    const foundation = (body.radius + city.elevation) / cosine - body.radius;
    height = foundation + (height - foundation) * blend;
  }
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

/** Liquids block penetration but never permit conventional landing. */
export function surfaceHeight(body: CelestialDefinition, direction: Readonly<Vector3>) {
  return Math.max(body.ocean?.level ?? -Infinity, terrainHeight(body, direction));
}

/** Conservative radial bound, including engineered tangent foundations and landing-zone overrides. */
export function maximumTerrainHeight(body: CelestialDefinition) {
  let height = body.terrain?.relief ?? 0;
  for (const zone of body.landingZones ?? []) height = Math.max(height, zone.elevation);
  for (const city of body.settlements ?? []) {
    const cosine = 1 - ((city.radius * 1.3) / body.radius) ** 2 / 2;
    height = Math.max(
      height,
      (body.radius + city.elevation) / Math.max(0.01, cosine) - body.radius,
    );
  }
  return Math.max(height, body.ocean?.level ?? 0);
}
