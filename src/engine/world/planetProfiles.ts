import { generateSettlements, settlementSpaceport } from '@/engine/planetary/cities';
import type {
  Civilization,
  ClimateDefinition,
  PlanetArchetype,
} from '@/engine/planetary/environmentTypes';
import { SETTLEMENT_ANCHORS } from './settlementAnchors';
import type { CelestialDefinition, StarSystemDefinition, SurfacePattern } from './worldTypes';

export const ARCHETYPES: Readonly<
  Record<
    PlanetArchetype,
    {
      pattern: SurfacePattern;
      palette: readonly [string, string, string];
      gravity: number;
      relief: number;
      climate: ClimateDefinition;
    }
  >
> = {
  temperate: {
    pattern: 'ocean',
    palette: ['#123567', '#47886e', '#d8e6df'],
    gravity: 7.8,
    relief: 1400,
    climate: {
      temperature: 286,
      moisture: 0.7,
      weather: ['rain', 'clear'],
      period: 480,
      windSpeed: 9,
      cloudCover: 0.42,
    },
  },
  oceanic: {
    pattern: 'ocean',
    palette: ['#084566', '#4f9a85', '#d8edf4'],
    gravity: 8.4,
    relief: 1800,
    climate: {
      temperature: 292,
      moisture: 0.95,
      weather: ['rain'],
      period: 390,
      windSpeed: 13,
      cloudCover: 0.65,
    },
  },
  desert: {
    pattern: 'desert',
    palette: ['#7a3328', '#c7864e', '#e6b97c'],
    gravity: 6.2,
    relief: 2100,
    climate: {
      temperature: 318,
      moisture: 0.06,
      weather: ['dust', 'sandstorm', 'clear'],
      period: 620,
      windSpeed: 18,
      cloudCover: 0.12,
    },
  },
  frozen: {
    pattern: 'ice',
    palette: ['#25445d', '#9bbfcf', '#e4f2ed'],
    gravity: 5.9,
    relief: 1700,
    climate: {
      temperature: 208,
      moisture: 0.3,
      weather: ['snow', 'clear'],
      period: 540,
      windSpeed: 11,
      cloudCover: 0.46,
    },
  },
  volcanic: {
    pattern: 'volcanic',
    palette: ['#1e202c', '#754236', '#ff6c2f'],
    gravity: 9.6,
    relief: 2400,
    climate: {
      temperature: 423,
      moisture: 0.01,
      weather: ['ash', 'clear'],
      period: 720,
      windSpeed: 14,
      cloudCover: 0.32,
    },
  },
  barren: {
    pattern: 'cratered',
    palette: ['#4c5362', '#a4a7ad', '#d8d7d2'],
    gravity: 1.4,
    relief: 1100,
    climate: {
      temperature: 180,
      moisture: 0,
      weather: ['clear'],
      period: 600,
      windSpeed: 0,
      cloudCover: 0,
    },
  },
  'gas-giant': {
    pattern: 'bands',
    palette: ['#73634e', '#d8bd8b', '#f1dfbd'],
    gravity: 14,
    relief: 0,
    climate: {
      temperature: 130,
      moisture: 0,
      weather: ['clear'],
      period: 900,
      windSpeed: 60,
      cloudCover: 1,
    },
  },
};
const fromPattern: Record<SurfacePattern, PlanetArchetype> = {
  ocean: 'temperate',
  desert: 'desert',
  ice: 'frozen',
  volcanic: 'volcanic',
  bands: 'gas-giant',
  cratered: 'barren',
};
const inhabitants: Record<string, Civilization> = {
  pelagos: 'DEVELOPED',
  cairn: 'OUTPOST',
  rime: 'COLONY',
  umbra: 'OUTPOST',
  pyra: 'OUTPOST',
  serein: 'COLONY',
};

