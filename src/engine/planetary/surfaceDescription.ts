import type { Vector3 } from '@/engine/math/linear';
import type { CelestialDefinition } from '@/engine/world/worldTypes';
import type { Biome } from './environmentTypes';
import { clamp01, range, surfaceNoise } from './surfaceNoise';
import { terrainHeight, terrainNormal } from './terrain';

export interface SurfaceDescription {
  elevation: number;
  slope: number;
  temperature: number;
  moisture: number;
  biome: Biome;
  /** Physical cover fractions: vegetation, stone, sediment, frozen. Sum is one. */
  cover: [number, number, number, number];
  forest: number;
  lava: number;
}
export function describeSurface(
  body: CelestialDefinition,
  local: Readonly<Vector3>,
  elevation = terrainHeight(body, local),
  slope = 1 - terrainNormal(body, local).dot(local),
): SurfaceDescription {
  const relief = body.terrain?.relief ?? 1,
    sea = body.ocean?.level ?? -10000;
  const temperature =
    (body.climate?.temperature ?? 180) -
    Math.abs(local.y) ** 1.4 * 48 -
    Math.max(0, elevation - Math.max(0, sea)) * 0.006;
  const variation = surfaceNoise(
    local.x * 9,
    local.y * 9,
    local.z * 9,
    (body.terrain?.seed ?? 1) + 1709,
  );
  const moisture = clamp01(
    (body.climate?.moisture ?? 0) +
      (variation - 0.5) * 0.65 +
      (1 - range(sea, sea + 500, elevation)) * 0.08 -
      Math.abs(local.y) * 0.12,
  );
  let rock = range(0.025, 0.19, slope),
    sand = 0,
    snow = range(277, 264, temperature),
    green = 0,
    forest = 0,
    lava = 0;
  let biome: Biome = 'rock';
  switch (body.archetype) {
    case 'temperate':
    case 'oceanic':
      snow = Math.max(
        snow,
        range(relief * 0.72, relief * 0.94, elevation) * (0.6 + Math.abs(local.y) * 0.4),
      );
      sand = Math.max(
        1 - range(sea + 8, sea + 110, elevation),
        (1 - range(0.12, 0.38, moisture)) * 0.7,
      );
      rock = Math.max(rock, range(relief * 0.57, relief * 0.85, elevation) * (1 - snow));
      green = 1;
      forest =
        range(0.43, 0.72, moisture) *
        (1 - range(relief * 0.48, relief * 0.75, elevation)) *
        (1 - rock) *
        (1 - sand) *
        (1 - snow);
      biome = snow > 0.5 ? 'polar' : rock > 0.45 ? 'mountain' : forest > 0.35 ? 'forest' : 'plains';
      break;
    case 'desert':
      sand = 1;
      snow = 0;
      rock = Math.max(rock, range(relief * 0.45, relief * 0.7, elevation));
      biome = rock > 0.5 ? 'rock' : 'dunes';
      break;
    case 'frozen':
      snow = 0.75 + variation * 0.25;
      biome = 'ice';
      break;
    case 'volcanic':
      snow = 0;
      rock = 1;
      lava =
        (1 - range(0.012, 0.045, Math.abs(variation - 0.5))) *
        (1 - range(relief * 0.2, relief * 0.5, elevation));
      biome = lava > 0.3 ? 'lava' : 'basalt';
      break;
    default:
      rock = 1;
      snow = 0;
      break;
  }
  if (body.ocean && elevation <= sea) {
    biome = 'ocean';
    forest = 0;
  } else if (body.ocean && elevation < sea + 45) biome = 'coast';
  const frozen = clamp01(snow),
    stone = clamp01(rock) * (1 - frozen),
    sediment = clamp01(sand) * (1 - frozen) * (1 - clamp01(rock));
  const vegetation = green * Math.max(0, 1 - frozen - stone - sediment);
  const remainder = Math.max(0, 1 - frozen - stone - sediment - vegetation);
  return {
    elevation,
    slope,
    temperature,
    moisture,
    biome,
    cover: [vegetation, stone + remainder, sediment, frozen],
    forest,
    lava,
  };
}

type RGB = readonly [number, number, number];
export interface SurfacePalette {
  vegetation: RGB;
  stone: RGB;
  sediment: RGB;
  frozen: RGB;
}
const palettes: Record<
  Exclude<NonNullable<CelestialDefinition['archetype']>, 'gas-giant'>,
  SurfacePalette
> = {
  temperate: {
    vegetation: [0.19, 0.31, 0.13],
    stone: [0.37, 0.38, 0.35],
    sediment: [0.61, 0.55, 0.38],
    frozen: [0.85, 0.9, 0.88],
  },
  oceanic: {
    vegetation: [0.14, 0.35, 0.23],
    stone: [0.32, 0.38, 0.37],
    sediment: [0.72, 0.66, 0.46],
    frozen: [0.85, 0.91, 0.91],
  },
  desert: {
    vegetation: [0.3, 0.31, 0.12],
    stone: [0.43, 0.27, 0.18],
    sediment: [0.72, 0.49, 0.28],
    frozen: [0.8, 0.76, 0.64],
  },
  frozen: {
    vegetation: [0.22, 0.31, 0.3],
    stone: [0.22, 0.32, 0.38],
    sediment: [0.4, 0.49, 0.51],
    frozen: [0.77, 0.87, 0.9],
  },
  volcanic: {
    vegetation: [0.17, 0.17, 0.16],
    stone: [0.19, 0.18, 0.19],
    sediment: [0.35, 0.26, 0.23],
    frozen: [0.5, 0.43, 0.4],
  },
  barren: {
    vegetation: [0.25, 0.26, 0.25],
    stone: [0.4, 0.41, 0.43],
    sediment: [0.52, 0.51, 0.48],
    frozen: [0.7, 0.72, 0.73],
  },
};
export function surfacePalette(body: CelestialDefinition): SurfacePalette {
  return body.archetype && body.archetype !== 'gas-giant'
    ? palettes[body.archetype]
    : palettes.barren;
}
/** Unlit surface color, shared by orbital baking and terrain-material inputs. */
export function surfaceColor(body: CelestialDefinition, sample: SurfaceDescription): RGB {
  const p = surfacePalette(body),
    w = sample.cover;
  const forest = 1 - sample.forest * 0.38;
  const channel = (i: 0 | 1 | 2) =>
    p.vegetation[i] * w[0] * forest + p.stone[i] * w[1] + p.sediment[i] * w[2] + p.frozen[i] * w[3];
  return [channel(0), channel(1), channel(2)];
}
