import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { EXIT_COAST_DISTANCE, HYPERSPACE_MOTION } from '@/engine/navigation/HyperspaceController';
import {
  departureObstruction,
  departureWindow,
  jumpBodyRadius,
  planDepartureDirection,
  routeArrival,
  routeOrientation,
  travelDirection,
  travelDistance,
} from '@/engine/navigation/hyperspaceRoute';
import { stationPose } from '@/engine/stations/stationGeometry';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import { validateCatalog, validateSystem } from '@/engine/world/validateSystem';
import { SYSTEMS } from '@/features/exploration/data/systems';

describe('galactic jump routes', () => {
  for (const source of SYSTEMS) {
    for (const destination of SYSTEMS.filter((system) => system.id !== source.id)) {
      it(`${source.name} → ${destination.name} faces along the route and arrives from the source`, () => {
        const direction = travelDirection(source, destination);
        const world = new SystemRuntime(destination, 130);
        const arrival = routeArrival(world, direction, EXIT_COAST_DISTANCE);
        const anchor = world.positions.get(destination.defaultTargetId);
        expect(anchor).toBeDefined();
        const forward = new Vector3(0, 0, -1).applyQuaternion(arrival.orientation);
        expect(forward.dot(direction)).toBeCloseTo(1, 12);
        expect(
          arrival.position
            .clone()
            .sub(anchor ?? new Vector3())
            .dot(direction),
        ).toBeLessThan(0);
        expect(departureObstruction(world, arrival.position, direction, 1800)).toBeNull();
        expect(
          departureObstruction(
            world,
            arrival.position.clone().addScaledVector(direction, -EXIT_COAST_DISTANCE),
            direction,
            EXIT_COAST_DISTANCE + 1000,
          ),
        ).toBeNull();
        expect(travelDistance(source, destination)).toBeCloseTo(
          travelDistance(destination, source),
        );
        const body = destination.bodies.find(
          (candidate) => candidate.id === destination.defaultTargetId,
        );
        const offset = arrival.position.clone().sub(anchor ?? new Vector3());
        offset.addScaledVector(direction, -offset.dot(direction));
        expect(offset.length()).toBeGreaterThan(
          (body?.radius ?? 0) * (body?.rings?.outer ?? 1) + 1000,
        );
        expect(direction.clone().add(travelDirection(destination, source)).length()).toBeLessThan(
          1e-12,
        );
      });
    }
  }

  it('keeps the near-planet endpoint independent of the incoming coast length', () => {
    const source = SYSTEMS[0],
      destination = SYSTEMS[1];
    if (!source || !destination) throw new Error('Missing fixtures.');
    const world = new SystemRuntime(destination);
    const direction = travelDirection(source, destination);
    const short = routeArrival(world, direction, 1000);
    const long = routeArrival(world, direction, 900000);
    expect(long.position.distanceTo(short.position)).toBeLessThan(1e-9);
    expect(
      departureObstruction(
        world,
        long.position.clone().addScaledVector(direction, -900000),
        direction,
        901000,
      ),
    ).toBeNull();
  });

  it('aligns a long departure beside a blocking planet without crossing its bounds', () => {
    const source = SYSTEMS[0],
      destination = SYSTEMS[1];
    if (!source || !destination) throw new Error('Missing fixtures.');
    const world = new SystemRuntime(source);
    const position = new Vector3().fromArray(world.arrival().position);
    const route = travelDirection(source, destination);
    const horizon = departureWindow(source, destination);
    expect(
      departureObstruction(world, position, route, HYPERSPACE_MOTION.departureDistance, horizon)
        ?.id,
    ).toBe('pelagos');
    const launch = planDepartureDirection(
      world,
      position,
      route,
      HYPERSPACE_MOTION.departureDistance,
      horizon,
    );
    expect(launch).not.toBeNull();
    if (!launch) throw new Error('Expected a clear heading.');
    expect(launch.length()).toBeCloseTo(1);
    expect(
      departureObstruction(world, position, launch, HYPERSPACE_MOTION.departureDistance, horizon),
    ).toBeNull();
    expect(
      planDepartureDirection(
        world,
        position,
        launch,
        HYPERSPACE_MOTION.departureDistance,
        horizon,
      )?.distanceTo(launch),
    ).toBeLessThan(1e-12);
    expect(
      planDepartureDirection(
        world,
        world.positions.get('pelagos') ?? position,
        route,
        HYPERSPACE_MOTION.departureDistance,
        horizon,
      ),
    ).toBeNull();
  });

  it('blocks a swept departure through a body even when both endpoints are outside it', () => {
    const system = SYSTEMS[0];
    if (!system) throw new Error('Missing fixture.');
    const world = new SystemRuntime(system);
    expect(
      departureObstruction(world, new Vector3(0, 0, 1000000), new Vector3(0, 0, -1), 2000000)?.kind,
    ).toBe('star');
    expect(
      departureObstruction(world, new Vector3(0, 0, 1000000), new Vector3(0, 0, 1), 2000000),
    ).toBeNull();
  });

  it('keeps vertical routes finite and normalized', () => {
    for (const y of [-1, 1]) {
      const orientation = routeOrientation(new Vector3(0, y, 0));
      expect(orientation.length()).toBeCloseTo(1);
      expect(new Vector3(0, 0, -1).applyQuaternion(orientation).y).toBeCloseTo(y);
      expect(orientation.angleTo(new Quaternion())).toBeGreaterThan(0);
    }
  });

  it('keeps a receiver holding point clear through a long transit before its exit lead-in', () => {
    const source = SYSTEMS[0];
    const moon = source?.bodies.find((body) => body.kind === 'moon');
    if (!source || !moon?.orbit) throw new Error('Missing moon.');
    const radius = moon.orbit.radius;
    const world = new SystemRuntime({
      ...source,
      defaultTargetId: moon.id,
      bodies: source.bodies.map((body) =>
        body.id === moon.id
          ? { ...body, orbit: { radius, period: 60, phase: 0, inclination: 0 } }
          : body,
      ),
    });
    const direction = new Vector3(0, 0, -1);
    const short = routeArrival(world, direction, 1000, 2);
    expect(departureObstruction(world, short.position, direction, 1000, 25)?.id).toBe(moon.id);
    const held = routeArrival(world, direction, 1000, 25);
    expect(
      departureObstruction(
        world,
        held.position.clone().addScaledVector(direction, -1000),
        direction,
        3000,
        25,
      ),
    ).toBeNull();
  });

  it('protects the rendered source throughout transit and preparation holds, not only ignition', () => {
    const source = SYSTEMS[0],
      destination = SYSTEMS[1];
    if (!source || !destination) throw new Error('Missing fixture.');
    const world = new SystemRuntime(source);
    const moon = source.bodies.find((body) => body.kind === 'moon');
    const center = moon && world.positions.get(moon.id);
    const parent = moon?.parentId && world.positions.get(moon.parentId);
    if (!moon || !center || !parent) throw new Error('Missing moon.');
    const direction = center.clone().sub(parent).normalize();
    const point = center
      .clone()
      .addScaledVector(
        direction,
        (jumpBodyRadius(world, moon, 7) +
          jumpBodyRadius(world, moon, departureWindow(source, destination))) /
          2,
      );
    expect(departureWindow(source, destination)).toBeGreaterThan(15);
    expect(departureObstruction(world, point, direction, 0, 7)).toBeNull();
    expect(
      departureObstruction(world, point, direction, 0, departureWindow(source, destination))?.id,
    ).toBe(moon.id);
  });

  it('blocks a facility that will orbit into a corridor after the current collision sweep', () => {
    const source = SYSTEMS[0];
    const template = source?.stations?.find((station) => station.type === 'orbital');
    if (!source || !template) throw new Error('Missing orbital station.');
    const { parentId: _parentId, surfaceAnchor: _anchor, ...free } = template;
    const station = {
      ...free,
      position: [10000000, 0, 0] as const,
      orbit: { radius: 5000, period: 20, phase: 0, inclination: 0 },
    };
    const world = new SystemRuntime(
      {
        ...source,
        stations:
          source.stations?.map((candidate) =>
            candidate.id === template.id ? station : candidate,
          ) ?? [],
      },
      4,
    );
    const box = station.boxes[0];
    if (!box) throw new Error('Missing hull.');
    const future = stationPose(world, station);
    const point = new Vector3()
      .fromArray(box.center)
      .applyQuaternion(future.orientation)
      .add(future.position);
    const direction = new Vector3(0, -1, 0);
    point.addScaledVector(direction, -1000);
    expect(departureObstruction(world, point, direction, 2000, 0)?.id).toBe(station.id);
    world.update(0);
    expect(departureObstruction(world, point, direction, 2000, 0)).toBeNull();
    expect(departureObstruction(world, point, direction, 2000, 4)?.id).toBe(station.id);
  });

  it('includes physical atmosphere height, terrain and parent orbital motion in clearance', () => {
    const system = SYSTEMS[0];
    if (!system) throw new Error('Missing fixture.');
    const parent = system.bodies.find((body) => body.id === system.defaultTargetId);
    if (!parent) throw new Error('Missing planet.');
    const world = new SystemRuntime({
      ...system,
      bodies: system.bodies.map((body) => {
        if (body.id !== parent.id) return body;
        const { position: _position, ...orbiting } = body;
        return { ...orbiting, orbit: { radius: 2000000, period: 10000, phase: 0, inclination: 0 } };
      }),
    });
    const moon = {
      ...parent,
      id: 'test-moon',
      parentId: parent.id,
      atmosphere: { color: '#ffffff', strength: 1, scale: 1.01, height: 50000 },
      orbit: { radius: 200000, period: 1000, phase: 0, inclination: 0 },
    };
    const still = jumpBodyRadius(world, moon, 0);
    expect(still).toBeGreaterThan(parent.radius + 50000);
    expect(jumpBodyRadius(world, moon, 10) - still).toBeCloseTo(
      ((Math.PI * 2 * 2000000) / 10000 + (Math.PI * 2 * 200000) / 1000) * 10,
    );
  });

  it('rejects invalid or coincident galactic coordinates', () => {
    const system = SYSTEMS[0];
    if (!system) throw new Error('Missing fixture.');
    expect(() => validateSystem({ ...system, galacticPosition: [0, Number.NaN, 0] })).toThrow();
    expect(() => validateCatalog([system, { ...system, id: 'duplicate-position' }])).toThrow(
      /distinct/,
    );
    expect(() => travelDirection(system, system)).toThrow(/distinct/);
  });
});
