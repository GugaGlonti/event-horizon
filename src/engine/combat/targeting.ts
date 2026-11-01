import type { Vector3 } from 'three';
import type { CombatShip } from './combatTypes';

export interface TargetingConfig {
  readonly range: number;
  readonly aheadAngle: number;
}

export function validTarget(ship: CombatShip, player: CombatShip, range: number) {
  return (
    ship.team !== player.team &&
    !ship.health.destroyed &&
    ship.position.distanceToSquared(player.position) <= range * range
  );
}

/** Selection uses logical positions and the ship's nose, independently of either camera. */
export function nearestAhead(
  ships: Iterable<CombatShip>,
  player: CombatShip,
  forward: Readonly<Vector3>,
  config: TargetingConfig,
) {
  let selected: string | null = null;
  let nearest = Infinity;
  const cone = Math.cos(config.aheadAngle);
  for (const ship of ships) {
    if (!validTarget(ship, player, config.range)) continue;
    const x = ship.position.x - player.position.x;
    const y = ship.position.y - player.position.y;
    const z = ship.position.z - player.position.z;
    const distance = x * x + y * y + z * z;
    if (
      distance < nearest &&
      distance > 1e-12 &&
      (x * forward.x + y * forward.y + z * forward.z) / Math.sqrt(distance) >= cone
    ) {
      nearest = distance;
      selected = ship.id;
    }
  }
  return selected;
}

/** Constant-velocity intercept; projectile inherits the shooter's velocity. */
export function leadTime(
  relativePosition: Readonly<Vector3>,
  relativeVelocity: Readonly<Vector3>,
  projectileSpeed: number,
  maxTime: number,
) {
  const a = relativeVelocity.lengthSq() - projectileSpeed ** 2;
  const b = 2 * relativePosition.dot(relativeVelocity);
  const c = relativePosition.lengthSq();
  if (projectileSpeed <= 0 || maxTime <= 0 || c < 1e-12) return 0;
  if (Math.abs(a) < 1e-8) {
    const time = b < 0 ? -c / b : 0;
    return time > 0 && time <= maxTime ? time : 0;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  const root = Math.sqrt(discriminant);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  const t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
  return Number.isFinite(t) && t <= maxTime ? t : 0;
}
