import { Vector3 } from 'three';
import { validateSystem } from './validateSystem';
import type { CelestialDefinition, Position3, StarSystemDefinition } from './worldTypes';

/** Pure analytical orbits: identical system/time produces identical positions, regardless of FPS. */
export function orbitalOffset(
  orbit: NonNullable<CelestialDefinition['orbit']>,
  time: number,
  out: Vector3,
) {
  const angle = orbit.phase + ((time % orbit.period) / orbit.period) * Math.PI * 2;
  return out.set(
    Math.cos(angle) * orbit.radius,
    Math.sin(angle) * orbit.radius * Math.sin(orbit.inclination),
    Math.sin(angle) * orbit.radius * Math.cos(orbit.inclination),
  );
}

/** CPU-only system state. Parent relationships are sorted once; vectors are reused. */
export class SystemRuntime {
  readonly definition: StarSystemDefinition;
  readonly positions = new Map<string, Vector3>();
  private readonly ordered: CelestialDefinition[] = [];
  time = 0;

  constructor(definition: StarSystemDefinition, time = 0) {
    validateSystem(definition);
    this.definition = definition;
    const visit = (body: CelestialDefinition) => {
      if (this.positions.has(body.id)) return;
      if (body.parentId) {
        const parent = definition.bodies.find((candidate) => candidate.id === body.parentId);
        if (parent) visit(parent);
      }
      this.positions.set(body.id, new Vector3());
      this.ordered.push(body);
    };
    for (const body of definition.bodies) visit(body);
    this.update(time);
  }

  update(time: number) {
    if (!Number.isFinite(time) || time < 0)
      throw new RangeError('System time must be finite and nonnegative.');
    this.time = time;
    for (const body of this.ordered) {
      const position = this.positions.get(body.id);
      if (!position) continue;
      if (body.orbit) orbitalOffset(body.orbit, time, position);
      else position.fromArray(body.position ?? [0, 0, 0]);
      if (body.parentId) {
        const parent = this.positions.get(body.parentId);
        if (parent) position.add(parent);
      }
    }
  }

  arrival(spawnId = this.definition.arrivalId): {
    position: Position3;
    orientation: readonly [number, number, number, number];
  } {
    const spawn = this.definition.spawns.find((candidate) => candidate.id === spawnId);
    const anchor = spawn && this.positions.get(spawn.bodyId);
    if (!spawn || !anchor) throw new Error('Unknown arrival point.');
    const position = anchor.clone().add(new Vector3().fromArray(spawn.offset));
    // A moving moon may cross a configured arrival. Move above the entire local system if necessary.
    if (
      this.definition.bodies.some(
        (body) => position.distanceTo(this.positions.get(body.id) ?? position) < body.radius + 100,
      )
    ) {
      let ceiling = position.y;
      for (const body of this.definition.bodies)
        ceiling = Math.max(ceiling, (this.positions.get(body.id)?.y ?? 0) + body.radius + 500);
      position.y = ceiling;
    }
    return {
      position: position.toArray() as [number, number, number],
      orientation: spawn.orientation,
    };
  }
}
