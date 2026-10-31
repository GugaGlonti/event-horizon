import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  departureObstruction,
  routeArrival,
  routeOrientation,
  travelDirection,
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
        const body = destination.bodies.find(
          (candidate) => candidate.id === destination.defaultTargetId,
        );
        const offset = arrival.position.clone().sub(anchor ?? new Vector3());
        offset.addScaledVector(direction, -offset.dot(direction));
        expect(offset.length()).toBeGreaterThan(
          (body?.radius ?? 0) * (body?.rings?.outer ?? 1) + 180,
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
      departureObstruction(world, new Vector3(0, 0, 2000), new Vector3(0, 0, -1), 4000)?.kind,
    ).toBe('star');
    expect(
      departureObstruction(world, new Vector3(0, 0, 2000), new Vector3(0, 0, 1), 4000),
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
