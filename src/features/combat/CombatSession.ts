import { Quaternion, Vector3 } from 'three';
import { CombatSimulation } from '@/engine/combat/CombatSimulation';
import type { WeaponSlot } from '@/engine/combat/combatTypes';
import { Encounter } from '@/engine/combat/Encounter';
import { missileCanLock } from '@/engine/combat/weapons';
import type { FlightController } from '@/engine/simulation/FlightController';
import type { FlightInput } from '@/engine/simulation/flightTypes';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import { useCombatStore } from '@/stores/combatStore';
import { CombatAudio } from './CombatAudio';
import {
  AI_CONFIG,
  ENCOUNTER_CONFIG,
  ENEMY_SHIP,
  PLAYER_SHIP,
  PRACTICE_TARGET,
  TARGETING_CONFIG,
} from './config';

/** Adapts world definitions and low-frequency UI to the pure gameplay simulation. */
export class CombatSession {
  readonly simulation: CombatSimulation;
  readonly audio = new CombatAudio();
  private world: SystemRuntime | null = null;
  readonly encounter = new Encounter(ENCOUNTER_CONFIG);
  private readonly forward = new Vector3(0, 0, -1);
  private readonly point = new Vector3();
  private readonly direction = new Vector3();
  private readonly orientation = new Quaternion();
  private readonly command: { flight: FlightInput; fire: boolean; weapon: WeaponSlot };
  status = 'Patrol inbound / B to engage now';

  constructor(controller: FlightController, input: FlightInput) {
    this.simulation = new CombatSimulation(PLAYER_SHIP, AI_CONFIG, controller, TARGETING_CONFIG);
    this.command = { flight: input, fire: false, weapon: 1 };
  }

  setWorld(world: SystemRuntime) {
    this.world = world;
    this.simulation.clearEncounter();
    this.encounter.reset(world.definition.id);
    for (const body of world.definition.bodies) {
      const center = world.positions.get(body.id);
      if (center)
        this.simulation.obstacles.push({
          id: `body:${body.id}`,
          kind: 'celestial',
          inverseMass: 0,
          layer: 2,
          mask: 5,
          radius: body.radius,
          position: center.clone(),
          previous: center.clone(),
          velocity: new Vector3(),
        });
    }
    this.simulation.player.sync();
    this.status = 'Patrol inbound / B to engage now';
    this.publish();
  }

  depart() {
    this.encounter.clear();
    this.simulation.clearEncounter();
    this.audio.stop();
    this.status = 'Encounter left behind';
    this.publish();
  }

  selectWeapon(slot: WeaponSlot) {
    if (this.simulation.player.health.destroyed) return;
    if (this.simulation.player.weapon !== slot) this.simulation.player.railgunCharge = 0;
    this.command.weapon = slot;
    this.simulation.player.weapon = slot;
    this.publish();
  }

  cancelWeaponCharge() {
    if (this.simulation.player.railgunCharge === 0) return;
    this.simulation.player.railgunCharge = 0;
    this.publish();
  }

  reset(world: SystemRuntime) {
    this.command.weapon = 1;
    this.simulation.respawn(ENCOUNTER_CONFIG.spawnProtection);
    this.setWorld(world);
  }

  private safe(point: Readonly<Vector3>, radius: number) {
    return (
      this.simulation.obstacles.every(
        (obstacle) => point.distanceTo(obstacle.position) > obstacle.radius + radius + 100,
      ) &&
      [...this.simulation.ships.values()].every(
        (ship) => point.distanceTo(ship.position) > ship.config.radius + radius + 60,
      )
    );
  }

