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

export function gearTranslationSpeed(
  altitude: number,
  ordinarySpeed: number,
  config: Readonly<PlanetaryFlightConfig>,
) {
  const t = Math.max(
    0,
    Math.min(
      1,
      (altitude - config.gearPrecisionAltitude) /
        (config.gearSlowAltitude - config.gearPrecisionAltitude),
    ),
  );
  return config.gearJetSpeed + (ordinarySpeed - config.gearJetSpeed) * t;
}

export function surfaceDescentSpeed(
  clearance: number,
  gear: boolean,
  config: Readonly<PlanetaryFlightConfig>,
) {
  const speed = descentSpeedLimit(clearance, config);
  return gear && clearance + 5 < config.gearSlowAltitude
    ? Math.min(speed, gearTranslationSpeed(clearance + 5, config.descentFinalSpeed, config))
    : speed;
}

/** Bounded quadrature of the shared V descent profile; includes ramp-up and contact settling. */
export function descentEta(
  clearance: number,
  downSpeed: number,
  gear: boolean,
  config: Readonly<PlanetaryFlightConfig>,
) {
  if (!Number.isFinite(clearance) || clearance < 0 || downSpeed <= 0.5) return null;
  let seconds = 0;
  for (let i = 0; i < 64; i++) {
    const low = clearance * (i / 64) ** 3,
      high = clearance * ((i + 1) / 64) ** 3;
    seconds += (high - low) / surfaceDescentSpeed((low + high) / 2, gear, config);
  }
  return (
    seconds +
    Math.max(0, surfaceDescentSpeed(clearance, gear, config) - downSpeed) /
      (2 * config.descentAcceleration) +
    0.8
  );
}
