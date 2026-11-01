import { Quaternion, Vector3 } from '@/engine/math/linear';
import {
  COLLISION_LAYERS,
  collides,
  type SphereBody,
  SphereSolver,
  sweepSphere,
} from '@/engine/physics/spheres';
import type { PlanetaryEnvironment } from '@/engine/planetary/PlanetaryEnvironment';
import type { FlightController } from '@/engine/simulation/FlightController';
import type { StationSimulation } from '@/engine/stations/StationSimulation';
import { traceStation } from '@/engine/stations/stationGeometry';
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
import { leadTime, nearestAhead, type TargetingConfig, validTarget } from './targeting';
import { flakDirection, missileCanLock } from './weapons';

/** Authoritative gameplay state. No renderer, browser, stores, clocks or async work. */
export class CombatSimulation {
  environment: PlanetaryEnvironment | null = null;
  stations: StationSimulation | null = null;
  readonly ships = new Map<string, CombatShip>();
  readonly projectiles: Projectile[] = [];
  readonly effects: CombatEffect[] = [];
  readonly events: CombatEvent[] = [];
  readonly tracers: RailgunTrace[] = [];
  readonly obstacles: Obstacle[] = [];
  readonly player: CombatShip;
  pvp = false;
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
  readonly targeting: TargetingConfig;

  constructor(
    config: ShipConfig,
    aiConfig: AiConfig,
    controller?: FlightController,
    targeting: TargetingConfig = { range: 3500, aheadAngle: Math.PI / 3 },
  ) {
    this.aiConfig = aiConfig;
    this.targeting = targeting;
    this.player = new CombatShip('player', 'player', config, controller);
    this.ships.set(this.player.id, this.player);
  }

