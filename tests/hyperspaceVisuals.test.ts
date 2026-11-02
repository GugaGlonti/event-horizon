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
  it('grows the departure beams continuously from the start into the crossing flash', () => {
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * 0.02;
    expect(jumpStretch(jump)).toBe(0);
    let previous = 0;
    for (let frame = 3; frame <= 108; frame++) {
      jump.elapsed = (HYPERSPACE_TIMING.ACCELERATING * frame) / 120;
      const growth = jumpStretch(jump);
      expect(growth).toBeGreaterThan(previous);
      expect(growth).toBeLessThanOrEqual(1);
      expect(jumpExposure(jump)).toBe(0);
      previous = growth;
    }
    expect(previous).toBe(1);
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * 0.86;
    expect(jumpStretch(jump)).toBeGreaterThan(0.99);
    expect(jumpStretch(jump)).toBeLessThan(1);
    expect(jumpExposure(jump)).toBe(0);
  });

  it('keeps stretching past the old full-length hold without a second growth onset', () => {
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    for (const progress of [0.64, 0.72, 0.88]) {
      const samples = [-0.001, 0, 0.001].map((offset) => {
        jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * (progress + offset);
        return jumpStretch(jump);
      });
      const incoming = (samples[1] ?? 0) - (samples[0] ?? 0);
      const outgoing = (samples[2] ?? 0) - (samples[1] ?? 0);
      expect(incoming).toBeGreaterThan(0);
      expect(outgoing).toBeGreaterThan(0);
      expect(outgoing / incoming).toBeGreaterThan(0.9);
      expect(outgoing / incoming).toBeLessThan(1.1);
    }
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING / 2;
    expect(jumpStretch(jump)).toBeGreaterThan(0.5);
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

  it('blooms fully stretched beams through white before recovering into the tunnel', () => {
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * HYPERSPACE_ENTRY.impactStart;
    expect(jumpStretch(jump)).toBe(1);
    expect(jumpExposure(jump)).toBe(0);
    for (let frame = 0; frame <= 120; frame++) {
      jump.elapsed = (HYPERSPACE_TIMING.ACCELERATING * frame) / 120;
      if (jump.coverage === 0) {
        expect(jumpStarVisibility(jump)).toBe(1);
      }
      expect(jumpExposure(jump)).toBeGreaterThanOrEqual(0);
      expect(jumpExposure(jump)).toBeLessThanOrEqual(1);
      // The cloud mask and optical trails never both disappear during their handoff.
      expect(jump.coverage + jumpStarVisibility(jump)).toBeGreaterThanOrEqual(1);
    }
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * ((HYPERSPACE_ENTRY.tunnelStart + 1) / 2);
    expect(jumpExposure(jump)).toBeGreaterThan(0.8);
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING;
    expect(jumpExposure(jump)).toBe(1);
    jump.phase = 'HYPERSPACE';
    jump.elapsed = 0.21;
    expect(jumpExposure(jump)).toBeCloseTo(0.5);
    expect(jump.coverage).toBe(1);
    jump.elapsed = 0.45;
    expect(jumpExposure(jump)).toBe(0);
    expect(jump.coverage).toBe(1);
  });

  it('flashes out of the tunnel before revealing the arrival streaks and braking', () => {
    const jump = new HyperspaceController();
    jump.phase = 'EXITING';
    expect(jumpExposure(jump)).toBe(0);
    jump.elapsed = 0.252;
    expect(jumpExposure(jump)).toBe(1);
    expect(jump.coverage).toBe(1);
    expect(jumpStretch(jump)).toBe(1);
    jump.elapsed = 0.525;
    expect(jumpExposure(jump)).toBeCloseTo(0.5);
    jump.elapsed = 0.714;
    expect(jumpExposure(jump)).toBe(0);
    expect(jumpStarVisibility(jump)).toBe(1);
    expect(jumpStretch(jump)).toBe(1);
    jump.elapsed = HYPERSPACE_TIMING.EXITING * HYPERSPACE_EXIT.revealEnd + 0.1;
    expect(jumpKick(jump)).toBeGreaterThan(0);
    expect(jumpExposure(jump)).toBe(0);
  });

  it('has one bounded flash per crossing, freezes on holds and suppresses reduced-motion flashes', () => {
    const jump = new HyperspaceController();
    let pulses = 0;
    let bright = false;
    for (const phase of [
      'CHARGING',
      'ACCELERATING',
      'HYPERSPACE',
      'EXITING',
      'COOLDOWN',
    ] as const) {
      jump.phase = phase;
      for (let frame = 0; frame <= Math.ceil(jump.duration(phase) * 120); frame++) {
        jump.elapsed = Math.min(frame / 120, jump.duration(phase));
        const exposure = jumpExposure(jump);
        expect(exposure).toBeGreaterThanOrEqual(0);
        expect(exposure).toBeLessThanOrEqual(1);
        expect(jumpExposure(jump, true)).toBe(0);
        expect(jumpExposure(jump)).toBe(exposure);
        if (exposure > 0.9 && !bright) pulses++;
        bright = exposure > 0.9;
      }
    }
    expect(pulses).toBe(2);
    jump.phase = 'ACCELERATING';
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * 0.97;
    expect(jumpExposure(jump)).toBeGreaterThan(0);
    jump.cancel();
    expect(jumpExposure(jump)).toBe(0);
  });

  it('reveals fully glowing exit streaks over the mask before contracting them', () => {
    const jump = new HyperspaceController();
    jump.phase = 'EXITING';
    jump.elapsed = 0.42;
    expect(jump.coverage).toBe(1);
    expect(jumpStarVisibility(jump)).toBeGreaterThan(0.7);
    expect(jumpStretch(jump)).toBe(1);
    jump.elapsed = 0.63;
    expect(jumpStarVisibility(jump)).toBe(1);
    expect(jumpStarTravel(jump)).toBeLessThan(0.3);
    let visibleHold = 0;
    for (let time = 0; time <= HYPERSPACE_TIMING.EXITING; time += 1 / 120) {
      jump.elapsed = time;
      if (jumpStretch(jump) === 1 && jumpStarVisibility(jump) >= 0.8) visibleHold += 1 / 120;
      expect(jump.coverage + jumpStarVisibility(jump)).toBeGreaterThanOrEqual(1);
    }
    expect(visibleHold).toBeGreaterThan(0.55);
    jump.elapsed = HYPERSPACE_TIMING.EXITING;
    expect(jumpStarTravel(jump)).toBe(0);
    expect(jumpStretch(jump)).toBe(0);
    expect(jumpExposure(jump)).toBe(0);
  });

  it('gives clear exit beams the full entry duration without lengthening the flash or world reveal', () => {
    const jump = new HyperspaceController();
    jump.phase = 'EXITING';
    const clear = HYPERSPACE_EXIT.flashEnd * HYPERSPACE_TIMING.EXITING;
    expect(clear).toBeCloseTo(0.714);
    expect(HYPERSPACE_TIMING.EXITING - clear).toBeCloseTo(HYPERSPACE_TIMING.ACCELERATING);
    jump.elapsed = clear;
    expect(jumpExposure(jump)).toBe(0);
    expect(jumpStarVisibility(jump)).toBe(1);
    expect(jumpStretch(jump)).toBe(1);
    jump.elapsed = clear + HYPERSPACE_TIMING.ACCELERATING * 0.75;
    expect(jump.busy).toBe(true);
    expect(jumpStretch(jump)).toBeGreaterThan(0.05);
    expect(jumpExposure(jump)).toBe(0);
    expect(jump.coverage).toBe(0);
    jump.elapsed = clear + HYPERSPACE_TIMING.ACCELERATING;
    expect(jumpStretch(jump)).toBe(0);
    expect(HYPERSPACE_EXIT.revealStart * HYPERSPACE_TIMING.EXITING).toBeCloseTo(0.504);
    expect(HYPERSPACE_EXIT.revealEnd * HYPERSPACE_TIMING.EXITING).toBeCloseTo(0.882);
  });

  it('exchanges beams and clouds only under white and keeps all beams out of the tunnel', () => {
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    for (let frame = 0; frame <= 120; frame++) {
      jump.elapsed = (HYPERSPACE_TIMING.ACCELERATING * frame) / 120;
      if (jumpStarVisibility(jump) < 1) expect(jumpExposure(jump)).toBeGreaterThanOrEqual(0.95);
    }
    jump.phase = 'HYPERSPACE';
    for (let frame = 0; frame <= 120; frame++) {
      jump.elapsed = (jump.duration('HYPERSPACE') * frame) / 120;
      expect(jumpStarVisibility(jump)).toBe(0);
    }
    jump.phase = 'EXITING';
    jump.elapsed = 0;
    expect(jumpStarVisibility(jump)).toBe(0);
    for (let frame = 0; frame <= 120; frame++) {
      jump.elapsed = (HYPERSPACE_TIMING.EXITING * frame) / 120;
      const visibility = jumpStarVisibility(jump);
      if (visibility > 0 && visibility < 1) expect(jumpExposure(jump)).toBe(1);
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
    jump.elapsed =
      HYPERSPACE_TIMING.EXITING *
      (HYPERSPACE_EXIT.revealEnd + (HYPERSPACE_EXIT.settle - HYPERSPACE_EXIT.revealEnd) * 0.2);
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
