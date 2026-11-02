import { describe, expect, it, vi } from 'vitest';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import { joinSchema, PROTOCOL_VERSION } from '@/engine/network/protocol';
import {
  type BuildingInstance,
  buildingCollisionBoxes,
} from '@/engine/planetary/buildingTemplates';
import { generateSettlements } from '@/engine/planetary/cities';
import { generateCityLayout, selectCityBlocks } from '@/engine/planetary/cityLayout';
import { surfaceDirection } from '@/engine/planetary/coordinates';
import { foundationRadius } from '@/engine/planetary/foundations';
import {
  buildSceneryCell,
  sceneryCellKey,
  sceneryExcluded,
  selectSceneryCells,
} from '@/engine/planetary/scenery';
import { describeSurface, surfaceColor } from '@/engine/planetary/surfaceDescription';
import { SURFACE_GENERATION_REVISION } from '@/engine/planetary/surfaceNoise';
import {
  maximumTerrainHeight,
  naturalTerrainHeight,
  terrainHeight,
} from '@/engine/planetary/terrain';
import { buildTerrainPatch, cubeDirection } from '@/engine/planetary/terrainLod';
import { FrameCapture } from '@/engine/rendering/FrameCapture';
import { portPose, traceStation } from '@/engine/stations/stationGeometry';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import { SYSTEMS } from '@/engine/world/systems';
import {
  BUILDING_TEMPLATES,
  createBuildingGeometry,
} from '@/features/planets/rendering/buildingGeometry';
import { PlanetGeneration, type PlanetWorker } from '@/features/planets/rendering/PlanetGeneration';
import type {
  PlanetJob,
  PlanetWorkerRequest,
  PlanetWorkerResponse,
} from '@/features/planets/rendering/planetGenerationJobs';
import { bakeSurfaceFace } from '@/features/planets/rendering/surfaceBake';
import {
  PLANET_VISUAL_BYTES,
  reserveVisualBytes,
  visualMetrics,
} from '@/features/planets/rendering/visualBudget';
import { placeVerificationPilots, setVerificationNight } from '../scripts/planetaryFixtures';
import anchors from './fixtures/planetaryAnchors.json';

function required<T>(value: T | undefined | null): T {
  if (value == null) throw new Error('Missing test fixture.');
  return value;
}
const solara = required(SYSTEMS[0]),
  pelagos = required(solara.bodies.find((body) => body.id === 'pelagos'));

