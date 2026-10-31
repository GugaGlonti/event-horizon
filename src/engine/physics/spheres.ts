import { Vector3 } from 'three';

/** Earliest contact between a relative segment and a sphere, including initial overlap. */
export function sweepSphere(
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  radius: number,
): number | null {
  const c = x * x + y * y + z * z - radius * radius;
  const b = x * dx + y * dy + z * dz;
  if (c <= 0) return c < -0.000001 || b < -0.000001 ? 0 : null;
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-18 || b >= 0) return null;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const t = c / (-b + Math.sqrt(discriminant));
  return t >= 0 && t <= 1 ? t : null;
}

export interface SphereBody {
  readonly id: string;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly radius: number;
  readonly layer: number;
  readonly mask: number;
  /** Zero means an infinite-mass environment collider. */
  readonly inverseMass: number;
}

/** Bit masks keep projectile contacts separate from physical impulse contacts. */
export const COLLISION_LAYERS = { ship: 1, environment: 2, projectile: 4 } as const;
export function collides(layer: number, mask: number, otherLayer: number, otherMask: number) {
  return (layer & otherMask) !== 0 && (otherLayer & mask) !== 0;
}

/** Reuses caller-owned body positions/velocities. All bodies advance together to each TOI. */
export class SphereSolver {
  private readonly normal = new Vector3();

  solve(
    bodies: readonly SphereBody[],
    dt: number,
    onImpact: (a: SphereBody, b: SphereBody, speed: number) => void,
  ) {
    let remaining = dt;
    // A bounded conservative fallback freezes remaining travel in an unusually crowded pileup.
    for (let iteration = 0; iteration < 24 && remaining > 1e-10; iteration++) {
      let first = 1;
      let hitA: SphereBody | null = null;
      let hitB: SphereBody | null = null;
      for (let aIndex = 0; aIndex < bodies.length; aIndex++) {
        const a = bodies[aIndex];
        if (!a) continue;
        for (let bIndex = aIndex + 1; bIndex < bodies.length; bIndex++) {
          const b = bodies[bIndex];
          if (
            !b ||
            a.inverseMass + b.inverseMass === 0 ||
            !collides(a.layer, a.mask, b.layer, b.mask)
          )
            continue;
          const t = sweepSphere(
            a.position.x - b.position.x,
            a.position.y - b.position.y,
            a.position.z - b.position.z,
            (a.velocity.x - b.velocity.x) * remaining,
            (a.velocity.y - b.velocity.y) * remaining,
            (a.velocity.z - b.velocity.z) * remaining,
            a.radius + b.radius,
          );
          if (t !== null && t <= first) {
            first = t;
            hitA = a;
            hitB = b;
          }
        }
      }
      for (const body of bodies) body.position.addScaledVector(body.velocity, remaining * first);
      remaining *= 1 - first;
      if (!hitA || !hitB) break;
      this.normal.subVectors(hitA.position, hitB.position);
      const distance = this.normal.length();
      if (distance < 1e-10) this.normal.set(1, 0, 0);
      else this.normal.divideScalar(distance);
      const inverseMass = hitA.inverseMass + hitB.inverseMass;
      const separation = Math.max(0, hitA.radius + hitB.radius - distance) + 0.001;
      hitA.position.addScaledVector(this.normal, (separation * hitA.inverseMass) / inverseMass);
      hitB.position.addScaledVector(this.normal, (-separation * hitB.inverseMass) / inverseMass);
      const closing = -(
        (hitA.velocity.x - hitB.velocity.x) * this.normal.x +
        (hitA.velocity.y - hitB.velocity.y) * this.normal.y +
        (hitA.velocity.z - hitB.velocity.z) * this.normal.z
      );
      if (closing > 0) {
        const impulse = (1.15 * closing) / inverseMass;
        hitA.velocity.addScaledVector(this.normal, impulse * hitA.inverseMass);
        hitB.velocity.addScaledVector(this.normal, -impulse * hitB.inverseMass);
        onImpact(hitA, hitB, closing);
      }
    }
  }
}
