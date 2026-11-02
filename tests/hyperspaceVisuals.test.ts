import { describe, expect, it } from 'vitest';
import {
  HYPERSPACE_ENTRY,
  HYPERSPACE_EXIT,
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
    expect(visibleHold).toBeGreaterThan(0.65);
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING / 2;
    expect(jumpStretch(jump)).toBeGreaterThan(0.6);
    expect(jumpStretch(jump)).toBeLessThan(1);
    expect(jump.coverage).toBe(0);
    expect(jumpKick(jump)).toBe(0);
    expect(jump.intensity).toBeGreaterThan(0.08);
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
    expect(jumpStarTravel(jump)).toBeLessThan(0.1);
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
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * ((HYPERSPACE_ENTRY.tunnelStart + 1) / 2);
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

  it('anchors arrival star heads instead of reversing their departure sweep', () => {
    const jump = new HyperspaceController();
    jump.phase = 'HYPERSPACE';
    expect(jumpStarVisibility(jump)).toBe(0);
    jump.phase = 'EXITING';
    expect(jumpStarVisibility(jump)).toBe(0);
    // The head positions reset only under the opaque tunnel, then remain fixed as tails contract.
    for (let frame = 0; frame <= 120; frame++) {
      jump.elapsed = (HYPERSPACE_TIMING.EXITING * frame) / 120;
      expect(jumpStarTravel(jump)).toBe(0);
    }
  });

  it('unifies braking, trail contraction, engine release and the arrival camera impulse', () => {
    const jump = new HyperspaceController();
    jump.phase = 'EXITING';
    jump.elapsed = HYPERSPACE_TIMING.EXITING * HYPERSPACE_EXIT.revealEnd;
    expect(jump.coverage).toBe(0);
    expect(jumpStretch(jump)).toBe(1);
    expect(jump.intensity).toBe(1);
    expect(jumpKick(jump)).toBe(0);
    jump.elapsed += 0.1;
    expect(jumpKick(jump)).toBeGreaterThan(0.7);
    expect(jumpStretch(jump)).toBeLessThan(1);
    expect(jump.intensity).toBeLessThan(1);
    expect(Math.abs(jumpRecoil(jump))).toBeGreaterThan(0.01);
    jump.elapsed += 0.1;
    expect(jumpStretch(jump)).toBeLessThan(0.7);
    jump.elapsed = HYPERSPACE_TIMING.EXITING;
    expect(jumpKick(jump)).toBe(0);
    expect(jumpRecoil(jump)).toBeCloseTo(0);
  });

  it('leaves calm stretches between brief, smooth tunnel hiccups', () => {
    const jump = new HyperspaceController();
    jump.request('solara', 'vesper', ['solara', 'vesper'], 300);
    jump.phase = 'HYPERSPACE';
    let previous = jumpTurbulence(jump);
    let quiet = 0,
      duration = 0,
      calm = 0,
      events = 0;
    for (let frame = 0; frame < 3600; frame++) {
      jump.elapsed = frame / 120;
      const channels = [0, 1, 2].map((channel) => jumpTurbulence(jump, channel));
      const value = channels[0] ?? 0;
      expect(Math.abs(value)).toBeLessThanOrEqual(1);
      expect(Math.abs(value - previous)).toBeLessThan(0.08);
      if (channels.every((sample) => sample === 0)) {
        quiet++;
        calm += 1 / 120;
        if (duration) {
          expect(duration).toBeGreaterThan(0.4);
          expect(duration).toBeLessThan(0.75);
          duration = 0;
        }
      } else {
        if (!duration) {
          if (events) expect(calm).toBeGreaterThan(2);
          events++;
          calm = 0;
        }
        duration += 1 / 120;
      }
      previous = value;
    }
    expect(quiet / 3600).toBeGreaterThan(0.8);
    expect(events).toBeGreaterThanOrEqual(4);
    expect(events).toBeLessThanOrEqual(7);
  });

  it('varies hiccup timing between journeys and keeps the shared clock deterministic', () => {
    const jump = new HyperspaceController();
    jump.request('solara', 'vesper', ['solara', 'vesper'], 100);
    jump.phase = 'HYPERSPACE';
    const first: number[] = [];
    for (let frame = 0; frame < 1200; frame++) {
      jump.elapsed = frame / 120;
      const value = jumpTurbulence(jump);
      first.push(value);
      expect(jumpTurbulence(jump)).toBe(value);
      if (Math.abs(value) > 0.01) expect(jumpTurbulence(jump, 1)).not.toBeCloseTo(value, 5);
    }
    jump.cancel();
    expect(jumpTurbulence(jump)).toBe(0);
    jump.request('solara', 'vesper', ['solara', 'vesper'], 100);
    expect(jumpTurbulence(jump)).toBe(0);
    jump.phase = 'HYPERSPACE';
    const second: number[] = [];
    for (let frame = 0; frame < 1200; frame++) {
      jump.elapsed = frame / 120;
      second.push(jumpTurbulence(jump));
    }
    expect(second).not.toEqual(first);
    expect(second.map((value) => value === 0)).not.toEqual(first.map((value) => value === 0));
  });

  it('settles all hiccups before the arrival reveal', () => {
    const jump = new HyperspaceController();
    jump.request('solara', 'vesper', ['solara', 'vesper']);
    jump.phase = 'EXITING';
    jump.elapsed = HYPERSPACE_TIMING.EXITING * 0.4;
    expect(jumpTurbulence(jump)).toBeCloseTo(0);
  });
});
