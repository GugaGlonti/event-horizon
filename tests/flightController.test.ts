import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '@/engine/simulation/FixedStepLoop';
import { FlightController } from '@/engine/simulation/FlightController';
import { createFlightInput, type FlightInput } from '@/engine/simulation/flightTypes';
import { FLIGHT_CONFIG, GAME_CONFIG } from '@/features/flight/config';

const dt = GAME_CONFIG.fixedStep;
function fly(controller: FlightController, seconds: number, overrides: Partial<FlightInput> = {}) {
  const input = { ...createFlightInput(), ...overrides };
  for (let tick = 0; tick < Math.round(seconds / dt); tick += 1) controller.step(input, dt);
}

function pose(controller: FlightController) {
  const position = new Vector3();
  const orientation = new Quaternion();
  controller.copyTransform(position, orientation);
  return { position, orientation, forward: new Vector3(0, 0, -1).applyQuaternion(orientation) };
}

describe('arcade flight simulation', () => {
  it('resets a moving and rotated ship without carrying over boost or momentum', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    fly(ship, 3, { throttle: 1, boost: true, roll: 0.5 });
    ship.reset();
    expect(ship.getTelemetry()).toMatchObject({
      speed: 0,
      throttle: 0,
      boostCharge: 1,
      boosting: false,
      distance: 0,
    });
    expect(pose(ship).position.length()).toBe(0);
    expect(pose(ship).orientation.equals(new Quaternion())).toBe(true);
    fly(ship, 1);
    expect(pose(ship).position.length()).toBe(0);
    expect(pose(ship).orientation.equals(new Quaternion())).toBe(true);
  });
  it('accelerates forward, caps normal speed, and clamps throttle to 100%', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    fly(ship, 10, { throttle: 1 });
    expect(ship.getTelemetry().throttle).toBe(1);
    expect(ship.speed).toBeCloseTo(FLIGHT_CONFIG.maxSpeed);
    expect(pose(ship).position.z).toBeLessThan(-1000);
    expect(pose(ship).position.x).toBe(0);
  });

  it('ramps throttle gradually while held and eases it to zero on release', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    fly(ship, 1, { throttle: 1 });
    expect(ship.enginePower).toBeCloseTo(FLIGHT_CONFIG.throttleRate);
    const speed = ship.speed;
    fly(ship, 0.5);
    expect(ship.enginePower).toBeCloseTo(FLIGHT_CONFIG.throttleRate * 0.5);
    expect(ship.speed).toBeCloseTo(speed - FLIGHT_CONFIG.deceleration * 0.5);
    fly(ship, 3);
    expect(ship.enginePower).toBe(0);
    expect(ship.speed).toBe(0);
    fly(ship, 3, { throttle: 1 });
    expect(ship.enginePower).toBe(1);
  });

  it.each([true, false])('slows to a stop when W is released with assistance %s', (assistance) => {
    const ship = new FlightController(FLIGHT_CONFIG);
    ship.setAssistance(assistance);
    fly(ship, 10, { throttle: 1 });
    fly(ship, 1);
    expect(ship.enginePower).toBeCloseTo(1 - FLIGHT_CONFIG.throttleRate);
    expect(ship.speed).toBeCloseTo(FLIGHT_CONFIG.maxSpeed - FLIGHT_CONFIG.deceleration);
    fly(ship, 8);
    expect(ship.enginePower).toBe(0);
    expect(ship.speed).toBe(0);
  });

  it.each([true, false])(
    'brakes faster with assistance %s, overrides thrust/boost, and keeps slowing on release',
    (assistance) => {
      const ship = new FlightController(FLIGHT_CONFIG);
      ship.setAssistance(assistance);
      fly(ship, 8, { throttle: 1 });
      fly(ship, 0.5, { throttle: 1, brake: true, boost: true });
      const speed = ship.speed;
      expect(speed).toBeCloseTo(FLIGHT_CONFIG.maxSpeed - FLIGHT_CONFIG.brakeDeceleration * 0.5);
      expect(ship.getTelemetry().boosting).toBe(false);
      expect(ship.getTelemetry().boostCharge).toBe(1);
      expect(ship.enginePower * FLIGHT_CONFIG.maxSpeed).toBeCloseTo(speed);
      fly(ship, 1);
      expect(ship.speed).toBeCloseTo(speed - FLIGHT_CONFIG.deceleration);
      fly(ship, 3, { brake: true });
      expect(ship.speed).toBe(0);
      expect(ship.enginePower).toBe(0);
      fly(ship, 1);
      expect(ship.speed).toBe(0);
    },
  );

  it('brakes sideways drift with assistance off', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    fly(ship, 8, { throttle: 1 });
    ship.setAssistance(false);
    fly(ship, 2, { yaw: 1 });
    const speed = ship.speed;
    fly(ship, 0.5, { brake: true });
    expect(ship.speed).toBeCloseTo(speed - FLIGHT_CONFIG.brakeDeceleration * 0.5);
  });

  it('boosts above cruise speed without exceeding its configured limit', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    fly(ship, 8, { throttle: 1 });
    fly(ship, 2, { throttle: 1, boost: true });
    expect(ship.speed).toBeCloseTo(FLIGHT_CONFIG.boostMaxSpeed);
    expect(ship.getTelemetry().boostCharge).toBeCloseTo(0.5);
    expect(ship.getTelemetry().boosting).toBe(true);
    const speed = ship.speed;
    ship.step({ ...createFlightInput(), throttle: 1 }, dt);
    expect(ship.speed).toBeLessThan(speed);
    expect(ship.speed).toBeGreaterThan(FLIGHT_CONFIG.maxSpeed);
  });

  it('exhausts boost, prevents held-key pulsing, and recharges after the delay', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    fly(ship, 5, { throttle: 1, boost: true });
    expect(ship.getTelemetry().boosting).toBe(false);
    expect(ship.getTelemetry().boostCharge).toBeCloseTo(0);
    fly(ship, 5, { throttle: 1, boost: true });
    expect(ship.getTelemetry().boosting).toBe(false);
    expect(ship.getTelemetry().boostCharge).toBeGreaterThan(0.3);
    fly(ship, 10, { throttle: 1 });
    expect(ship.getTelemetry().boostCharge).toBe(1);
    fly(ship, 0.5, { throttle: 1, boost: true });
    expect(ship.getTelemetry().boosting).toBe(true);
  });

  it('does not spend boost reserve with the throttle at zero', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    fly(ship, 3, { boost: true });
    expect(ship.getTelemetry().boostCharge).toBe(1);
    expect(ship.speed).toBe(0);
  });

  it('slows down on W release even if Shift remains held', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    fly(ship, 8, { throttle: 1 });
    fly(ship, 1, { throttle: 1, boost: true });
    const charge = ship.getTelemetry().boostCharge;
    const speed = ship.speed;
    fly(ship, 0.5, { boost: true });
    expect(ship.speed).toBeLessThan(speed);
    expect(ship.getTelemetry().boosting).toBe(false);
    expect(ship.getTelemetry().boostCharge).toBe(charge);
  });

  it.each(['pitch', 'yaw', 'roll'] as const)(
    'rotates in the expected local %s direction',
    (axis) => {
      const ship = new FlightController(FLIGHT_CONFIG);
      fly(ship, 1, { [axis]: 1 });
      const result = pose(ship);
      expect(result.orientation.length()).toBeCloseTo(1, 12);
      if (axis === 'pitch') expect(result.forward.y).toBeGreaterThan(0.4);
      if (axis === 'yaw') expect(result.forward.x).toBeGreaterThan(0.4);
      if (axis === 'roll')
        expect(new Vector3(0, 1, 0).applyQuaternion(result.orientation).x).toBeGreaterThan(0.5);
    },
  );

  it('maintains a normalized quaternion through combined rotations and multiple full turns', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    fly(ship, 30, { pitch: 1, yaw: -0.7, roll: 1, throttle: 1 });
    expect(pose(ship).orientation.length()).toBeCloseTo(1, 12);
    expect(Number.isFinite(pose(ship).position.length())).toBe(true);
    expect(ship.speed).toBeLessThanOrEqual(FLIGHT_CONFIG.maxSpeed + 1e-8);
  });

  it('assistance damps rotation while unassisted flight retains angular momentum', () => {
    const assisted = new FlightController(FLIGHT_CONFIG);
    const unassisted = new FlightController(FLIGHT_CONFIG);
    unassisted.setAssistance(false);
    fly(assisted, 1, { roll: 1 });
    fly(unassisted, 1, { roll: 1 });
    fly(assisted, 2);
    fly(unassisted, 2);
    const a = pose(assisted).orientation;
    const b = pose(unassisted).orientation;
    fly(assisted, 1);
    fly(unassisted, 1);
    expect(a.angleTo(pose(assisted).orientation)).toBeLessThan(0.001);
    expect(b.angleTo(pose(unassisted).orientation)).toBeGreaterThan(0.5);
  });

  it('slows sideways drift after W release without assistance', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    fly(ship, 8, { throttle: 1 });
    ship.setAssistance(false);
    fly(ship, 1, { throttle: 1, yaw: 1 });
    const speed = ship.speed;
    fly(ship, 1);
    expect(ship.speed).toBeCloseTo(speed - FLIGHT_CONFIG.deceleration);
    fly(ship, 8);
    expect(ship.speed).toBe(0);
  });

  it('accelerates along the new forward direction after a turn', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    fly(ship, 1, { yaw: 1 });
    fly(ship, 2, { throttle: 1 });
    expect(pose(ship).position.x).toBeGreaterThan(1);
  });

  it('returns detached poses and scalar telemetry instead of mutable internal state', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    const copied = pose(ship);
    copied.position.set(999, 999, 999);
    copied.orientation.set(0, 0, 0, 0);
    expect(pose(ship).position.length()).toBe(0);
    expect(pose(ship).orientation.length()).toBe(1);
    expect(
      Object.values(ship.getTelemetry()).every(
        (value) => typeof value === 'number' || typeof value === 'boolean',
      ),
    ).toBe(true);
  });

  it.each([NaN, Infinity, -1])('rejects invalid timestep %s', (delta) => {
    expect(() => new FlightController(FLIGHT_CONFIG).step(createFlightInput(), delta)).toThrow(
      RangeError,
    );
  });
});

