import { Quaternion, Vector3 } from 'three';
import { CombatSimulation } from '@/engine/combat/CombatSimulation';
import type { WeaponSlot } from '@/engine/combat/combatTypes';
import { missileCanLock } from '@/engine/combat/weapons';
import type { FlightController } from '@/engine/simulation/FlightController';
import type { FlightInput } from '@/engine/simulation/flightTypes';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import { useCombatStore } from '@/stores/combatStore';
import { CombatAudio } from './CombatAudio';
import { AI_CONFIG, ENCOUNTER_CONFIG, ENEMY_SHIP, PLAYER_SHIP, PRACTICE_TARGET } from './config';

/** Adapts world definitions and low-frequency UI to the pure gameplay simulation. */
export class CombatSession {
  readonly simulation: CombatSimulation;
  readonly audio = new CombatAudio();
  private world: SystemRuntime | null = null;
  private active = false;
  private encounterSize = 0;
  private readonly point = new Vector3();
  private readonly direction = new Vector3();
  private readonly orientation = new Quaternion();
  private readonly command: { flight: FlightInput; fire: boolean; weapon: WeaponSlot };
  status = 'B / Start patrol encounter';

  constructor(controller: FlightController, input: FlightInput) {
    this.simulation = new CombatSimulation(PLAYER_SHIP, AI_CONFIG, controller);
    this.command = { flight: input, fire: false, weapon: 1 };
  }

  setWorld(world: SystemRuntime) {
    this.world = world;
    this.simulation.clearEncounter();
    this.active = false;
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
    this.status = 'B / Start patrol encounter';
    this.publish();
  }

  depart() {
    this.active = false;
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
    this.simulation.respawn();
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

  startEncounter(practice = false, count: number = ENCOUNTER_CONFIG.enemies) {
    if (!this.world || this.simulation.player.health.destroyed || this.active) return false;
    this.setWorld(this.world);
    const player = this.simulation.player;
    player.sync();
    const total = practice ? 1 : Math.max(1, Math.min(ENCOUNTER_CONFIG.maximumEnemies, count));
    for (let index = 0; index < total; index++) {
      let found = false;
      // Search a deterministic shell; never spawn inside a planet, moon or another ship.
      for (let attempt = 0; attempt < 24; attempt++) {
        const angle = index * 2.399 + attempt * 0.7;
        const radius = practice && attempt === 0 ? 0 : 170 + index * 35;
        this.point
          .set(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            -(practice ? 260 : 600 + (index % 3) * 100) + attempt * 50,
          )
          .applyQuaternion(player.orientation)
          .add(player.position);
        if (this.safe(this.point, ENEMY_SHIP.radius)) {
          found = true;
          break;
        }
      }
      if (!found) continue;
      this.direction.subVectors(player.position, this.point).normalize();
      this.orientation.setFromUnitVectors(new Vector3(0, 0, -1), this.direction);
      this.simulation.spawn(
        practice ? PRACTICE_TARGET : ENEMY_SHIP,
        this.point,
        this.orientation,
        practice,
      );
    }
    const spawned = this.simulation.ships.size - 1;
    if (!spawned) {
      this.status = 'No clear encounter space. Fly away from the surface.';
      this.publish();
      return false;
    }
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
    this.encounterSize = spawned;
    this.active = true;
    this.status = practice
      ? 'Practice target / Space to fire'
      : `Patrol engaged / ${spawned} contacts`;
    this.simulation.cycleTarget();
    this.publish();
    return true;
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
    if (
      this.active &&
      this.simulation.ships.size === 1 &&
      !this.simulation.player.health.destroyed
    ) {
      this.status = `Sector clear / ${this.encounterSize} ${this.encounterSize === 1 ? 'contact' : 'contacts'} destroyed / B to replay`;
      this.active = false;
    }
  }

  dispose() {
    this.simulation.clearEncounter();
    this.audio.dispose();
    this.world = null;
    this.active = false;
  }

  publish() {
    const simulation = this.simulation,
      player = simulation.player;
    const target = simulation.targetId ? simulation.ships.get(simulation.targetId) : null;
    useCombatStore.setState({
      readout: {
        weapon: player.weapon,
        weaponCooldown: player.cooldown,
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
