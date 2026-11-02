import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import { departureBearing, findDepartureWaypoint } from '@/engine/navigation/hyperspaceDeparture';
import { departureObstruction } from '@/engine/navigation/hyperspaceRoute';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import { SYSTEMS } from '@/engine/world/systems';

function fixture() {
  const source = SYSTEMS[0];
  const star = source?.bodies[0];
  if (!source || !star) throw new Error('Missing fixture.');
  const world = new SystemRuntime({
    ...source,
    bodies: [star],
    stations: [],
    defaultTargetId: star.id,
    spawns: [
      {
        id: 'arrival',
        bodyId: star.id,
        offset: [0, 0, star.radius + 10000],
        orientation: [0, 0, 0, 1],
      },
    ],
    arrivalId: 'arrival',
  });
  return { world, radius: star.radius };
}

describe('hyperdrive departure guidance', () => {
  it('finds a short outward escape instead of sending a pilot around an entire planet', () => {
    const { world, radius } = fixture();
    const start = new Vector3(0, 0, radius + 2000);
    const direction = new Vector3(0, 0, -1);
    expect(departureObstruction(world, start, direction, 5200)).not.toBeNull();
    const waypoint = findDepartureWaypoint(world, start, direction, 5200);
    expect(waypoint).not.toBeNull();
    if (!waypoint) throw new Error('Missing escape.');
    expect(waypoint.distanceTo(start)).toBeGreaterThan(3400);
    expect(waypoint.distanceTo(start)).toBeLessThan(3600);
    expect(waypoint.z).toBeGreaterThan(start.z);
    expect(departureObstruction(world, waypoint, direction, 5200)).toBeNull();
    expect(start.toArray()).toEqual([0, 0, radius + 2000]);
  });

  it('clears a tangent mass shadow by moving outward, with a bounded finite waypoint', () => {
    const { world, radius } = fixture();
    const start = new Vector3(radius + 180, 0, 0);
    const direction = new Vector3(0, 0, -1);
    const waypoint = findDepartureWaypoint(world, start, direction, 5200);
    expect(waypoint).not.toBeNull();
    if (!waypoint) throw new Error('Missing escape.');
    expect(waypoint.x).toBeGreaterThan(start.x);
    expect(waypoint.distanceTo(start)).toBeLessThan(200);
    expect(departureObstruction(world, waypoint, direction, 5200)).toBeNull();
  });

  it('identifies an astern waypoint without a zero bearing or nonfinite HUD projection', () => {
    const astern = departureBearing(new Vector3(), new Quaternion(), new Vector3(0, 0, 100));
    expect(astern.bearingX).toBe(1);
    expect(astern.bearingY).toBeCloseTo(0);
    expect(astern.behind).toBe(true);
    const ahead = departureBearing(new Vector3(), new Quaternion(), new Vector3(10, 20, -100));
    expect(ahead.behind).toBe(false);
    expect(ahead.bearingX).toBeGreaterThan(0);
    expect(ahead.bearingY).toBeLessThan(0);
  });
});
