import type { Vector3 } from 'three';

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
  if (Math.abs(a) < 1e-8) return b < 0 ? Math.min(maxTime, -c / b) : 0;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  const root = Math.sqrt(discriminant);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  const t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
  return Number.isFinite(t) && t <= maxTime ? t : 0;
}
