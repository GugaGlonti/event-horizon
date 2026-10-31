import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CombatSimulation } from '@/engine/combat/CombatSimulation';
import type { Obstacle, ShipCommand } from '@/engine/combat/combatTypes';
import { missileCanLock } from '@/engine/combat/weapons';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { AI_CONFIG, PLAYER_SHIP, PRACTICE_TARGET } from '@/features/combat/config';

const dt = 1 / 120;
const idle = { flight: createFlightInput(), fire: false };
function simulation() {
  return new CombatSimulation(PLAYER_SHIP, AI_CONFIG);
}
function target(world: CombatSimulation, position = new Vector3(0, 0, -300)) {
  const ship = world.spawn(PRACTICE_TARGET, position, new Quaternion(), true);
  if (!ship) throw new Error('Expected a target');
  return ship;
}
function advance(world: CombatSimulation, seconds: number, command: ShipCommand = idle) {
  for (let index = 0; index < Math.round(seconds * 120); index++) world.step(command, dt);
}
function rock(): Obstacle {
  return {
    id: 'rock',
    kind: 'asteroid',
    inverseMass: 0,
    layer: 2,
    mask: 5,
    position: new Vector3(0, 0, -100),
    previous: new Vector3(0, 0, -100),
    velocity: new Vector3(),
    radius: 20,
  };
}

describe('slower homing missiles', () => {
  it('launches below the central nose at a slower speed and captures the selected hostile', () => {
    const world = simulation(),
      enemy = target(world);
    world.targetId = enemy.id;
    world.step({ ...idle, fire: true, weapon: 2 }, dt);
    const missile = world.projectiles[0];
    expect(missile?.kind).toBe('missile');
    if (missile?.kind !== 'missile') throw new Error('Expected a missile');
    expect(missile.targetId).toBe(enemy.id);
    expect(missile.velocity.length()).toBe(320);
    expect(missile.velocity.length()).toBeLessThan(PLAYER_SHIP.laser.speed);
    expect(missile.position.toArray()).toEqual([0, -0.4, -6]);
    expect(enemy.health.shields).toBe(30);
    expect(world.effects.some((effect) => effect.kind === 'missile-launch')).toBe(true);
  });
  it('steers toward an off-axis target without exceeding its turn rate, then hits it', () => {
    const world = simulation(),
      enemy = target(world, new Vector3(130, 40, -400));
    world.targetId = enemy.id;
    world.step({ ...idle, fire: true, weapon: 2 }, dt);
    const missile = world.projectiles[0];
    if (missile?.kind !== 'missile') throw new Error('Expected a missile');
    const previous = missile.heading.clone();
    world.step(idle, dt);
    expect(missile.heading.angleTo(previous)).toBeLessThanOrEqual(missile.turnRate * dt + 1e-7);
    expect(missile.heading.x).toBeGreaterThan(0);
    for (let tick = 0; tick < 240 && !enemy.health.destroyed; tick++) world.step(idle, dt);
    expect(enemy.health.destroyed).toBe(true);
    expect(world.projectiles).toHaveLength(0);
    expect(world.effects.some((effect) => effect.kind === 'detonation')).toBe(true);
  });
  it('acquires only a live hostile in its forward cone and range', () => {
    const world = simulation();
    const enemy = target(world);
    expect(missileCanLock(world.player, enemy)).toBe(true);
    for (const position of [
      new Vector3(0, 0, 300),
      new Vector3(0, 0, -2300),
      new Vector3(500, 0, -100),
    ]) {
      enemy.position.copy(position);
      expect(missileCanLock(world.player, enemy)).toBe(false);
    }
    expect(missileCanLock(world.player, world.player)).toBe(false);
    expect(missileCanLock(world.player, undefined)).toBe(false);
    enemy.position.set(0, 0, -300);
    enemy.health.damage(1000);
    expect(missileCanLock(world.player, enemy)).toBe(false);
  });
  it('keeps its launch target when selection changes and flies unguided when that target is lost', () => {
    const world = simulation(),
      first = target(world),
      second = target(world, new Vector3(100, 0, -300));
    world.targetId = first.id;
    world.step({ ...idle, fire: true, weapon: 2 }, dt);
    const missile = world.projectiles[0];
    if (missile?.kind !== 'missile') throw new Error('Expected a missile');
    world.targetId = second.id;
    world.step(idle, dt);
    expect(missile.targetId).toBe(first.id);
    world.damage(first, 1000);
    const heading = missile.heading.clone();
    world.step(idle, dt);
    expect(missile.targetId).toBeNull();
    expect(missile.heading.equals(heading)).toBe(true);
  });
  it('can fire without a lock, expires, and stops at the first environment collider', () => {
    const world = simulation();
    world.step({ ...idle, fire: true, weapon: 2 }, dt);
    const missile = world.projectiles[0];
    if (missile?.kind !== 'missile') throw new Error('Expected a missile');
    expect(missile.targetId).toBeNull();
    advance(world, 7.1);
    expect(world.projectiles).toHaveLength(0);
    const enemy = target(world);
    world.targetId = enemy.id;
    world.obstacles.push(rock());
    world.step({ ...idle, fire: true }, dt);
    advance(world, 0.3);
    expect(world.projectiles).toHaveLength(0);
    expect(enemy.health.shields).toBe(30);
    expect(world.effects.some((effect) => effect.kind === 'detonation')).toBe(true);
  });
});
