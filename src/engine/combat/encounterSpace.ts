import type { CombatSimulation } from './CombatSimulation';
import type { CombatShip } from './combatTypes';
/** These milestones retain orbital patrols; they do not create planetary or station traffic. */
export function encounterSpace(simulation: CombatSimulation, ship: CombatShip) {
  if (
    ship.health.destroyed ||
    ship.transferring ||
    ship.controller.flightLocked ||
    ship.controller.surface.phase !== 'flying'
  )
    return false;
  const world = simulation.environment?.world;
  if (!world) return true;
  for (const body of world.definition.bodies) {
    const center = world.positions.get(body.id);
    if (
      center &&
      ship.position.distanceTo(center) < body.radius + (body.atmosphere?.height ?? 1000) + 1500
    )
      return false;
  }
  for (const station of world.definition.stations ?? []) {
    const center = world.positions.get(station.id);
    if (center && ship.position.distanceTo(center) < 1500) return false;
  }
  return true;
}
