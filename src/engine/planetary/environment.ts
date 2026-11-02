import { Vector3 } from '@/engine/math/linear';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import { bodyRotation, surfaceDirection } from './coordinates';
import type { Biome, WeatherKind } from './environmentTypes';
import { naturalTerrainHeight } from './terrain';

export function surfaceBiome(body: CelestialDefinition, local: Readonly<Vector3>): Biome {
  const height = naturalTerrainHeight(body, local);
  if (body.ocean && height <= body.ocean.level) return 'ocean';
  if (body.ocean && height < body.ocean.level + 45) return 'coast';
  if (body.archetype === 'frozen') return 'ice';
  if (body.archetype === 'desert')
    return height > (body.terrain?.relief ?? 1) * 0.65 ? 'rock' : 'dunes';
  if (body.archetype === 'volcanic')
    return height < (body.terrain?.relief ?? 1) * 0.42 ? 'lava' : 'basalt';
  if (body.archetype === 'barren') return 'rock';
  if (Math.abs(local.y) > 0.86) return 'polar';
  if (height > (body.terrain?.relief ?? 1) * 0.65) return 'mountain';
  return (body.climate?.moisture ?? 0) > 0.45 && Math.abs(local.y) < 0.7 ? 'forest' : 'plains';
}

/** Smooth deterministic weather cells. No wall clock, random state or per-client state. */
export function weatherAt(body: CelestialDefinition, time: number, local: Readonly<Vector3>) {
  const climate = body.climate;
  if (!climate || !body.atmosphere || !climate.weather.length)
    return {
      kind: 'clear' as WeatherKind,
      intensity: 0,
      visibility: 100000,
      cloudCover: 0,
      windEast: 0,
      windNorth: 0,
    };
  const phase = time / climate.period + (body.terrain?.seed ?? body.surface.seed) * 0.013;
  const cell = Math.sin(phase * Math.PI * 2 + local.x * 3 + local.z * 2);
  const intensity = Math.max(0, (cell - 0.05) / 0.95);
  const index = Math.floor(phase / 3 + local.y + 10000);
  const kind =
    climate.weather[
      ((index % climate.weather.length) + climate.weather.length) % climate.weather.length
    ] ?? 'clear';
  const severity = kind === 'clear' ? 0 : intensity;
  return {
    kind,
    intensity: severity,
    visibility:
      100000 /
      (1 + severity * (kind === 'sandstorm' || kind === 'dust' || kind === 'ash' ? 100 : 30)),
    cloudCover: Math.min(1, climate.cloudCover + severity * 0.3),
    windEast: Math.sin(phase * 0.7 + local.z) * climate.windSpeed * (0.4 + intensity * 0.6),
    windNorth: Math.cos(phase * 0.53 + local.x) * climate.windSpeed * 0.5,
  };
}

export function daylightAt(
  world: SystemRuntime,
  body: CelestialDefinition,
  local: Readonly<Vector3>,
) {
  const star = world.definition.bodies.find((b) => b.kind === 'star');
  const center = world.positions.get(body.id),
    sun = star && world.positions.get(star.id);
  if (!sun || !center) return 0;
  return new Vector3()
    .copy(local)
    .applyQuaternion(bodyRotation(body, world.time))
    .dot(new Vector3().subVectors(sun, center).normalize());
}

export function restrictedAirspace(
  body: CelestialDefinition,
  local: Readonly<Vector3>,
  altitude: number,
) {
  return (
    body.restrictedZones?.find(
      (zone) =>
        altitude < zone.ceiling &&
        surfaceDirection(zone.latitude, zone.longitude).distanceTo(local) * body.radius <
          zone.radius,
    ) ?? null
  );
}
