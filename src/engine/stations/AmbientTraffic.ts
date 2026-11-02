import type { CombatSimulation } from '@/engine/combat/CombatSimulation';
import { CombatShip } from '@/engine/combat/combatTypes';
import { PLAYER_SHIP } from '@/engine/combat/config';
import { MathUtils, Quaternion, Vector3 } from '@/engine/math/linear';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import { stationPose } from './stationGeometry';
import type { StationDefinition } from './stationTypes';

interface TrafficSlot {
  ship: CombatShip;
  station: StationDefinition;
  waypoint: number;
  lane: number;
}
/** Three friendly NPCs at the nearest inhabited spaceport. Shared commands and collisions, no teleport flight. */
export class AmbientTraffic {
  private readonly slots = new Map<string, TrafficSlot>();
  private readonly cooldowns = new Map<string, number>();
  private readonly point = new Vector3();
  private readonly direction = new Vector3();
  private readonly local = new Vector3();
  private readonly inverse = new Quaternion();
  readonly world: SystemRuntime;
  readonly simulation: CombatSimulation;
  readonly limit: number;
  constructor(world: SystemRuntime, simulation: CombatSimulation, limit = 3) {
    this.world = world;
    this.simulation = simulation;
    this.limit = Math.max(0, Math.min(3, Math.floor(limit)));
  }
  clear() {
    for (const id of this.slots.keys()) {
      this.simulation.stations?.remove(id);
      this.simulation.ships.delete(id);
    }
    this.slots.clear();
    this.cooldowns.clear();
  }
  update(dt: number, observers: readonly Readonly<Vector3>[]) {
    for (const [id, remaining] of this.cooldowns) {
      if (remaining <= dt) this.cooldowns.delete(id);
      else this.cooldowns.set(id, remaining - dt);
    }
    let nearest: StationDefinition | undefined,
      distance = 12000;
    for (const station of this.world.definition.stations ?? []) {
      if (station.type !== 'surface') continue;
      const pose = stationPose(this.world, station);
      for (const observer of observers) {
        const range = observer.distanceTo(pose.position);
        if (range < distance) {
          nearest = station;
          distance = range;
        }
      }
    }
    for (const [id, slot] of this.slots) {
      if (slot.ship.health.destroyed) this.cooldowns.set(id, 120);
      if (
        slot.station !== nearest ||
        slot.ship.health.destroyed ||
        !this.simulation.ships.has(id)
      ) {
        this.simulation.stations?.remove(id);
        this.simulation.ships.delete(id);
        this.slots.delete(id);
      }
    }
    if (!nearest) return;
    const pose = stationPose(this.world, nearest);
    for (let lane = 0; lane < Math.min(this.limit, nearest.ports.length); lane++) {
      const id = `traffic-${nearest.id}-${lane}`;
      if (this.slots.has(id) || this.cooldowns.has(id) || this.simulation.ships.size >= 42)
        continue;
      const angle = (lane * Math.PI * 2) / 3;
      this.point
        .set(Math.cos(angle) * 2200, 950 + lane * 250, Math.sin(angle) * 2200)
        .applyQuaternion(pose.orientation)
        .add(pose.position);
      if (
        observers.some((p) => p.distanceTo(this.point) < 1800) ||
        [...this.simulation.ships.values()].some((s) => s.position.distanceTo(this.point) < 150)
      )
        continue;
      const ship = new CombatShip(id, 'player', {
        ...PLAYER_SHIP,
        name: `${['Arrival', 'Transit', 'Departure'][lane]} courier`,
        flight: { ...PLAYER_SHIP.flight, maxSpeed: 95 },
      });
      ship.controller.relocate(this.point, pose.orientation);
      ship.controller.resolveMotion(this.point, pose.velocity);
      ship.sync();
      ship.previous.copy(ship.position);
      ship.previousOrientation.copy(ship.orientation);
      this.simulation.ships.set(id, ship);
      this.slots.set(id, { ship, station: nearest, waypoint: lane * 4, lane });
    }
    for (const slot of this.slots.values()) {
      const { ship, lane } = slot;
      const angle = (slot.waypoint * Math.PI) / 6;
      this.point
        .set(
          Math.cos(angle) * 2200,
          950 + lane * 250 + Math.sin(angle) * 120,
          Math.sin(angle) * 2200,
        )
        .applyQuaternion(pose.orientation)
        .add(pose.position);
      if (ship.position.distanceTo(this.point) < 400) slot.waypoint++;
      this.direction.subVectors(this.point, ship.position);
      this.inverse.copy(ship.orientation).invert();
      this.local.copy(this.direction).applyQuaternion(this.inverse);
      const input = ship.command.flight;
      input.yaw = MathUtils.clamp(Math.atan2(this.local.x, -this.local.z) * 2, -1, 1);
      input.pitch = MathUtils.clamp(
        Math.atan2(this.local.y, Math.hypot(this.local.x, this.local.z)) * 2,
        -1,
        1,
      );
      input.throttle = 0.6;
      input.brake = false;
      input.roll = 0;
      input.strafe = 0;
      input.lift = MathUtils.clamp(this.local.y / 120, -1, 1);
      ship.command.fire = false;
      // Yield to another craft ahead without directing either craft into a building or pad.
      for (const other of this.simulation.ships.values()) {
        if (
          other === ship ||
          other.health.destroyed ||
          other.position.distanceTo(ship.position) > 180
        )
          continue;
        this.local.subVectors(other.position, ship.position).applyQuaternion(this.inverse);
        if (this.local.z < 0 && Math.abs(this.local.x) < 70) {
          input.brake = true;
          input.throttle = 0;
          input.lift = 0.5;
        }
      }
    }
  }
}
