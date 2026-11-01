import { Quaternion, Vector3 } from 'three';
import {
  COLLISION_LAYERS,
  collides,
  type SphereBody,
  SphereSolver,
  sweepSphere,
} from '@/engine/physics/spheres';
import type { FlightController } from '@/engine/simulation/FlightController';
import {
  type AiConfig,
  type CombatEffect,
  type CombatEvent,
  type CombatEventDetail,
  CombatShip,
  type Obstacle,
  type Projectile,
  type RailgunTrace,
  type ShipCommand,
  type ShipConfig,
} from './combatTypes';
import { impactDamage } from './damage';
import { ShipAi } from './ShipAi';
import { leadTime } from './targeting';
import { flakDirection, missileCanLock } from './weapons';

/** Authoritative gameplay state. No renderer, browser, stores, clocks or async work. */
export class CombatSimulation {
  readonly ships = new Map<string, CombatShip>();
  readonly projectiles: Projectile[] = [];
  readonly effects: CombatEffect[] = [];
  readonly events: CombatEvent[] = [];
  readonly tracers: RailgunTrace[] = [];
  readonly obstacles: Obstacle[] = [];
  readonly player: CombatShip;
  targetId: string | null = null;
  kills = 0;
  time = 0;
  alpha = 0;
  impact = 0;
  private sequence = 0;
  private eventSequence = 0;
  private readonly solver = new SphereSolver();
  private readonly ai = new ShipAi();
  private readonly bodies: SphereBody[] = [];
  private readonly direction = new Vector3();
  private readonly end = new Vector3();
  private readonly aim = new Vector3();
  private readonly relativeVelocity = new Vector3();
  private readonly point = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly turn = new Quaternion();
  private hitFraction = 1;
  private hitShip: CombatShip | null = null;
  private hitDetected = false;
  readonly aiConfig: AiConfig;

  constructor(config: ShipConfig, aiConfig: AiConfig, controller?: FlightController) {
    this.aiConfig = aiConfig;
    this.player = new CombatShip('player', 'player', config, controller);
    this.ships.set(this.player.id, this.player);
  }

  spawn(
    config: ShipConfig,
    position: Readonly<Vector3>,
    orientation: Readonly<Quaternion>,
    stationary = false,
  ) {
    if (this.ships.size >= 11) return null;
    const ship = new CombatShip(`hostile-${++this.sequence}`, 'hostile', config);
    ship.controller.relocate(position, orientation);
    ship.sync();
    ship.previous.copy(ship.position);
    ship.previousOrientation.copy(ship.orientation);
    ship.home.copy(ship.position);
    ship.stationary = stationary;
    this.ships.set(ship.id, ship);
    this.event(ship.id, ship.position, { kind: 'spawned', sourceId: null });
    return ship;
  }

  clearEncounter() {
    for (const [id, ship] of this.ships) if (ship !== this.player) this.ships.delete(id);
    this.bodies.length = 0;
    this.projectiles.length = 0;
    this.effects.length = 0;
    this.events.length = 0;
    this.tracers.length = 0;
    this.obstacles.length = 0;
    this.targetId = null;
    this.impact = 0;
    this.kills = 0;
    this.player.railgunCharge = 0;
    this.player.command.fire = false;
  }

  respawn() {
    this.clearEncounter();
    const player = this.player;
    player.health.hull = player.config.defense.hull;
    player.health.shields = player.config.defense.shields;
    player.health.invulnerability = 3;
    player.cooldown = 0;
    player.weapon = 1;
    player.hitFlash = 0;
    player.health.sinceDamage = 0;
    player.sync();
    player.previous.copy(player.position);
    player.previousOrientation.copy(player.orientation);
  }

  cycleTarget() {
    const nearby = [...this.ships.values()].filter(
      (ship) =>
        ship.team === 'hostile' &&
        !ship.health.destroyed &&
        ship.position.distanceToSquared(this.player.position) <= 3500 ** 2,
    );
    const index = nearby.findIndex((ship) => ship.id === this.targetId);
    this.targetId = nearby[(index + 1) % nearby.length]?.id ?? null;
  }

