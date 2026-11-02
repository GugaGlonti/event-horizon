import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import { navigationContacts } from '@/engine/navigation/contacts';
import {
  departureObstruction,
  routeArrival,
  travelDirection,
} from '@/engine/navigation/hyperspaceRoute';
import { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import {
  actionSchema,
  joinSchema,
  PROTOCOL_VERSION,
  snapshotSchema,
} from '@/engine/network/protocol';
import {
  generateCityLayout,
  generateSettlements,
  generateTransportRoutes,
  settlementSuitability,
} from '@/engine/planetary/cities';
import { surfaceDirection } from '@/engine/planetary/coordinates';
import {
  daylightAt,
  restrictedAirspace,
  surfaceBiome,
  weatherAt,
} from '@/engine/planetary/environment';
import { PlanetaryEnvironment, SurfaceSample } from '@/engine/planetary/PlanetaryEnvironment';
import { surfaceHeight, terrainHeight } from '@/engine/planetary/terrain';
import { FLIGHT_CONFIG } from '@/engine/simulation/config';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { portPose, stationPose, traceStation } from '@/engine/stations/stationGeometry';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import { SETTLEMENT_ANCHORS } from '@/engine/world/settlementAnchors';
import { SYSTEMS } from '@/engine/world/systems';
import { validateSystem } from '@/engine/world/validateSystem';

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Missing fixture');
  return value;
}
const solara = required(SYSTEMS[0]),
  pelagos = required(solara.bodies.find((b) => b.id === 'pelagos'));

describe('expanded galaxy and shared cities', () => {
  it('admits and routes every system through the actual validated travel protocol', () => {
    expect(SYSTEMS).toHaveLength(10);
    expect(new Set(SYSTEMS.map((s) => s.environment.seed)).size).toBe(10);
    expect(
      new Set(SYSTEMS.flatMap((s) => s.bodies.map((b) => b.archetype)).filter(Boolean)).size,
    ).toBe(7);
    for (const system of SYSTEMS) {
      expect(
        joinSchema.safeParse({ v: PROTOCOL_VERSION, name: 'Survey', systemId: system.id }).success,
      ).toBe(true);
      expect(actionSchema.safeParse({ kind: 'travel', destination: system.id }).success).toBe(true);
      const world = new MultiplayerWorld(system.id);
      world.addPlayer('survey', 'Survey');
      expect(snapshotSchema.safeParse(world.snapshot('survey', 12000)).success).toBe(true);
      const runtime = new SystemRuntime(system, 9000);
      for (const source of SYSTEMS.filter((s) => s.id !== system.id)) {
        const direction = travelDirection(source, system),
          arrival = routeArrival(runtime, direction, 4800);
        expect(departureObstruction(runtime, arrival.position, direction, 5800)).toBeNull();
      }
      const contacts = navigationContacts(system);
      expect(new Set(contacts.map((c) => c.id)).size).toBe(contacts.length);
      for (const city of system.bodies.flatMap((b) => b.settlements ?? []))
        expect(contacts.some((c) => c.id === city.id)).toBe(true);
    }
    expect(
      joinSchema.safeParse({ v: PROTOCOL_VERSION, name: 'Survey', systemId: 'unlisted' }).success,
    ).toBe(false);
  });

  it('keeps every capital and regional city dry, separated and reproducible from its seed', () => {
    for (const system of SYSTEMS)
      for (const body of system.bodies.filter((b) => b.landable)) {
        const cities = body.settlements ?? [];
        if (cities.some((city) => city.authored))
          expect(cities).toEqual(SETTLEMENT_ANCHORS[body.id]);
        else expect(generateSettlements(body, body.civilization ?? 'UNINHABITED')).toEqual(cities);
        for (const city of cities) {
          if (!city.authored)
            expect(settlementSuitability(body, city.latitude, city.longitude).suitable).toBe(true);
          const up = surfaceDirection(city.latitude, city.longitude);
          expect(terrainHeight(body, up)).toBeCloseTo(city.elevation, 6);
          const a = generateCityLayout(city),
            b = generateCityLayout(JSON.parse(JSON.stringify(city)));
          expect(a).toEqual(b);
          expect(a.buildings.length).toBeLessThanOrEqual(512);
          expect(a.buildings.length).toBeGreaterThan(5);
          const station = required(system.stations?.find((s) => s.id === `${city.id}-spaceport`));
          expect(station.boxes.slice(0, -1)).toEqual(a.collisionBoxes);
          expect(station.ports.length).toBeGreaterThan(0);
        }
        if (body.civilization === 'DEVELOPED' || body.civilization === 'HIGHLY_URBANIZED') {
          expect(cities.filter((c) => c.kind === 'capital')).toHaveLength(1);
          expect(cities.filter((c) => c.kind === 'regional').length).toBeGreaterThanOrEqual(3);
        }
      }
  });

  it('rejects malformed oceans, climates, capitals, overlaps and surface anchors', () => {
    const city = required(pelagos.settlements?.[0]);
    for (const body of [
      { ...pelagos, ocean: { level: Number.NaN, color: '#ffffff' } },
      { ...pelagos, climate: { ...required(pelagos.climate), windSpeed: Infinity } },
      { ...pelagos, settlements: (pelagos.settlements ?? []).filter((s) => s.kind !== 'capital') },
      {
        ...pelagos,
        settlements: [
          ...(pelagos.settlements ?? []),
          { ...city, id: 'overlap', kind: 'outpost' as const },
        ],
      },
      { ...pelagos, settlements: (pelagos.settlements ?? []).map((s) => ({ ...s, elevation: 0 })) },
    ])
      expect(() =>
        validateSystem({
          ...solara,
          bodies: solara.bodies.map((b) => (b.id === body.id ? body : b)),
        }),
      ).toThrow();
    expect(() =>
      validateSystem({
        ...solara,
        stations: (solara.stations ?? []).map((s) =>
          s.surfaceAnchor ? { ...s, surfaceAnchor: { ...s.surfaceAnchor, latitude: 100 } } : s,
        ),
      }),
    ).toThrow(/surface station/);
  });
});

