import type { PlanetaryFlightConfig } from './config';

/** Braking envelope for high-speed approach; ordinary close-range piloting remains available. */
export function approachSpeedLimit(
  clearance: number,
  ordinarySpeed: number,
  config: Readonly<PlanetaryFlightConfig>,
) {
  return Math.min(
    config.approachMaxSpeed,
    Math.sqrt(
      ordinarySpeed ** 2 +
        2 * config.approachBraking * Math.max(0, clearance - config.approachClearance),
    ),
  );
}
