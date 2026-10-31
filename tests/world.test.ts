import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { NavigationComputer } from '@/engine/navigation/NavigationComputer';
import { RenderOrigin } from '@/engine/world/RenderOrigin';
import { orbitalOffset, SystemRuntime } from '@/engine/world/SystemRuntime';
import { validateCatalog, validateSystem } from '@/engine/world/validateSystem';
import type { StarSystemDefinition } from '@/engine/world/worldTypes';
import { SYSTEMS } from '@/features/exploration/data/systems';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test fixture.');
  return value;
}

const solara = () => structuredClone(SYSTEMS[0]) as StarSystemDefinition;

describe('star system definitions', () => {
  it('validates three serializable handcrafted systems with stars, planets and moons', () => {
    expect(SYSTEMS).toHaveLength(3);
    expect(() => validateCatalog(JSON.parse(JSON.stringify(SYSTEMS)))).not.toThrow();
    for (const system of SYSTEMS) {
      expect(system.bodies.filter((body) => body.kind === 'moon').length).toBeGreaterThanOrEqual(2);
      expect(
        system.bodies.filter((body) => body.kind !== 'star' && body.kind !== 'moon'),
      ).toHaveLength(3);
    }
  });

  it('rejects duplicate system and body IDs', () => {
    const system = solara();
    expect(() => validateCatalog([system, system])).toThrow(/Duplicate/);
    expect(() =>
      validateSystem({ ...system, bodies: [...system.bodies, required(system.bodies[0])] }),
    ).toThrow(/Duplicate/);
  });

  it.each([
    'parent',
    'cycle',
    'radius',
    'orbit',
    'surface',
    'spawn',
    'quaternion',
    'arrival',
    'position',
  ])('rejects malformed %s configurations', (fault) => {
    const system = solara();
    const planet = required(system.bodies.find((body) => body.id === 'pelagos'));
    const moon = required(system.bodies.find((body) => body.id === 'lyra'));
    let changed = system;
    if (fault === 'parent')
      changed = {
        ...system,
        bodies: system.bodies.map((body) =>
          body === planet ? { ...body, parentId: 'missing' } : body,
        ),
      };
    if (fault === 'cycle')
      changed = {
        ...system,
        bodies: system.bodies.map((body) =>
          body === planet ? { ...body, parentId: 'lyra' } : body,
        ),
      };
    if (fault === 'radius')
      changed = {
        ...system,
        bodies: system.bodies.map((body) =>
          body === planet ? { ...body, radius: Number.NaN } : body,
        ),
      };
    if (fault === 'orbit')
      changed = {
        ...system,
        bodies: system.bodies.map((body) =>
          body === moon ? { ...body, orbit: { ...required(moon.orbit), period: 0 } } : body,
        ),
      };
    if (fault === 'surface')
      changed = {
        ...system,
        bodies: system.bodies.map((body) =>
          body === planet
            ? { ...body, surface: { ...body.surface, palette: ['red', '#ffffff', '#000000'] } }
            : body,
        ),
      };
    if (fault === 'spawn')
      changed = { ...system, spawns: [{ ...required(system.spawns[0]), offset: [0, 0, 0] }] };
    if (fault === 'quaternion')
      changed = {
        ...system,
        spawns: [{ ...required(system.spawns[0]), orientation: [0, 0, 0, 0] }],
      };
    if (fault === 'arrival') changed = { ...system, arrivalId: 'missing' };
    if (fault === 'position')
      changed = {
        ...system,
        bodies: system.bodies.map((body) =>
          body === planet ? { ...body, position: [Number.POSITIVE_INFINITY, 0, 0] } : body,
        ),
      };
    expect(() => validateSystem(changed)).toThrow();
  });
});