  private event(shipId: string, position: Readonly<Vector3>, detail: CombatEventDetail) {
    if (this.events.length >= 128) this.events.shift();
    this.events.push({
      id: ++this.eventSequence,
      time: this.time,
      shipId,
      position: [position.x, position.y, position.z],
      ...detail,
    });
  }

  private effect(
    kind: CombatEffect['kind'],
    position: Readonly<Vector3>,
    team: CombatShip['team'],
  ) {
    if (this.effects.length >= 96) this.effects.shift();
    this.effects.push({
      id: ++this.sequence,
      kind,
      position: new Vector3().copy(position),
      team,
      age: 0,
      lifetime:
        kind === 'explosion'
          ? 1.5
          : kind === 'detonation'
            ? 0.7
            : kind === 'shot' || kind === 'railgun-shot' || kind === 'flak-shot'
              ? 0.07
              : 0.35,
    });
  }

  damage(ship: CombatShip, amount: number, sourceId: string | null = null) {
    // Slot IDs survive respawn; an old object must never damage or destroy its replacement.
    if (this.ships.get(ship.id) !== ship) return;
    const shield = ship.health.shields > 0;
    const beforeShield = ship.health.shields,
      beforeHull = ship.health.hull;
    if (!ship.health.damage(amount)) return;
    this.event(ship.id, ship.position, {
      kind: 'damage',
      sourceId,
      shields: beforeShield - ship.health.shields,
      hull: beforeHull - ship.health.hull,
    });
    ship.hitFlash = 0.3;
    if (ship.health.destroyed) {
      ship.railgunCharge = 0;
      ship.command.fire = false;
      this.event(ship.id, ship.position, { kind: 'destroyed', sourceId });
    }
    if (ship === this.player) this.impact = Math.min(1, this.impact + amount / 50);
    this.effect(
      ship.health.destroyed ? 'explosion' : shield ? 'shield' : 'impact',
      ship.position,
      ship.team,
    );
    if (ship.health.destroyed && ship !== this.player) {
      this.kills++;
      this.ships.delete(ship.id);
      if (this.targetId === ship.id) this.cycleTarget();
    }
  }

  private collision = (a: SphereBody, b: SphereBody, speed: number) => {
    for (const body of [a, b]) {
      const ship = this.ships.get(body.id);
      if (ship) this.damage(ship, impactDamage(speed, ship.config.mass), body === a ? b.id : a.id);
    }
  };

