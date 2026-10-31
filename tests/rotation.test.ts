import { describe, expect, it } from 'vitest';
import { advanceAngle } from '@/engine/simulation/rotation';

describe('advanceAngle', () => {
  it.each([30, 60, 144])('advances by the same amount over one second at %i fps', (fps) => {
    let angle = 0;
    for (let frame = 0; frame < fps; frame += 1) {
      angle = advanceAngle(angle, 0.5, 1 / fps);
    }
    expect(angle).toBeCloseTo(0.5, 10);
  });

  it('wraps an angle that crosses a full turn', () => {
    expect(advanceAngle(Math.PI * 2 - 0.01, 1, 0.02)).toBeCloseTo(0.01);
  });

  it('supports reverse rotation without returning a negative angle', () => {
    expect(advanceAngle(0.01, -1, 0.02)).toBeCloseTo(Math.PI * 2 - 0.01);
  });

  it('caps large background-tab gaps instead of jumping through the scene', () => {
    expect(advanceAngle(1, 0.5, 30)).toBeCloseTo(1.05);
  });

  it('does not advance for a negative frame delta', () => {
    expect(advanceAngle(1, 0.5, -1)).toBe(1);
  });
});