describe('fixed-step clock', () => {
  function replay(fps: number) {
    const ship = new FlightController(FLIGHT_CONFIG);
    const loop = new FixedStepLoop(dt, GAME_CONFIG.maxFrameTime, GAME_CONFIG.maxSteps);
    const input = {
      ...createFlightInput(),
      throttle: 1,
      pitch: 0.15,
      yaw: 0.2,
      roll: 0.1,
      boost: true,
    };
    for (let frame = 0; frame < fps * 8; frame += 1)
      loop.advance(1 / fps, (step) => ship.step(input, step));
    return pose(ship);
  }

  it.each([20, 30, 60, 144])('produces identical flight at %i render fps', (fps) => {
    const reference = replay(120);
    const actual = replay(fps);
    expect(actual.position.distanceTo(reference.position)).toBeLessThan(1e-8);
    actual.orientation.toArray().forEach((value, index) => {
      expect(value).toBeCloseTo(reference.orientation.toArray()[index] ?? 0, 12);
    });
  });

  it('caps suspension catch-up and discards backlog', () => {
    const loop = new FixedStepLoop(dt, 0.1, 12);
    let ticks = 0;
    loop.advance(60, () => {
      ticks += 1;
    });
    expect(ticks).toBe(12);
    loop.advance(dt, () => {
      ticks += 1;
    });
    expect(ticks).toBe(13);
  });

  it('reset drops partial time so pausing does not advance the next flight', () => {
    const loop = new FixedStepLoop(dt, 0.1, 12);
    let ticks = 0;
    loop.advance(dt * 0.75, () => {
      ticks += 1;
    });
    loop.reset();
    loop.advance(dt * 0.75, () => {
      ticks += 1;
    });
    expect(ticks).toBe(0);
    expect(
      loop.advance(NaN, () => {
        ticks += 1;
      }),
    ).toBeCloseTo(0.75);
  });
});

