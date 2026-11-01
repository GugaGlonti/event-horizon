export interface PlanetaryFlightConfig {
  readonly gravityCompensation: number;
  readonly drag: number;
  readonly densitySpeedReduction: number;
  readonly handlingSpeed: number;
  readonly transitMultiplier: number;
  readonly transitRamp: number;
  readonly approachMaxSpeed: number;
  readonly approachBraking: number;
  readonly approachClearance: number;
  readonly gearPrecisionAltitude: number;
  readonly gearSlowAltitude: number;
  readonly gearJetSpeed: number;
  readonly landingVerticalSpeed: number;
  readonly landingGroundSpeed: number;
}
/** Shared authority/prediction tuning. F disables gravity compensation and gear leveling. */
export const PLANETARY_FLIGHT_CONFIG: Readonly<PlanetaryFlightConfig> = Object.freeze({
  gravityCompensation: 0.9,
  drag: 0.12,
  densitySpeedReduction: 0.22,
  handlingSpeed: 240,
  transitMultiplier: 33,
  transitRamp: 18000,
  approachMaxSpeed: 1400,
  approachBraking: 100,
  approachClearance: 300,
  gearPrecisionAltitude: 20,
  gearSlowAltitude: 120,
  gearJetSpeed: 2.2,
  landingVerticalSpeed: 3,
  landingGroundSpeed: 5,
});
