import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CombatSimulation } from '@/engine/combat/CombatSimulation';
import type { CombatShip, Obstacle, ShipConfig } from '@/engine/combat/combatTypes';
import { impactDamage, ShipHealth } from '@/engine/combat/damage';
import { ShipAi } from '@/engine/combat/ShipAi';
import { leadTime } from '@/engine/combat/targeting';
import { collides, SphereSolver, sweepSphere } from '@/engine/physics/spheres';
import { FixedStepLoop } from '@/engine/simulation/FixedStepLoop';
import { createFlightInput } from '@/engine/simulation/flightTypes';
import { AI_CONFIG, ENEMY_SHIP, PLAYER_SHIP, PRACTICE_TARGET } from '@/features/combat/config';

const dt = 1 / 120;
const idle = { flight: createFlightInput(), fire: false };
function world(config = PLAYER_SHIP) {
  return new CombatSimulation(config, AI_CONFIG);
}
function obstacle(position: Vector3, radius = 20): Obstacle {
  return {
    id: 'rock',
    kind: 'asteroid',
    layer: 2,
    mask: 5,
    inverseMass: 0,
    radius,
    position,
    previous: position.clone(),
    velocity: new Vector3(),
  };
}
function ticks(simulation: CombatSimulation, seconds: number, fire = false) {
  for (let i = 0; i < seconds * 120; i++) simulation.step({ ...idle, fire }, dt);
}
function target(
  simulation: CombatSimulation,
  position = new Vector3(0, 0, -260),
  config = PRACTICE_TARGET,
) {
  const ship = simulation.spawn(config, position, new Quaternion(), true);
  if (!ship) throw new Error('Expected a target');
  return ship;
}

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

describe('continuous sphere collision', () => {
  it('finds a high-speed entry even if both segment endpoints are outside', () => {
    expect(sweepSphere(-100, 0, 0, 200, 0, 0, 5)).toBeCloseTo(0.475);
    expect(sweepSphere(-100, 6, 0, 200, 0, 0, 5)).toBeNull();
    expect(sweepSphere(5, 0, 0, 10, 0, 0, 5)).toBeNull();
    expect(sweepSphere(5, 0, 0, -10, 0, 0, 5)).toBe(0);
  });
  it('exchanges mass-weighted impulses, separates overlap, and dissipates energy', () => {
    const a = {
      id: 'a',
      position: new Vector3(-10, 0, 0),
      velocity: new Vector3(2000, 0, 0),
      radius: 2,
      inverseMass: 0.1,
      layer: 1,
      mask: 7,
    };
    const b = {
      id: 'b',
      position: new Vector3(10, 0, 0),
      velocity: new Vector3(-1000, 0, 0),
      radius: 2,
      inverseMass: 0.05,
      layer: 1,
      mask: 7,
    };
    const momentum = a.velocity.x * 10 + b.velocity.x * 20;
    const energy = a.velocity.lengthSq() * 10 + b.velocity.lengthSq() * 20;
    let contacts = 0;
    new SphereSolver().solve([a, b], dt, () => contacts++);
    expect(contacts).toBe(1);
    expect(a.position.distanceTo(b.position)).toBeGreaterThanOrEqual(4);
    expect(a.velocity.x * 10 + b.velocity.x * 20).toBeCloseTo(momentum);
    expect(a.velocity.lengthSq() * 10 + b.velocity.lengthSq() * 20).toBeLessThan(energy);
    a.position.copy(b.position);
    new SphereSolver().solve([a, b], dt, () => {});
    expect(a.position.distanceTo(b.position)).toBeGreaterThanOrEqual(4);
  });
  it('blocks a ship crossing an asteroid at 12 km/s and applies impact damage', () => {
    const config: ShipConfig = {
      ...PLAYER_SHIP,
      flight: { ...PLAYER_SHIP.flight, maxSpeed: 12000, boostMaxSpeed: 12000 },
    };
    const simulation = world(config);
    simulation.player.controller.relocate(new Vector3(0, 0, 100), new Quaternion(), 12000);
    simulation.obstacles.push(obstacle(new Vector3()));
    simulation.step(idle, dt);
    expect(simulation.player.position.z).toBeGreaterThanOrEqual(25);
    expect(simulation.player.velocity.z).toBeGreaterThanOrEqual(0);
    expect(simulation.player.health.destroyed).toBe(true);
    expect(impactDamage(10, 12)).toBe(0);
    expect(impactDamage(100, 12)).toBeGreaterThan(0);
  });
  it('handles moving moon boundaries and large logical coordinates without render-origin input', () => {
    const center = new Vector3(1e10, 1e10, 1e10);
    const ship = {
      id: 'ship',
      position: center.clone().add(new Vector3(10005, 0, 0)),
      velocity: new Vector3(),
      radius: 5,
      inverseMass: 1 / 12,
      layer: 1,
      mask: 7,
    };
    const moon = {
      id: 'moon',
      position: center.clone(),
      velocity: new Vector3(100, 0, 0),
      radius: 10000,
      inverseMass: 0,
      layer: 2,
      mask: 5,
    };
    new SphereSolver().solve([ship, moon], dt, () => {});
    expect(ship.position.distanceTo(moon.position)).toBeGreaterThanOrEqual(10005 - 1e-4);
    expect(ship.velocity.x).toBeGreaterThan(0);
  });
  it('separates collision masks', () => {
    expect(collides(4, 2, 1, 4)).toBe(false);
    expect(collides(4, 3, 1, 4)).toBe(true);
  });
});