export function configurePlanet(body: CelestialDefinition): CelestialDefinition {
  if (body.kind === 'star') return body;
  const archetype =
    body.archetype ?? (body.id === 'serein' ? 'oceanic' : fromPattern[body.surface.pattern]);
  const profile = ARCHETYPES[archetype];
  const solid = body.kind !== 'gas-giant';
  const atmosphere =
    body.atmosphere ??
    (archetype !== 'barren'
      ? {
          color:
            archetype === 'gas-giant'
              ? body.surface.palette[1]
              : archetype === 'desert'
                ? '#d6ab78'
                : archetype === 'volcanic'
                  ? '#a98b82'
                  : '#8bb9df',
          strength: 0.5,
          scale: 1 + 12000 / body.radius,
        }
      : undefined);
  const configured: CelestialDefinition = {
    ...body,
    archetype,
    civilization: body.civilization ?? inhabitants[body.id] ?? 'UNINHABITED',
    landable: solid,
    ...(solid
      ? {
          terrain: body.terrain ?? {
            seed: Math.floor(body.surface.seed * 103 + body.radius),
            relief: profile.relief,
            frequency: archetype === 'oceanic' ? 7 : 12,
            octaves: 6,
            patchResolution: 16,
            maxLevel: 11,
          },
        }
      : {}),
    climate: body.climate ?? profile.climate,
    ...(archetype === 'temperate' || archetype === 'oceanic'
      ? { ocean: { level: archetype === 'oceanic' ? 480 : 300, color: body.surface.palette[0] } }
      : {}),
    ...(atmosphere
      ? {
          atmosphere: {
            ...atmosphere,
            height: body.radius * (atmosphere.scale - 1),
            scaleHeight: body.atmosphere?.scaleHeight ?? 3500,
            density: body.atmosphere?.density ?? (archetype === 'frozen' ? 0.55 : 1),
          },
        }
      : {}),
    pointsOfInterest:
      body.pointsOfInterest ??
      (solid
        ? [
            {
              id: `${body.id}-landmark`,
              name: `${body.name} ${archetype === 'volcanic' ? 'Caldera' : archetype === 'frozen' ? 'Great Fracture' : archetype === 'desert' ? 'Canyon' : archetype === 'oceanic' ? 'Archipelago' : 'Highlands'}`,
              landform:
                archetype === 'volcanic'
                  ? 'caldera'
                  : archetype === 'frozen'
                    ? 'fracture'
                    : archetype === 'desert'
                      ? 'canyon'
                      : archetype === 'oceanic'
                        ? 'archipelago'
                        : 'mountain',
              latitude: 0.33,
              longitude: -0.7,
            },
          ]
        : []),
    hazards:
      archetype === 'volcanic'
        ? ['Lava fields', 'Ash visibility']
        : archetype === 'desert'
          ? ['Sandstorm visibility']
          : archetype === 'frozen'
            ? ['Glacial fractures']
            : [],
  };
  const settlements =
    body.settlements ??
    SETTLEMENT_ANCHORS[body.id] ??
    generateSettlements(
      configured,
      configured.civilization ?? 'UNINHABITED',
      body.id === 'pelagos' ? 'Port Helios' : body.id === 'concord' ? 'Meridian Crown' : undefined,
    );
  return {
    ...configured,
    settlements,
    restrictedZones: settlements
      .filter((s) => s.kind === 'capital' || s.purpose === 'military')
      .map((s) => ({
        id: `${s.id}-restricted`,
        name: `${s.name} Civic Airspace`,
        latitude: s.latitude,
        longitude: s.longitude,
        radius: s.radius * 0.22,
        ceiling: 1500,
      })),
  };
}
export function populateSystem(system: StarSystemDefinition): StarSystemDefinition {
  const bodies = system.bodies.map(configurePlanet);
  return {
    ...system,
    bodies,
    civilization:
      system.civilization ??
      (system.id === 'solara' ? 'DEVELOPED' : system.id === 'vesper' ? 'OUTPOST' : 'COLONY'),
    stations: [
      ...(system.stations ?? []),
      ...bodies.flatMap((body) =>
        (body.settlements ?? []).map((city) => settlementSpaceport(body, city)),
      ),
    ],
  };
}
