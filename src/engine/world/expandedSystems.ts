import type { Civilization, PlanetArchetype } from '@/engine/planetary/environmentTypes';
import { ARCHETYPES } from './planetProfiles';
import type { CelestialDefinition, StarSystemDefinition } from './worldTypes';

interface WorldSpec {
  id: string;
  name: string;
  archetype: PlanetArchetype;
  radius: number;
  civilization: Civilization;
  position: readonly [number, number, number];
}
interface SystemSpec {
  id: string;
  name: string;
  description: string;
  chart: readonly [number, number];
  color: string;
  seed: number;
  civilization: Civilization;
  worlds: readonly WorldSpec[];
}
const specs: readonly SystemSpec[] = [
  {
    id: 'meridian',
    name: 'Meridian',
    description:
      'The bright commercial core: dense capitals, coastal trade hubs and busy orbital approaches.',
    chart: [38, 76],
    color: '#fff2b7',
    seed: 1011,
    civilization: 'HIGHLY_URBANIZED',
    worlds: [
      {
        id: 'concord',
        name: 'Concord',
        archetype: 'temperate',
        radius: 260000,
        civilization: 'HIGHLY_URBANIZED',
        position: [2900000, 80000, -300000],
      },
      {
        id: 'brass',
        name: 'Brass',
        archetype: 'desert',
        radius: 162000,
        civilization: 'OUTPOST',
        position: [-3800000, -100000, 1700000],
      },
      {
        id: 'regent',
        name: 'Regent',
        archetype: 'gas-giant',
        radius: 460000,
        civilization: 'UNINHABITED',
        position: [4700000, 200000, 4600000],
      },
    ],
  },
  {
    id: 'kharon',
    name: 'Kharon',
    description: 'An ochre mining frontier of dune seas, canyon refineries and bare mineral moons.',
    chart: [16, 35],
    color: '#ffae64',
    seed: 2017,
    civilization: 'OUTPOST',
    worlds: [
      {
        id: 'sirocco',
        name: 'Sirocco',
        archetype: 'desert',
        radius: 228000,
        civilization: 'COLONY',
        position: [-2400000, 120000, -1900000],
      },
      {
        id: 'slag',
        name: 'Slag',
        archetype: 'barren',
        radius: 146000,
        civilization: 'OUTPOST',
        position: [1400000, -30000, 2600000],
      },
      {
        id: 'ochre',
        name: 'Ochre',
        archetype: 'gas-giant',
        radius: 378000,
        civilization: 'UNINHABITED',
        position: [5200000, 300000, -3400000],
      },
    ],
  },
  {
    id: 'nivalis',
    name: 'Nivalis',
    description:
      'A quiet white star above glacial worlds, enclosed research habitats and blue ice fractures.',
    chart: [36, 13],
    color: '#dcecff',
    seed: 3019,
    civilization: 'COLONY',
    worlds: [
      {
        id: 'boreal',
        name: 'Boreal',
        archetype: 'frozen',
        radius: 214000,
        civilization: 'COLONY',
        position: [2700000, 180000, 900000],
      },
      {
        id: 'hoarfrost',
        name: 'Hoarfrost',
        archetype: 'frozen',
        radius: 177000,
        civilization: 'OUTPOST',
        position: [-3100000, -160000, -2200000],
      },
      {
        id: 'pallor',
        name: 'Pallor',
        archetype: 'gas-giant',
        radius: 421000,
        civilization: 'UNINHABITED',
        position: [-4800000, 400000, 4200000],
      },
    ],
  },
  {
    id: 'pelagia',
    name: 'Pelagia',
    description:
      'Rain-soaked archipelagos, agricultural colonies and deep turquoise seas beneath a warm sun.',
    chart: [61, 82],
    color: '#ffe3a4',
    seed: 4013,
    civilization: 'COLONY',
    worlds: [
      {
        id: 'thalassa',
        name: 'Thalassa',
        archetype: 'oceanic',
        radius: 288000,
        civilization: 'COLONY',
        position: [-2800000, 60000, 1200000],
      },
      {
        id: 'verdant',
        name: 'Verdant',
        archetype: 'temperate',
        radius: 198000,
        civilization: 'COLONY',
        position: [3400000, -70000, -1600000],
      },
      {
        id: 'gyre',
        name: 'Gyre',
        archetype: 'gas-giant',
        radius: 510000,
        civilization: 'UNINHABITED',
        position: [4900000, 270000, 4400000],
      },
    ],
  },
  {
    id: 'ignis',
    name: 'Ignis',
    description:
      'A violent orange beacon over basalt ranges, ash-hazed extraction platforms and incandescent fissures.',
    chart: [68, 19],
    color: '#ff8054',
    seed: 5011,
    civilization: 'OUTPOST',
    worlds: [
      {
        id: 'forge',
        name: 'Forge',
        archetype: 'volcanic',
        radius: 241000,
        civilization: 'OUTPOST',
        position: [1800000, -90000, -2100000],
      },
      {
        id: 'scoria',
        name: 'Scoria',
        archetype: 'volcanic',
        radius: 183000,
        civilization: 'UNINHABITED',
        position: [-3200000, 110000, 2400000],
      },
      {
        id: 'furnace',
        name: 'Furnace',
        archetype: 'gas-giant',
        radius: 442000,
        civilization: 'UNINHABITED',
        position: [4700000, 410000, 3900000],
      },
    ],
  },
  {
    id: 'elysion',
    name: 'Elysion',
    description:
      'A young temperate colony network: forested uplands, regional farming cities and open skies.',
    chart: [86, 39],
    color: '#fff8d4',
    seed: 6011,
    civilization: 'DEVELOPED',
    worlds: [
      {
        id: 'elysium',
        name: 'Elysium',
        archetype: 'temperate',
        radius: 247000,
        civilization: 'DEVELOPED',
        position: [3100000, -30000, 900000],
      },
      {
        id: 'haven',
        name: 'Haven',
        archetype: 'oceanic',
        radius: 176000,
        civilization: 'OUTPOST',
        position: [-2800000, 100000, -2300000],
      },
      {
        id: 'pastel',
        name: 'Pastel',
        archetype: 'gas-giant',
        radius: 399000,
        civilization: 'UNINHABITED',
        position: [-4900000, -210000, 3900000],
      },
    ],
  },
  {
    id: 'umbra-system',
    name: 'Umbra',
    description:
      'The uninhabited outer survey: black crater plains, abandoned signals and remote frozen moons.',
    chart: [53, 49],
    color: '#b5a7f5',
    seed: 7013,
    civilization: 'UNINHABITED',
    worlds: [
      {
        id: 'noctis',
        name: 'Noctis',
        archetype: 'barren',
        radius: 234000,
        civilization: 'UNINHABITED',
        position: [-2400000, 170000, -1600000],
      },
      {
        id: 'hush',
        name: 'Hush',
        archetype: 'frozen',
        radius: 157000,
        civilization: 'UNINHABITED',
        position: [3300000, -150000, 2000000],
      },
      {
        id: 'penumbra',
        name: 'Penumbra',
        archetype: 'gas-giant',
        radius: 478000,
        civilization: 'UNINHABITED',
        position: [-5100000, 230000, 4600000],
      },
    ],
  },
];
function buildSystem(spec: SystemSpec): StarSystemDefinition {
  const starId = `${spec.id}-star`;
  const bodies: CelestialDefinition[] = [
    {
      id: starId,
      name: spec.name,
      description: 'Central stellar beacon.',
      kind: 'star',
      radius: 620000 + spec.seed * 21,
      position: [0, 0, 0],
      rotation: { tilt: 0, speed: 0.008 },
      surface: {
        pattern: 'bands',
        palette: [spec.color, '#ffffff', spec.color],
        seed: spec.seed,
        brightness: 2.4,
      },
    },
  ];
  for (const [i, w] of spec.worlds.entries()) {
    const profile = ARCHETYPES[w.archetype];
    bodies.push({
      id: w.id,
      name: w.name,
      description: `${w.name}: ${w.archetype} ${w.civilization.toLowerCase().replaceAll('_', ' ')} world in ${spec.name}.`,
      kind: w.archetype === 'gas-giant' ? 'gas-giant' : 'rocky',
      parentId: starId,
      position: w.position,
      radius: w.radius,
      archetype: w.archetype,
      civilization: w.civilization,
      gravity: { surfaceAcceleration: profile.gravity, influenceRadius: w.radius * 3.2 },
      rotation: { tilt: (i + 1) * 0.12, speed: 0.000015 + (spec.seed % 17) * 0.000001 },
      surface: {
        pattern: profile.pattern,
        palette: profile.palette,
        seed: spec.seed + i * 127,
        brightness: 1,
      },
      ...(w.archetype === 'gas-giant'
        ? {
            rings: {
              inner: 1.4,
              outer: 1.9 + (spec.seed % 3) * 0.1,
              color: spec.color,
              tilt: 0.13,
            },
          }
        : {}),
    });
  }
  const primary = spec.worlds[0],
    giant = spec.worlds[2];
  if (!primary || !giant) throw new Error('Expanded system needs three worlds.');
  for (const [i, parent] of [primary, giant, giant].entries())
    bodies.push({
      id: `${spec.id}-moon-${i + 1}`,
      name: `${['Echo', 'Shard', 'Drift'][i]} of ${spec.name}`,
      description: 'A distinct cratered survey satellite.',
      kind: 'moon',
      parentId: parent.id,
      radius: 34000 + i * 13000 + (spec.seed % 7000),
      orbit: {
        radius: parent.radius * (i === 0 ? 2.8 : 3 + i * 0.9),
        period: 170000 + i * 70000 + spec.seed,
        phase: i * 2.1 + spec.seed * 0.001,
        inclination: 0.14 + i * 0.11,
      },
      rotation: { tilt: 0.08, speed: 0.00002 },
      gravity: { surfaceAcceleration: 1.2 + i * 0.4, influenceRadius: 140000 + i * 50000 },
      surface: {
        pattern: i === 2 ? 'ice' : 'cratered',
        palette: i === 2 ? ARCHETYPES.frozen.palette : ARCHETYPES.barren.palette,
        seed: spec.seed + i + 37,
        brightness: 1,
      },
    });
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    civilization: spec.civilization,
    chartPosition: spec.chart,
    galacticPosition: [spec.chart[0], (spec.seed % 13) - 6, spec.chart[1]],
    environment: {
      background: '#040710',
      nebula: spec.color,
      accent: spec.color,
      ambient: 0.15 + (spec.seed % 4) * 0.02,
      seed: spec.seed,
    },
    bodies,
    stations:
      spec.civilization === 'UNINHABITED'
        ? []
        : [
            {
              id: `${spec.id}-orbital`,
              name: `${spec.name} ${spec.civilization === 'OUTPOST' ? 'Refinery' : 'Gateway'}`,
              type: spec.civilization === 'OUTPOST' ? 'industrial' : 'orbital',
              parentId: primary.id,
              position: [0, 12000, primary.radius + 28000],
              orientation: [0, 0, 0, 1],
              ports: [
                {
                  id: 'berth-1',
                  name: 'Visitor Berth',
                  kind: 'external',
                  position: [0, 0, 110],
                  approach: [0, 0, 440],
                  orientation: [0, 0, 0, 1],
                },
              ],
              boxes: [
                { center: [0, 0, -80], size: [180, 140, 150], role: 'hull' },
                { center: [0, -30, 25], size: [110, 20, 210], role: 'arm' },
                { center: [240, 0, -100], size: [40, 310, 80], role: 'hull' },
                { center: [-240, 0, -100], size: [40, 310, 80], role: 'hull' },
              ],
              services: ['repair', 'shields', 'weapons'],
            },
          ],
    spawns: [
      {
        id: `${primary.id}-approach`,
        bodyId: primary.id,
        offset: [0, 12000, primary.radius + 31000],
        orientation: [0, 0, 0, 1],
      },
    ],
    arrivalId: `${primary.id}-approach`,
    defaultTargetId: primary.id,
  };
}
export const EXPANDED_SYSTEMS = specs.map(buildSystem);
