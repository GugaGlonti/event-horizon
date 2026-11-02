import { Vector3 } from '@/engine/math/linear';
import type { CelestialDefinition, Position3 } from '@/engine/world/worldTypes';
import type { TransportRoute } from './cities';
import { surfaceDirection, tangentFrame } from './coordinates';
import { seededRandom } from './seededRandom';
import { describeSurface } from './surfaceDescription';
import { terrainHeight, terrainNormal } from './terrain';
import { cubeDirection } from './terrainLod';

export const SCENERY_CELL_METRES = 256;
export const SCENERY_CELL_LIMIT = 32;
export const SCENERY_INSTANCE_LIMIT = 4096;
export type SceneryKind = 'broadleaf' | 'conifer' | 'shrub' | 'rock';
export interface SceneryCell {
  face: number;
  x: number;
  y: number;
}
export interface SceneryInstance {
  kind: SceneryKind;
  position: Position3;
  height: number;
  width: number;
  heading: number;
  tint: number;
}
export const sceneryCellKey = (cell: SceneryCell) => `${cell.face}/${cell.x}/${cell.y}`;
function cellAt(body: CelestialDefinition, direction: Readonly<Vector3>): SceneryCell {
  const { x, y, z } = direction,
    ax = Math.abs(x),
    ay = Math.abs(y),
    az = Math.abs(z);
  let face: number, u: number, v: number;
  if (ax >= ay && ax >= az) {
    face = x >= 0 ? 0 : 1;
    u = x >= 0 ? -z / ax : z / ax;
    v = y / ax;
  } else if (ay >= az) {
    face = y >= 0 ? 2 : 3;
    u = x / ay;
    v = y >= 0 ? -z / ay : z / ay;
  } else {
    face = z >= 0 ? 4 : 5;
    u = z >= 0 ? x / az : -x / az;
    v = y / az;
  }
  return {
    face,
    x: Math.floor(((u + 1) * body.radius) / SCENERY_CELL_METRES),
    y: Math.floor(((v + 1) * body.radius) / SCENERY_CELL_METRES),
  };
}
export function selectSceneryCells(body: CelestialDefinition, local: Readonly<Vector3>) {
  const up = new Vector3().copy(local).normalize(),
    frame = tangentFrame(up);
  const east = new Vector3(1, 0, 0).applyQuaternion(frame),
    south = new Vector3(0, 0, 1).applyQuaternion(frame);
  const cells = new Map<string, { cell: SceneryCell; distance: number }>();
  for (let y = -4; y <= 4; y++)
    for (let x = -4; x <= 4; x++) {
      const point = up
        .clone()
        .multiplyScalar(body.radius)
        .addScaledVector(east, x * 220)
        .addScaledVector(south, y * 220)
        .normalize();
      const cell = cellAt(body, point),
        key = sceneryCellKey(cell);
      const old = cells.get(key),
        distance = x * x + y * y;
      if (!old || old.distance > distance) cells.set(key, { cell, distance });
    }
  return [...cells.values()]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, SCENERY_CELL_LIMIT)
    .map((c) => c.cell);
}
export function sceneryExcluded(
  body: CelestialDefinition,
  direction: Readonly<Vector3>,
  routes: readonly TransportRoute[],
) {
  for (const city of body.settlements ?? []) {
    const up = surfaceDirection(city.latitude, city.longitude);
    const offset = new Vector3().subVectors(direction, up).multiplyScalar(body.radius);
    if (offset.lengthSq() < (city.radius * 1.35) ** 2) return true;
    const frame = tangentFrame(up).invert();
    offset.applyQuaternion(frame);
    if (
      Math.abs(offset.x) < 300 &&
      offset.z > city.radius * 0.3 &&
      offset.z < city.radius * 0.64 + 850
    )
      return true;
  }
  for (const zone of body.landingZones ?? [])
    if (
      surfaceDirection(zone.latitude, zone.longitude).distanceToSquared(direction) *
        body.radius ** 2 <
      (zone.radius * 2) ** 2
    )
      return true;
  const point = new Vector3().copy(direction).multiplyScalar(body.radius);
  for (const route of routes)
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i];
      if (!a || !b) continue;
      const av = new Vector3().fromArray(a).normalize().multiplyScalar(body.radius),
        bv = new Vector3().fromArray(b).normalize().multiplyScalar(body.radius);
      const ab = bv.sub(av),
        t = Math.max(0, Math.min(1, point.clone().sub(av).dot(ab) / Math.max(1, ab.lengthSq())));
      if (av.addScaledVector(ab, t).distanceToSquared(point) < 35 ** 2) return true;
    }
  return false;
}
export function buildSceneryCell(
  body: CelestialDefinition,
  cell: SceneryCell,
  routes: readonly TransportRoute[] = [],
): SceneryInstance[] {
  const random = seededRandom(
    (body.terrain?.seed ?? 1) ^
      Math.imul(cell.face + 1, 73856093) ^
      Math.imul(cell.x, 19349663) ^
      Math.imul(cell.y, 83492791),
  );
  const result: SceneryInstance[] = [];
  for (let i = 0; i < 96; i++) {
    const u = ((cell.x + random()) * SCENERY_CELL_METRES) / body.radius - 1,
      v = ((cell.y + random()) * SCENERY_CELL_METRES) / body.radius - 1;
    if (Math.abs(u) > 1 || Math.abs(v) > 1) continue;
    const direction = cubeDirection(cell.face, u, v),
      height = terrainHeight(body, direction);
    if (height <= (body.ocean?.level ?? -Infinity) + 4 || sceneryExcluded(body, direction, routes))
      continue;
    const slope = 1 - terrainNormal(body, direction).dot(direction);
    if (slope > 0.13) continue;
    const sample = describeSurface(body, direction, height, slope),
      chance = random();
    let kind: SceneryKind;
    if (sample.forest > 0.28 && chance < sample.forest * 0.72)
      kind = sample.temperature < 280 || random() < 0.42 ? 'conifer' : 'broadleaf';
    else if (chance < 0.17 && sample.cover[0] > 0.4) kind = 'shrub';
    else if (chance > 0.91) kind = 'rock';
    else continue;
    const scale = random(),
      tree = kind === 'broadleaf' || kind === 'conifer';
    result.push({
      kind,
      position: direction.multiplyScalar(body.radius + height - 0.15).toArray(),
      height: tree ? 9 + scale * 13 : kind === 'rock' ? 0.6 + scale * 2.2 : 0.4 + scale * 1.2,
      width: tree ? 4 + scale * 5 : 1 + scale * 2,
      heading: random() * Math.PI * 2,
      tint: 0.75 + random() * 0.35,
    });
  }
  return result;
}
