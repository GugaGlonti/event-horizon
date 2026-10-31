import { validateCatalog } from '@/engine/world/validateSystem';
import type {
  CelestialDefinition,
  Position3,
  StarSystemDefinition,
  SurfacePattern,
} from '@/engine/world/worldTypes';

function star(id: string, name: string, color: string, brightness: number): CelestialDefinition {
  return {
    id,
    name,
    description: 'The central light of this system.',
    kind: 'star',
    radius: 900,
    position: [0, 0, 0],
    rotation: { tilt: 0, speed: 0.015 },
    surface: { pattern: 'bands', palette: [color, '#ffffff', color], seed: 11, brightness },
  };
}

function planet(
  id: string,
  name: string,
  parentId: string,
  position: Position3,
  radius: number,
  pattern: SurfacePattern,
  palette: readonly [string, string, string],
  description: string,
  extra: Partial<Pick<CelestialDefinition, 'atmosphere' | 'rings'>> = {},
): CelestialDefinition {
  return {
    id,
    name,
    description,
    kind: pattern === 'bands' ? 'gas-giant' : 'rocky',
    radius,
    parentId,
    position,
    rotation: { tilt: 0.2, speed: 0.018 },
    surface: { pattern, palette, seed: radius * 0.017, brightness: 1 },
    ...extra,
  };
}

function moon(
  id: string,
  name: string,
  parentId: string,
  radius: number,
  orbitRadius: number,
  phase: number,
  palette: readonly [string, string, string],
): CelestialDefinition {
  return {
    id,
    name,
    description: 'A quiet satellite, charted by the Kestrel survey program.',
    kind: 'moon',
    radius,
    parentId,
    orbit: { radius: orbitRadius, period: 240 + orbitRadius * 0.08, phase, inclination: 0.17 },
    rotation: { tilt: 0.1, speed: 0.012 },
    surface: { pattern: 'cratered', palette, seed: radius, brightness: 1 },
  };
}

