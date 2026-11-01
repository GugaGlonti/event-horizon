import { CombatShip } from '@/engine/combat/combatTypes';
import { ENEMY_SHIP, PLAYER_SHIP, PRACTICE_TARGET } from '@/engine/combat/config';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import { neutralInput } from '@/engine/network/InputQueue';
import { Prediction } from '@/engine/network/Prediction';
import type { JoinOptions, NetworkInput, WorldSnapshot } from '@/engine/network/protocol';
import { SnapshotBuffer } from '@/engine/network/SnapshotBuffer';
import type { FlightController } from '@/engine/simulation/FlightController';
import type { FlightInput } from '@/engine/simulation/flightTypes';
import type { CombatSession } from '@/features/combat/CombatSession';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import { NetworkSession } from './NetworkSession';

/** Client presentation and prediction only. CombatSimulation here is a read model, never stepped. */
export class MultiplayerSession {
  enabled = false;
  readonly network: NetworkSession;
  readonly prediction: Prediction;
  readonly buffer = new SnapshotBuffer();
  readonly names = new Map<string, string>();
  private readonly previousPosition = new Vector3();
  private readonly previousOrientation = new Quaternion();
  private readonly currentPosition = new Vector3();
  private readonly currentOrientation = new Quaternion();
  private sequence = 0;
  private elapsed = 0;
  private publication = 0;
  private lastReceived = 0;
  private readonly combat: CombatSession;
  private readonly busy: () => boolean;
  private readonly onFirst: (snapshot: WorldSnapshot) => void;
  private readonly point = new Vector3();
  private readonly rotation = new Quaternion();
  constructor(
    controller: FlightController,
    combat: CombatSession,
    busy: () => boolean,
    onFirst: (snapshot: WorldSnapshot) => void,
  ) {
    this.combat = combat;
    this.busy = busy;
    this.onFirst = onFirst;
    this.buffer.delay =
      Math.max(50, Math.min(300, Number(import.meta.env.VITE_INTERPOLATION_MS) || 100)) / 1000;
    this.prediction = new Prediction(controller);
    this.network = new NetworkSession(this.receive);
  }
  connect(name: string, systemId: JoinOptions['systemId']) {
    this.enabled = true;
    this.sequence = 0;
    this.prediction.reset();
    this.buffer.clear();
    this.combat.depart();
    void this.network.connect(name, systemId);
  }
  private receive = (snapshot: WorldSnapshot, first: boolean) => {
    this.lastReceived = performance.now() / 1000;
    this.prediction.tickRate = snapshot.tickRate;
    if (first) {
      this.combat.audio.resetEvents();
      this.buffer.clear();
      this.prediction.reset();
      this.sequence = snapshot.ack;
      if (!this.busy()) this.onFirst(snapshot);
      this.prediction.controller.copyTransform(this.previousPosition, this.previousOrientation);
    }
    this.buffer.push(snapshot, this.lastReceived);
    const simulation = this.combat.simulation;
    const local = snapshot.ships.find((ship) => ship.id === snapshot.playerId);
    const respawned = simulation.player.health.destroyed && local && local.hull > 0;
    if (local && !this.busy()) {
      if (respawned) this.prediction.reset();
      if (first || local.hull <= 0 || local.transferring)
        this.prediction.controller.restore(local.flight);
      else this.prediction.reconcile(local.flight, snapshot.ack);
      if (respawned)
        this.prediction.controller.copyTransform(this.previousPosition, this.previousOrientation);
    }
    const ids = new Set(snapshot.roster);
    for (const [id, ship] of simulation.ships)
      if (ship !== simulation.player && !ids.has(id)) {
        simulation.ships.delete(id);
        this.names.delete(id);
      }
    this.names.set('player', useMultiplayerStore.getState().name);
    for (const state of snapshot.ships) {
      const own = state.id === snapshot.playerId;
      let ship = own ? simulation.player : simulation.ships.get(state.id);
      if (!ship) {
        ship = new CombatShip(
          state.id,
          state.player ? 'player' : 'hostile',
          state.player ? PLAYER_SHIP : state.stationary ? PRACTICE_TARGET : ENEMY_SHIP,
        );
        simulation.ships.set(state.id, ship);
      }
      this.names.set(ship.id, state.name);
      simulation.stations?.states.set(ship.id, structuredClone(state.docking));
      if (!own) ship.controller.restore(state.flight);
      ship.health.shields = state.shields;
      ship.health.hull = state.hull;
      ship.health.invulnerability = state.protection;
      ship.transferring = state.transferring;
      ship.stationary = state.stationary;
      ship.heat = state.heat;
      ship.overheated = state.overheated;
      ship.cooldown = state.cooldown;
      ship.railgunCharge = state.charge;
      ship.weapon = own ? this.combat.requestedWeapon : state.weapon;
      ship.command.fire = state.firing;
      ship.hitFlash = state.hitFlash;
      ship.shieldHit = state.shieldHit;
      ship.sync();
      ship.previous.copy(ship.position);
      ship.previousOrientation.copy(ship.orientation);
    }
    simulation.stations?.occupancy.clear();
    for (const port of snapshot.ports)
      if (port.occupant)
        simulation.stations?.occupancy.set(
          `${port.stationId}/${port.portId}`,
          port.occupant === snapshot.playerId ? 'player' : port.occupant,
        );
    const selected = simulation.targetId && simulation.ships.get(simulation.targetId);
    if (
      !selected ||
      selected.health.destroyed ||
      selected.transferring ||
      selected.position.distanceTo(simulation.player.position) > 3500
    )
      simulation.targetId = null;
    simulation.kills = snapshot.kills;
    simulation.time = snapshot.time;
    simulation.alpha = 1;
    simulation.effects.length = 0;
    simulation.effects.push(
      ...snapshot.effects.map((effect) => ({
        ...effect,
        position: new Vector3().fromArray(effect.position),
      })),
    );
    simulation.events.length = 0;
    simulation.events.push(...snapshot.events);
    simulation.tracers.length = 0;
    simulation.tracers.push(
      ...snapshot.tracers.map((trace) => ({
        ...trace,
        start: new Vector3().fromArray(trace.start),
        end: new Vector3().fromArray(trace.end),
      })),
    );
    simulation.projectiles.length = 0;
    for (const shot of snapshot.projectiles) {
      const config =
        shot.kind === 'missile'
          ? PLAYER_SHIP.missile
          : shot.kind === 'flak'
            ? PLAYER_SHIP.flak
            : PLAYER_SHIP.laser;
      const base = {
        ...shot,
        position: new Vector3().fromArray(shot.position),
        previous: new Vector3().fromArray(shot.position),
        velocity: new Vector3().fromArray(shot.velocity),
        damage: config.damage,
        radius: config.radius,
        range: config.range,
        speed: config.speed,
      };
      if (shot.kind === 'missile')
        simulation.projectiles.push({
          ...base,
          kind: 'missile',
          targetId: null,
          heading: new Vector3().fromArray(shot.velocity).normalize(),
          inheritedVelocity: new Vector3(),
          turnRate: 0,
        });
      else simulation.projectiles.push({ ...base, kind: shot.kind });
    }
    this.combat.status = `Shared sector / ${snapshot.players} pilots / PvP enabled`;
    this.combat.targetNames = this.names;
    if (first) this.combat.publish();
  };
  advance(delta: number, flight: FlightInput, fire: boolean, paused: boolean, assistance: boolean) {
    this.network.ping();
    const snapshot = this.network.latest,
      simulation = this.combat.simulation;
    if (!snapshot) return;
    const dt = Math.min(0.1, delta);
    this.elapsed += dt;
    const step = 1 / snapshot.tickRate;
    for (let count = 0; this.elapsed >= step && count < 6; count++) {
      this.elapsed -= step;
      if (!this.network.active || this.busy()) continue;
      const command: NetworkInput = {
        ...neutralInput(++this.sequence),
        flight: paused ? neutralInput().flight : { ...flight },
        fire: !paused && fire,
        paused,
        assistance,
        weapon: this.combat.requestedWeapon,
        targetId: simulation.targetId,
      };
      this.prediction.controller.copyTransform(this.previousPosition, this.previousOrientation);
      if (!simulation.player.health.destroyed && !simulation.player.transferring)
        this.prediction.apply(command);
      this.network.send(command);
    }
    this.prediction.visualOffset.multiplyScalar(Math.exp(-12 * dt));
    const now = performance.now() / 1000;
    for (const ship of simulation.ships.values()) {
      if (ship === simulation.player) {
        ship.sync();
        continue;
      }
      if (this.buffer.sample(ship.id, now, this.point, this.rotation)) {
        ship.position.copy(this.point);
        ship.previous.copy(this.point);
        ship.orientation.copy(this.rotation);
        ship.previousOrientation.copy(this.rotation);
      }
      ship.hitFlash = Math.max(0, ship.hitFlash - dt);
    }
    for (const effect of simulation.effects) effect.age += dt;
    for (const trace of simulation.tracers) trace.age += dt;
    for (const shot of simulation.projectiles) {
      shot.previous.copy(shot.position);
      if (now - this.lastReceived < 0.15) shot.position.addScaledVector(shot.velocity, dt);
    }
    this.publication += dt;
    if (this.publication >= 0.1) {
      this.publication %= 0.1;
      useMultiplayerStore.setState({
        fps: delta > 0 ? Math.round(1 / delta) : 0,
        delay: Math.round((now - this.lastReceived) * 1000),
        corrections: this.prediction.corrections,
      });
      this.combat.publish();
    }
  }
  pause() {
    if (!this.enabled || !this.network.active || !this.network.latest) return;
    const input = {
      ...neutralInput(++this.sequence),
      weapon: this.combat.simulation.player.weapon,
      assistance: this.prediction.controller.snapshot().assistance,
    };
    this.network.send(input);
  }
  present(
    position: { set(x: number, y: number, z: number): unknown },
    orientation: { set(x: number, y: number, z: number, w: number): unknown },
  ) {
    this.prediction.controller.copyTransform(this.currentPosition, this.currentOrientation);
    this.point.lerpVectors(
      this.previousPosition,
      this.currentPosition,
      Math.min(1, this.elapsed * this.prediction.tickRate),
    );
    this.point.add(this.prediction.visualOffset);
    this.rotation.slerpQuaternions(
      this.previousOrientation,
      this.currentOrientation,
      Math.min(1, this.elapsed * this.prediction.tickRate),
    );
    position.set(this.point.x, this.point.y, this.point.z);
    orientation.set(this.rotation.x, this.rotation.y, this.rotation.z, this.rotation.w);
  }
  restoreArrival() {
    const snapshot = this.network.latest,
      local = snapshot?.ships.find((ship) => ship.id === snapshot.playerId);
    if (local) this.prediction.controller.restore(local.flight);
    this.prediction.reset();
    this.prediction.controller.copyTransform(this.previousPosition, this.previousOrientation);
    this.elapsed = 0;
    this.network.ready();
  }
  disconnect() {
    this.enabled = false;
    this.network.disconnect();
    this.buffer.clear();
    this.prediction.reset();
    this.names.clear();
    this.combat.targetNames = null;
    this.combat.depart();
  }
}