describe('lasers and entity lifetime', () => {
  it('enforces cooldowns and expires every missed shot after releasing fire', () => {
    const simulation = world();
    ticks(simulation, 1, true);
    expect(simulation.projectiles.length).toBeGreaterThanOrEqual(7);
    expect(simulation.projectiles.length).toBeLessThanOrEqual(8);
    ticks(simulation, 2.1);
    expect(simulation.projectiles).toHaveLength(0);
    expect(simulation.effects).toHaveLength(0);
  });
  it('sweeps fast lasers through targets, reports kills and removes destroyed NPCs and target locks', () => {
    const simulation = world({ ...PLAYER_SHIP, laser: { ...PLAYER_SHIP.laser, speed: 100000 } });
    const ship = target(simulation);
    simulation.targetId = ship.id;
    ticks(simulation, 1.2, true);
    expect(ship.health.destroyed).toBe(true);
    expect(simulation.kills).toBe(1);
    expect(simulation.ships.size).toBe(1);
    expect(simulation.targetId).toBeNull();
    expect(simulation.effects.some((effect) => effect.kind === 'explosion')).toBe(true);
    ticks(simulation, 4);
    expect(simulation.projectiles).toHaveLength(0);
    expect(simulation.effects).toHaveLength(0);
  });
  it('hits the nearest obstruction and blocks projectiles before a target', () => {
    const simulation = world();
    const ship = target(simulation);
    simulation.obstacles.push(obstacle(new Vector3(0, 0, -100)));
    ticks(simulation, 2, true);
    expect(ship.health.shields).toBe(PRACTICE_TARGET.defense.shields);
    expect(ship.health.hull).toBe(PRACTICE_TARGET.defense.hull);
    expect(simulation.effects.some((effect) => effect.kind === 'impact')).toBe(true);
  });
  it('uses relative motion to hit a ship crossing a projectile between ticks', () => {
    const simulation = world();
    const config: ShipConfig = {
      ...PRACTICE_TARGET,
      flight: { ...PRACTICE_TARGET.flight, maxSpeed: 9000, boostMaxSpeed: 9000 },
    };
    const ship = target(simulation, new Vector3(-30, 0, -100), config);
    ship.controller.relocate(
      ship.position,
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2),
      7200,
    );
    simulation.projectiles.push({
      id: 1,
      kind: 'gun',
      owner: 'player',
      team: 'player',
      position: new Vector3(0, 0, -130),
      previous: new Vector3(0, 0, -130),
      velocity: new Vector3(0, 0, 7200),
      damage: 40,
      radius: 0.6,
      life: 1,
    });
    simulation.step(idle, dt);
    expect(ship.health.shields).toBe(0);
    expect(ship.health.hull).toBe(40);
    expect(simulation.projectiles).toHaveLength(0);
  });
  it('helps only a selected target within the small forward aim cone', () => {
    for (const [offset, expectedKill] of [
      [10, true],
      [80, false],
    ] as const) {
      const simulation = world();
      const ship = target(simulation, new Vector3(offset, 0, -260));
      simulation.targetId = ship.id;
      ticks(simulation, 2.2, true);
      expect(ship.health.destroyed).toBe(expectedKill);
    }
  });

  it('cycles only nearby live hostiles and clears all encounter state on respawn', () => {
    const simulation = world();
    const first = target(simulation),
      second = target(simulation, new Vector3(100, 0, -260));
    target(simulation, new Vector3(5000, 0, 0));
    simulation.cycleTarget();
    expect(simulation.targetId).toBe(first.id);
    simulation.cycleTarget();
    expect(simulation.targetId).toBe(second.id);
    simulation.cycleTarget();
    expect(simulation.targetId).toBe(first.id);
    ticks(simulation, 0.2, true);
    simulation.damage(simulation.player, 250);
    simulation.respawn();
    expect(simulation.ships.size).toBe(1);
    expect(simulation.projectiles).toHaveLength(0);
    expect(simulation.effects).toHaveLength(0);
    expect(simulation.targetId).toBeNull();
    expect(simulation.player.health.hull).toBe(100);
    expect(simulation.player.health.invulnerability).toBe(3);
  });
  it('calculates an intercept from relative velocity', () => {
    const position = new Vector3(0, 0, -1000),
      velocity = new Vector3(100, 0, 0);
    const time = leadTime(position, velocity, 1000, 2);
    expect(position.clone().addScaledVector(velocity, time).length()).toBeCloseTo(time * 1000);
    expect(leadTime(position, new Vector3(0, 0, -2000), 1000, 2)).toBe(0);
  });
});

