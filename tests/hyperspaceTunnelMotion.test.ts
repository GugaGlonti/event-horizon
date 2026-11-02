import { describe, expect, it } from 'vitest';
import {
  sampleTunnelMotion,
  type TunnelMotionSample,
} from '@/features/exploration/hyperspaceTunnelMotion';

function sample(): TunnelMotionSample {
  return { flowTime: 0, spinCos: 1, spinSin: 0 };
}

describe('hyperspace tunnel motion', () => {
  it('brings cloud features closer and expands their projected radius on every shell', () => {
    const motion = sample();
    for (let layer = 0; layer < 3; layer++) {
      const shell = 10 - layer * 3.5;
      const speed = 22 + layer * 9;
      let previous = 0;
      for (let frame = 0; frame <= 120; frame++) {
        sampleTunnelMotion(frame / 120, false, motion);
        // Invert z = depth - flowTime * speed for a fixed feature in the cloud field.
        const depth = 100 + motion.flowTime * speed;
        const radius = shell / depth;
        expect(depth).toBeGreaterThan(0);
        expect(radius).toBeGreaterThan(previous);
        previous = radius;
      }
    }
  });

  it('turns the walls smoothly at about eleven degrees per second, including angle wraps', () => {
    const motion = sample();
    sampleTunnelMotion(0, false, motion);
    for (let frame = 1; frame < 6000; frame++) {
      const before = { ...motion };
      sampleTunnelMotion(frame / 120, false, motion);
      const turn = Math.atan2(
        before.spinCos * motion.spinSin - before.spinSin * motion.spinCos,
        before.spinCos * motion.spinCos + before.spinSin * motion.spinSin,
      );
      expect(turn).toBeCloseTo(0.2 / 120, 10);
      expect(Math.hypot(motion.spinCos, motion.spinSin)).toBeCloseTo(1, 10);
    }
  });

  it('freezes travel and spin on the held clock and suppresses both for reduced motion', () => {
    const motion = sample();
    sampleTunnelMotion(4, false, motion);
    const held = { ...motion };
    sampleTunnelMotion(4, false, motion);
    expect(motion).toEqual(held);
    sampleTunnelMotion(4, true, motion);
    const still = { ...motion };
    sampleTunnelMotion(1000, true, motion);
    expect(motion).toEqual(still);
    expect(motion.flowTime).toBeCloseTo(0);
    expect(motion.spinCos).toBe(1);
    expect(motion.spinSin).toBe(0);
  });
});
