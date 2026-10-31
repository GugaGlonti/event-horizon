import { describe, expect, it } from 'vitest';
import { createEngineSoundInput, EngineSoundModel } from '@/features/flight/audio/EngineSoundModel';

describe('engine sound response', () => {
  it('keeps coasting quiet regardless of ship speed, with a winding-down tail after release', () => {
    const input = createEngineSoundInput();
    const model = new EngineSoundModel();
    input.speed = 360;
    for (let tick = 0; tick < 120; tick++) model.step(input, 1 / 60);
    expect(model.power).toBe(0);
    input.throttle = input.requestedThrottle = 1;
    model.step(input, 1 / 60);
    expect(model.power).toBeGreaterThan(0);
    expect(model.power).toBeLessThan(0.1);
    for (let tick = 0; tick < 120; tick++) model.step(input, 1 / 60);
    const loaded = model.power;
    input.requestedThrottle = 0;
    model.step(input, 1 / 60);
    expect(model.release).toBe(true);
    expect(model.power).toBeGreaterThan(loaded * 0.9);
    for (let tick = 0; tick < 180; tick++) {
      model.step(input, 1 / 60);
      expect(model.release).toBe(false);
    }
    expect(model.power).toBeLessThan(0.005);
  });

  it('engages boost once and adds reserve strain only while the engine is boosted', () => {
    const model = new EngineSoundModel();
    const input = {
      ...createEngineSoundInput(),
      throttle: 1,
      requestedThrottle: 1,
      boosting: true,
    };
    model.step(input, 0.1);
    expect(model.engage).toBe(true);
    expect(model.strain).toBe(0);
    input.boostReserve = 0.05;
    for (let tick = 0; tick < 30; tick++) {
      model.step(input, 0.1);
      expect(model.engage).toBe(false);
    }
    expect(model.strain).toBeGreaterThan(0.8);
    input.boosting = false;
    model.step(input, 0.1);
    expect(model.release).toBe(true);
    model.step(input, 0.1);
    expect(model.release).toBe(false);
    input.braking = true;
    input.boosting = true;
    model.step(input, 0.1);
    expect(model.engage).toBe(false);
  });

  it('distinguishes braking/translation from forward thrust and settles when stopped', () => {
    const model = new EngineSoundModel();
    const input = { ...createEngineSoundInput(), braking: true, speed: 100 };
    for (let tick = 0; tick < 20; tick++) model.step(input, 0.1);
    expect(model.jets).toBeGreaterThan(0.9);
    expect(model.power).toBe(0);
    input.speed = 0;
    for (let tick = 0; tick < 20; tick++) model.step(input, 0.1);
    expect(model.jets).toBeLessThan(0.001);
    input.braking = false;
    input.translation = 1;
    for (let tick = 0; tick < 20; tick++) model.step(input, 0.1);
    expect(model.jets).toBeCloseTo(0.65);
    expect(model.power).toBe(0);
  });

  it('blends cabin acoustics without triggering machinery transients', () => {
    const model = new EngineSoundModel();
    const input = createEngineSoundInput();
    model.step(input, 0.1);
    input.cockpit = true;
    model.step(input, 0.1);
    expect(model.cabin).toBeGreaterThan(0);
    expect(model.cabin).toBeLessThan(0.3);
    expect(model.engage || model.release).toBe(false);
    for (let tick = 0; tick < 30; tick++) model.step(input, 0.1);
    expect(model.cabin).toBeGreaterThan(0.99);
    model.reset();
    model.step(input, 0.1);
    expect(model.release).toBe(false);
    expect(model.power).toBe(0);
  });

  it('is frame-rate independent, ignores zero/invalid delta and bounds long gaps', () => {
    const input = { ...createEngineSoundInput(), throttle: 0.8, requestedThrottle: 1 };
    const fast = new EngineSoundModel(),
      slow = new EngineSoundModel();
    for (let tick = 0; tick < 120; tick++) fast.step(input, 1 / 120);
    for (let tick = 0; tick < 30; tick++) slow.step(input, 1 / 30);
    expect(fast.power).toBeCloseTo(slow.power, 10);
    const before = fast.power;
    fast.step(input, 0);
    fast.step(input, Number.NaN);
    expect(fast.power).toBe(before);
    fast.reset();
    slow.reset();
    fast.step(input, 60);
    slow.step(input, 0.1);
    expect(fast.power).toBe(slow.power);
  });
});
