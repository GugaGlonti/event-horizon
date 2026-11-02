import type { StationBox } from '@/engine/stations/stationTypes';
import type { Position3, Rotation4 } from '@/engine/world/worldTypes';
import {
  type BuildingInstance,
  type BuildingTemplate,
  buildingCollisionBoxes,
} from './buildingTemplates';
import type { SettlementDefinition } from './environmentTypes';
import { foundationRadius } from './foundations';
import { seededRandom } from './seededRandom';
export interface CityLayout {
  buildings: BuildingInstance[];
  collisionBoxes: StationBox[];
  roads: { center: Position3; size: Position3; orientation: Rotation4 }[];
  districts: { id: string; name: string; center: Position3 }[];
  blocks: { id: string; districtId: string; center: Position3; size: number }[];
  landmark: Position3;
}
/** Static district-first layout; authored pad frames and the southern approach stay untouched. */
export function generateCityLayout(city: SettlementDefinition): CityLayout {
  const random = seededRandom(city.seed),
    buildings: BuildingInstance[] = [],
    collisionBoxes: StationBox[] = [],
    roads: CityLayout['roads'] = [],
    blocks: CityLayout['blocks'] = [];
  const districts = [
    { id: 'civic', name: 'Civic', center: [0, 0, 0] as Position3 },
    {
      id: 'habitat',
      name: 'Habitat',
      center: [-city.radius * 0.45, 0, -city.radius * 0.1] as Position3,
    },
    {
      id: 'industry',
      name: 'Industry',
      center: [city.radius * 0.5, 0, city.radius * 0.12] as Position3,
    },
    {
      id: 'research',
      name: 'Research',
      center: [city.radius * 0.1, 0, -city.radius * 0.55] as Position3,
    },
    { id: 'spaceport', name: 'Spaceport', center: [0, 0, city.radius * 0.64] as Position3 },
  ];
  const blockSize = Math.min(400, city.radius * 0.5),
    half = Math.ceil(city.radius / blockSize);
  const add = (
    template: BuildingTemplate,
    x: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    blockId: string,
    districtId: string,
    landmark = false,
  ) => {
    const yaw = template === 'hangar' || landmark ? 0 : (random() - 0.5) * 0.08;
    const instance: BuildingInstance = {
      id: `${city.id}-building-${buildings.length}`,
      template,
      center: [x, height / 2, z],
      size: [width, height, depth],
      orientation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
      role: template === 'hangar' ? 'hangar' : 'hull',
      blockId,
      districtId,
      variant: Math.floor(random() * 8),
      ...(landmark ? { landmark: true } : {}),
    };
    const boxes = buildingCollisionBoxes(instance);
    if (collisionBoxes.length + boxes.length > 500) return;
    buildings.push(instance);
    collisionBoxes.push(...boxes);
  };
  let coordinates: (readonly [number, number])[] = [];
  for (let x = -half; x < half; x++) for (let z = -half; z < half; z++) coordinates.push([x, z]);
  // Large capitals distribute their finite collision budget across every district.
  if (city.radius > 2400) {
    const ordering = seededRandom(city.seed ^ 7919);
    coordinates = coordinates
      .map((point) => ({ point, order: ordering() }))
      .sort((a, b) => a.order - b.order)
      .map((item) => item.point);
  }
  for (const [x, z] of coordinates) {
    const px = (x + 0.5) * blockSize,
      pz = (z + 0.5) * blockSize;
    const radius = foundationRadius(city, Math.atan2(pz, px));
    if (
      Math.hypot(px, pz) + blockSize * 0.48 > radius * 0.97 ||
      random() < (city.kind === 'outpost' ? 0 : 0.12)
    )
      continue;
    const district = [...districts].sort(
      (a, b) =>
        Math.hypot(px - a.center[0], pz - a.center[2]) -
        Math.hypot(px - b.center[0], pz - b.center[2]),
    )[0];
    if (!district) continue;
    const blockId = `${x}/${z}`;
    blocks.push({ id: blockId, districtId: district.id, center: [px, 0, pz], size: blockSize });
    for (const [ox, oz] of [
      [-0.22, -0.22],
      [0.22, -0.22],
      [-0.22, 0.22],
      [0.22, 0.22],
    ] as const) {
      const bx = px + ox * blockSize,
        bz = pz + oz * blockSize;
      if (
        (Math.abs(bx) < 300 && bz > city.radius * 0.3) ||
        Math.hypot(bx, bz) < Math.min(220, city.radius * 0.23) ||
        random() < (city.kind === 'outpost' ? 0 : 0.12)
      )
        continue;
      if (
        city.kind !== 'outpost' &&
        Math.abs(Math.abs(bx) - city.radius * 0.22) < 200 &&
        Math.abs(bz - city.radius * 0.62) < 220
      )
        continue;
      const central = Math.max(0, 1 - Math.hypot(bx, bz) / city.radius);
      let template: BuildingTemplate =
        district.id === 'industry'
          ? 'industrial'
          : district.id === 'spaceport'
            ? 'hangar'
            : district.id === 'civic'
              ? random() < 0.55
                ? 'setback'
                : 'slab'
              : district.id === 'research'
                ? 'habitat'
                : random() < 0.25
                  ? 'slab'
                  : 'lowrise';
      if (city.style === 'domes' || city.style === 'habitats')
        template =
          district.id === 'industry'
            ? 'industrial'
            : district.id === 'spaceport'
              ? 'hangar'
              : 'habitat';
      if (city.style === 'modules') template = district.id === 'spaceport' ? 'hangar' : 'lowrise';
      if (city.style === 'industrial')
        template =
          district.id === 'spaceport' ? 'hangar' : random() < 0.6 ? 'industrial' : 'lowrise';
      const width = blockSize * (0.2 + random() * 0.1);
      const height =
        template === 'slab' || template === 'setback'
          ? 40 + central ** 2 * (city.kind === 'capital' ? 380 : 140) * (0.45 + random() * 0.55)
          : template === 'industrial'
            ? 30 + random() * 60
            : 16 + random() * 38;
      add(template, bx, bz, width, height, width * (0.8 + random() * 0.35), blockId, district.id);
    }
  }
  const landmarkHeight = city.kind === 'capital' ? 560 : city.kind === 'regional' ? 140 : 42;
  // Reserve the civic landmark before any decorative hangars consume the remaining box allowance.
  if (collisionBoxes.length > 490) {
    while (collisionBoxes.length > 480) {
      const removed = buildings.pop();
      if (!removed) break;
      collisionBoxes.splice(collisionBoxes.length - buildingCollisionBoxes(removed).length);
    }
  }
  add(
    city.style === 'towers' ? 'setback' : 'habitat',
    0,
    0,
    city.radius * 0.05,
    landmarkHeight,
    city.radius * 0.05,
    'civic-landmark',
    'civic',
    true,
  );
  if (city.kind !== 'outpost') {
    add(
      'hangar',
      -city.radius * 0.22,
      city.radius * 0.62,
      Math.min(180, city.radius * 0.1),
      55,
      200,
      'spaceport-west',
      'spaceport',
    );
    add(
      'hangar',
      city.radius * 0.22,
      city.radius * 0.62,
      Math.min(180, city.radius * 0.1),
      55,
      200,
      'spaceport-east',
      'spaceport',
    );
  }
  // Connected street grid: lots stay inside blocks and the approach spine reaches the pad apron.
  for (let offset = -half + 1; offset < half; offset++) {
    const value = offset * blockSize;
    for (let segment = -half; segment < half; segment++) {
      const mid = (segment + 0.5) * blockSize;
      for (const [x, z, horizontal] of [
        [value, mid, false],
        [mid, value, true],
      ] as const) {
        if (Math.hypot(x, z) + blockSize * 0.4 > foundationRadius(city, Math.atan2(z, x)) * 0.98)
          continue;
        roads.push({
          center: [x, 0.18, z],
          size: horizontal
            ? [blockSize + 1, 0.25, offset === 0 ? 28 : 16]
            : [offset === 0 ? 28 : 16, 0.25, blockSize + 1],
          orientation: [0, 0, 0, 1],
        });
      }
    }
  }
  return { buildings, collisionBoxes, roads, districts, blocks, landmark: [0, landmarkHeight, 0] };
}
export function selectCityBlocks(layout: CityLayout, x: number, z: number) {
  return layout.blocks
    .filter((block) => Math.hypot(block.center[0] - x, block.center[2] - z) < 1800)
    .sort(
      (a, b) =>
        Math.hypot(a.center[0] - x, a.center[2] - z) - Math.hypot(b.center[0] - x, b.center[2] - z),
    )
    .slice(0, 16)
    .map((block) => block.id);
}
