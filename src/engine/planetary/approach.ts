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

/** Metres above gear contact, not the reference sphere. Smooth approach-to-touchdown speeds. */
export function descentSpeedLimit(clearance: number, config: Readonly<PlanetaryFlightConfig>) {
  if (clearance <= config.descentFinalAltitude)
    return (
      config.gearJetSpeed +
      (config.descentFinalSpeed - config.gearJetSpeed) *
        Math.sqrt(Math.max(0, clearance - 4) / (config.descentFinalAltitude - 4))
    );
  return Math.min(
    config.descentMaxSpeed,
    Math.sqrt(
      config.descentFinalSpeed ** 2 +
        2 * config.descentBraking * (clearance - config.descentFinalAltitude),
    ),
  );
}
