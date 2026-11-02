import type { CombatShip } from '@/engine/combat/combatTypes';
import { Quaternion, Vector3 } from '@/engine/math/linear';
import { PlanetaryEnvironment } from '@/engine/planetary/PlanetaryEnvironment';
import type { FlightInput } from '@/engine/simulation/flightTypes';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import { portPose, traceStation } from './stationGeometry';
import { createDockingState, type DockingState } from './stationTypes';

/** One instance per authoritative system. Exclusive leases are released on destruction/removal. */
export class StationSimulation {
  readonly states = new Map<string, DockingState>();
  readonly occupancy = new Map<string, string>();
  readonly world: SystemRuntime;
  readonly ships: ReadonlyMap<string, CombatShip>;
  private readonly environment: PlanetaryEnvironment;
  constructor(world: SystemRuntime, ships: ReadonlyMap<string, CombatShip>) {
    this.world = world;
    this.ships = ships;
    this.environment = new PlanetaryEnvironment(world);
  }
  state(id: string) {
    return this.states.get(id) ?? createDockingState();
  }
  request(id: string, stationId: string, portId?: string): string | null {
    const ship = this.ships.get(id),
      station = this.world.definition.stations?.find((s) => s.id === stationId);
    if (
      !ship ||
      ship.health.destroyed ||
      ship.transferring ||
      !['flying', ...(station?.type === 'surface' ? ['approaching'] : [])].includes(
        ship.controller.surface.phase,
      )
    )
      return 'Ship is unavailable for docking.';
    if (this.state(id).phase !== 'undocked') return 'Cancel the existing clearance first.';
    if (!station) return 'Unknown station.';
    const available = station.ports.filter(
      (p) => (!portId || p.id === portId) && !this.occupancy.has(`${station.id}/${p.id}`),
    );
    if (!available.length) return 'Docking port occupied.';
    const nearby = available.filter(
      (p) => ship.position.distanceTo(portPose(this.world, station, p).approach) <= 2500,
    );
    if (!nearby.length) return 'Approach within 2.5 km to request docking.';
    const port = nearby
      .sort(
        (a, b) =>
          ship.position.distanceToSquared(portPose(this.world, station, a).approach) -
          ship.position.distanceToSquared(portPose(this.world, station, b).approach),
      )
      .find((p) => this.clearance(id, ship.position, portPose(this.world, station, p).approach));
    if (!port) return 'Docking approach obstructed. Fly toward the approach marker and retry G.';
    const pose = portPose(this.world, station, port);
    if (ship.velocity.clone().sub(pose.velocity).length() > 150)
      return 'Slow below 150 m/s before engaging automatic docking.';
    if (
      [...this.ships.values()].some(
        (other) =>
          other !== ship &&
          !other.health.destroyed &&
          other.position.distanceTo(pose.position) < 25,
      )
    )
      return 'Docking berth obstructed.';
    this.occupancy.set(`${station.id}/${port.id}`, id);
    this.states.set(id, {
      ...createDockingState(),
      phase: 'requested',
      stationId: station.id,
      portId: port.id,
    });
    ship.controller.travelMode = 'normal';
    ship.controller.requestLandingAssist(null);
    ship.controller.landingGear = true;
    return null;
  }
  cancel(id: string) {
    const state = this.states.get(id),
      ship = this.ships.get(id);
    if (state?.phase === 'docked' || state?.phase === 'undocking') return false;
    if (state?.stationId && state.portId)
      this.occupancy.delete(`${state.stationId}/${state.portId}`);
    this.states.delete(id);
    if (ship) {
      ship.controller.flightLocked = false;
      if (state) ship.controller.landingGear = false;
    }
    return true;
  }
  /** Movement overrides the approach; secured berths and the undocking corridor retain their lease. */
  cancelOnInput(id: string, input: Readonly<FlightInput>) {
    if (
      this.states.has(id) &&
      (input.throttle ||
        input.brake ||
        input.reverse ||
        input.boost ||
        input.pitch ||
        input.yaw ||
        input.roll ||
        input.strafe ||
        input.lift)
    )
      this.cancel(id);
  }
  remove(id: string) {
    const state = this.states.get(id);
    if (state?.stationId && state.portId)
      this.occupancy.delete(`${state.stationId}/${state.portId}`);
    this.states.delete(id);
    const ship = this.ships.get(id);
    if (ship) {
      ship.controller.flightLocked = false;
      if (state) ship.controller.landingGear = false;
    }
  }
  private clearance(id: string, from: Readonly<Vector3>, to: Readonly<Vector3>) {
    return (
      !traceStation(this.world, from, to, (this.ships.get(id)?.radius ?? 5) + 0.25) &&
      this.environment.trace(from, to, (this.ships.get(id)?.radius ?? 5) + 0.25) === null &&
      ![...this.ships.values()].some((other) => {
        if (other.id === id || other.health.destroyed) return false;
        const delta = new Vector3().subVectors(to, from),
          length = delta.lengthSq();
        const t = length
          ? Math.max(
              0,
              Math.min(1, new Vector3().subVectors(other.position, from).dot(delta) / length),
            )
          : 0;
        return (
          new Vector3().copy(from).addScaledVector(delta, t).distanceTo(other.position) <
          other.radius + 10
        );
      })
    );
  }
  assist(id: string): string | null {
    const state = this.states.get(id),
      ship = this.ships.get(id);
    const station = this.world.definition.stations?.find((s) => s.id === state?.stationId),
      port = station?.ports.find((p) => p.id === state?.portId);
    if (!state || !ship || !station || !port || !['approaching', 'aligning'].includes(state.phase))
      return 'Request docking clearance first.';
    const pose = portPose(this.world, station, port);
    if (ship.position.distanceTo(pose.position) > 45)
      return 'Final capture requires range below 45 m.';
    if (ship.velocity.clone().sub(pose.velocity).length() > 3)
      return 'Final capture requires speed below 3 m/s.';
    if (ship.orientation.angleTo(pose.orientation) > 0.12)
      return 'Align the ship within 7 degrees of the berth.';
    if (!this.clearance(id, ship.position, pose.position)) return 'Final docking path obstructed.';
    state.phase = 'docking';
    state.timer = 0;
    state.start = ship.position.toArray();
    state.orientation = ship.orientation.toArray();
    ship.controller.flightLocked = true;
    ship.command.fire = false;
    ship.railgunCharge = 0;
    return null;
  }
  undock(id: string): string | null {
    const state = this.states.get(id),
      ship = this.ships.get(id);
    const station = this.world.definition.stations?.find((s) => s.id === state?.stationId),
      port = station?.ports.find((p) => p.id === state?.portId);
    if (!state || !ship || !station || !port || state.phase !== 'docked')
      return 'Ship must be docked.';
    const pose = portPose(this.world, station, port);
    const exit = pose.approach.clone();
    if (!this.clearance(id, pose.position, exit)) return 'Undocking corridor obstructed.';
    state.phase = 'undocking';
    state.timer = 0;
    state.start = pose.position.toArray();
    state.orientation = ship.orientation.toArray();
    return null;
  }
  service(id: string, service: 'repair' | 'shields' | 'weapons'): string | null {
    const state = this.state(id),
      ship = this.ships.get(id),
      station = this.world.definition.stations?.find((s) => s.id === state.stationId);
    if (
      !ship ||
      ship.health.destroyed ||
      state.phase !== 'docked' ||
      !station?.services.includes(service)
    )
      return 'Service requires a docked live ship.';
    if (service === 'repair') ship.health.hull = ship.config.defense.hull;
    if (service === 'shields') ship.health.shields = ship.config.defense.shields;
    if (service === 'weapons') {
      ship.heat = ship.cooldown = ship.railgunCharge = 0;
      ship.overheated = false;
    }
    return null;
  }
  step(dt: number) {
    for (const [id, state] of this.states) {
      const ship = this.ships.get(id),
        station = this.world.definition.stations?.find((s) => s.id === state.stationId),
        port = station?.ports.find((p) => p.id === state.portId);
      if (!ship || ship.health.destroyed || ship.transferring || !station || !port) {
        this.remove(id);
        continue;
      }
      const pose = portPose(this.world, station, port);
      state.timer += dt;
      if (['requested', 'approaching', 'aligning'].includes(state.phase)) {
        if (state.timer > 90 || ship.position.distanceTo(pose.approach) > 4000) {
          this.remove(id);
          continue;
        }
        if (state.phase === 'requested') state.phase = 'approaching';
        const relative = ship.velocity.clone().sub(pose.velocity);
        if (
          state.phase === 'approaching' &&
          ship.position.distanceTo(pose.approach) < 8 &&
          relative.length() < 3
        )
          state.phase = 'aligning';
        const target = state.phase === 'aligning' ? pose.position : pose.approach;
        const delta = target.clone().sub(ship.position);
        const distance = delta.length();
        const speed = Math.min(state.phase === 'aligning' ? 20 : 65, distance * 0.6);
        const desired = delta.multiplyScalar(distance > 0 ? speed / distance : 0);
        const change = desired.sub(relative);
        const acceleration = 30 * dt;
        if (change.length() > acceleration) change.normalize().multiplyScalar(acceleration);
        relative.add(change);
        const velocity = relative.clone().add(pose.velocity);
        const point = ship.position.clone().addScaledVector(velocity, dt);
        if (!this.clearance(id, ship.position, point)) {
          this.cancel(id);
          continue;
        }
        ship.controller.lockPose(
          point,
          ship.orientation.clone().slerp(pose.orientation, 1 - Math.exp(-2 * dt)),
          velocity,
          relative.length() / 65,
        );
        ship.command.fire = false;
        ship.railgunCharge = 0;
        ship.sync();
        if (state.phase === 'aligning' && distance < 4) this.assist(id);
      } else if (state.phase === 'docking') {
        const t = Math.min(1, state.timer / 2),
          smooth = t * t * (3 - 2 * t);
        const point = new Vector3()
          .fromArray(state.start ?? pose.position.toArray())
          .lerp(pose.position, smooth);
        if (!this.clearance(id, ship.position, point)) {
          this.cancel(id);
          continue;
        }
        ship.controller.lockPose(
          point,
          new Quaternion()
            .fromArray(state.orientation ?? pose.orientation.toArray())
            .slerp(pose.orientation, smooth),
          new Vector3()
            .subVectors(
              pose.position,
              new Vector3().fromArray(state.start ?? pose.position.toArray()),
            )
            .multiplyScalar(3 * t * (1 - t))
            .addScaledVector(pose.velocity, smooth),
        );
        if (t === 1) {
          state.phase = 'docked';
          state.timer = 0;
        }
      } else if (state.phase === 'docked')
        ship.controller.lockPose(pose.position, pose.orientation, pose.velocity);
      else if (state.phase === 'undocking') {
        const t = Math.min(1, state.timer / 4),
          point = pose.position.clone().lerp(pose.approach, t * t * (3 - 2 * t));
        if (!this.clearance(id, ship.position, point)) {
          state.timer = Math.max(0, state.timer - dt);
          ship.controller.lockPose(ship.position, pose.orientation, pose.velocity);
          continue;
        }
        ship.controller.lockPose(
          point,
          pose.orientation,
          new Vector3()
            .subVectors(pose.approach, pose.position)
            .multiplyScalar(1.5 * t * (1 - t))
            .add(pose.velocity),
        );
        if (t === 1) {
          this.remove(id);
          ship.controller.resolveMotion(
            point,
            new Vector3(0, 0, 12).applyQuaternion(pose.orientation).add(pose.velocity),
          );
        }
      }
      ship.sync();
    }
  }
}
