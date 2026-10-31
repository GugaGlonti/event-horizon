import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CombatSimulation } from '@/engine/combat/CombatSimulation';
import type { CombatShip, Obstacle, ShipCommand, WeaponSlot } from '@/engine/combat/combatTypes';
import { missileCanLock } from '@/engine/combat/weapons';
import { FixedStepLoop } from '@/engine/simulation/FixedStepLoop';
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
function charge(world: CombatSimulation) {
  advance(world, PLAYER_SHIP.railgun.chargeTime, { ...idle, weapon: 3, fire: true });
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

describe('weapon commands and reload', () => {
  it('defaults to the gun, accepts slot commands and retains selection without another command', () => {
    const world = simulation();
    world.step({ ...idle, fire: true }, dt);
    expect(world.player.weapon).toBe(1);
    expect(world.projectiles[0]?.kind).toBe('gun');
    world.step({ ...idle, weapon: 2 }, dt);
    world.step(idle, dt);
    expect(world.player.weapon).toBe(2);
  });
  it('does not bypass reload by switching and restores the gun on respawn', () => {
    const world = simulation();
    charge(world);
    expect(world.tracers).toHaveLength(1);
    world.step({ ...idle, fire: true, weapon: 2 }, dt);
    expect(world.projectiles).toHaveLength(0);
    advance(world, PLAYER_SHIP.railgun.interval);
    world.step({ ...idle, fire: true }, dt);
    expect(world.projectiles[0]?.kind).toBe('missile');
    world.respawn();
    expect(world.player.weapon).toBe(1);
    expect(world.player.cooldown).toBe(0);
    expect(world.tracers).toHaveLength(0);
  });
});

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

describe('charged central railgun', () => {
  it('waits for a full charge, fires once from the rotated center and deals heavy damage', () => {
    const world = simulation();
    const position = new Vector3(100000, 200, -100000);
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7);
    world.player.controller.relocate(position, rotation);
    world.player.sync();
    const enemy = world.spawn(
      {
        ...PRACTICE_TARGET,
        defense: { shields: 100, hull: 100, regeneration: 0, regenerationDelay: 6 },
      },
      new Vector3(0, 0, -300).applyQuaternion(rotation).add(position),
      new Quaternion(),
      true,
    );
    if (!enemy) throw new Error('Expected target');
    advance(world, 0.8 - dt, { ...idle, weapon: 3, fire: true });
    expect(world.tracers).toHaveLength(0);
    expect(enemy.health.shields).toBe(100);
    expect(world.player.railgunCharge).toBeCloseTo(0.8 - dt);
    world.step({ ...idle, fire: true }, dt);
    const tracer = world.tracers[0];
    if (!tracer) throw new Error('Expected a rail shot');
    const localStart = tracer.start
      .clone()
      .sub(position)
      .applyQuaternion(rotation.clone().invert());
    expect(localStart.x).toBeCloseTo(0);
    expect(localStart.y).toBeCloseTo(0);
    expect(localStart.z).toBeCloseTo(-6);
    expect(enemy.health.shields).toBe(0);
    expect(enemy.health.hull).toBe(80);
    expect(world.player.railgunCharge).toBe(0);
    expect(world.player.cooldown).toBe(1.6);
    expect(world.projectiles).toHaveLength(0);
    expect(tracer.owner).toBe('player');
    advance(world, 0.2);
    expect(enemy.health.hull).toBe(80);
    expect(world.tracers).toHaveLength(1);
    advance(world, 0.06);
    expect(world.tracers).toHaveLength(0);
  });
  it('cancels partial charge on release, slot changes, encounter cleanup and destruction', () => {
    const world = simulation();
    advance(world, 0.5, { ...idle, weapon: 3, fire: true });
    world.step(idle, dt);
    expect(world.player.railgunCharge).toBe(0);
    advance(world, 0.5, { ...idle, fire: true });
    expect(world.tracers).toHaveLength(0);
    world.step({ ...idle, weapon: 2 }, dt);
    world.step({ ...idle, weapon: 3 }, dt);
    expect(world.player.railgunCharge).toBe(0);
    advance(world, 0.5, { ...idle, fire: true });
    world.clearEncounter();
    expect(world.player.railgunCharge).toBe(0);
    advance(world, 0.5, { ...idle, fire: true });
    world.damage(world.player, 1000);
    expect(world.player.railgunCharge).toBe(0);
    advance(world, 1, { ...idle, fire: true });
    expect(world.tracers).toHaveLength(0);
  });
  it('requires a reload and fresh charge for each shot while Space stays held', () => {
    const world = simulation();
    charge(world);
    advance(world, 1.6 - dt, { ...idle, fire: true });
    expect(world.player.railgunCharge).toBe(0);
    advance(world, 0.8 - dt, { ...idle, fire: true });
    expect(world.tracers).toHaveLength(0);
    world.step({ ...idle, fire: true }, dt);
    expect(world.tracers).toHaveLength(1);
    expect(world.tracers[0]?.start.toArray()).toEqual([0, 0, -6]);
    world.clearEncounter();
    expect(world.tracers).toHaveLength(0);
  });
  it('hits only the first solid object, stops its tracer there, and obeys maximum range', () => {
    const world = simulation(),
      enemy = target(world);
    world.obstacles.push(rock());
    charge(world);
    expect(enemy.health.shields).toBe(30);
    expect(world.tracers[0]?.end.z).toBeCloseTo(-79.75);
    world.respawn();
    target(world, new Vector3(0, 0, -3600));
    charge(world);
    const tracer = world.tracers[0];
    if (!tracer) throw new Error('Expected a rail shot');
    expect(tracer.start.distanceTo(tracer.end)).toBeCloseTo(3500);
    expect(world.kills).toBe(0);
  });
  it('does not steer or bend toward a selected off-axis target', () => {
    const world = simulation(),
      enemy = target(world, new Vector3(9, 0, -300));
    world.targetId = enemy.id;
    charge(world);
    expect(enemy.health.shields).toBe(30);
    expect(world.tracers[0]?.start.x).toBe(0);
    expect(world.tracers[0]?.end.x).toBe(0);
  });
});

describe('fixed-step weapon replay', () => {
  it.each([1, 2, 3] as const)(
    'replays slot %s identically at 30/60/144 render FPS',
    (weapon: WeaponSlot) => {
      function replay(fps: number) {
        const world = simulation(),
          enemy: CombatShip = target(world, new Vector3(80, 0, -400));
        world.targetId = enemy.id;
        const clock = new FixedStepLoop(dt, 0.1, 12);
        for (let frame = 0; frame < fps * 2; frame++)
          clock.advance(1 / fps, (step) => world.step({ ...idle, fire: true, weapon }, step));
        return {
          kills: world.kills,
          health: enemy.health.hull,
          shots: world.projectiles.map((shot) => shot.position.toArray()),
          tracers: world.tracers.map((tracer) => [tracer.age, tracer.end.toArray()]),
          charge: world.player.railgunCharge,
        };
      }
      expect(replay(30)).toEqual(replay(60));
      expect(replay(144)).toEqual(replay(60));
    },
  );
});
