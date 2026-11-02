import type { StationBox, StationDefinition } from '@/engine/stations/stationTypes';
import type { CelestialDefinition, Position3 } from '@/engine/world/worldTypes';
import { surfaceDirection } from './coordinates';
import type { Civilization, SettlementDefinition } from './environmentTypes';
import { naturalTerrainHeight, terrainHeight, terrainNormal } from './terrain';

export function seededRandom(seed: number) {
  let state = seed | 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    state = (state ^ (state >>> 14)) | 0;
    return (state >>> 0) / 4294967296;
  };
}
export function settlementSuitability(
  body: CelestialDefinition,
  latitude: number,
  longitude: number,
) {
  const up = surfaceDirection(latitude, longitude);
  const height = naturalTerrainHeight(body, up);
  const slope = terrainNormal({ ...body, settlements: [], landingZones: [] }, up).dot(up);
  return {
    height,
    slope,
    suitable: Boolean(
      body.landable && height > (body.ocean?.level ?? -Infinity) + 60 && slope > 0.98,
    ),
  };
}

/** Bounded search of deterministic geographic candidates; unsuitable worlds fail preparation. */
export function generateSettlements(
  body: CelestialDefinition,
  civilization: Civilization,
  capitalName?: string,
): SettlementDefinition[] {
  if (civilization === 'UNINHABITED' || !body.landable) return [];
  const count =
    civilization === 'HIGHLY_URBANIZED'
      ? 7
      : civilization === 'DEVELOPED'
        ? 6
        : civilization === 'COLONY'
          ? 3
          : 1;
  const random = seededRandom((body.terrain?.seed ?? 1) + 7919);
  const settlements: SettlementDefinition[] = [];
  const purposes = ['trade', 'mining', 'research', 'agriculture', 'industry', 'military'] as const;
  for (let i = 0; i < count; i++) {
    const kind =
      i === 0 && (civilization === 'DEVELOPED' || civilization === 'HIGHLY_URBANIZED')
        ? 'capital'
        : i === count - 1 || civilization === 'OUTPOST' || (civilization === 'COLONY' && i > 0)
          ? 'outpost'
          : 'regional';
    const radius =
      kind === 'capital'
        ? civilization === 'HIGHLY_URBANIZED'
          ? 3400
          : 2400
        : kind === 'regional'
          ? 1100 + random() * 500
          : 340;
    let placed = false;
    for (let attempt = 0; attempt < 768; attempt++) {
      // Pelagos' reference capital is within a short atmospheric flight of the existing survey zone.
      const preferred = body.id === 'pelagos' && i === 0 && attempt < 96;
      const latitude = preferred
        ? attempt === 0
          ? 0.045
          : random() * 0.16 - 0.08
        : Math.asin(random() * 1.7 - 0.85);
      const longitude = preferred
        ? attempt === 0
          ? 2.29
          : 2.21 + random() * 0.18 - 0.09
        : random() * Math.PI * 2 - Math.PI;
      const up = surfaceDirection(latitude, longitude),
        site = settlementSuitability(body, latitude, longitude);
      if (
        !site.suitable ||
        settlements.some(
          (other) =>
            surfaceDirection(other.latitude, other.longitude).distanceTo(up) * body.radius <
            (other.radius + radius) * 3,
        )
      )
        continue;
      settlements.push({
        id: `${body.id}-${kind}-${i}`,
        name:
          kind === 'capital'
            ? (capitalName ?? `${body.name} Prime`)
            : `${body.name} ${['Reach', 'Haven', 'Heights', 'Fields', 'Works', 'Watch'][i - 1] ?? 'Survey'}`,
        kind,
        purpose:
          kind === 'capital' ? 'administration' : (purposes[i % purposes.length] ?? 'research'),
        latitude,
        longitude,
        elevation: Math.max(site.height, (body.ocean?.level ?? 0) + 100),
        radius,
        seed: (body.terrain?.seed ?? 1) + i * 104729,
        population:
          kind === 'capital'
            ? civilization === 'HIGHLY_URBANIZED'
              ? 12000000
              : 2400000
            : kind === 'regional'
              ? 180000 + Math.floor(random() * 500000)
              : 1200,
        style:
          body.archetype === 'desert'
            ? 'domes'
            : body.archetype === 'frozen'
              ? 'habitats'
              : body.archetype === 'volcanic'
                ? 'industrial'
                : body.archetype === 'barren'
                  ? 'modules'
                  : 'towers',
      });
      placed = true;
      break;
    }
    if (!placed) throw new Error(`${body.id}: no suitable site for settlement ${i}.`);
  }
  return settlements;
}