  private fire(ship: CombatShip) {
    if (ship.cooldown > 1e-9 || ship.health.destroyed) return;
    const projectileCount = ship.weapon === 4 ? ship.config.flak.pellets : 1;
    if (ship.weapon !== 3 && this.projectiles.length + projectileCount > 192) return;
    this.direction.set(0, 0, -1).applyQuaternion(ship.orientation);
    this.point
      .set(ship.weapon === 1 ? ship.barrel * 2.65 : 0, ship.weapon === 2 ? -0.4 : 0, -6)
      .applyQuaternion(ship.orientation)
      .add(ship.position);
    ship.barrel *= -1;
    const target =
      ship.team === 'player' && this.targetId
        ? this.ships.get(this.targetId)
        : ship.team === 'hostile'
          ? this.player
          : undefined;
    if (ship.weapon === 3) {
      const railgun = ship.config.railgun;
      ship.cooldown = railgun.interval;
      ship.railgunCharge = 0;
      this.event(ship.id, this.point, { kind: 'fired', weapon: ship.weapon });
      this.end.copy(this.point).addScaledVector(this.direction, railgun.range);
      this.trace(this.point, this.end, ship.id, ship.team, railgun.radius, 0);
      this.end.lerpVectors(this.point, this.end, this.hitFraction);
      if (this.tracers.length >= 32) this.tracers.shift();
      this.tracers.push({
        id: ++this.sequence,
        owner: ship.id,
        start: this.point.clone(),
        end: this.end.clone(),
        team: ship.team,
        age: 0,
        lifetime: railgun.duration,
      });
      if (this.hitDetected)
        this.event(ship.id, this.end, {
          kind: 'impact',
          sourceId: ship.id,
          targetId: this.hitShip?.id ?? null,
        });
      if (this.hitShip) this.damage(this.hitShip, railgun.damage, ship.id);
      if (this.hitDetected) this.effect('impact', this.end, ship.team);
      this.effect('railgun-shot', this.point, ship.team);
      return;
    }
    if (ship.weapon === 4) {
      const flak = ship.config.flak;
      ship.cooldown = flak.interval;
      const phase = this.sequence * 2.399963229728653;
      for (let index = 0; index < flak.pellets; index++) {
        flakDirection(index, flak.pellets, flak.spreadAngle, phase, this.direction).applyQuaternion(
          ship.orientation,
        );
        this.projectiles.push({
          id: ++this.sequence,
          owner: ship.id,
          team: ship.team,
          kind: 'flak',
          position: this.point.clone(),
          previous: this.point.clone(),
          velocity: this.direction.clone().multiplyScalar(flak.speed).add(ship.velocity),
          damage: flak.damage,
          radius: flak.radius,
          life: flak.lifetime,
        });
      }
      this.effect('flak-shot', this.point, ship.team);
      this.event(ship.id, this.point, { kind: 'fired', weapon: ship.weapon });
      return;
    }
    const config = ship.weapon === 2 ? ship.config.missile : ship.config.laser;
    ship.cooldown = config.interval;
    if (ship.weapon === 1 && target && !target.health.destroyed && config.aimAssistAngle > 0) {
      this.aim.subVectors(target.position, this.point);
      this.relativeVelocity.subVectors(target.velocity, ship.velocity);
      const time = leadTime(this.aim, this.relativeVelocity, config.speed, config.lifetime);
      this.aim.addScaledVector(this.relativeVelocity, time).normalize();
      if (time > 0 && this.direction.dot(this.aim) >= Math.cos(config.aimAssistAngle))
        this.direction.copy(this.aim);
    }
    const state = {
      id: ++this.sequence,
      owner: ship.id,
      team: ship.team,
      position: this.point.clone(),
      previous: this.point.clone(),
      velocity: this.direction.clone().multiplyScalar(config.speed).add(ship.velocity),
      damage: config.damage,
      radius: config.radius,
      life: config.lifetime,
    };
    if (ship.weapon === 2)
      this.projectiles.push({
        ...state,
        kind: 'missile',
        targetId: missileCanLock(ship, target) ? (target?.id ?? null) : null,
        heading: this.direction.clone(),
        inheritedVelocity: ship.velocity.clone(),
        speed: ship.config.missile.speed,
        turnRate: ship.config.missile.turnRate,
      });
    else this.projectiles.push({ ...state, kind: 'gun' });
    this.effect(ship.weapon === 2 ? 'missile-launch' : 'shot', this.point, ship.team);
    this.event(ship.id, this.point, { kind: 'fired', weapon: ship.weapon });
  }

  /** Shared nearest-hit query. A zero motion fraction traces an instantaneous rail shot. */
  private trace(
    start: Readonly<Vector3>,
    end: Readonly<Vector3>,
    owner: string,
    team: CombatShip['team'],
    radius: number,
    motionFraction: number,
  ) {
    this.hitFraction = 1;
    this.hitShip = null;
    this.hitDetected = false;
    for (const ship of this.ships.values()) {
      if (ship.id === owner || ship.team === team || ship.health.destroyed) continue;
      if (
        !collides(
          COLLISION_LAYERS.projectile,
          COLLISION_LAYERS.ship | COLLISION_LAYERS.environment,
          ship.layer,
          ship.mask,
        )
      )
        continue;
      const from = motionFraction === 0 ? ship.position : ship.previous;
      const t = sweepSphere(
        start.x - from.x,
        start.y - from.y,
        start.z - from.z,
        end.x - start.x - (ship.position.x - ship.previous.x) * motionFraction,
        end.y - start.y - (ship.position.y - ship.previous.y) * motionFraction,
        end.z - start.z - (ship.position.z - ship.previous.z) * motionFraction,
        ship.config.radius + radius,
      );
      if (t !== null && t <= this.hitFraction) {
        this.hitFraction = t;
        this.hitShip = ship;
        this.hitDetected = true;
      }
    }
    for (const obstacle of this.obstacles) {
      if (
        !collides(
          COLLISION_LAYERS.projectile,
          COLLISION_LAYERS.ship | COLLISION_LAYERS.environment,
          obstacle.layer,
          obstacle.mask,
        )
      )
        continue;
      const from = motionFraction === 0 ? obstacle.position : obstacle.previous;
      const t = sweepSphere(
        start.x - from.x,
        start.y - from.y,
        start.z - from.z,
        end.x - start.x - (obstacle.position.x - obstacle.previous.x) * motionFraction,
        end.y - start.y - (obstacle.position.y - obstacle.previous.y) * motionFraction,
        end.z - start.z - (obstacle.position.z - obstacle.previous.z) * motionFraction,
        obstacle.radius + radius,
      );
      if (t !== null && t <= this.hitFraction) {
        this.hitFraction = t;
        this.hitShip = null;
        this.hitDetected = true;
      }
    }
  }

