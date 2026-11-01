import { CombatSimulation } from '@/engine/combat/CombatSimulation';
import { CombatShip, type ShipCommand } from '@/engine/combat/combatTypes';
import {
  AI_CONFIG,
  ENCOUNTER_CONFIG,
  ENEMY_SHIP,
  PLAYER_SHIP,
  PRACTICE_TARGET,
} from '@/engine/combat/config';
import { Encounter } from '@/engine/combat/Encounter';
import { encounterSpace } from '@/engine/combat/encounterSpace';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import {
  departureObstruction,
  routeArrival,
  travelDirection,
} from '@/engine/navigation/hyperspaceRoute';
import { PlanetaryEnvironment } from '@/engine/planetary/PlanetaryEnvironment';
import { StationSimulation } from '@/engine/stations/StationSimulation';
import { SystemRuntime } from '@/engine/world/SystemRuntime';
import { SYSTEMS } from '@/engine/world/systems';
import { InputQueue, neutralInput } from './InputQueue';
import type { FlightState, ShipState, WorldSnapshot } from './protocol';

export interface Pilot {
  id: string;
  name: string;
  ship: CombatShip;
  inputs: InputQueue;
  kills: number;
  deaths: number;
  connected: boolean;
  travelCooldown: number;
}
export class MultiplayerWorld {
  readonly system: SystemRuntime;
  readonly simulation = new CombatSimulation(PLAYER_SHIP, AI_CONFIG);
  readonly pilots = new Map<string, Pilot>();
  readonly encounter = new Encounter(ENCOUNTER_CONFIG);
  tick = 0;
  time = 0;
  private eventCursor = 0;
  private readonly commands = new Map<string, ShipCommand>();
  readonly instanceId: string;
  readonly tickRate: number;
  constructor(systemId: string, instanceId = 'public', tickRate = 30) {
    this.instanceId = instanceId;
    this.tickRate = tickRate;
    const definition = SYSTEMS.find((system) => system.id === systemId);
    if (!definition) throw new Error('Unknown star system.');
    this.system = new SystemRuntime(definition);
    this.simulation.environment = new PlanetaryEnvironment(this.system);
    this.simulation.stations = new StationSimulation(this.system, this.simulation.ships);
    this.simulation.ships.clear();
    this.simulation.pvp = true;
    this.encounter.reset(systemId);
    for (const body of definition.bodies) {
      const center = this.system.positions.get(body.id);
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
  }
  private safe(point: Vector3, ignoreId?: string) {
    return (
      this.simulation.obstacles.every(
        (body) => point.distanceTo(body.position) > body.radius + 120,
      ) &&
      [...this.simulation.ships.values()].every(
        (ship) =>
          ship.id === ignoreId || ship.health.destroyed || point.distanceTo(ship.position) > 80,
      )
    );
  }
  safePose(sourceId?: string) {
    const source = SYSTEMS.find((system) => system.id === sourceId);
    const route =
      source && routeArrival(this.system, travelDirection(source, this.system.definition), 4200);
    const arrival = this.system.arrival();
    const position = route?.position ?? new Vector3().fromArray(arrival.position);
    const orientation = route?.orientation ?? new Quaternion().fromArray(arrival.orientation);
    const base = position.clone();
    for (let i = 0; i < 256; i++) {
      position
        .copy(base)
        .add(new Vector3((i % 8) * 90, Math.floor(i / 64) * 140, (Math.floor(i / 8) % 8) * 90));
      if (this.safe(position)) return { position, orientation };
    }
    throw new Error('No safe spawn is available.');
  }
  addPlayer(
    id: string,
    name: string,
    health?: {
      shields: number;
      hull: number;
      kills: number;
      deaths: number;
      flight?: FlightState;
      sinceDamage?: number;
    },
    sourceId?: string,
  ) {
    if (this.pilots.has(id)) throw new Error('Duplicate player.');
    const pose = this.safePose(sourceId);
    const ship = new CombatShip(id, 'player', PLAYER_SHIP);
    if (health?.flight) ship.controller.restore(health.flight);
    ship.controller.relocate(pose.position, pose.orientation, sourceId ? 100 : 0);
    ship.sync();
    ship.previous.copy(ship.position);
    ship.previousOrientation.copy(ship.orientation);
    ship.health.invulnerability = 3;
    if (health) {
      ship.health.shields = health.shields;
      ship.health.hull = health.hull;
      ship.health.sinceDamage = health.sinceDamage ?? 0;
    }
    const pilot: Pilot = {
      id,
      name,
      ship,
      inputs: new InputQueue(),
      kills: health?.kills ?? 0,
      deaths: health?.deaths ?? 0,
      connected: true,
      travelCooldown: sourceId ? 5 : 0,
    };
    this.pilots.set(id, pilot);
    this.simulation.ships.set(id, ship);
    return pilot;
  }
  releasePlayer(id: string) {
    const pilot = this.pilots.get(id);
    if (!pilot) return false;
    if (!pilot.ship.transferring) {
      pilot.inputs.clear();
      return true;
    }
    const ship = pilot.ship,
      point = new Vector3();
    for (let i = 0; i < 256; i++) {
      point
        .copy(ship.position)
        .add(new Vector3((i % 8) * 90, Math.floor(i / 64) * 140, (Math.floor(i / 8) % 8) * 90));
      if (!this.safe(point, id)) continue;
      ship.controller.resolveMotion(point, ship.velocity);
      ship.sync();
      ship.previous.copy(ship.position);
      ship.previousOrientation.copy(ship.orientation);
      ship.transferring = false;
      pilot.inputs.clear();
      return true;
    }
    return false;
  }
  removePlayer(id: string) {
    this.simulation.stations?.remove(id);
    this.pilots.delete(id);
    this.simulation.ships.delete(id);
    this.commands.delete(id);
    for (let i = this.simulation.projectiles.length - 1; i >= 0; i--)
      if (this.simulation.projectiles[i]?.owner === id) this.simulation.projectiles.splice(i, 1);
    for (const ship of this.simulation.ships.values())
      if (ship.targetId === id) ship.targetId = null;
  }
  respawn(id: string) {
    const pilot = this.pilots.get(id);
    if (!pilot?.ship.health.destroyed || pilot.ship.transferring) return false;
    const { name, kills, deaths } = pilot;
    pilot.inputs.clear();
    this.removePlayer(id);
    const replacement = this.addPlayer(id, name, { shields: 100, hull: 100, kills, deaths });
    replacement.inputs = pilot.inputs;
    return true;
  }
  canTravel(id: string, destination: string) {
    const pilot = this.pilots.get(id),
      target = SYSTEMS.find((system) => system.id === destination);
    if (
      !pilot ||
      !target ||
      destination === this.system.definition.id ||
      pilot.ship.health.destroyed ||
      pilot.ship.transferring ||
      pilot.travelCooldown > 0 ||
      pilot.ship.controller.surface.phase !== 'flying' ||
      pilot.ship.controller.landingAssist ||
      this.simulation.stations?.state(id).phase !== 'undocked'
    )
      return false;
    return !departureObstruction(
      this.system,
      pilot.ship.position,
      travelDirection(this.system.definition, target),
      5200,
    );
  }
  startEncounter(practice: boolean) {
    if ([...this.simulation.ships.values()].some((ship) => ship.team === 'hostile')) return false;
    this.encounter.begin(practice, practice ? 1 : 5);
    this.encounter.advance(0, this.simulation.ships, this.spawn);
    return true;
  }
  private spawn = (slot: Readonly<{ id: string; index: number }>) => {
    const player = [...this.pilots.values()].find(
      (pilot) => pilot.connected && encounterSpace(this.simulation, pilot.ship),
    )?.ship;
    if (!player) return false;
    const practice = this.encounter.mode === 'practice';
    for (let attempt = 0; attempt < 48; attempt++) {
      const angle = slot.index * 2.399 + attempt * 0.7;
      const radius = practice && attempt === 0 ? 0 : 170 + slot.index * 35 + attempt * 12;
      const point = new Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        practice ? -260 : -600 - (slot.index % 3) * 100,
      )
        .applyQuaternion(player.orientation)
        .add(player.position);
      if (!this.safe(point)) continue;
      const orientation = new Quaternion().setFromUnitVectors(
        new Vector3(0, 0, -1),
        new Vector3().subVectors(player.position, point).normalize(),
      );
      return (
        this.simulation.spawn(
          practice ? PRACTICE_TARGET : ENEMY_SHIP,
          point,
          orientation,
          practice,
          slot.id,
          practice ? 0 : 3,
        ) !== null
      );
    }
    return false;
  };
  step() {
    const dt = 1 / this.tickRate;
    this.tick++;
    this.commands.clear();
    let hasActive = false;
    for (const pilot of this.pilots.values()) {
      const input = pilot.inputs.step(dt),
        ship = pilot.ship;
      const active = pilot.connected && !ship.transferring && !ship.health.destroyed;
      const command = active ? input : neutralInput();
      if (command.paused) ship.controller.landingAssist = null;
      if (!input.paused && pilot.connected && !ship.health.destroyed) hasActive = true;
      ship.controller.setAssistance(command.assistance);
      ship.targetId = command.targetId;
      const target = ship.targetId && this.simulation.ships.get(ship.targetId);
      if (
        !target ||
        target === ship ||
        target.transferring ||
        target.health.destroyed ||
        ship.position.distanceTo(target.position) > 3500
      )
        ship.targetId = null;
      this.commands.set(pilot.id, {
        flight: command.flight,
        fire: active && !command.paused && command.fire,
        weapon: command.weapon,
      });
      pilot.travelCooldown = Math.max(0, pilot.travelCooldown - dt);
    }
    const substeps = Math.max(1, Math.round(120 / this.tickRate)),
      subDt = dt / substeps;
    for (let sub = 0; sub < substeps; sub++) {
      this.time += subDt;
      this.system.update(this.time);
      for (const obstacle of this.simulation.obstacles) {
        obstacle.previous.copy(obstacle.position);
        const center = this.system.positions.get(obstacle.id.slice(5));
        if (center) obstacle.velocity.subVectors(center, obstacle.previous).divideScalar(subDt);
      }
      this.simulation.step({ flight: neutralInput().flight, fire: false }, subDt, this.commands);
      for (const obstacle of this.simulation.obstacles) {
        const center = this.system.positions.get(obstacle.id.slice(5));
        if (center) obstacle.position.copy(center);
      }
    }
    for (const event of this.simulation.events) {
      if (event.id <= this.eventCursor) continue;
      this.eventCursor = event.id;
      if (event.kind !== 'destroyed') continue;
      const victim = this.pilots.get(event.shipId),
        killer = event.sourceId && this.pilots.get(event.sourceId);
      if (victim) victim.deaths++;
      if (killer && killer !== victim) killer.kills++;
    }
    if (this.encounter.mode !== 'waiting' || hasActive)
      this.encounter.advance(dt, this.simulation.ships, this.spawn);
  }
  snapshot(id: string, relevance: number, distant = false, afterEvent = 0): WorldSnapshot {
    const pilot = this.pilots.get(id);
    if (!pilot) throw new Error('Player is not in this room.');
    const ships: ShipState[] = [];
    for (const ship of this.simulation.ships.values()) {
      if (
        !distant &&
        ship.id !== id &&
        ship.position.distanceToSquared(pilot.ship.position) > relevance ** 2 &&
        ship.targetId !== id &&
        pilot.ship.targetId !== ship.id
      )
        continue;
      ships.push({
        id: ship.id,
        name: this.pilots.get(ship.id)?.name ?? ship.config.name,
        player: ship.team === 'player',
        stationary: ship.stationary,
        flight: ship.controller.snapshot(),
        docking: {
          ...(this.simulation.stations?.state(ship.id) ?? {
            phase: 'undocked' as const,
            stationId: null,
            portId: null,
            timer: 0,
            start: null,
            orientation: null,
          }),
        },
        shields: ship.health.shields,
        hull: ship.health.hull,
        protection: ship.health.invulnerability,
        transferring: ship.transferring,
        weapon: ship.weapon,
        heat: ship.heat,
        overheated: ship.overheated,
        cooldown: ship.cooldown,
        charge: ship.railgunCharge,
        firing: ship.command.fire,
        hitFlash: ship.hitFlash,
        shieldHit: ship.shieldHit,
      });
    }
    const nearby = (position: Vector3) =>
      position.distanceToSquared(pilot.ship.position) <= relevance ** 2;
    return {
      v: 3,
      tick: this.tick,
      time: this.time,
      systemId: this.system.definition.id,
      instanceId: this.instanceId,
      playerId: id,
      ack: pilot.inputs.ack,
      tickRate: this.tickRate,
      players: [...this.pilots.values()].filter((pilot) => pilot.connected).length,
      kills: pilot.kills,
      deaths: pilot.deaths,
      tickMs: 0,
      overruns: 0,
      roster: [...this.simulation.ships.keys()],
      ports: (this.system.definition.stations ?? []).flatMap((station) =>
        station.ports.map((port) => ({
          stationId: station.id,
          portId: port.id,
          occupant: this.simulation.stations?.occupancy.get(`${station.id}/${port.id}`) ?? null,
        })),
      ),
      ships,
      projectiles: this.simulation.projectiles
        .filter((shot) => nearby(shot.position))
        .map((shot) => ({
          id: shot.id,
          owner: shot.owner,
          team: shot.team,
          kind: shot.kind,
          position: shot.position.toArray(),
          velocity: shot.velocity.toArray(),
          life: shot.life,
        })),
      effects: this.simulation.effects
        .filter((effect) => nearby(effect.position))
        .map((effect) => ({ ...effect, position: effect.position.toArray() })),
      events: this.simulation.events.filter((event) => {
        if (event.id <= afterEvent) return false;
        if (
          event.shipId === id ||
          ('sourceId' in event && event.sourceId === id) ||
          ('targetId' in event && event.targetId === id)
        )
          return true;
        const point = event.position,
          center = pilot.ship.position;
        return (
          (point[0] - center.x) ** 2 + (point[1] - center.y) ** 2 + (point[2] - center.z) ** 2 <=
          relevance ** 2
        );
      }),
      tracers: this.simulation.tracers
        .filter((trace) => nearby(trace.start))
        .map((trace) => ({ ...trace, start: trace.start.toArray(), end: trace.end.toArray() })),
    };
  }
}