describe('physical environment consistency', () => {
  it('classifies coast, ocean and archetype biomes using deterministic shared heights', () => {
    const seen = new Set<string>();
    for (const body of SYSTEMS.flatMap((s) => s.bodies).filter((b) => b.terrain))
      for (let i = 0; i < 64; i++) {
        const up = surfaceDirection(Math.asin((i + 0.5) / 32 - 1), i * 2.39996323);
        const biome = surfaceBiome(body, up);
        seen.add(biome);
        expect(surfaceBiome(structuredClone(body), up)).toBe(biome);
        if (biome === 'ocean')
          expect(terrainHeight(body, up)).toBeLessThanOrEqual(required(body.ocean).level);
      }
    for (const biome of ['ocean', 'forest', 'ice', 'dunes', 'basalt', 'rock'])
      expect(seen.has(biome)).toBe(true);
  });
  it('synchronizes changing weather, bounds wind and never produces wind in vacuum', () => {
    const up = surfaceDirection(0.3, 0.4),
      clone = structuredClone(pelagos);
    const states = new Set<string>();
    for (let time = 0; time < 3000; time += 11) {
      const a = weatherAt(pelagos, time, up);
      expect(a).toEqual(weatherAt(clone, time, up));
      expect(a.intensity).toBeGreaterThanOrEqual(0);
      expect(a.intensity).toBeLessThanOrEqual(1);
      expect(a.visibility).toBeGreaterThan(500);
      states.add(a.intensity.toFixed(2));
    }
    expect(states.size).toBeGreaterThan(10);
    const barren = required(SYSTEMS.flatMap((s) => s.bodies).find((b) => b.archetype === 'barren'));
    expect(weatherAt(barren, 2000, up).windEast).toBe(0);
  });
  it('rotates day/night and surface facilities together without rotating moon orbits', () => {
    const body = { ...pelagos, rotation: { tilt: 0.2, speed: 0.00005 } };
    const world = new SystemRuntime({
      ...solara,
      bodies: solara.bodies.map((b) => (b.id === body.id ? body : b)),
    });
    const up = surfaceDirection(0, 0),
      day = daylightAt(world, body, up),
      moon = required(world.positions.get('lyra')).clone();
    world.update(Math.PI / body.rotation.speed);
    expect(daylightAt(world, body, up)).toBeCloseTo(-day);
    const station = required(world.definition.stations?.find((s) => s.surfaceAnchor));
    const pose = stationPose(world, station);
    expect(
      portPose(world, station, required(station.ports[0])).approach.distanceTo(
        required(world.positions.get(station.id)),
      ),
    ).toBeLessThan(1e-8);
    expect(pose.velocity.length()).toBeGreaterThan(1);
    expect(required(world.positions.get('lyra')).distanceTo(moon)).toBeGreaterThan(100);
    const city = required(body.settlements?.[0]);
    expect(
      restrictedAirspace(body, surfaceDirection(city.latitude, city.longitude), 100)?.id,
    ).toContain(city.id);
    expect(
      restrictedAirspace(body, surfaceDirection(city.latitude, city.longitude), 3000),
    ).toBeNull();
  });
  it('blocks ocean penetration while rejecting ocean touchdown', () => {
    let up = surfaceDirection(0, 0);
    for (let i = 0; i < 512; i++) {
      up = surfaceDirection(Math.asin((i + 0.5) / 256 - 1), i * 2.39996323);
      if (surfaceBiome(pelagos, up) === 'ocean') break;
    }
    expect(surfaceBiome(pelagos, up)).toBe('ocean');
    const world = new SystemRuntime(solara),
      controller = new FlightController(FLIGHT_CONFIG);
    controller.environment = new PlanetaryEnvironment(world);
    const point = required(world.positions.get(pelagos.id))
      .clone()
      .addScaledVector(up, pelagos.radius + surfaceHeight(pelagos, up) + 5.01);
    controller.relocate(point, new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), up));
    controller.resolveMotion(point, up.clone().negate());
    controller.landingGear = true;
    controller.step(createFlightInput(), 1 / 120);
    expect(controller.surface.phase).not.toBe('landed');
    expect(controller.surface.phase).not.toBe('landing');
    const sample = controller.environment.sample(point, new SurfaceSample());
    expect(sample.liquid).toBe(true);
    expect(sample.normal.dot(sample.up)).toBeCloseTo(1);
  });
});

