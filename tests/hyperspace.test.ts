import { describe, expect, it } from 'vitest';
import {
  HYPERSPACE_EXIT,
  HYPERSPACE_TIMING,
  HyperspaceController,
  hyperspaceDuration,
  type JumpPhase,
} from '@/engine/navigation/HyperspaceController';

function advance(jump: HyperspaceController, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 120); i += 1) jump.advance(1 / 120);
}

describe('hyperspace state machine', () => {
  it('scales transit monotonically with distance and publishes honest progress and remaining time', () => {
    const short = new HyperspaceController();
    const long = new HyperspaceController();
    short.request('solara', 'vesper', ['solara', 'vesper'], 10);
    long.request('solara', 'vesper', ['solara', 'vesper'], 80);
    expect(long.journeyDuration - short.journeyDuration).toBeCloseTo(70 * 0.12);
    short.phase = long.phase = 'HYPERSPACE';
    short.elapsed = short.duration('HYPERSPACE') / 2;
    long.elapsed = short.elapsed;
    expect(short.distanceTraveled).toBe(5);
    expect(long.progress).toBeLessThan(short.progress);
    const age = short.journeyElapsed;
    short.advance(0.1);
    expect(short.journeyElapsed - age).toBeCloseTo(0.1);
    expect(short.distanceTraveled).toBeGreaterThan(5);
    short.cancel();
    expect(short.distanceTraveled).toBe(0);
    expect(() => hyperspaceDuration(Infinity)).toThrow();
    expect(() => hyperspaceDuration(-1)).toThrow();
  });

  it('does not time out an already prepared long journey and distinguishes an arrival hold', () => {
    const jump = new HyperspaceController();
    jump.request('solara', 'vesper', ['solara', 'vesper'], 150);
    jump.prepared = true;
    advance(jump, HYPERSPACE_TIMING.ALIGNMENT + HYPERSPACE_TIMING.ACCELERATING + 13);
    expect(jump.phase).toBe('HYPERSPACE');
    expect(jump.waiting).toBe(false);
    advance(jump, 10);
    expect(jump.phase).toBe('EXITING');
    expect(jump.waiting).toBe(true);
    const elapsed = jump.journeyElapsed;
    const flightElapsed = jump.flightElapsed;
    advance(jump, 1);
    expect(jump.journeyElapsed).toBe(elapsed);
    expect(jump.flightElapsed).toBeGreaterThan(flightElapsed);
    jump.arrivalReady = true;
    expect(jump.waiting).toBe(false);
  });
  it.each([null, 'solara', 'missing'])('rejects invalid destination %s', (destination) => {
    const jump = new HyperspaceController();
    expect(jump.request('solara', destination, ['solara', 'vesper'])).toBe(false);
    expect(jump.phase).toBe('IDLE');
    expect(jump.error).toBeTruthy();
  });

  it('runs the complete sequence once, waits for preparation, and blocks overlapping jumps/cooldown', () => {
    const jump = new HyperspaceController();
    expect(jump.request('solara', 'vesper', ['solara', 'vesper'])).toBe(true);
    expect(jump.request('solara', 'vesper', ['solara', 'vesper'])).toBe(false);
    advance(jump, HYPERSPACE_TIMING.ALIGNMENT);
    expect(jump.phase).toBe('ACCELERATING');
    advance(jump, HYPERSPACE_TIMING.ACCELERATING);
    expect(jump.phase).toBe('HYPERSPACE');
    advance(jump, 4);
    expect(jump.phase).toBe('HYPERSPACE');
    jump.prepared = true;
    jump.advance(1 / 120);
    expect(jump.phase).toBe('EXITING');
    jump.arrivalReady = true;
    advance(jump, HYPERSPACE_TIMING.EXITING);
    expect(jump.phase).toBe('COOLDOWN');
    expect(jump.busy).toBe(false);
    expect(jump.request('vesper', 'solara', ['solara', 'vesper'])).toBe(false);
    advance(jump, HYPERSPACE_TIMING.COOLDOWN);
    expect(jump.phase).toBe('IDLE');
    expect(jump.destinationId).toBeNull();
  });

  it('recovers from preparation timeout and explicit failures', () => {
    const jump = new HyperspaceController();
    jump.request('solara', 'vesper', ['solara', 'vesper']);
    advance(jump, 20);
    expect(jump.phase).toBe('IDLE');
    expect(jump.error).toMatch(/timed out/);
    jump.request('solara', 'vesper', ['solara', 'vesper']);
    jump.fail('Unavailable destination.');
    expect(jump.phase).toBe('IDLE');
    expect(jump.error).toBe('Unavailable destination.');
  });

  it.each(['ALIGNMENT', 'ACCELERATING', 'HYPERSPACE', 'EXITING', 'COOLDOWN'] as JumpPhase[])(
    'cancels cleanly during %s',
    (phase) => {
      const jump = new HyperspaceController();
      jump.request('solara', 'vesper', ['solara', 'vesper']);
      jump.phase = phase;
      jump.cancel();
      expect(jump.phase).toBe('IDLE');
      expect(jump.destinationId).toBeNull();
      expect(jump.intensity).toBe(0);
    },
  );

  it('bounds suspension time and rejects invalid elapsed time', () => {
    const jump = new HyperspaceController();
    jump.request('solara', 'vesper', ['solara', 'vesper']);
    jump.advance(3600);
    expect(jump.phase).toBe('ALIGNMENT');
    expect(jump.elapsed).toBe(0.1);
    expect(() => jump.advance(Number.NaN)).toThrow();
    expect(() => jump.advance(-1)).toThrow();
  });

  it('keeps the destination fully masked until its first rendered frame and times out safely', () => {
    const jump = new HyperspaceController();
    jump.request('solara', 'vesper', ['solara', 'vesper']);
    jump.prepared = true;
    advance(
      jump,
      HYPERSPACE_TIMING.ALIGNMENT + HYPERSPACE_TIMING.ACCELERATING + HYPERSPACE_TIMING.HYPERSPACE,
    );
    expect(jump.phase).toBe('EXITING');
    advance(jump, 2);
    expect(jump.progress).toBe(0);
    expect(jump.coverage).toBe(1);
    advance(jump, 11);
    expect(jump.phase).toBe('IDLE');
    expect(jump.error).toMatch(/Arrival rendering timed out/);
  });

  it('holds the arrival opaque for the glowing stars, then clears it before the braking beat', () => {
    const jump = new HyperspaceController();
    jump.phase = 'EXITING';
    jump.elapsed = HYPERSPACE_TIMING.EXITING * HYPERSPACE_EXIT.revealStart;
    expect(jump.coverage).toBe(1);
    jump.elapsed = HYPERSPACE_TIMING.EXITING * HYPERSPACE_EXIT.revealEnd;
    expect(jump.coverage).toBe(0);
    expect(
      HYPERSPACE_TIMING.EXITING * (HYPERSPACE_EXIT.revealEnd - HYPERSPACE_EXIT.revealStart),
    ).toBeLessThan(0.4);
  });
});