  spawn(
    config: ShipConfig,
    position: Readonly<Vector3>,
    orientation: Readonly<Quaternion>,
    stationary = false,
    id = `hostile-${++this.sequence}`,
    protection = 0,
  ) {
    if (
      [...this.ships.values()].filter((s) => s.team === 'hostile').length >= 10 ||
      this.ships.has(id)
    )
      return null;
    const ship = new CombatShip(id, 'hostile', config);
    ship.controller.relocate(position, orientation);
    ship.sync();
    ship.previous.copy(ship.position);
    ship.previousOrientation.copy(ship.orientation);
    ship.home.copy(ship.position);
    ship.stationary = stationary;
    ship.health.invulnerability = protection;
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

  respawn(protection = 3) {
    this.clearEncounter();
    const player = this.player;
    player.health.hull = player.config.defense.hull;
    player.health.shields = player.config.defense.shields;
    player.health.invulnerability = protection;
    player.cooldown = 0;
    player.weapon = 1;
    player.hitFlash = 0;
    player.shieldHit = false;
    player.barrel = 0;
    player.aiState = 'patrol';
    player.aiElapsed = player.aiTime = player.aiReaction = 0;
    player.heat = 0;
    player.overheated = false;
    player.health.sinceDamage = 0;
    player.sync();
    player.previous.copy(player.position);
    player.previousOrientation.copy(player.orientation);
  }

  cycleTarget() {
    const nearby = [...this.ships.values()].filter((ship) =>
      validTarget(ship, this.player, this.targeting.range),
    );
    const index = nearby.findIndex((ship) => ship.id === this.targetId);
    this.targetId = nearby[(index + 1) % nearby.length]?.id ?? null;
  }

  targetAhead() {
    this.direction.set(0, 0, -1).applyQuaternion(this.player.orientation);
    this.targetId = nearestAhead(this.ships.values(), this.player, this.direction, this.targeting);
  }

  clearTarget() {
    this.targetId = null;
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
    if (ship.transferring || !ship.health.damage(amount)) return;
    this.event(ship.id, ship.position, {
      kind: 'damage',
      sourceId,
      shields: beforeShield - ship.health.shields,
      hull: beforeHull - ship.health.hull,
    });
    ship.hitFlash = 0.3;
    ship.shieldHit = shield;
    if (ship.health.destroyed) {
      ship.railgunCharge = 0;
      ship.aiState = 'destroyed';
      ship.command.fire = false;
      this.event(ship.id, ship.position, { kind: 'destroyed', sourceId });
    }
    if (ship === this.player) this.impact = Math.min(1, this.impact + amount / 50);
    this.effect(
      ship.health.destroyed ? 'explosion' : shield ? 'shield' : 'impact',
      ship.position,
      ship.team,
    );
    if (ship.health.destroyed && ship.team === 'hostile') {
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
    const laser = ship.config.laser;
    if (ship.weapon === 1 && (ship.overheated || laser.hardpoints.length === 0)) return;
    const projectileCount =
      ship.weapon === 4
        ? ship.config.flak.pellets
        : ship.weapon === 1 && laser.firingMode === 'synchronized'
          ? laser.hardpoints.length
          : 1;
    if (ship.weapon !== 3 && this.projectiles.length + projectileCount > 192) return;
    this.direction.set(0, 0, -1).applyQuaternion(ship.orientation);
    this.point
      .set(0, ship.weapon === 2 ? -0.4 : 0, -6)
      .applyQuaternion(ship.orientation)
      .add(ship.position);
    const target = ship.targetId
      ? this.ships.get(ship.targetId)
      : ship === this.player && this.targetId
        ? this.ships.get(this.targetId)
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
          velocity: this.direction
            .clone()
            .multiplyScalar(flak.speed)
            .addScaledVector(ship.velocity, flak.velocityInheritance),
          damage: flak.damage,
          radius: flak.radius,
          life: flak.lifetime,
          range: flak.range,
          speed: flak.speed,
        });
      }
      this.effect('flak-shot', this.point, ship.team);
      this.event(ship.id, this.point, { kind: 'fired', weapon: ship.weapon });
      return;
    }
    const config = ship.weapon === 2 ? ship.config.missile : ship.config.laser;
    ship.cooldown = config.interval;
    if (ship.weapon === 1) {
      ship.heat = Math.min(1, ship.heat + laser.heat.perShot * projectileCount);
      ship.overheated = ship.heat >= 1 - 1e-9;
    }
    for (let cannon = 0; cannon < projectileCount; cannon++) {
      this.direction.set(0, 0, -1).applyQuaternion(ship.orientation);
      if (ship.weapon === 1) {
        const hardpoint = laser.hardpoints[ship.barrel % laser.hardpoints.length];
        if (!hardpoint) continue;
        this.point.fromArray(hardpoint).applyQuaternion(ship.orientation).add(ship.position);
        ship.barrel = (ship.barrel + 1) % laser.hardpoints.length;
      }
      if (ship.weapon === 1 && target && !target.health.destroyed && config.aimAssistAngle > 0) {
        this.aim.subVectors(target.position, this.point);
        this.relativeVelocity
          .copy(target.velocity)
          .addScaledVector(ship.velocity, -config.velocityInheritance);
        const time = leadTime(
          this.aim,
          this.relativeVelocity,
          config.speed,
          Math.min(config.lifetime, config.range / config.speed),
        );
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
        velocity: this.direction
          .clone()
          .multiplyScalar(config.speed)
          .addScaledVector(ship.velocity, config.velocityInheritance),
        damage: config.damage,
        radius: config.radius,
        life: config.lifetime,
        range: config.range,
        speed: config.speed,
      };
      if (ship.weapon === 2)
        this.projectiles.push({
          ...state,
          kind: 'missile',
          targetId: missileCanLock(ship, target) ? (target?.id ?? null) : null,
          heading: this.direction.clone(),
          inheritedVelocity: ship.velocity.clone().multiplyScalar(config.velocityInheritance),
          turnRate: ship.config.missile.turnRate,
        });
      else this.projectiles.push({ ...state, kind: 'gun' });
      this.effect(ship.weapon === 2 ? 'missile-launch' : 'shot', this.point, ship.team);
      this.event(ship.id, this.point, { kind: 'fired', weapon: ship.weapon });
    }
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
      if (
        ship.id === owner ||
        (ship.team === team && !(this.pvp && team === 'player')) ||
        ship.health.destroyed ||
        ship.transferring
      )
        continue;
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
        this.environment?.world.definition.bodies.some(
          (body) => obstacle.id === `body:${body.id}` && body.terrain,
        )
      )
        continue;
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
    const terrainHit = this.environment?.trace(start, end, radius);
    if (terrainHit !== null && terrainHit !== undefined && terrainHit <= this.hitFraction) {
      this.hitFraction = terrainHit;
      this.hitShip = null;
      this.hitDetected = true;
    }
    const stationHit = this.environment && traceStation(this.environment.world, start, end, radius);
    if (stationHit && stationHit.fraction <= this.hitFraction) {
      this.hitFraction = stationHit.fraction;
      this.hitShip = null;
      this.hitDetected = true;
    }
  }

  private advanceProjectiles(dt: number) {
    for (let index = this.projectiles.length - 1; index >= 0; index--) {
      const shot = this.projectiles[index];
      if (!shot) continue;
      const travel = Math.min(dt, shot.life, shot.range / shot.speed);
      if (shot.kind === 'missile' && shot.targetId) {
        const target = this.ships.get(shot.targetId);
        if (
          !target ||
          target.health.destroyed ||
          (target.team === shot.team && !(this.pvp && shot.team === 'player'))
        )
          shot.targetId = null;
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
      shot.range = Math.max(0, shot.range - shot.speed * travel);
      if (this.hitDetected) {
        this.event(shot.owner, shot.position, {
          kind: 'impact',
          sourceId: shot.owner,
          targetId: this.hitShip?.id ?? null,
        });
        if (this.hitShip) this.damage(this.hitShip, shot.damage, shot.owner);
        this.effect(shot.kind === 'missile' ? 'detonation' : 'impact', shot.position, shot.team);
      }
      if (this.hitDetected || shot.life <= 1e-9 || shot.range <= 1e-9)
        this.projectiles.splice(index, 1);
    }
  }

  step(command: ShipCommand, dt: number, commands?: ReadonlyMap<string, ShipCommand>) {
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
    this.stations?.step(dt);
    for (const ship of this.ships.values()) {
      ship.sync();
      ship.previous.copy(ship.position);
      ship.previousOrientation.copy(ship.orientation);
      ship.health.step(dt);
      ship.hitFlash = Math.max(0, ship.hitFlash - dt);
      ship.cooldown = Math.max(0, ship.cooldown - dt);
      ship.heat = Math.max(0, ship.heat - ship.config.laser.heat.coolingRate * dt);
      if (ship.overheated && ship.heat <= ship.config.laser.heat.resumeAt) ship.overheated = false;
      if (ship.health.destroyed || ship.transferring) continue;
      if (ship.team === 'hostile') {
        let target = this.player;
        let distance = Infinity;
        for (const candidate of this.ships.values()) {
          if (candidate.team !== 'player' || candidate.health.destroyed || candidate.transferring)
            continue;
          const next = candidate.position.distanceToSquared(ship.position);
          if (next < distance) {
            target = candidate;
            distance = next;
          }
        }
        ship.targetId = distance < Infinity ? target.id : null;
        this.ai.step(ship, target, this.obstacles, this.aiConfig, dt);
        if (distance === Infinity) ship.command.fire = false;
      } else if (commands) {
        const next = commands.get(ship.id);
        if (next) {
          Object.assign(ship.command.flight, next.flight);
          ship.command.fire = next.fire;
          if (next.weapon && next.weapon !== ship.weapon) {
            ship.railgunCharge = 0;
            ship.weapon = next.weapon;
          }
        } else ship.command.fire = false;
      }
      const input = commands || ship !== this.player ? ship.command.flight : command.flight;
      ship.controller.environment = ship.stationary ? null : this.environment;
      ship.controller.step(input, dt);
      ship.sync();
      if (ship.controller.impactSpeed > 0)
        this.damage(ship, impactDamage(ship.controller.impactSpeed, ship.config.mass));
      // Terrain has already swept the full segment. Feed its corrected velocity into the sphere solver.
      if (ship.controller.environment)
        ship.velocity.subVectors(ship.position, ship.previous).divideScalar(dt);
      ship.position.copy(ship.previous);
      this.bodies.push(ship);
    }
    for (const obstacle of this.obstacles) {
      if (
        !this.environment?.world.definition.bodies.some(
          (body) => obstacle.id === `body:${body.id}` && body.terrain,
        )
      )
        this.bodies.push(obstacle);
    }
    this.solver.solve(this.bodies, dt, this.collision);
    for (const ship of this.ships.values()) {
      const hit =
        this.environment &&
        !ship.controller.flightLocked &&
        traceStation(this.environment.world, ship.previous, ship.position, ship.radius);
      if (hit) {
        ship.position
          .lerpVectors(ship.previous, ship.position, hit.fraction)
          .addScaledVector(hit.normal, 0.02);
        const closing = -ship.velocity.dot(hit.normal);
        if (closing > 0) {
          ship.velocity.addScaledVector(hit.normal, closing * 1.08);
          this.damage(ship, impactDamage(closing, ship.config.mass), hit.stationId);
        }
      }
      ship.controller.resolveMotion(ship.position, ship.velocity);
    }
    // Existing projectiles sweep relative to this tick's moving colliders.
    this.advanceProjectiles(dt);
    // New projectiles start at the end of the tick, avoiding a one-tick target motion error.
    for (const ship of this.ships.values()) {
      const firing =
        !ship.transferring &&
        !ship.controller.flightLocked &&
        (commands || ship !== this.player ? ship.command.fire : command.fire);
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
          this.targeting.range)
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
      targeting: { ...this.targeting },
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
        heat: ship.heat,
        overheated: ship.overheated,
        barrel: ship.barrel,
        hitFlash: ship.hitFlash,
        shieldHit: ship.shieldHit,
        aiState: ship.aiState,
        aiElapsed: ship.aiElapsed,
        aiTime: ship.aiTime,
        aiReaction: ship.aiReaction,
        aiPhase: ship.aiPhase,
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