it('shares rotating planetary port occupancy, services, building collision and continuous release', () => {
  const world = new MultiplayerWorld('meridian'),
    a = world.addPlayer('a', 'Alpha'),
    b = world.addPlayer('b', 'Bravo');
  const station = required(world.system.definition.stations?.find((s) => s.type === 'surface')),
    port = required(station.ports[0]),
    ops = required(world.simulation.stations);
  const pose = portPose(world.system, station, port),
    side = new Vector3(100, 0, 0).applyQuaternion(pose.orientation);
  a.ship.controller.relocate(pose.approach, pose.orientation);
  a.ship.sync();
  b.ship.controller.relocate(pose.approach.clone().add(side), pose.orientation);
  b.ship.sync();
  expect(ops.request('a', station.id, port.id)).toBeNull();
  expect(ops.request('b', station.id, port.id)).toMatch(/occupied/);
  ops.step(0.01);
  const point = pose.position.clone().add(new Vector3(0, 0, 20).applyQuaternion(pose.orientation));
  a.ship.controller.relocate(point, pose.orientation);
  a.ship.controller.resolveMotion(point, pose.velocity);
  a.ship.sync();
  expect(ops.assist('a')).toBeNull();
  ops.step(2.1);
  expect(ops.state('a').phase).toBe('docked');
  a.ship.health.hull = 35;
  expect(ops.service('a', 'repair')).toBeNull();
  expect(a.ship.health.hull).toBe(100);
  const before = a.ship.position.clone();
  expect(ops.undock('a')).toBeNull();
  ops.step(0.01);
  expect(a.ship.position.distanceTo(before)).toBeLessThan(1);
  ops.step(4.1);
  expect(ops.occupancy.size).toBe(0);
  expect(a.ship.controller.flightLocked).toBe(false);
  const base = stationPose(world.system, station),
    building = required(station.boxes[0]);
  const wall = new Vector3()
    .fromArray(building.center)
    .applyQuaternion(base.orientation)
    .add(base.position);
  expect(
    traceStation(world.system, wall.clone().add(new Vector3(0, 1000, 0)), wall, 5),
  ).not.toBeNull();
});

it('streams at most three authoritative non-firing traffic ships near cities and cleans them on departure', () => {
  const world = new MultiplayerWorld('solara'),
    pilot = world.addPlayer('observer', 'Observer');
  world.step();
  expect(world.simulation.ships.size).toBe(1);
  const station = required(world.system.definition.stations?.find((s) => s.type === 'surface'));
  const pose = stationPose(world.system, station);
  pilot.ship.controller.relocate(
    pose.position.clone().add(new Vector3(0, 100, 200).applyQuaternion(pose.orientation)),
    pose.orientation,
  );
  pilot.ship.sync();
  world.step();
  const traffic = [...world.simulation.ships.values()].filter((s) => s.id.startsWith('traffic-'));
  expect(traffic).toHaveLength(3);
  const positions = traffic.map((s) => s.position.clone());
  for (let tick = 0; tick < 150; tick++) world.step();
  traffic.forEach((ship, i) => {
    expect(ship.command.fire).toBe(false);
    expect(ship.position.distanceTo(required(positions[i]))).toBeGreaterThan(0.1);
    expect(ship.health.destroyed).toBe(false);
  });
  expect(
    world.snapshot('observer', 12000).ships.filter((s) => s.id.startsWith('traffic-')),
  ).toHaveLength(3);
  expect(snapshotSchema.safeParse(world.snapshot('observer', 12000)).success).toBe(true);
  pilot.ship.controller.relocate(new Vector3(0, 2400000, 0), new Quaternion());
  pilot.ship.sync();
  world.step();
  expect([...world.simulation.ships.keys()].some((id) => id.startsWith('traffic-'))).toBe(false);
});

it('generates bounded deterministic transport links above the shared terrain', () => {
  let count = 0;
  for (const body of SYSTEMS.flatMap((system) => system.bodies)) {
    const routes = generateTransportRoutes(body);
    expect(routes).toEqual(generateTransportRoutes(structuredClone(body)));
    for (const route of routes) {
      count++;
      expect(route.points.length).toBeLessThanOrEqual(257);
      for (const point of route.points) {
        const position = new Vector3().fromArray(point),
          radius = position.length();
        expect(radius - body.radius).toBeGreaterThanOrEqual(
          terrainHeight(body, position.normalize()) + 0.99,
        );
      }
    }
  }
  expect(count).toBeGreaterThan(0);
});