describe('world coordinates and celestial motion', () => {
  it('solves inclined orbits analytically and repeats after a full period', () => {
    const orbit = { radius: 1000, period: 80, phase: 0, inclination: Math.PI / 4 };
    const start = orbitalOffset(orbit, 0, new Vector3());
    expect(start.toArray()).toEqual([1000, 0, 0]);
    const quarter = orbitalOffset(orbit, 20, new Vector3());
    expect(quarter.length()).toBeCloseTo(1000);
    expect(quarter.y).toBeCloseTo(Math.sqrt(500000));
    expect(orbitalOffset(orbit, 80, new Vector3()).distanceTo(start)).toBeCloseTo(0);
  });

  it('resolves children before parents regardless of definition order or update history', () => {
    const definition = solara();
    const direct = new SystemRuntime(
      { ...definition, bodies: [...definition.bodies].reverse() },
      240,
    );
    const stepped = new SystemRuntime(definition);
    for (let second = 0; second <= 240; second += 1) stepped.update(second);
    expect(direct.positions.get('lyra')?.equals(required(stepped.positions.get('lyra')))).toBe(
      true,
    );
    expect(
      direct.positions.get('lyra')?.distanceTo(required(direct.positions.get('pelagos'))),
    ).toBeCloseTo(1380);
  });

  it('keeps GPU coordinates bounded and round-trips large logical coordinates without mutating them', () => {
    const origin = new RenderOrigin();
    const logical = new Vector3(1e12 + 123.5, -1e11 + 41.25, 1e12 - 33);
    const copy = logical.clone();
    origin.update(logical);
    const render = origin.toRender(logical, new Vector3());
    expect(Math.max(...render.toArray().map(Math.abs))).toBeLessThanOrEqual(512);
    expect(origin.toLogical(render, new Vector3()).equals(logical)).toBe(true);
    expect(logical.equals(copy)).toBe(true);
  });

  it('preserves object separation across origin rebases', () => {
    const origin = new RenderOrigin();
    const ship = new Vector3(510, 0, 0);
    const body = new Vector3(20000, 200, -1000);
    for (const x of [510, 520, 2048, -2048]) {
      ship.x = x;
      origin.update(ship);
      const relative = origin
        .toRender(body, new Vector3())
        .sub(origin.toRender(ship, new Vector3()));
      expect(relative.distanceTo(body.clone().sub(ship))).toBe(0);
    }
  });

  it('selects safe arrivals near the intended planets at different orbital epochs', () => {
    for (const definition of SYSTEMS)
      for (const time of [0, 100, 5000]) {
        const system = new SystemRuntime(definition, time);
        const arrival = new Vector3().fromArray(system.arrival().position);
        for (const body of definition.bodies)
          expect(
            arrival.distanceTo(required(system.positions.get(body.id))) - body.radius,
          ).toBeGreaterThanOrEqual(100);
        expect(() => system.arrival('missing')).toThrow();
      }
  });

  it('moves an obstructed arrival above all celestial safety zones', () => {
    const definition = solara();
    const system = new SystemRuntime({
      ...definition,
      spawns: [{ ...required(definition.spawns[0]), offset: [1380, 0, 0] }],
      bodies: definition.bodies.map((body) =>
        body.id === 'lyra' ? { ...body, orbit: { ...required(body.orbit), phase: 0 } } : body,
      ),
    });
    const arrival = new Vector3().fromArray(system.arrival().position);
    expect(arrival.distanceTo(required(system.positions.get('lyra')))).toBeGreaterThan(205);
  });
});

describe('local navigation', () => {
  it('selects, cycles and clears targets, rejecting unknown IDs without losing the current target', () => {
    const navigation = new NavigationComputer();
    const system = new SystemRuntime(solara());
    expect(navigation.select('pelagos', system)).toBe(true);
    expect(navigation.select('unknown', system)).toBe(false);
    expect(navigation.targetId).toBe('pelagos');
    navigation.cycle(system);
    expect(navigation.targetId).toBe('lyra');
    expect(navigation.select(null, system)).toBe(true);
    expect(navigation.sample(system, new Vector3(), new Quaternion()).targetId).toBeNull();
  });

  it('reports centre/surface distances and ship-relative bearings, including targets behind the ship', () => {
    const system = new SystemRuntime(solara());
    const navigation = new NavigationComputer();
    navigation.select('pelagos', system);
    let sample = navigation.sample(system, new Vector3(7800, 0, 2000), new Quaternion());
    expect(sample.distance).toBe(2000);
    expect(sample.surfaceDistance).toBe(1380);
    expect(sample.aligned).toBe(true);
    sample = navigation.sample(system, new Vector3(7800, 0, -2000), new Quaternion());
    expect(sample.behind).toBe(true);
    expect(sample.bearingX).toBe(1);
    sample = navigation.sample(system, new Vector3(5800, 0, 0), new Quaternion());
    expect(sample.bearingX).toBe(1);
    expect(sample.nearestId).toBe('pelagos');
  });
});