  private spawnSlot = (slot: Readonly<{ id: string; index: number }>) => {
    const player = this.simulation.player;
    const practice = this.encounter.mode === 'practice';
    const index = slot.index;
    for (let attempt = 0; attempt < 48; attempt++) {
      const angle = index * 2.399 + attempt * 0.7;
      const radius =
        practice && attempt === 0 ? 0 : ENCOUNTER_CONFIG.spawnRadius + index * 35 + attempt * 12;
      this.point
        .set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          -(practice
            ? 260
            : ENCOUNTER_CONFIG.spawnDistance + (index % 3) * ENCOUNTER_CONFIG.spawnSpacing),
        )
        .applyQuaternion(player.orientation)
        .add(player.position);
      if (!this.safe(this.point, ENEMY_SHIP.radius)) continue;
      this.direction.subVectors(player.position, this.point).normalize();
      this.orientation.setFromUnitVectors(this.forward, this.direction);
      return (
        this.simulation.spawn(
          practice ? PRACTICE_TARGET : ENEMY_SHIP,
          this.point,
          this.orientation,
          practice,
          slot.id,
          practice ? 0 : ENCOUNTER_CONFIG.spawnProtection,
        ) !== null
      );
    }
    return false;
  };

  startEncounter(practice = false, count: number = ENCOUNTER_CONFIG.enemies) {
    if (!this.world || this.simulation.player.health.destroyed || this.simulation.ships.size > 1)
      return false;
    this.setWorld(this.world);
    this.encounter.begin(practice, count);
    this.encounter.advance(0, this.simulation.ships, this.spawnSlot);
    this.seedAsteroids();
    this.updateStatus();
    this.simulation.targetAhead();
    this.publish();
    return this.simulation.ships.size > 1;
  }

  private seedAsteroids() {
    const player = this.simulation.player;
    for (let index = 0; index < ENCOUNTER_CONFIG.asteroids; index++) {
      this.point
        .set(
          (index % 2 ? 1 : -1) * (240 + index * 45),
          Math.sin(index * 2.4) * 150,
          -260 - index * 130,
        )
        .applyQuaternion(player.orientation)
        .add(player.position);
      const radius = 16 + (index % 3) * 7;
      if (this.safe(this.point, radius))
        this.simulation.obstacles.push({
          id: `asteroid:${index}`,
          kind: 'asteroid',
          inverseMass: 0,
          layer: 2,
          mask: 5,
          radius,
          position: this.point.clone(),
          previous: this.point.clone(),
          velocity: new Vector3(),
        });
    }
  }

  private updateStatus() {
    const hostiles = this.simulation.ships.size - 1;
    if (this.encounter.mode === 'complete') this.status = 'Sector clear / B for patrol';
    else if (this.encounter.mode === 'practice')
      this.status = 'Practice target / Mouse or Space to fire';
    else if (this.encounter.mode === 'patrol') {
      const next = this.encounter.nextRespawn;
      this.status =
        next !== null
          ? `${hostiles} contacts / Reinforcements in ${Math.ceil(next)}s`
          : `Patrol engaged / ${hostiles} contacts`;
    }
  }

  step(input: FlightInput, fire: boolean, dt: number) {
    const world = this.world;
    if (!world) return;
    for (const obstacle of this.simulation.obstacles) {
      obstacle.previous.copy(obstacle.position);
      if (obstacle.kind === 'celestial') {
        const center = world.positions.get(obstacle.id.slice(5));
        if (center) obstacle.velocity.subVectors(center, obstacle.previous).divideScalar(dt);
      }
    }
    this.command.flight = input;
    this.command.fire = fire;
    this.simulation.step(this.command, dt);
    // Conservative collision iteration limits must not change analytical world trajectories.
    for (const obstacle of this.simulation.obstacles) {
      if (obstacle.kind !== 'celestial') continue;
      const center = world.positions.get(obstacle.id.slice(5));
      if (center) obstacle.position.copy(center);
    }
    if (!this.simulation.player.health.destroyed) {
      const waiting = this.encounter.mode === 'waiting';
      this.encounter.advance(dt, this.simulation.ships, this.spawnSlot);
      if (waiting && this.encounter.mode === 'patrol') this.seedAsteroids();
    }
    this.updateStatus();
  }

  dispose() {
    this.simulation.clearEncounter();
    this.audio.dispose();
    this.world = null;
    this.encounter.clear();
  }

  publish() {
    const simulation = this.simulation,
      player = simulation.player;
    const target = simulation.targetId ? simulation.ships.get(simulation.targetId) : null;
    useCombatStore.setState({
      readout: {
        weapon: player.weapon,
        weaponCooldown: player.cooldown,
        reinforcements: this.encounter.nextRespawn,
        weaponCharge: player.railgunCharge / player.config.railgun.chargeTime,
        missileLocked: missileCanLock(player, target ?? undefined),
        shields: player.health.shields / player.config.defense.shields,
        hull: player.health.hull / player.config.defense.hull,
        dead: player.health.destroyed,
        invulnerable: player.health.invulnerability > 0,
        hostiles: simulation.ships.size - 1,
        kills: simulation.kills,
        status: this.status,
        target: target
          ? {
              id: target.id,
              name: `${target.config.name} ${target.id.split(':').at(-1)}`,
              distance: target.position.distanceTo(player.position),
              shields: target.health.shields / Math.max(1, target.config.defense.shields),
              hull: target.health.hull / target.config.defense.hull,
              state: target.stationary ? 'practice' : target.aiState,
            }
          : null,
      },
    });
  }
}
