import type { CombatSimulation } from '@/engine/combat/CombatSimulation';
export type GameplayAction =
  | { kind: 'landing-gear'; enabled: boolean }
  | { kind: 'transit'; enabled: boolean }
  | { kind: 'landing-assist'; zoneId: string | null }
  | { kind: 'takeoff' }
  | { kind: 'dock'; stationId: string; portId?: string | undefined }
  | { kind: 'capture' }
  | { kind: 'cancel-docking' }
  | { kind: 'undock' }
  | { kind: 'service'; service: 'repair' | 'shields' | 'weapons' };
/** The same intention validation is used by offline composition and the room authority. */
export function performGameplayAction(
  simulation: CombatSimulation,
  id: string,
  action: GameplayAction,
): string | null {
  const ship = simulation.ships.get(id),
    stations = simulation.stations;
  if (!ship || ship.health.destroyed || ship.transferring) return 'Ship is unavailable.';
  switch (action.kind) {
    case 'landing-gear':
      if (
        !['flying', 'approaching'].includes(ship.controller.surface.phase) ||
        ship.controller.flightLocked
      )
        return 'Gear is locked during landing or docking.';
      ship.controller.landingGear = action.enabled;
      if (!action.enabled) ship.controller.landingAssist = null;
      if (action.enabled && ship.controller.transit) ship.controller.transit = false;
      return null;
    case 'landing-assist':
      if (stations && stations.state(id).phase !== 'undocked')
        return 'Cancel docking before landing assistance.';
      return ship.controller.requestLandingAssist(action.zoneId);
    case 'transit':
      if (
        ship.controller.landingGear ||
        ship.controller.surface.phase !== 'flying' ||
        stations?.state(id).phase !== 'undocked'
      )
        return 'Retract gear and clear docking before transit.';
      if (
        action.enabled &&
        [...simulation.ships.values()].some(
          (other) =>
            other !== ship &&
            !other.health.destroyed &&
            other.position.distanceTo(ship.position) < 1000,
        )
      )
        return 'Clear nearby traffic before transit.';
      ship.controller.transit = action.enabled;
      return null;
    case 'takeoff':
      if (
        [...simulation.ships.values()].some(
          (other) =>
            other !== ship &&
            !other.health.destroyed &&
            other.position.distanceTo(ship.position) < 35,
        )
      )
        return 'Takeoff clearance obstructed.';
      return ship.controller.requestTakeoff() ? null : 'Takeoff requires a landed ship.';
    case 'dock':
      if (ship.controller.landingAssist) return 'Cancel landing assistance before docking.';
      return stations
        ? stations.request(id, action.stationId, action.portId)
        : 'Docking unavailable.';
    case 'capture':
      return stations ? stations.assist(id) : 'Docking unavailable.';
    case 'cancel-docking':
      return stations?.cancel(id) ? null : 'Undock to release this berth.';
    case 'undock':
      return stations ? stations.undock(id) : 'Docking unavailable.';
    case 'service':
      return stations ? stations.service(id, action.service) : 'Docking unavailable.';
  }
}
