import { describe, expect, it } from 'vitest';
import { ShipHealth } from '@/engine/combat/damage';
import { PLAYER_SHIP } from '@/features/combat/config';

describe('damage and regeneration', () => {
  it('absorbs shield damage, spills to hull, clamps death, and never revives wrecks', () => {
    const health = new ShipHealth(PLAYER_SHIP.defense);
    health.damage(40);
    expect(health.shields).toBe(60);
    expect(health.hull).toBe(100);
    health.damage(80);
    expect(health.shields).toBe(0);
    expect(health.hull).toBe(80);
    health.damage(1000);
    health.step(100);
    expect(health.hull).toBe(0);
    expect(health.shields).toBe(0);
    expect(health.damage(10)).toBe(false);
  });
  it('regenerates only the time after the delay and restarts the delay on a hit', () => {
    const health = new ShipHealth(PLAYER_SHIP.defense);
    health.damage(60);
    health.step(3.9);
    expect(health.shields).toBe(40);
    health.step(0.3);
    expect(health.shields).toBeCloseTo(42);
    health.damage(1);
    health.step(3.9);
    expect(health.shields).toBeCloseTo(41);
    health.step(100);
    expect(health.shields).toBe(100);
    expect(health.hull).toBe(100);
  });
  it('protects fresh respawns and rejects invalid damage', () => {
    const health = new ShipHealth(PLAYER_SHIP.defense);
    health.invulnerability = 3;
    expect(health.damage(100)).toBe(false);
    health.step(3);
    expect(health.damage(100)).toBe(true);
    for (const value of [NaN, Infinity, -1, 0]) expect(health.damage(value)).toBe(false);
  });
});
