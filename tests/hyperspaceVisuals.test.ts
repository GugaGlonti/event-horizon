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
  jumpFlash,
  jumpKick,
  jumpRattle,
  jumpRecoil,
  jumpStarVisibility,
  jumpStretch,
  jumpTurbulence,
} from '@/features/exploration/hyperspaceVisuals';

describe('hyperspace visual timing', () => {
  it.each(['ACCELERATING', 'EXITING'] as const)(
    'reaches white at one instant and immediately fades without a hold during %s',
    (phase) => {
      const jump = new HyperspaceController();
      jump.phase = phase;
      const entryPeak = HYPERSPACE_TIMING.ACCELERATING * HYPERSPACE_ENTRY.flashPeak;
      const peak = phase === 'ACCELERATING' ? entryPeak : HYPERSPACE_TIMING.EXITING - entryPeak;
      jump.elapsed = peak;
      expect(jumpExposure(jump)).toBeCloseTo(1, 12);
      for (const side of [-1, 1]) {
        let previous = 1;
        for (const offset of [1 / 240, 1 / 120, 1 / 60, 1 / 30]) {
          jump.elapsed = peak + side * offset;
          const exposure = jumpExposure(jump);
          expect(exposure).toBeLessThan(previous);
          expect(exposure).toBeGreaterThan(0.95);
          previous = exposure;
        }
      }
    },
  );

  it('reverses the complete entry beam, flash and coverage sequence for exit at every sample', () => {
    const entry = new HyperspaceController();
    const exit = new HyperspaceController();
    exit.phase = 'EXITING';
    const duration = HYPERSPACE_TIMING.EXITING;
    expect(duration).toBeCloseTo(HYPERSPACE_TIMING.ACCELERATING + 0.42);
    for (let frame = 0; frame <= Math.ceil(duration * 120); frame++) {
      const time = Math.min(frame / 120, duration);
      entry.phase = time <= HYPERSPACE_TIMING.ACCELERATING ? 'ACCELERATING' : 'HYPERSPACE';
      entry.elapsed =
        time <= HYPERSPACE_TIMING.ACCELERATING ? time : time - HYPERSPACE_TIMING.ACCELERATING;
      exit.elapsed = duration - time;
      expect(jumpStretch(exit)).toBeCloseTo(jumpStretch(entry), 10);
      expect(jumpExposure(exit)).toBeCloseTo(jumpExposure(entry), 10);
      expect(jumpFlash(exit)).toBeCloseTo(jumpFlash(entry), 10);
      expect(jumpStarVisibility(exit)).toBeCloseTo(jumpStarVisibility(entry), 10);
      expect(exit.coverage).toBeCloseTo(entry.coverage, 10);
    }
  });

  it('grows and whitens together for exactly three seconds, then reverses both together', () => {
    const entry = new HyperspaceController();
    const exit = new HyperspaceController();
    entry.phase = 'ACCELERATING';
    exit.phase = 'EXITING';
    expect(HYPERSPACE_TIMING.ACCELERATING).toBe(3);
    const exitStart = HYPERSPACE_TIMING.EXITING - 3;
    let previous = -1;
    for (let frame = 0; frame <= 360; frame++) {
      const time = frame / 120;
      entry.elapsed = time;
      exit.elapsed = exitStart + 3 - time;
      const growth = jumpStretch(entry);
      expect(growth).toBeGreaterThan(previous);
      expect(jumpExposure(entry)).toBeCloseTo(growth, 12);
      expect(jumpStretch(exit)).toBeCloseTo(growth, 12);
      expect(jumpExposure(exit)).toBeCloseTo(growth, 12);
      if (frame > 0 && frame < 360) {
        expect(growth).toBeGreaterThan(0);
        expect(growth).toBeLessThan(1);
      }
      previous = growth;
    }
    entry.elapsed = 1.5;
    exit.elapsed = exitStart + 1.5;
    expect(jumpStretch(entry)).toBeCloseTo(0.5);
    expect(jumpExposure(entry)).toBeCloseTo(0.5);
    expect(jumpStretch(exit)).toBeCloseTo(0.5);
    expect(jumpExposure(exit)).toBeCloseTo(0.5);
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
    expect(jumpStretch(jump)).toBeCloseTo(0.5);
    expect(jumpStretch(jump)).toBeLessThan(1);
    expect(jump.coverage).toBe(0);
    expect(jumpKick(jump)).toBe(0);
    expect(jump.intensity).toBeGreaterThan(0.08);
  });

  it('holds the mirrored exit at the dark tunnel endpoint until the destination frame is ready', () => {
    const jump = new HyperspaceController();
    jump.request('solara', 'vesper', ['solara', 'vesper']);
    jump.phase = 'EXITING';
    for (let frame = 0; frame < 120; frame++) {
      jump.advance(1 / 120);
      expect(jump.elapsed).toBe(0);
      expect(jump.coverage).toBe(1);
      expect(jumpExposure(jump)).toBe(0);
      expect(jumpStarVisibility(jump)).toBe(0);
    }
    jump.arrivalReady = true;
    jump.advance(0.1);
    expect(jumpExposure(jump)).toBeGreaterThan(0);
    expect(jumpStarVisibility(jump)).toBe(0);
    expect(jump.coverage).toBe(1);
  });

  it.each<[JumpPhase, JumpPhase]>([
    ['ALIGNMENT', 'ACCELERATING'],
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
      jumpFlash(jump),
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
      jumpFlash(jump),
      jump.coverage,
      jump.intensity,
      jumpTurbulence(jump),
    ];
    next.forEach((value, index) => {
      expect(value).toBeCloseTo(previous[index] ?? Number.NaN, 10);
    });
  });

  it('keeps mid-growth beams clear of screen wash and covers their exchange only near the peak', () => {
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING / 2;
    expect(jumpStretch(jump)).toBeCloseTo(0.5);
    expect(jumpExposure(jump)).toBeCloseTo(0.5);
    expect(jumpFlash(jump)).toBe(0);
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING;
    expect(jumpFlash(jump)).toBe(1);
    expect(jumpFlash(jump, true)).toBe(0);
    jump.phase = 'EXITING';
    jump.elapsed = 0.42 + HYPERSPACE_TIMING.ACCELERATING / 2;
    expect(jumpStretch(jump)).toBeCloseTo(0.5);
    expect(jumpFlash(jump)).toBe(0);
  });

  it('grows and brightens through white before recovering into the tunnel', () => {
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    jump.elapsed = HYPERSPACE_TIMING.ACCELERATING * HYPERSPACE_ENTRY.impactStart;
    expect(jumpStretch(jump)).toBeLessThan(1);
    expect(jumpExposure(jump)).toBeCloseTo(jumpStretch(jump));
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

  it('flashes out of the tunnel then contracts and recovers from white together', () => {
    const jump = new HyperspaceController();
    jump.phase = 'EXITING';
    expect(jumpExposure(jump)).toBe(0);
    jump.elapsed = 0.21;
    expect(jumpExposure(jump)).toBeCloseTo(0.5);
    expect(jumpStarVisibility(jump)).toBe(0);
    jump.elapsed = 0.42;
    expect(jumpExposure(jump)).toBe(1);
    expect(jump.coverage).toBe(1);
    expect(jumpStretch(jump)).toBe(1);
    jump.elapsed = 1.92;
    expect(jumpExposure(jump)).toBeCloseTo(0.5);
    expect(jumpStretch(jump)).toBeCloseTo(0.5);
    expect(jumpStarVisibility(jump)).toBe(1);
    expect(jump.coverage).toBe(0);
    jump.elapsed = 3.42;
    expect(jumpExposure(jump)).toBe(0);
    expect(jumpStretch(jump)).toBe(0);
  });

  it('has one bounded flash per crossing, freezes on holds and suppresses reduced-motion flashes', () => {
    const jump = new HyperspaceController();
    let pulses = 0;
    let bright = false;
    for (const phase of [
      'ALIGNMENT',
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
        expect(jumpFlash(jump, true)).toBe(0);
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

  it('reveals near-peak beams under white without an exit extension hold', () => {
    const jump = new HyperspaceController();
    jump.phase = 'EXITING';
    jump.elapsed = 0.465;
    expect(jump.coverage).toBeGreaterThan(0.8);
    expect(jumpStarVisibility(jump)).toBeGreaterThan(0.7);
    expect(jumpStretch(jump)).toBeGreaterThan(0.99);
    expect(jumpStretch(jump)).toBeLessThan(1);
    expect(jumpExposure(jump)).toBeCloseTo(jumpStretch(jump));
    let previous = 1;
    for (let frame = 1; frame <= 360; frame++) {
      jump.elapsed = 0.42 + frame / 120;
      const stretch = jumpStretch(jump);
      expect(stretch).toBeLessThan(previous);
      expect(jumpExposure(jump)).toBeCloseTo(stretch);
      expect(jump.coverage + jumpStarVisibility(jump)).toBeGreaterThanOrEqual(1);
      previous = stretch;
    }
    expect(previous).toBe(0);
  });

  it('fits the simultaneous beam effect into three seconds while preserving the masked exchange', () => {
    const jump = new HyperspaceController();
    jump.phase = 'EXITING';
    expect(HYPERSPACE_TIMING.EXITING).toBeCloseTo(3.42);
    const peak = HYPERSPACE_EXIT.streaksStart * HYPERSPACE_TIMING.EXITING;
    const clear = HYPERSPACE_EXIT.flashEnd * HYPERSPACE_TIMING.EXITING;
    expect(peak).toBeCloseTo(0.42);
    expect(clear - peak).toBeCloseTo(3);
    jump.elapsed = peak;
    expect(jumpExposure(jump)).toBe(1);
    expect(jumpStretch(jump)).toBe(1);
    jump.elapsed = clear;
    expect(jumpExposure(jump)).toBe(0);
    expect(jumpStretch(jump)).toBe(0);
    expect(HYPERSPACE_EXIT.revealEnd * HYPERSPACE_TIMING.EXITING).toBeCloseTo(0.6);
    expect(
      HYPERSPACE_TIMING.EXITING * (HYPERSPACE_EXIT.revealEnd - HYPERSPACE_EXIT.revealStart),
    ).toBeCloseTo(HYPERSPACE_TIMING.ACCELERATING * (1 - HYPERSPACE_ENTRY.tunnelStart));
  });

  it('exchanges beams and clouds only under white and keeps all beams out of the tunnel', () => {
    const jump = new HyperspaceController();
    jump.phase = 'ACCELERATING';
    for (let frame = 0; frame <= 120; frame++) {
      jump.elapsed = (HYPERSPACE_TIMING.ACCELERATING * frame) / 120;
      if (jumpStarVisibility(jump) < 1) expect(jumpFlash(jump)).toBeGreaterThanOrEqual(0.99);
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
      if (visibility > 0 && visibility < 1) expect(jumpFlash(jump)).toBeGreaterThanOrEqual(0.99);
    }
  });

  it('brakes after world reveal while beam contraction and whitening recover together', () => {
    const jump = new HyperspaceController();
    jump.phase = 'EXITING';
    jump.elapsed = HYPERSPACE_TIMING.EXITING * HYPERSPACE_EXIT.brakingStart;
    expect(jump.coverage).toBe(0);
    expect(jumpStretch(jump)).toBeLessThan(1);
    expect(jumpExposure(jump)).toBeCloseTo(jumpStretch(jump));
    expect(jump.intensity).toBe(1);
    expect(jumpKick(jump)).toBe(0);
    jump.elapsed += 0.1;
    expect(jumpKick(jump)).toBeGreaterThan(0.7);
    expect(jumpStretch(jump)).toBeLessThan(1);
    expect(jump.intensity).toBeLessThan(1);
    expect(Math.abs(jumpRecoil(jump))).toBeGreaterThan(0.01);
    jump.elapsed =
      HYPERSPACE_TIMING.EXITING *
      (HYPERSPACE_EXIT.brakingStart +
        (HYPERSPACE_EXIT.settle - HYPERSPACE_EXIT.brakingStart) * 0.5);
    expect(jumpStretch(jump)).toBeLessThan(0.5);
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
