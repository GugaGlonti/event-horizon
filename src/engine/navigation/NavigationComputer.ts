import { Quaternion, Vector3 } from '@/engine/math/linear';
import type { SystemRuntime } from '@/engine/world/SystemRuntime';
import { navigationContacts } from './contacts';

export interface NavigationSnapshot {
  readonly targetId: string | null;
  readonly distance: number;
  readonly surfaceDistance: number;
  readonly bearingX: number;
  readonly bearingY: number;
  readonly behind: boolean;
  readonly aligned: boolean;
  readonly nearestId: string | null;
  readonly nearestDistance: number;
}

export class NavigationComputer {
  targetId: string | null = null;
  private readonly direction = new Vector3();
  private readonly inverse = new Quaternion();

  select(id: string | null, system: SystemRuntime) {
    if (id !== null && !system.positions.has(id)) return false;
    this.targetId = id;
    return true;
  }

  cycle(system: SystemRuntime) {
    const bodies = navigationContacts(system.definition).filter((body) => body.kind !== 'star');
    const index = bodies.findIndex((body) => body.id === this.targetId);
    this.targetId = bodies[(index + 1) % bodies.length]?.id ?? null;
  }

  sample(
    system: SystemRuntime,
    position: Readonly<Vector3>,
    orientation: Readonly<Quaternion>,
  ): NavigationSnapshot {
    let nearestId: string | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const body of navigationContacts(system.definition)) {
      const location = system.positions.get(body.id);
      if (!location) continue;
      const distance = Math.max(0, position.distanceTo(location) - body.radius);
      if (distance < nearestDistance) {
        nearestId = body.id;
        nearestDistance = distance;
      }
    }
    const target = system.positions.get(this.targetId ?? '');
    const body = navigationContacts(system.definition).find(
      (candidate) => candidate.id === this.targetId,
    );
    const distance = target ? position.distanceTo(target) : 0;
    this.direction
      .copy(target ?? position)
      .sub(position)
      .normalize();
    this.inverse.copy(orientation).invert();
    this.direction.applyQuaternion(this.inverse);
    const denominator = Math.max(0.12, -this.direction.z);
    let x = this.direction.x / denominator;
    let y = -this.direction.y / denominator;
    const edge = Math.max(1, Math.abs(x), Math.abs(y));
    x /= edge;
    y /= edge;
    if (this.direction.z > 0 && Math.abs(x) + Math.abs(y) < 0.001) x = 1;
    return {
      targetId: this.targetId,
      distance,
      surfaceDistance: Math.max(0, distance - (body?.radius ?? 0)),
      bearingX: x,
      bearingY: y,
      behind: this.direction.z > 0,
      aligned: Boolean(target) && this.direction.z < -0.995,
      nearestId,
      nearestDistance,
    };
  }
}
