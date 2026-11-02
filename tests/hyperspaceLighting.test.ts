import { describe, expect, it } from 'vitest';
import {
  sampleTunnelLights,
  type TunnelLightSample,
} from '@/features/exploration/hyperspaceLighting';

function sample(): TunnelLightSample {
  return { x: 0, y: 0, z: 0, pulse: 0, fill: 0 };
}

describe('tunnel light pools', () => {
  it('keeps slow blue pulses and moving lamps bounded near the ship', () => {
    const lamps = sample();
    let previous = 0,
      minimum = 1,
      maximum = 0;
    for (let frame = 0; frame < 3600; frame++) {
      sampleTunnelLights(frame / 120, false, lamps);
      expect(lamps.pulse).toBeGreaterThanOrEqual(0.2);
      expect(lamps.pulse).toBeLessThanOrEqual(1);
      expect(lamps.fill).toBeGreaterThanOrEqual(0.2);
      expect(lamps.fill).toBeLessThanOrEqual(1);
      if (frame) expect(Math.abs(lamps.pulse - previous)).toBeLessThan(0.03);
      // A 32 m shadow frustum contains the lamp-to-hull distance plus the 5 m hull radius.
      expect(Math.hypot(lamps.x, lamps.y, lamps.z) + 5).toBeLessThan(32);
      minimum = Math.min(minimum, lamps.pulse);
      maximum = Math.max(maximum, lamps.pulse);
      previous = lamps.pulse;
    }
    expect(maximum - minimum).toBeGreaterThan(0.7);
  });

  it('freezes the pulse and lamp directions for reduced motion and explicit clock holds', () => {
    const lamps = sample();
    sampleTunnelLights(3, false, lamps);
    const held = { ...lamps };
    sampleTunnelLights(3, false, lamps);
    expect(lamps).toEqual(held);
    sampleTunnelLights(0, true, lamps);
    const still = { ...lamps };
    sampleTunnelLights(1000, true, lamps);
    expect(lamps).toEqual(still);
    expect(lamps.pulse).toBeGreaterThan(0);
    expect(lamps.fill).toBeGreaterThan(0);
  });
});