describe('surface revision and preserved chart', () => {
  it('preserves every pre-revision body size/rotation, settlement anchor, pad and arrival', () => {
    for (const old of anchors) {
      const system = required(SYSTEMS.find((system) => system.id === old.id));
      expect(system.spawns).toEqual(old.spawns);
      for (const previous of old.bodies) {
        const body = required(system.bodies.find((body) => body.id === previous.id));
        expect(body.radius).toBe(previous.radius);
        expect(body.rotation).toEqual(previous.rotation);
        expect(
          (body.settlements ?? []).map((city) => ({
            id: city.id,
            name: city.name,
            latitude: city.latitude,
            longitude: city.longitude,
            elevation: city.elevation,
            radius: city.radius,
            seed: city.seed,
          })),
        ).toEqual(previous.settlements);
      }
      for (const previous of old.ports) {
        const station = required(system.stations?.find((station) => station.id === previous.id));
        expect(station.surfaceAnchor).toEqual(previous.surfaceAnchor);
        expect(station.ports).toEqual(previous.ports);
      }
    }
    expect(PROTOCOL_VERSION).toBe(5);
    expect(joinSchema.safeParse({ v: 4, name: 'Old client', systemId: 'solara' }).success).toBe(
      false,
    );
  });
  it('still generates reproducible suitable settlements for new worlds', () => {
    const body = { ...pelagos, id: 'uncharted', settlements: [] };
    const a = generateSettlements(body, 'DEVELOPED', 'New Capital');
    expect(a).toEqual(generateSettlements(structuredClone(body), 'DEVELOPED', 'New Capital'));
    expect(a.filter((city) => city.kind === 'capital')).toHaveLength(1);
    expect(
      a.every(
        (city) =>
          !city.authored &&
          naturalTerrainHeight(body, surfaceDirection(city.latitude, city.longitude)) > 360,
      ),
    ).toBe(true);
  });
});
describe('rotating QA fixtures', () => {
  it('uses the body/station frame and relative velocity at night without protocol fixtures', () => {
    const world = new MultiplayerWorld('vesper');
    const pilot = world.addPlayer('night-pilot', 'Night');
    expect(setVerificationNight(world)).toBe(true);
    expect(placeVerificationPilots(world, 'city')).toBe(true);
    const body = required(world.system.definition.bodies.find((body) => body.landable));
    const city = required(body.settlements?.[0]);
    const station = required(
      world.system.definition.stations?.find((station) => station.id === `${city.id}-spaceport`),
    );
    const pose = portPose(world.system, station, required(station.ports[0]));
    const position = new Vector3(),
      orientation = new Quaternion();
    pilot.ship.controller.copyTransform(position, orientation);
    expect(position.distanceTo(pose.approach)).toBeLessThan(1e-6);
    expect(
      pilot.ship.controller.copyVelocity(new Vector3()).distanceTo(pose.velocity),
    ).toBeLessThan(0.1);
  });
});
describe('coherent physical surfaces', () => {
  it('creates coast, forest and a pale ridge in the Pelagos reference region', () => {
    const ocean = describeSurface(pelagos, surfaceDirection(-0.035, 2.27));
    const forest = describeSurface(pelagos, surfaceDirection(0.015, 2.26));
    const ridge = describeSurface(pelagos, surfaceDirection(0.025, 2.22));
    expect(ocean.biome).toBe('ocean');
    expect(forest.forest).toBeGreaterThan(0.4);
    expect(ridge.elevation).toBeGreaterThan(forest.elevation + 600);
    expect(ridge.cover[3]).toBeGreaterThan(0.2);
  });
  it('honors the bounded terrain detail setting', () => {
    const direction = surfaceDirection(0.3, -1);
    const terrain = required(pelagos.terrain);
    expect(
      naturalTerrainHeight({ ...pelagos, terrain: { ...terrain, octaves: 1 } }, direction),
    ).not.toBe(naturalTerrainHeight(pelagos, direction));
  });
  it('keeps all archetypes deterministic, bounded and normalized including poles and cube edges', () => {
    const seen = new Set<string>();
    for (const body of SYSTEMS.flatMap((system) => system.bodies).filter((body) => body.terrain)) {
      for (let i = 0; i < 96; i++) {
        const up = surfaceDirection(Math.asin((i + 0.5) / 48 - 1), i * 2.39996323);
        const height = terrainHeight(body, up),
          sample = describeSurface(body, up);
        expect(height).toBeGreaterThanOrEqual(0);
        expect(height).toBeLessThanOrEqual(maximumTerrainHeight(body) + 1e-5);
        expect(sample).toEqual(describeSurface(structuredClone(body), up));
        expect(sample.cover.reduce((a, b) => a + b)).toBeCloseTo(1, 10);
        expect(sample.cover.every((value) => value >= 0 && value <= 1)).toBe(true);
        expect(surfaceColor(body, sample).every(Number.isFinite)).toBe(true);
        seen.add(sample.biome);
      }
    }
    for (const biome of ['ocean', 'forest', 'dunes', 'ice', 'rock', 'basalt'])
      expect(seen.has(biome)).toBe(true);
  });
  it('transfers matching radial directions and biome weights across patch edges and skirts', () => {
    const a = buildTerrainPatch(pelagos, { face: 4, level: 10, x: 512, y: 512 });
    const b = buildTerrainPatch(pelagos, { face: 4, level: 10, x: 513, y: 512 });
    const resolution = required(pelagos.terrain).patchResolution,
      width = resolution + 1;
    for (let y = 0; y < width; y++) {
      const i = y * width + resolution,
        j = y * width;
      expect([...a.directions.subarray(i * 3, i * 3 + 3)]).toEqual([
        ...b.directions.subarray(j * 3, j * 3 + 3),
      ]);
      expect([...a.cover.subarray(i * 4, i * 4 + 4)]).toEqual([
        ...b.cover.subarray(j * 4, j * 4 + 4),
      ]);
    }
    expect(a.directions.length / 3).toBe(a.positions.length / 3);
    expect(a.cover.length / 4).toBe(a.positions.length / 3);
  });
  it('bakes exactly the shared field, with strips equal to a whole face and matching edge heights', () => {
    const size = 16,
      whole = bakeSurfaceFace(pelagos, 0, size),
      joined = new Uint8Array(whole.length);
    for (let row = 0; row < size; row += 4)
      joined.set(bakeSurfaceFace(pelagos, 0, size, row, 4), row * size * 4);
    expect(joined).toEqual(whole);
    const adjacent = bakeSurfaceFace(pelagos, 5, size);
    for (let y = 0; y < size; y++)
      expect(whole[(y * size + size - 1) * 4 + 3]).toBe(adjacent[y * size * 4 + 3]);
    const up = cubeDirection(0, -1, 1),
      height = terrainHeight(pelagos, up);
    expect(whole[3]).toBe(Math.round(Math.min(1, height / required(pelagos.terrain).relief) * 255));
  });
});
describe('bounded geography-aware scenery', () => {
  it('selects unique stable cells at seams/poles and bounds deterministic instances', () => {
    for (const direction of [
      surfaceDirection(0.015, 2.26),
      new Vector3(0, 1, 0),
      new Vector3(1, 0, 1).normalize(),
    ]) {
      const cells = selectSceneryCells(pelagos, direction);
      expect(cells.length).toBeLessThanOrEqual(32);
      expect(new Set(cells.map(sceneryCellKey)).size).toBe(cells.length);
      expect(cells).toEqual(selectSceneryCells(structuredClone(pelagos), direction));
    }
    const cells = selectSceneryCells(pelagos, surfaceDirection(0.015, 2.26));
    const a = cells.flatMap((cell) => buildSceneryCell(pelagos, cell));
    expect(a.length).toBeGreaterThan(50);
    expect(a.length).toBeLessThanOrEqual(4096);
    expect(a).toEqual(cells.flatMap((cell) => buildSceneryCell(structuredClone(pelagos), cell)));
    for (const instance of a) {
      const up = new Vector3().fromArray(instance.position).normalize();
      expect(sceneryExcluded(pelagos, up, [])).toBe(false);
      expect(terrainHeight(pelagos, up)).toBeGreaterThan(required(pelagos.ocean).level + 4);
    }
  });
  it('excludes survey foundations, cities, approach corridors, roads and water', () => {
    const city = required(pelagos.settlements?.[0]);
    expect(sceneryExcluded(pelagos, surfaceDirection(city.latitude, city.longitude), [])).toBe(
      true,
    );
    const zone = required(pelagos.landingZones?.[0]);
    expect(sceneryExcluded(pelagos, surfaceDirection(zone.latitude, zone.longitude), [])).toBe(
      true,
    );
    const direction = surfaceDirection(0.015, 2.26),
      a = direction.clone().multiplyScalar(pelagos.radius),
      b = a.clone().add(new Vector3(30, 0, 0));
    expect(
      sceneryExcluded(pelagos, direction, [
        { id: 'road', points: [a.toArray(), b.toArray()], bridges: 0 },
      ]),
    ).toBe(true);
    const sea = selectSceneryCells(pelagos, surfaceDirection(-0.035, 2.27));
    expect(sea.flatMap((cell) => buildSceneryCell(pelagos, cell))).toHaveLength(0);
  });
});
describe('districts and shared building recipes', () => {
  it('keeps city blocks bounded, reproduces districts and leaves every port capture path clear', () => {
    for (const system of SYSTEMS) {
      const world = new SystemRuntime(system, 137);
      for (const body of system.bodies)
        for (const city of body.settlements ?? []) {
          const layout = generateCityLayout(city);
          expect(layout).toEqual(generateCityLayout(structuredClone(city)));
          expect(layout.collisionBoxes.length + 1).toBeLessThanOrEqual(512);
          if (city.kind === 'capital')
            for (const district of layout.districts)
              expect(layout.buildings.some((building) => building.districtId === district.id)).toBe(
                true,
              );
          expect(layout.districts.map((d) => d.id)).toEqual([
            'civic',
            'habitat',
            'industry',
            'research',
            'spaceport',
          ]);
          expect(selectCityBlocks(layout, 0, 0).length).toBeLessThanOrEqual(16);
          const station = required(system.stations?.find((s) => s.id === `${city.id}-spaceport`));
          for (const port of station.ports) {
            const pose = portPose(world, station, port);
            expect(traceStation(world, pose.approach, pose.position, 5)).toBeNull();
          }
          expect(foundationRadius(city, 0)).not.toBe(foundationRadius(city, 1));
        }
    }
  });
  it('preserves rotated expanded-corner contacts and fast sweeps through thin walls', () => {
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);
    const station = {
      id: 'test-wall',
      name: 'Wall',
      type: 'industrial' as const,
      position: [0, 0, 0] as const,
      orientation: [0, 0, 0, 1] as const,
      ports: [
        {
          id: 'test-port',
          name: 'Test',
          kind: 'external' as const,
          position: [0, 1000, 0] as const,
          approach: [0, 1200, 0] as const,
          orientation: [0, 0, 0, 1] as const,
        },
      ],
      services: [],
      boxes: [
        {
          center: [0, 0, 0] as const,
          size: [200, 10, 10] as const,
          role: 'hull' as const,
          orientation: rotation.toArray(),
        },
      ],
    };
    const world = new SystemRuntime({ ...solara, stations: [...(solara.stations ?? []), station] });
    const start = new Vector3(102.5, 0, 9.75).applyQuaternion(rotation),
      end = new Vector3(102.49, 0, 9.74).applyQuaternion(rotation);
    expect(traceStation(world, start, end, 5)?.fraction).toBe(0);
    const fast = traceStation(
      world,
      new Vector3(-1000, 0, 0).applyQuaternion(rotation),
      new Vector3(1000, 0, 0).applyQuaternion(rotation),
      5,
    );
    expect(fast?.fraction).toBeCloseTo(0.4475, 6);
  });
  it('contains actual renderer vertices in the same rotated collision boxes for every kit/style', () => {
    for (const style of ['towers', 'domes', 'habitats', 'industrial', 'modules'] as const)
      for (const template of BUILDING_TEMPLATES) {
        const geometry = createBuildingGeometry(template, style),
          positions = geometry.getAttribute('position');
        const building: BuildingInstance = {
          id: 'test',
          blockId: 'block',
          districtId: 'civic',
          template,
          center: [30, 25, 10],
          size: [10, 40, 15],
          orientation: [0, Math.sin(0.2), 0, Math.cos(0.2)],
          role: 'hull',
          variant: 0,
        };
        const boxes = buildingCollisionBoxes(building),
          rotation = new Quaternion().fromArray(required(building.orientation));
        for (let i = 0; i < positions.count; i++) {
          const vertex = new Vector3(
            positions.getX(i) * 10,
            positions.getY(i) * 40,
            positions.getZ(i) * 15,
          )
            .applyQuaternion(rotation)
            .add(new Vector3().fromArray(building.center));
          expect(
            boxes.some((box) => {
              const p = vertex
                .clone()
                .sub(new Vector3().fromArray(box.center))
                .applyQuaternion(rotation.clone().invert());
              return (
                Math.abs(p.x) <= box.size[0] / 2 + 1e-4 &&
                Math.abs(p.y) <= box.size[1] / 2 + 1e-4 &&
                Math.abs(p.z) <= box.size[2] / 2 + 1e-4
              );
            }),
          ).toBe(true);
        }
        geometry.dispose();
      }
  });
});