export interface CityLayout {
  buildings: StationBox[];
  roads: {
    center: Position3;
    size: Position3;
    orientation: readonly [number, number, number, number];
  }[];
  districts: { name: string; center: Position3 }[];
  landmark: Position3;
}
/** Small bounded static layout. All buildings are also authoritative station collision boxes. */
export function generateCityLayout(city: SettlementDefinition): CityLayout {
  const random = seededRandom(city.seed),
    buildings: StationBox[] = [],
    roads: CityLayout['roads'] = [];
  const half = city.kind === 'capital' ? 9 : city.kind === 'regional' ? 5 : 3;
  const spacing = city.radius / (half + 1),
    angle = random() * 0.6 - 0.3;
  const rotation = [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)] as const;
  for (let x = -half; x <= half; x++)
    for (let z = -half; z <= half; z++) {
      if (
        Math.hypot(x, z) > half ||
        x === 0 ||
        z === 0 ||
        (city.kind === 'capital' && Math.abs(x) === 1 && Math.abs(z) === 1)
      )
        continue;
      const px = (x * Math.cos(angle) + z * Math.sin(angle)) * spacing;
      const pz = (z * Math.cos(angle) - x * Math.sin(angle)) * spacing;
      // Reserved, unobstructed spaceport and final approach corridor.
      if (Math.abs(px) < 340 && pz > city.radius * 0.32) continue;
      const central = 1 - Math.hypot(x, z) / (half + 1);
      const height =
        city.style === 'towers'
          ? 25 + central ** 2 * (city.kind === 'capital' ? 460 : 190) * (0.4 + random())
          : city.style === 'industrial'
            ? 35 + random() * 100
            : 16 + random() * 35;
      const width = spacing * (city.style === 'towers' ? 0.38 : 0.62) * (0.7 + random() * 0.3);
      buildings.push({
        center: [px, height / 2, pz],
        size: [width, height, width * (0.7 + random() * 0.4)],
        role: 'hull',
        orientation: rotation,
      });
    }
  buildings.push({
    center: [city.radius * 0.4, 18, -city.radius * 0.3],
    size: [56, 36, 56],
    role: 'arm',
  });
  buildings.push({
    center: [-city.radius * 0.5, 15, city.radius * 0.5],
    size: [70, 30, 100],
    role: 'hangar',
  });
  const landmarkHeight = city.kind === 'capital' ? 560 : city.kind === 'regional' ? 140 : 42;
  buildings.push({
    center: [0, landmarkHeight / 2, 0],
    size: [city.radius * 0.05, landmarkHeight, city.radius * 0.05],
    role: 'hull',
  });
  for (const offset of [-3, 0, 3].filter((n) => Math.abs(n) < half)) {
    const d = offset * spacing;
    roads.push({
      center: [d * Math.cos(angle), 0.3, -d * Math.sin(angle)],
      size: [10, 0.5, city.radius * 1.8],
      orientation: rotation,
    });
    roads.push({
      center: [d * Math.sin(angle), 0.3, d * Math.cos(angle)],
      size: [city.radius * 1.8, 0.5, 10],
      orientation: rotation,
    });
  }
  return {
    buildings,
    roads,
    landmark: [0, landmarkHeight, 0],
    districts: ['Civic', 'Habitat', 'Industry', 'Research', 'Spaceport'].map((name, i) => ({
      name,
      center: [Math.sin(i * 1.4) * city.radius * 0.5, 0, Math.cos(i * 1.4) * city.radius * 0.5],
    })),
  };
}
export function settlementSpaceport(
  body: CelestialDefinition,
  city: SettlementDefinition,
): StationDefinition {
  const layout = generateCityLayout(city);
  const pads = city.kind === 'capital' ? 3 : city.kind === 'regional' ? 2 : 1;
  return {
    id: `${city.id}-spaceport`,
    name: `${city.name} Spaceport`,
    type: 'surface',
    parentId: body.id,
    surfaceAnchor: {
      latitude: city.latitude,
      longitude: city.longitude,
      elevation: city.elevation,
    },
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    ports: Array.from({ length: pads }, (_, i) => ({
      id: `pad-${i + 1}`,
      name: `Pad ${i + 1}`,
      kind: 'surface',
      position: [(i - (pads - 1) / 2) * 100, 8, city.radius * 0.64],
      approach: [(i - (pads - 1) / 2) * 100, 180, city.radius * 0.64 + 380],
      orientation: [0, 0, 0, 1],
    })),
    boxes: [
      ...layout.buildings,
      { center: [0, 0, city.radius * 0.64], size: [pads * 110, 4, 100], role: 'hangar' },
    ],
    services: ['repair', 'shields', 'weapons'],
  };
}

export interface TransportRoute {
  readonly id: string;
  readonly points: readonly Position3[];
  readonly bridges: number;
}
/** Terrain-following links on the same landmass; long ocean crossings are deliberately omitted. */
export function generateTransportRoutes(body: CelestialDefinition): TransportRoute[] {
  const cities = body.settlements ?? [];
  const hub = cities.find((c) => c.kind === 'capital') ?? cities[0];
  if (!hub) return [];
  const start = surfaceDirection(hub.latitude, hub.longitude);
  const routes: TransportRoute[] = [];
  for (const city of cities.filter((c) => c !== hub).slice(0, 5)) {
    const end = surfaceDirection(city.latitude, city.longitude);
    const angle = Math.acos(Math.max(-1, Math.min(1, start.dot(end))));
    if (angle > 1.4) continue;
    const points: Position3[] = [];
    let bridges = 0,
      wetRun = 0,
      suitable = true;
    const segments = Math.min(256, Math.max(32, Math.ceil((angle * body.radius) / 500)));
    for (let i = 0; i <= segments; i++) {
      const direction = start
        .clone()
        .lerp(end, i / segments)
        .normalize();
      const height = terrainHeight(body, direction);
      const wet = body.ocean && height <= body.ocean.level;
      wetRun = wet ? wetRun + (angle * body.radius) / segments : 0;
      if (wetRun > 1000) {
        suitable = false;
        break;
      }
      if (wet) bridges++;
      points.push(
        direction
          .multiplyScalar(body.radius + Math.max(height, (body.ocean?.level ?? -Infinity) + 6) + 1)
          .toArray(),
      );
    }
    if (suitable) routes.push({ id: `${hub.id}-to-${city.id}`, points, bridges });
  }
  return routes;
}
