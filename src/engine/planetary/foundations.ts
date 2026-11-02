import type { SettlementDefinition } from './environmentTypes';

/** Shared irregular boundary; its 1.28x shoulder remains inside the 1.3x broad-phase bound. */
export function foundationRadius(city: SettlementDefinition, angle: number) {
  const phase = (city.seed % 1024) * 0.006135923;
  return (
    city.radius * (0.92 + Math.sin(angle * 3 + phase) * 0.04 + Math.sin(angle * 5 - phase) * 0.035)
  );
}
