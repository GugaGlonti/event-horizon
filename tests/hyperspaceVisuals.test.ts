import { describe, expect, it } from 'vitest';
import {
  HYPERSPACE_TIMING,
  HyperspaceController,
  type JumpPhase,
} from '@/engine/navigation/HyperspaceController';
import { jumpKick, jumpStretch } from '@/features/exploration/hyperspaceVisuals';

describe('hyperspace visual timing', () => {
  it('holds fully extended stars in clear space for a readable beat before revealing the tunnel', () => {
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    let visibleHold = 0;
    for (let time = 0; time < HYPERSPACE_TIMING.ACCELERATING; time += 1 / 120) {
      jump.elapsed = time;
      if (jumpStretch(jump) >= 0.99 && jump.coverage === 0) visibleHold += 1 / 120;
    }
    expect(visibleHold).toBeGreaterThan(0.25);
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING / 2;
    expect(jumpStretch(jump)).toBe(1);
    expect(jump.coverage).toBe(0);
    expect(jumpKick(jump)).toBe(0);
    expect(jump.intensity).toBeCloseTo(0.08);
  });

  it.each<[JumpPhase, JumpPhase]>([
    ['CHARGING', 'ACCELERATING'],
    ['ACCELERATING', 'HYPERSPACE'],
    ['HYPERSPACE', 'EXITING'],
    ['EXITING', 'COOLDOWN'],
  ])('keeps the visual envelopes continuous across %s → %s', (before, after) => {
    const jump = new HyperspaceController();
    jump.phase = before;
    jump.elapsed = before === 'IDLE' ? 0 : HYPERSPACE_TIMING[before];
    const previous = [jumpStretch(jump), jumpKick(jump), jump.coverage, jump.intensity];
    jump.phase = after;
    jump.elapsed = 0;
    const next = [jumpStretch(jump), jumpKick(jump), jump.coverage, jump.intensity];
    next.forEach((value, index) => {
      expect(value).toBeCloseTo(previous[index] ?? Number.NaN, 10);
    });
  });
});