export const SYSTEMS: readonly StarSystemDefinition[] = [
  {
    id: 'solara',
    name: 'Solara',
    description: 'A golden sun. Blue oceans. The familiar edge of the unknown.',
    chartPosition: [19, 65],
    galacticPosition: [19, 0, 65],
    environment: {
      background: '#040a13',
      nebula: '#214d69',
      accent: '#8de8ec',
      ambient: 0.19,
      seed: 73,
    },
    bodies: [
      star('solara-star', 'Solara', '#ffca65', 2.3),
      planet(
        'pelagos',
        'Pelagos',
        'solara-star',
        [7800, 0, 0],
        620,
        'ocean',
        ['#123567', '#47886e', '#d8e6df'],
        'A blue world of deep oceans and broad cloud systems.',
        { atmosphere: { color: '#64bfff', strength: 0.7, scale: 1.045 } },
      ),
      moon('lyra', 'Lyra', 'pelagos', 105, 1380, -0.4, ['#4c5362', '#a4a7ad', '#d8d7d2']),
      planet(
        'cairn',
        'Cairn',
        'solara-star',
        [-12000, 300, -6500],
        460,
        'desert',
        ['#7a3328', '#c7864e', '#e6b97c'],
        'Rust plains and wind-carved ochre basins.',
      ),
      planet(
        'aureole',
        'Aureole',
        'solara-star',
        [15500, -500, -15500],
        1150,
        'bands',
        ['#73634e', '#d8bd8b', '#f1dfbd'],
        'A pale gas giant threaded with warm cloud bands.',
      ),
      moon('tala', 'Tala', 'aureole', 180, 2300, 2.2, ['#4f4947', '#a09383', '#c6bca9']),
    ],
    spawns: [
      {
        id: 'pelagos-approach',
        bodyId: 'pelagos',
        offset: [300, 180, 1900],
        orientation: [0, 0, 0, 1],
      },
    ],
    arrivalId: 'pelagos-approach',
    defaultTargetId: 'pelagos',
  },
  {
    id: 'vesper',
    name: 'Vesper',
    description: 'Cold rings and long shadows beneath an ember-red sun.',
    chartPosition: [49, 27],
    galacticPosition: [49, 3, 27],
    environment: {
      background: '#080611',
      nebula: '#54315e',
      accent: '#c4b5fd',
      ambient: 0.14,
      seed: 219,
    },
    bodies: [
      star('vesper-star', 'Vesper', '#ff744a', 1.5),
      planet(
        'umbra',
        'Umbra',
        'vesper-star',
        [5000, -300, 5000],
        520,
        'cratered',
        ['#161e2c', '#464859', '#848494'],
        'An ancient rocky world with a nearly black surface.',
      ),
      planet(
        'rime',
        'Rime',
        'vesper-star',
        [-4500, 700, -13000],
        580,
        'ice',
        ['#25445d', '#9bbfcf', '#e4f2ed'],
        'Glacial shelves split by deep, sapphire fractures.',
        { atmosphere: { color: '#a2c7ef', strength: 0.45, scale: 1.035 } },
      ),
      planet(
        'nacre',
        'Nacre',
        'vesper-star',
        [-9500, 180, -1200],
        1100,
        'bands',
        ['#3c405e', '#928ca7', '#d1c8d7'],
        'A vast, violet gas giant inside a luminous ring system.',
        {
          atmosphere: { color: '#a99ae4', strength: 0.5, scale: 1.035 },
          rings: { inner: 1.35, outer: 2.05, color: '#b9b0d3', tilt: -0.18 },
        },
      ),
      moon('mote', 'Mote', 'umbra', 85, 1100, 0.6, ['#2d2938', '#696171', '#a39ba7']),
      moon('sable', 'Sable', 'nacre', 145, 2950, -0.45, ['#363343', '#80788e', '#c7bdcf']),
      moon('veil', 'Veil', 'nacre', 110, 3700, 2.7, ['#535d73', '#a6b5c6', '#d8e2e5']),
    ],
    spawns: [
      {
        id: 'nacre-approach',
        bodyId: 'nacre',
        offset: [550, 500, 3600],
        orientation: [0, 0, 0, 1],
      },
    ],
    arrivalId: 'nacre-approach',
    defaultTargetId: 'nacre',
  },
  {
    id: 'aether',
    name: 'Aether',
    description: 'A blue-white beacon over living seas and volcanic fire.',
    chartPosition: [82, 64],
    galacticPosition: [82, -2, 64],
    environment: {
      background: '#030a16',
      nebula: '#293d85',
      accent: '#93c5fd',
      ambient: 0.17,
      seed: 427,
    },
    bodies: [
      star('aether-star', 'Aether', '#94cbff', 3),
      planet(
        'pyra',
        'Pyra',
        'aether-star',
        [6000, 100, -1200],
        560,
        'volcanic',
        ['#1e202c', '#754236', '#ff6c2f'],
        'Charcoal continents divided by glowing lava seams.',
      ),
      moon('cinder', 'Cinder', 'pyra', 100, 1300, 1.9, ['#3d3338', '#8e6558', '#b89b83']),
      planet(
        'serein',
        'Serein',
        'aether-star',
        [-8200, 100, -5000],
        690,
        'ocean',
        ['#112c57', '#247e9c', '#c7e5f2'],
        'A world-spanning ocean beneath pearlescent storm fronts.',
        { atmosphere: { color: '#59cfed', strength: 0.7, scale: 1.05 } },
      ),
      moon('lilt', 'Lilt', 'serein', 125, 1600, -0.5, ['#424f66', '#91a5bc', '#c9d6df']),
      planet(
        'prism',
        'Prism',
        'aether-star',
        [16500, -700, 14000],
        1350,
        'bands',
        ['#253e64', '#8d73b6', '#73c9cc'],
        'Turquoise and amethyst clouds encircle this unusual giant.',
        {
          rings: { inner: 1.45, outer: 1.8, color: '#8eb8d6', tilt: 0.18 },
        },
      ),
      moon('opal', 'Opal', 'prism', 165, 2800, 0.8, ['#4d5769', '#a4b4c5', '#e0d8e7']),
    ],
    spawns: [
      {
        id: 'serein-approach',
        bodyId: 'serein',
        offset: [350, 210, 2150],
        orientation: [0, 0, 0, 1],
      },
    ],
    arrivalId: 'serein-approach',
    defaultTargetId: 'serein',
  },
];

validateCatalog(SYSTEMS);

export async function loadSystem(id: string, signal: AbortSignal): Promise<StarSystemDefinition> {
  // Bundled procedural definitions need no network assets. Keep preparation explicitly cancellable.
  await Promise.resolve();
  signal.throwIfAborted();
  const definition = SYSTEMS.find((system) => system.id === id);
  if (!definition) throw new Error('That star system is not charted.');
  return definition;
}