class FakeWorker implements PlanetWorker {
  onmessage: PlanetWorker['onmessage'] = null;
  onerror: PlanetWorker['onerror'] = null;
  sent: PlanetWorkerRequest[] = [];
  terminated = false;
  postMessage(request: PlanetWorkerRequest) {
    this.sent.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  finish(request = required(this.sent.at(-1)), revision = SURFACE_GENERATION_REVISION) {
    this.onmessage?.(
      new MessageEvent<PlanetWorkerResponse>('message', {
        data: {
          id: request.id,
          revision,
          ms: 1,
          result: { kind: 'surface', pixels: new Uint8Array(4) },
        },
      }),
    );
  }
}
describe('generation lifetime and performance accounting', () => {
  const job: PlanetJob = {
    kind: 'surface',
    body: pelagos,
    face: 0,
    resolution: 64,
    row: 0,
    rows: 16,
  };
  it('uses two workers, prioritizes roots and suppresses cancelled/stale generation', () => {
    const workers: FakeWorker[] = [],
      pool = new PlanetGeneration(() => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      });
    const low = vi.fn(),
      root = vi.fn(),
      stale = vi.fn();
    pool.request('far', 5, job, low);
    pool.request('root', 0, job, root);
    const cancel = pool.request('cancelled', 1, job, stale);
    cancel();
    pool.start();
    expect(workers).toHaveLength(2);
    expect(required(workers[0]).sent[0]?.id).toBe(2);
    required(workers[0]).finish();
    required(workers[1]).finish();
    expect(root).toHaveBeenCalledOnce();
    expect(low).toHaveBeenCalledOnce();
    expect(stale).not.toHaveBeenCalled();
    const ignored = vi.fn(),
      oldWorker = required(workers[0]);
    pool.request('active', 0, job, ignored);
    const active = required(oldWorker.sent.at(-1));
    pool.dispose();
    oldWorker.finish(active);
    expect(ignored).not.toHaveBeenCalled();
    expect(workers.every((worker) => worker.terminated)).toBe(true);
    // Child effects can enqueue before the scene effect restarts during Strict Mode.
    pool.request('remount', 0, job, root);
    pool.start();
    expect(workers).toHaveLength(4);
    required(workers[2]).finish();
    expect(root).toHaveBeenCalledTimes(2);
    pool.dispose();
  });
  it('rejects stale revisions, replaces a failed worker and retries only once', () => {
    const workers: FakeWorker[] = [],
      pool = new PlanetGeneration(() => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      });
    pool.start();
    const done = vi.fn(),
      failed = vi.fn();
    pool.request('bad-revision', 0, job, done, failed);
    required(workers[0]).finish(undefined, -1);
    expect(done).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
    pool.request('retry', 0, job, done, failed);
    const worker = required(workers[0]);
    worker.onerror?.(new Event('error') as ErrorEvent);
    expect(worker.terminated).toBe(true);
    expect(workers).toHaveLength(3);
    required(workers[2]).finish();
    expect(done).toHaveBeenCalledOnce();
    pool.dispose();
  });
  it('bounds allocation accounting and releases once', () => {
    const before = visualMetrics.bytes,
      release = required(reserveVisualBytes(1024));
    expect(visualMetrics.bytes).toBe(before + 1024);
    expect(reserveVisualBytes(PLANET_VISUAL_BYTES)).toBeNull();
    release();
    release();
    expect(visualMetrics.bytes).toBe(before);
  });
  it('captures a full minute of real frame times and flags background gaps', () => {
    const capture = new FrameCapture();
    capture.start();
    for (let i = 0; i < 3000; i++) capture.push(20);
    expect(capture.report()).toMatchObject({
      seconds: 60,
      frames: 3000,
      p50: 20,
      p95: 20,
      p99: 20,
      valid: true,
      complete: true,
    });
    capture.start();
    capture.push(16, false);
    capture.push(500);
    expect(capture.report().valid).toBe(false);
  });
});
