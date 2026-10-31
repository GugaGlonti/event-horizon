import { describe, expect, it } from 'vitest';
import {
  HYPERSPACE_TIMING,
  HyperspaceController,
  type JumpPhase,
} from '@/engine/navigation/HyperspaceController';
import {
  jumpExposure,
  jumpKick,
  jumpRattle,
  jumpRecoil,
  jumpStarTravel,
  jumpStretch,
} from '@/features/exploration/hyperspaceVisuals';

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
    const previous = [
      jumpStretch(jump),
      jumpKick(jump),
      jumpRecoil(jump),
      jumpRattle(jump),
      jumpStarTravel(jump),
      jumpExposure(jump),
      jump.coverage,
      jump.intensity,
    ];
    jump.phase = after;
    jump.elapsed = 0;
    const next = [
      jumpStretch(jump),
      jumpKick(jump),
      jumpRecoil(jump),
      jumpRattle(jump),
      jumpStarTravel(jump),
      jumpExposure(jump),
      jump.coverage,
      jump.intensity,
    ];
    next.forEach((value, index) => {
      expect(value).toBeCloseTo(previous[index] ?? Number.NaN, 10);
    });
  });

  it('keeps the long-streak buildup moving and reserves most travel for ignition', () => {
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * 0.55;
    expect(jumpStarTravel(jump)).toBeGreaterThan(0.02);
    expect(jumpStarTravel(jump)).toBeLessThan(0.065);
    let previous = 0;
    for (let frame = 0; frame <= 120; frame++) {
      jump.elapsed = (HYPERSPACE_TIMING.ACCELERATING * frame) / 120;
      const travel = jumpStarTravel(jump);
      expect(travel).toBeGreaterThanOrEqual(previous);
      expect(travel).toBeLessThanOrEqual(1);
      previous = travel;
    }
    expect(previous).toBe(1);
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * 0.45;
    const earlier = jumpStarTravel(jump);
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * 0.6;
    expect(jumpStarTravel(jump)).toBeGreaterThan(earlier);
  });

  it('dissolves the streaks in one bounded exposure crest and settles the exit sweep', () => {
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * 0.6;
    expect(jumpExposure(jump)).toBe(0);
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * 0.87;
    expect(jumpExposure(jump)).toBeCloseTo(1);
    jump.phase = 'HYPERSPACE';
    expect(jumpExposure(jump)).toBe(0);
    jump.phase = 'EXITING';
    jump.elapsed = HYPERSPACE_TIMING.EXITING * 0.4;
    expect(jumpStarTravel(jump)).toBe(0);
    expect(jumpStretch(jump)).toBe(0);
  });
});
