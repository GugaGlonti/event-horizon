import { describe, expect, it } from 'vitest';
import { Vector3 } from '@/engine/math/linear';
import { approachSpeedLimit } from '@/engine/planetary/approach';
import { PLANETARY_FLIGHT_CONFIG } from '@/engine/planetary/config';
import { surfaceDirection, tangentFrame } from '@/engine/planetary/coordinates';
import { PlanetaryEnvironment } from '@/engine/planetary/PlanetaryEnvironment';
import { FLIGHT_CONFIG } from '@/engine/simulation/config';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import { SYSTEMS } from '@/engine/world/systems';

function fixture(altitude: number) {
  const definition = SYSTEMS[0];
  if (!definition) throw new Error('Solara');
  const world = new SystemRuntime(definition),
    body = definition.bodies.find((p) => p.landable),
    zone = body?.landingZones?.[0],
    center = body && world.positions.get(body.id);
  if (!body || !zone || !center) throw new Error('Pelagos');
  const up = surfaceDirection(zone.latitude, zone.longitude),
    point = center.clone().addScaledVector(up, body.radius + zone.elevation + altitude);
  const controller = new FlightController(FLIGHT_CONFIG);
  controller.environment = new PlanetaryEnvironment(world);
  controller.relocate(point, tangentFrame(up));
  return { controller, world, up, point, body, zone };
}

describe('planetary approach envelope', () => {
  it('keeps planetary scale while allowing fast entry with a continuous stopping-distance envelope', () => {
    const limit = (height: number) => approachSpeedLimit(height, 180, PLANETARY_FLIGHT_CONFIG);
    expect(limit(22000)).toBe(1400);
    expect(limit(14000)).toBe(1400);
    expect(limit(300)).toBe(180);
    expect(limit(301) - limit(300)).toBeLessThan(1);
    for (let h = 301; h < 20000; h += 100)
      expect(
        (limit(h) ** 2 - 180 ** 2) / (2 * PLANETARY_FLIGHT_CONFIG.approachBraking),
      ).toBeLessThanOrEqual(h - 300 + 1e-8);
  });
  it('finds a terrain obstacle on the forward corridor before contact', () => {
    const f = fixture(1000);
    expect(
      f.controller.environment?.flightClearance(f.point, f.up.clone().negate(), 5000),
    ).toBeCloseTo(990, 0);
  });
  it('extends O cruise into the atmosphere and brakes excess speed progressively', () => {
    const f = fixture(12000);
    f.controller.transit = true;
    for (let i = 0; i < 1200; i++)
      f.controller.step({ ...createFlightInput(), throttle: 1 }, 1 / 120);
    expect(f.controller.speed).toBeGreaterThan(700);
    const low = fixture(500);
    low.controller.transit = true;
    low.controller.resolveMotion(
      low.point,
      new Vector3(0, 0, -900).applyQuaternion(tangentFrame(low.up)),
    );
    low.controller.step({ ...createFlightInput(), throttle: 1 }, 1 / 120);
    expect(low.controller.speed).toBeGreaterThan(890);
    expect(low.controller.speed).toBeLessThan(900);
  });
});
