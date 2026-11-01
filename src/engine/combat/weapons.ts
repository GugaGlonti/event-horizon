import { Vector3 } from '@/engine/math/linear';
import type { CombatShip } from './combatTypes';

/** A selected hostile must be alive, in range and within the forward acquisition cone. */
export function missileCanLock(ship: CombatShip, target: CombatShip | undefined) {
  if (!target || (target.team === ship.team && ship.team !== 'player') || target.health.destroyed)
    return false;
  const offset = new Vector3().subVectors(target.position, ship.position);
  const distance = offset.length();
  if (distance < 1e-6 || distance > ship.config.missile.lockRange) return false;
  const forward = new Vector3(0, 0, -1).applyQuaternion(ship.orientation);
  return offset.divideScalar(distance).dot(forward) >= Math.cos(ship.config.missile.lockAngle);
}

/** Even disk coverage with a central pellet; deterministic across command replays. */
export function flakDirection(
  index: number,
  pellets: number,
  spreadAngle: number,
  phase: number,
  out: Vector3,
) {
  if (index === 0) return out.set(0, 0, -1);
  const radius = Math.tan(spreadAngle) * Math.sqrt(index / Math.max(1, pellets - 1));
  const angle = index * 2.399963229728653 + phase;
  return out.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -1).normalize();
}