describe('six-degree translation', () => {
  it.each([true, false])(
    'brakes before reversing at zero throttle with assistance %s, even with W and boost held',
    (assistance) => {
      const ship = new FlightController(FLIGHT_CONFIG);
      ship.setAssistance(assistance);
      fly(ship, 8, { throttle: 1 });
      const input = {
        ...createFlightInput(),
        throttle: 1,
        brake: true,
        reverse: true,
        boost: true,
      };
      fly(ship, 0.5, input);
      expect(ship.enginePower).toBeGreaterThan(0);
      expect(ship.speed).toBeCloseTo(
        FLIGHT_CONFIG.maxSpeed - FLIGHT_CONFIG.brakeDeceleration * 0.5,
      );
      expect(ship.copyVelocity(new Vector3()).z).toBeLessThan(0);
      expect(ship.getTelemetry().boosting).toBe(false);
      expect(ship.getTelemetry().boostCharge).toBe(1);
      for (let tick = 0; tick < 1200; tick++) {
        ship.step(input, dt);
        if (ship.enginePower > 0) expect(ship.copyVelocity(new Vector3()).z).toBeLessThanOrEqual(0);
      }
      expect(ship.enginePower).toBe(0);
      expect(ship.copyVelocity(new Vector3()).z).toBeCloseTo(FLIGHT_CONFIG.reverseMaxSpeed);
      fly(ship, 3);
      expect(ship.speed).toBe(0);
      fly(ship, 4, { brake: true, reverse: true });
      expect(ship.copyVelocity(new Vector3()).z).toBeCloseTo(FLIGHT_CONFIG.reverseMaxSpeed);
      fly(ship, 4, { throttle: 1 });
      expect(ship.copyVelocity(new Vector3()).z).toBeLessThan(0);
      expect(ship.enginePower).toBe(1);
    },
  );

  it('waits for stored throttle to reach zero before applying standalone reverse thrust', () => {
    const ship = new FlightController(FLIGHT_CONFIG);
    fly(ship, 8, { throttle: 1 });
    // A collision can stop movement while leaving stored throttle above zero.
    ship.resolveMotion(new Vector3(), new Vector3());
    fly(ship, 1, { reverse: true });
    expect(ship.enginePower).toBeGreaterThan(0);
    expect(ship.speed).toBe(0);
    fly(ship, 4, { reverse: true });
    expect(ship.enginePower).toBe(0);
    expect(ship.copyVelocity(new Vector3()).z).toBeCloseTo(FLIGHT_CONFIG.reverseMaxSpeed);
  });

  it('accelerates laterally, vertically and in reverse in the local ship frame', () => {
    for (const [input, axis] of [
      [{ strafe: 1 }, new Vector3(1, 0, 0)],
      [{ lift: 1 }, new Vector3(0, 1, 0)],
      [{ reverse: true }, new Vector3(0, 0, 1)],
    ] as const) {
      const ship = new FlightController(FLIGHT_CONFIG);
      fly(ship, 2, input);
      const velocity = ship.copyVelocity(new Vector3());
      expect(velocity.dot(axis)).toBeGreaterThan(10);
      expect(velocity.length()).toBeLessThanOrEqual(FLIGHT_CONFIG.strafeMaxSpeed);
      fly(ship, 2, { brake: true });
      expect(ship.speed).toBeLessThan(0.01);
    }
  });
});
