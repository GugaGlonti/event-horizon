import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import { neutralInput } from '@/engine/network/InputQueue';
import { MultiplayerWorld } from '@/engine/network/MultiplayerWorld';
import { Prediction, predict } from '@/engine/network/Prediction';
import { actionSchema, snapshotSchema } from '@/engine/network/protocol';
import { approachSpeedLimit, descentEta, descentSpeedLimit } from '@/engine/planetary/approach';
import { PLANETARY_FLIGHT_CONFIG } from '@/engine/planetary/config';
import { surfaceDirection, tangentFrame } from '@/engine/planetary/coordinates';
import { PlanetaryEnvironment } from '@/engine/planetary/PlanetaryEnvironment';
import { planetaryTelemetry } from '@/engine/planetary/telemetry';
import { FLIGHT_CONFIG } from '@/engine/simulation/config';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { performGameplayAction } from '@/engine/simulation/shipActions';
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
  controller.setFlightMode('travel');
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
  it('extends Travel cruise into the atmosphere and brakes excess speed progressively', () => {
    const f = fixture(12000);
    for (let i = 0; i < 1200; i++)
      f.controller.step({ ...createFlightInput(), throttle: 1 }, 1 / 120);
    expect(f.controller.speed).toBeGreaterThan(700);
    const low = fixture(500);
    low.controller.resolveMotion(
      low.point,
      new Vector3(0, 0, -900).applyQuaternion(tangentFrame(low.up)),
    );
    low.controller.step({ ...createFlightInput(), throttle: 1 }, 1 / 120);
    expect(low.controller.speed).toBeGreaterThan(890);
    expect(low.controller.speed).toBeLessThan(900);
  });
});

describe('stabilization and speed modes', () => {
  it.each([-1, 1])(
    'retains %s radial travel after V/R release across low-level damping changes',
    (lift) => {
      const f = fixture(30000);
      for (let i = 0; i < 1020; i++) f.controller.step({ ...createFlightInput(), lift }, 1 / 120);
      expect(f.controller.travelMode).toBe('surface');
      for (const assisted of [false, true]) {
        f.controller.setAssistance(assisted);
        for (let i = 0; i < 240; i++) f.controller.step(createFlightInput(), 1 / 120);
        expect(f.controller.copyVelocity(new Vector3()).dot(f.up) * lift).toBeGreaterThan(750);
        expect(f.controller.travelMode).toBe('surface');
      }
    },
  );
  it.each([true, false])(
    'keeps terrain braking with stabilization %s and safely lands a released descent',
    (stabilized) => {
      const f = fixture(12000);
      f.controller.setAssistance(stabilized);
      f.controller.landingGear = true;
      for (let i = 0; i < 1020; i++)
        f.controller.step({ ...createFlightInput(), lift: -1 }, 1 / 120);
      expect(f.controller.speed).toBeGreaterThan(700);
      let time = 0,
        impact = 0;
      while (time < 90 && f.controller.surface.phase !== 'landed') {
        f.controller.step(createFlightInput(), 1 / 120);
        impact = Math.max(impact, f.controller.impactSpeed);
        time += 1 / 120;
      }
      expect(f.controller.surface.phase).toBe('landed');
      expect(impact).toBe(0);
      expect(f.controller.travelMode).toBe('normal');
    },
  );
  it('retains automatic approach speeds when stabilization is toggled', () => {
    const f = fixture(30000);
    for (let i = 0; i < 1200; i++)
      f.controller.step({ ...createFlightInput(), throttle: 1 }, 1 / 120);
    for (const stabilized of [false, true]) {
      f.controller.setAssistance(stabilized);
      for (let i = 0; i < 240; i++)
        f.controller.step({ ...createFlightInput(), throttle: 1 }, 1 / 120);
      expect(f.controller.speed).toBeGreaterThan(700);
      expect(f.controller.travelMode).toBe('transit');
    }
  });
  it.each([{ throttle: 1 }, { brake: true, reverse: true }])(
    'leaves coasting only on an explicit forward/brake command %j',
    (control) => {
      const f = fixture(30000);
      for (let i = 0; i < 900; i++)
        f.controller.step({ ...createFlightInput(), lift: -1 }, 1 / 120);
      const speed = f.controller.speed;
      f.controller.step({ ...createFlightInput(), ...control }, 1 / 120);
      expect(f.controller.travelMode).toBe('transit');
      expect(f.controller.speed).toBeGreaterThan(speed * 0.95);
      expect(f.controller.speed).toBeLessThan(speed);
    },
  );
  it('keeps gear independent of surface travel and clears the mode on reference handoffs', () => {
    const world = new MultiplayerWorld('solara'),
      pilot = world.addPlayer('p', 'Pilot');
    pilot.ship.controller.travelMode = 'surface';
    expect(
      performGameplayAction(world.simulation, pilot.id, { kind: 'landing-gear', enabled: true }),
    ).toBeNull();
    expect(pilot.ship.controller.travelMode).toBe('surface');
    const f = fixture(61000);
    f.controller.travelMode = 'surface';
    f.controller.step(createFlightInput(), 1 / 120);
    expect(f.controller.travelMode).toBe('transit');
    f.controller.travelMode = 'surface';
    f.controller.reset();
    expect(f.controller.travelMode).toBe('transit');
    f.controller.travelMode = 'surface';
    f.controller.relocate(f.point, tangentFrame(f.up));
    expect(f.controller.travelMode).toBe('normal');
  });
  it('restores the selected mode before delayed prediction replays released controls', () => {
    const a = fixture(30000),
      b = fixture(30000),
      prediction = new Prediction(b.controller);
    const delayed: { state: ReturnType<FlightController['snapshot']>; ack: number }[] = [];
    for (let seq = 1; seq <= 180; seq++) {
      const command = {
        ...neutralInput(seq),
        paused: false,
        flightMode: seq < 100 ? ('travel' as const) : ('combat' as const),
        flight: { ...createFlightInput(), lift: seq <= 90 ? -1 : 0 },
      };
      predict(a.controller, command, 30);
      prediction.apply(command);
      delayed.push({ state: a.controller.snapshot(), ack: seq });
      if (delayed.length > 4) {
        const snapshot = delayed.shift();
        if (snapshot) prediction.reconcile(snapshot.state, snapshot.ack);
      }
    }
    prediction.reconcile(a.controller.snapshot(), 180);
    expect(b.controller.snapshot()).toEqual(a.controller.snapshot());
    expect(b.controller.travelMode).toBe('surface');
    predict(b.controller, { ...neutralInput(181), paused: true }, 30);
    expect(b.controller.travelMode).toBe('surface');
    expect(b.controller.speed).toBeGreaterThan(250);
  });
});

