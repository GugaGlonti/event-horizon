import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  departureObstruction,
  jumpBodyRadius,
  routeArrival,
  routeOrientation,
  travelDirection,
  travelDistance,
} from '@/engine/navigation/hyperspaceRoute';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import { validateCatalog, validateSystem } from '@/engine/world/validateSystem';
import { SYSTEMS } from '@/features/exploration/data/systems';

describe('galactic jump routes', () => {
  for (const source of SYSTEMS) {
    for (const destination of SYSTEMS.filter((system) => system.id !== source.id)) {
      it(`${source.name} → ${destination.name} faces along the route and arrives from the source`, () => {
        const direction = travelDirection(source, destination);
        const world = new SystemRuntime(destination, 130);
        const arrival = routeArrival(world, direction, 800);
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
            arrival.position.clone().addScaledVector(direction, -800),
            direction,
            2600,
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
