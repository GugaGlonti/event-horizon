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
  jumpStarVisibility,
  jumpStretch,
  jumpTurbulence,
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
    expect(visibleHold).toBeGreaterThan(1.3);
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
      jumpStarVisibility(jump),
      jumpExposure(jump),
      jump.coverage,
      jump.intensity,
      jumpTurbulence(jump),
    ];
    jump.phase = after;
    jump.elapsed = 0;
    const next = [
      jumpStretch(jump),
      jumpKick(jump),
      jumpRecoil(jump),
      jumpRattle(jump),
      jumpStarTravel(jump),
      jumpStarVisibility(jump),
      jumpExposure(jump),
      jump.coverage,
      jump.intensity,
      jumpTurbulence(jump),
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

  it('crossfades directly into clouds without exposing a separate wash before the tunnel', () => {
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    for (let frame = 0; frame <= 120; frame++) {
      jump.elapsed = (HYPERSPACE_TIMING.ACCELERATING * frame) / 120;
      if (jump.coverage === 0) {
        expect(jumpExposure(jump)).toBe(0);
        expect(jumpStarVisibility(jump)).toBe(1);
      }
      expect(jumpExposure(jump)).toBeGreaterThanOrEqual(0);
      expect(jumpExposure(jump)).toBeLessThanOrEqual(0.35);
      // The cloud mask and optical trails never both disappear during their handoff.
      expect(jump.coverage + jumpStarVisibility(jump)).toBeGreaterThanOrEqual(1);
    }
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * 0.9;
    expect(jumpExposure(jump)).toBeCloseTo(0.35);
  });

  it('reveals fully glowing exit streaks over the mask before contracting them', () => {
    const jump = new HyperspaceController();
    jump.phase = 'EXITING';
    jump.elapsed = HYPERSPACE_TIMING.EXITING * 0.2;
    expect(jump.coverage).toBe(1);
    expect(jumpStarVisibility(jump)).toBeGreaterThan(0.7);
    expect(jumpStretch(jump)).toBe(1);
    jump.elapsed = HYPERSPACE_TIMING.EXITING * 0.3;
    expect(jumpStarVisibility(jump)).toBe(1);
    expect(jumpStarTravel(jump)).toBeLessThan(0.3);
    let visibleHold = 0;
    for (let frame = 0; frame <= 120; frame++) {
      jump.elapsed = (HYPERSPACE_TIMING.EXITING * frame) / 120;
      if (jumpStretch(jump) === 1 && jumpStarVisibility(jump) >= 0.8)
        visibleHold += HYPERSPACE_TIMING.EXITING / 120;
      expect(jump.coverage + jumpStarVisibility(jump)).toBeGreaterThanOrEqual(1);
    }
    expect(visibleHold).toBeGreaterThan(0.55);
    jump.elapsed = HYPERSPACE_TIMING.EXITING * 0.95;
    expect(jumpStarTravel(jump)).toBe(0);
    expect(jumpStretch(jump)).toBe(0);
    expect(jumpExposure(jump)).toBe(0);
  });

  it('varies bounded turbulence between journeys, stays smooth and settles before arrival', () => {
    const jump = new HyperspaceController();
    jump.request('solara', 'vesper', ['solara', 'vesper']);
    jump.phase = 'HYPERSPACE';
    let previous = jumpTurbulence(jump);
    for (let frame = 0; frame < 1200; frame++) {
      jump.elapsed = frame / 120;
      const value = jumpTurbulence(jump);
      expect(Math.abs(value)).toBeLessThanOrEqual(1);
      expect(Math.abs(value - previous)).toBeLessThan(0.08);
      previous = value;
    }
    jump.elapsed = 1;
    const first = jumpTurbulence(jump);
    jump.cancel();
    jump.request('solara', 'vesper', ['solara', 'vesper']);
    jump.phase = 'HYPERSPACE';
    jump.elapsed = 1;
    expect(jumpTurbulence(jump)).not.toBeCloseTo(first, 5);
    expect(jumpTurbulence(jump, 1)).not.toBeCloseTo(jumpTurbulence(jump), 5);
    jump.phase = 'EXITING';
    jump.elapsed = HYPERSPACE_TIMING.EXITING * 0.4;
    expect(jumpTurbulence(jump)).toBeCloseTo(0);
  });
});
