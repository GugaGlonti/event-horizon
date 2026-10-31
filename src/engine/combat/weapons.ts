import { Vector3 } from 'three';
import type { CombatShip } from './combatTypes';

/** A selected hostile must be alive, in range and within the forward acquisition cone. */
export function missileCanLock(ship: CombatShip, target: CombatShip | undefined) {
  if (!target || target.team === ship.team || target.health.destroyed) return false;
  const offset = new Vector3().subVectors(target.position, ship.position);
  const distance = offset.length();
  if (distance < 1e-6 || distance > ship.config.missile.lockRange) return false;
  const forward = new Vector3(0, 0, -1).applyQuaternion(ship.orientation);
  return offset.divideScalar(distance).dot(forward) >= Math.cos(ship.config.missile.lockAngle);
}
