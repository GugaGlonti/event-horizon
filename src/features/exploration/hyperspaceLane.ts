import type { StarSystemDefinition } from '@/engine/world/worldTypes';

type LaneSystem = Pick<StarSystemDefinition, 'id' | 'name' | 'galacticPosition'>;

/** Route-relative galactic coordinates: departure 0, arrival 1, perpendicular context alongside. */
export function projectHyperspaceLane(
  source: LaneSystem,
  destination: LaneSystem,
  systems: readonly LaneSystem[],
) {
  const origin = source.galacticPosition;
  const dx = destination.galacticPosition[0] - origin[0];
  const dy = destination.galacticPosition[1] - origin[1];
  const dz = destination.galacticPosition[2] - origin[2];
  const distance = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(distance) || distance < 1e-9) return null;
  const horizontal = Math.hypot(dx, dz);
  const sideX = horizontal > 1e-9 ? -dz / horizontal : Math.sign(dy);
  const sideZ = horizontal > 1e-9 ? dx / horizontal : 0;
  return systems.map((system) => {
    const x = system.galacticPosition[0] - origin[0];
    const y = system.galacticPosition[1] - origin[1];
    const z = system.galacticPosition[2] - origin[2];
    return {
      id: system.id,
      name: system.name,
      along: (x * dx + y * dy + z * dz) / (distance * distance),
      across: (x * sideX + z * sideZ) / distance,
    };
  });
}

/** Distance progress, independent of charge time, entry animation and arrival readiness waits. */
export function hyperspaceLaneProgress(traveled: number, distance: number) {
  if (!Number.isFinite(traveled) || !Number.isFinite(distance) || distance <= 0) return 0;
  return Math.max(0, Math.min(1, traveled / distance));
}