  private advanceProjectiles(dt: number) {
    for (let index = this.projectiles.length - 1; index >= 0; index--) {
      const shot = this.projectiles[index];
      if (!shot) continue;
      const travel = Math.min(dt, shot.life);
      if (shot.kind === 'missile' && shot.targetId) {
        const target = this.ships.get(shot.targetId);
        if (!target || target.health.destroyed || target.team === shot.team) shot.targetId = null;
        else {
          this.aim.subVectors(target.position, shot.position);
          this.relativeVelocity.subVectors(target.velocity, shot.inheritedVelocity);
          const time = leadTime(this.aim, this.relativeVelocity, shot.speed, shot.life);
          this.aim.addScaledVector(this.relativeVelocity, time).normalize();
          const angle = Math.acos(Math.max(-1, Math.min(1, shot.heading.dot(this.aim))));
          if (angle > 1e-8) {
            this.rotation.setFromUnitVectors(shot.heading, this.aim);
            this.turn
              .identity()
              .slerp(this.rotation, Math.min(1, (shot.turnRate * travel) / angle));
            shot.heading.applyQuaternion(this.turn).normalize();
          }
          shot.velocity.copy(shot.heading).multiplyScalar(shot.speed).add(shot.inheritedVelocity);
        }
      }
      shot.previous.copy(shot.position);
      this.end.copy(shot.position).addScaledVector(shot.velocity, travel);
      this.trace(shot.position, this.end, shot.owner, shot.team, shot.radius, travel / dt);
      shot.position.lerp(this.end, this.hitFraction);
      shot.life -= dt;
      if (this.hitDetected) {
        this.event(shot.owner, shot.position, {
          kind: 'impact',
          sourceId: shot.owner,
          targetId: this.hitShip?.id ?? null,
        });
        if (this.hitShip) this.damage(this.hitShip, shot.damage, shot.owner);
        this.effect(shot.kind === 'missile' ? 'detonation' : 'impact', shot.position, shot.team);
      }
      if (this.hitDetected || shot.life <= 1e-9) this.projectiles.splice(index, 1);
    }
  }

