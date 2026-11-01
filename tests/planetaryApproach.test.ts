import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import { neutralInput } from '@/engine/network/InputQueue';
import { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import { predict } from '@/engine/network/Prediction';
import { actionSchema, snapshotSchema } from '@/engine/network/protocol';
import { approachSpeedLimit, descentSpeedLimit } from '@/engine/planetary/approach';
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

describe('optional landing assistance', () => {
  it('validates a nearby selected zone and continuously levels, settles drift and lands', () => {
    const f = fixture(1800);
    f.controller.relocate(f.point.clone().add(new Vector3(0, 55, 0)), new Quaternion());
    expect(f.controller.requestLandingAssist('forged')).toMatch(/Select/);
    expect(f.controller.requestLandingAssist(f.zone.id)).toBeNull();
    expect(f.controller.landingGear).toBe(true);
    let time = 0;
    while (time < 45 && f.controller.surface.phase !== 'landed') {
      f.world.update(time);
      f.controller.step(createFlightInput(), 1 / 120);
      time += 1 / 120;
    }
    expect(f.controller.surface.phase).toBe('landed');
    expect(f.controller.landingAssist).toBeNull();
    expect(f.controller.impactSpeed).toBe(0);
    expect(time).toBeGreaterThan(5);
    expect(f.controller.copyVelocity(new Vector3()).length()).toBeLessThan(0.01);
  });
  it('rejects distant, fast, obstructed or unassisted capture and gives manual inputs priority', () => {
    const distant = fixture(22000);
    expect(distant.controller.requestLandingAssist(distant.zone.id)).not.toBeNull();
    const f = fixture(100);
    f.controller.setAssistance(false);
    expect(f.controller.requestLandingAssist(f.zone.id)).toMatch(/Enable/);
    f.controller.setAssistance(true);
    f.controller.landingClearance = false;
    expect(f.controller.requestLandingAssist(f.zone.id)).toMatch(/obstructed/);
    f.controller.landingClearance = true;
    f.controller.resolveMotion(f.point, f.up.clone().multiplyScalar(-200));
    expect(f.controller.requestLandingAssist(f.zone.id)).toMatch(/Slow/);
    f.controller.resolveMotion(f.point, new Vector3());
    expect(f.controller.requestLandingAssist(f.zone.id)).toBeNull();
    f.controller.step({ ...createFlightInput(), yaw: 1 }, 1 / 120);
    expect(f.controller.landingAssist).toBeNull();
    expect(f.controller.requestLandingAssist(f.zone.id)).toBeNull();
    f.controller.landingClearance = false;
    f.controller.step(createFlightInput(), 1 / 120);
    expect(f.controller.landingAssist).toBeNull();
  });
  it('reconciles the complete assist state and cancels on paused intentions', () => {
    const a = fixture(100),
      b = fixture(100);
    a.controller.requestLandingAssist(a.zone.id);
    b.controller.restore(a.controller.snapshot());
    const command = { ...neutralInput(1), paused: false };
    for (let i = 0; i < 10; i++) {
      predict(a.controller, command, 30);
      predict(b.controller, command, 30);
    }
    expect(a.controller.snapshot()).toEqual(b.controller.snapshot());
    predict(b.controller, { ...command, paused: true }, 30);
    expect(b.controller.landingAssist).toBeNull();
    const world = new MultiplayerWorld('solara');
    world.addPlayer('p', 'Pilot');
    expect(snapshotSchema.safeParse(world.snapshot('p', 6000)).success).toBe(true);
    expect(actionSchema.safeParse({ kind: 'landing-assist', zoneId: a.zone.id }).success).toBe(
      true,
    );
    expect(
      actionSchema.safeParse({ kind: 'landing-assist', zoneId: a.zone.id, position: [0, 0, 0] })
        .success,
    ).toBe(false);
  });
});

describe('planet-relative descent', () => {
  it('leaves deployed gear responsive until final approach and settles safely at contact', () => {
    const f = fixture(120);
    f.controller.landingGear = true;
    for (let i = 0; i < 120; i++) f.controller.step({ ...createFlightInput(), lift: -1 }, 1 / 120);
    expect(-f.controller.copyVelocity(new Vector3()).dot(f.up)).toBeGreaterThan(40);
    let seconds = 1;
    while (seconds < 20 && f.controller.surface.phase !== 'landed') {
      f.controller.step({ ...createFlightInput(), lift: -1 }, 1 / 120);
      seconds += 1 / 120;
    }
    expect(f.controller.surface.phase).toBe('landed');
    expect(f.controller.impactSpeed).toBe(0);
    expect(seconds).toBeLessThan(15);
  });
  it('changes continuously from entry speeds to safe touchdown speed', () => {
    const limit = (h: number) => descentSpeedLimit(h, PLANETARY_FLIGHT_CONFIG);
    expect(limit(22000)).toBe(1100);
    expect(limit(100)).toBe(60);
    expect(limit(100.001) - limit(100)).toBeLessThan(0.01);
    expect(limit(0)).toBe(2.2);
    expect(limit(5)).toBeLessThan(limit(20));
  });
  it('uses the planet up direction for V and R even when the nose is tilted', () => {
    for (const lift of [-1, 1]) {
      const f = fixture(20000);
      f.controller.relocate(f.point, new Quaternion());
      for (let i = 0; i < 600; i++) f.controller.step({ ...createFlightInput(), lift }, 1 / 120);
      const velocity = f.controller.copyVelocity(new Vector3());
      expect(velocity.dot(f.up) * lift).toBeGreaterThan(500);
      expect(velocity.clone().addScaledVector(f.up, -velocity.dot(f.up)).length()).toBeLessThan(1);
    }
  });
});