describe('AI commands and fixed-step replay', () => {
  it('patrols, detects, pursues, attacks, evades, disengages and returns home without changing poses', () => {
    const simulation = world(),
      ai = new ShipAi();
    const ship = simulation.spawn(
      ENEMY_SHIP,
      new Vector3(0, 0, -4000),
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
    ) as CombatShip;
    const update = (distance: number) => {
      simulation.player.position.copy(ship.position).add(new Vector3(0, 0, distance));
      const pose = ship.position.clone();
      ai.step(ship, simulation.player, [], AI_CONFIG, dt);
      expect(ship.position.equals(pose)).toBe(true);
    };
    update(2000);
    expect(ship.aiState).toBe('patrol');
    update(1200);
    expect(ship.aiState).toBe('pursue');
    update(500);
    expect(ship.aiState).toBe('attack');
    expect(ship.command.fire).toBe(true);
    update(60);
    expect(ship.aiState).toBe('evade');
    expect(ship.command.fire).toBe(false);
    ship.aiElapsed = 3;
    update(500);
    expect(ship.aiState).toBe('attack');
    update(3000);
    expect(ship.aiState).toBe('disengage');
    update(2000);
    expect(ship.aiState).toBe('patrol');
  });
  it('enemies fly within configured limits, fire, and can kill the player', () => {
    const simulation = world();
    for (let i = 0; i < 5; i++)
      simulation.spawn(
        ENEMY_SHIP,
        new Vector3((i - 2) * 140, (i % 2) * 100, -600),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      );
    let fired = false;
    for (let tick = 0; tick < 120 * 90 && !simulation.player.health.destroyed; tick++) {
      simulation.step(idle, dt);
      if (simulation.projectiles.length) fired = true;
      for (const ship of simulation.ships.values()) {
        expect(ship.position.toArray().every(Number.isFinite)).toBe(true);
        if (ship.team === 'hostile') expect(ship.velocity.length()).toBeLessThanOrEqual(135.01);
      }
    }
    expect(fired).toBe(true);
    expect(simulation.player.health.destroyed).toBe(true);
  });
  it('replays the same commands at 30/60/144 FPS with identical simulation results', () => {
    function replay(fps: number) {
      const simulation = world();
      target(simulation);
      const clock = new FixedStepLoop(dt, 0.1, 12);
      const command = {
        flight: { ...createFlightInput(), throttle: 1, yaw: 0.3, strafe: 0.4 },
        fire: true,
      };
      for (let frame = 0; frame < fps * 3; frame++)
        clock.advance(1 / fps, (step) => simulation.step(command, step));
      return [
        simulation.player.position.toArray(),
        simulation.player.orientation.toArray(),
        simulation.projectiles.length,
        simulation.kills,
      ];
    }
    expect(replay(30)).toEqual(replay(60));
    expect(replay(144)).toEqual(replay(60));
  });
  it('bounds projectiles, effects and ships through sustained ten-enemy encounters', () => {
    const simulation = world();
    simulation.player.health.invulnerability = 1000;
    for (let i = 0; i < 15; i++)
      simulation.spawn(ENEMY_SHIP, new Vector3((i - 5) * 100, 100, -700), new Quaternion());
    expect(simulation.ships.size).toBe(11);
    for (let i = 0; i < 120 * 30; i++) simulation.step({ ...idle, fire: true }, dt);
    expect(simulation.projectiles.length).toBeLessThanOrEqual(192);
    expect(simulation.effects.length).toBeLessThanOrEqual(96);
    ticks(simulation, 4);
    simulation.clearEncounter();
    expect(simulation.ships.size).toBe(1);
    expect(simulation.projectiles).toHaveLength(0);
    expect(simulation.obstacles).toHaveLength(0);
    expect(simulation.effects).toHaveLength(0);
  });
});
