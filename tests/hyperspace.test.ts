import { describe, expect, it } from 'vitest';
import {
  HYPERSPACE_TIMING,
  HyperspaceController,
  type JumpPhase,
} from '@/engine/navigation/HyperspaceController';

function advance(jump: HyperspaceController, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 120); i += 1) jump.advance(1 / 120);
}

describe('hyperspace state machine', () => {
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
    advance(jump, HYPERSPACE_TIMING.CHARGING);
    expect(jump.phase).toBe('ACCELERATING');
    advance(jump, HYPERSPACE_TIMING.ACCELERATING);
    expect(jump.phase).toBe('HYPERSPACE');
    advance(jump, 4);
    expect(jump.phase).toBe('HYPERSPACE');
    jump.prepared = true;
    jump.advance(1 / 120);
    expect(jump.phase).toBe('EXITING');
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

  it.each(['CHARGING', 'ACCELERATING', 'HYPERSPACE', 'EXITING', 'COOLDOWN'] as JumpPhase[])(
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
    expect(jump.phase).toBe('CHARGING');
    expect(jump.elapsed).toBe(0.1);
    expect(() => jump.advance(Number.NaN)).toThrow();
    expect(() => jump.advance(-1)).toThrow();
  });
});