  step(command: ShipCommand, dt: number) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw new RangeError('Invalid combat tick.');
    if (command.weapon && command.weapon !== this.player.weapon) {
      this.player.railgunCharge = 0;
      this.player.weapon = command.weapon;
    }
    Object.assign(this.player.command.flight, command.flight);
    this.player.command.fire = command.fire;
    this.player.command.weapon = this.player.weapon;
    this.time += dt;
    this.impact *= Math.exp(-8 * dt);
    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index];
      if (effect) {
        effect.age += dt;
        if (effect.age >= effect.lifetime) this.effects.splice(index, 1);
      }
    }
    for (let index = this.tracers.length - 1; index >= 0; index--) {
      const tracer = this.tracers[index];
      if (tracer) {
        tracer.age += dt;
        if (tracer.age >= tracer.lifetime) this.tracers.splice(index, 1);
      }
    }
    this.bodies.length = 0;
    for (const ship of this.ships.values()) {
      ship.sync();
      ship.previous.copy(ship.position);
      ship.previousOrientation.copy(ship.orientation);
      ship.health.step(dt);
      ship.hitFlash = Math.max(0, ship.hitFlash - dt);
      ship.cooldown = Math.max(0, ship.cooldown - dt);
      if (ship.health.destroyed) continue;
      if (ship !== this.player) this.ai.step(ship, this.player, this.obstacles, this.aiConfig, dt);
      const input = ship === this.player ? command.flight : ship.command.flight;
      ship.controller.step(input, dt);
      ship.sync();
      ship.position.copy(ship.previous);
      this.bodies.push(ship);
    }
    this.bodies.push(...this.obstacles);
    this.solver.solve(this.bodies, dt, this.collision);
    for (const ship of this.ships.values()) {
      ship.controller.resolveMotion(ship.position, ship.velocity);
    }
    // Existing projectiles sweep relative to this tick's moving colliders.
    this.advanceProjectiles(dt);
    // New projectiles start at the end of the tick, avoiding a one-tick target motion error.
    for (const ship of this.ships.values()) {
      const firing = ship === this.player ? command.fire : ship.command.fire;
      if (ship.weapon === 3) {
        if (!firing || ship.health.destroyed || ship.cooldown > 1e-9) ship.railgunCharge = 0;
        else {
          const chargeTime = ship.config.railgun.chargeTime;
          ship.railgunCharge = Math.min(chargeTime, ship.railgunCharge + dt);
          if (ship.railgunCharge + 1e-9 >= chargeTime) this.fire(ship);
        }
      } else {
        ship.railgunCharge = 0;
        if (firing) this.fire(ship);
      }
    }
    if (
      this.targetId &&
      (!this.ships.has(this.targetId) ||
        (this.ships.get(this.targetId)?.position.distanceTo(this.player.position) ?? Infinity) >
          3500)
    )
      this.targetId = null;
  }

  /** Interpolated logical pose for rendering. */
  present(ship: CombatShip, position: Vector3, orientation: Quaternion) {
    position.lerpVectors(ship.previous, ship.position, this.alpha);
    this.rotation.slerpQuaternions(ship.previousOrientation, ship.orientation, this.alpha);
    orientation.copy(this.rotation);
  }

  /** JSON data only. This is a transport boundary, not a networking or reconciliation layer. */
  snapshot() {
    return {
      version: 1 as const,
      time: this.time,
      sequence: this.sequence,
      eventSequence: this.eventSequence,
      kills: this.kills,
      targetId: this.targetId,
      aiConfig: { ...this.aiConfig },
      ships: [...this.ships.values()].map((ship) => ({
        id: ship.id,
        team: ship.team,
        config: structuredClone(ship.config),
        flight: ship.controller.snapshot(),
        previous: ship.previous.toArray(),
        previousOrientation: ship.previousOrientation.toArray(),
        home: ship.home.toArray(),
        stationary: ship.stationary,
        health: {
          shields: ship.health.shields,
          hull: ship.health.hull,
          sinceDamage: ship.health.sinceDamage,
          invulnerability: ship.health.invulnerability,
        },
        weapon: ship.weapon,
        cooldown: ship.cooldown,
        railgunCharge: ship.railgunCharge,
        barrel: ship.barrel,
        hitFlash: ship.hitFlash,
        aiState: ship.aiState,
        aiElapsed: ship.aiElapsed,
        command: { ...ship.command, flight: { ...ship.command.flight } },
      })),
      projectiles: this.projectiles.map((shot) => ({
        ...shot,
        position: shot.position.toArray(),
        previous: shot.previous.toArray(),
        velocity: shot.velocity.toArray(),
        ...(shot.kind === 'missile'
          ? { heading: shot.heading.toArray(), inheritedVelocity: shot.inheritedVelocity.toArray() }
          : {}),
      })),
      obstacles: this.obstacles.map((obstacle) => ({
        ...obstacle,
        position: obstacle.position.toArray(),
        previous: obstacle.previous.toArray(),
        velocity: obstacle.velocity.toArray(),
      })),
      effects: this.effects.map((effect) => ({ ...effect, position: effect.position.toArray() })),
      tracers: this.tracers.map((trace) => ({
        ...trace,
        start: trace.start.toArray(),
        end: trace.end.toArray(),
      })),
      events: this.events.map((event) => ({ ...event, position: [...event.position] })),
    };
  }
}