describe('optional landing assistance', () => {
  it.each(['travel', 'combat'] as const)(
    'validates a nearby zone and lands within the %s descent envelope',
    (mode) => {
      const f = fixture(1800);
      f.controller.setFlightMode(mode);
      f.controller.relocate(f.point.clone().add(new Vector3(0, 55, 0)), new Quaternion());
      expect(f.controller.requestLandingAssist('forged')).toMatch(/Select/);
      expect(f.controller.requestLandingAssist(f.zone.id)).toBeNull();
      expect(f.controller.landingGear).toBe(true);
      let time = 0;
      let peakSpeed = 0;
      while (time < 45 && f.controller.surface.phase !== 'landed') {
        f.world.update(time);
        f.controller.step(createFlightInput(), 1 / 120);
        peakSpeed = Math.max(peakSpeed, f.controller.speed);
        time += 1 / 120;
      }
      expect(f.controller.surface.phase).toBe('landed');
      expect(f.controller.landingAssist).toBeNull();
      expect(f.controller.impactSpeed).toBe(0);
      expect(time).toBeGreaterThan(5);
      if (mode === 'combat') expect(peakSpeed).toBeLessThanOrEqual(361);
      else expect(peakSpeed).toBeGreaterThan(360);
      expect(f.controller.copyVelocity(new Vector3()).length()).toBeLessThan(0.01);
    },
  );
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
  it('shows finite profile-based ETA only while descending and warns before an unsafe approach', () => {
    const f = fixture(20000);
    expect(descentEta(20000, 0, true, PLANETARY_FLIGHT_CONFIG)).toBeNull();
    expect(descentEta(Infinity, 100, true, PLANETARY_FLIGHT_CONFIG)).toBeNull();
    expect(descentEta(20000, 900, true, PLANETARY_FLIGHT_CONFIG)).toBeGreaterThan(20);
    expect(descentEta(20000, 900, true, PLANETARY_FLIGHT_CONFIG)).toBeLessThan(80);
    const high = planetaryTelemetry(f.controller);
    expect(high.descentEta).toBeNull();
    f.controller.resolveMotion(f.point, f.up.clone().multiplyScalar(-700));
    expect(planetaryTelemetry(f.controller).brakeNow).toBe(false);
    const low = fixture(100);
    low.controller.resolveMotion(low.point, low.up.clone().multiplyScalar(-300));
    const warning = planetaryTelemetry(low.controller);
    expect(warning.brakeNow).toBe(true);
    expect(warning.brakingDistance).toBeGreaterThan(warning.altitude);
    expect(warning.approachStage).toBe('FINAL APPROACH');
  });
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
    expect(limit(22000)).toBe(800);
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
      expect(velocity.dot(f.up) * lift).toBeGreaterThan(450);
      expect(velocity.clone().addScaledVector(f.up, -velocity.dot(f.up)).length()).toBeLessThan(1);
    }
  });
});
