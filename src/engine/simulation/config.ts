import type { FlightConfig } from '@/engine/simulation/flightTypes';

/** Fractions of one rechargeable reserve, shared by combat systems and boost. */
export const FLIGHT_MODE_CONFIG = Object.freeze({
  combatBraking: 600,
  shieldUpkeep: 0.02,
  shieldRegenerationCost: 0.004,
  weaponCost: { 1: 0.04, 2: 0.18, 3: 0.3, 4: 0.12 },
});

export const FLIGHT_CONFIG: FlightConfig = Object.freeze({
  maxSpeed: 180,
  acceleration: 45,
  deceleration: 28,
  brakeDeceleration: 95,
  throttleRate: 0.35,
  boostMaxSpeed: 360,
  boostAcceleration: 100,
  boostDeceleration: 70,
  boostDrain: 0.25,
  boostRecharge: 0.14,
  boostRechargeDelay: 1.2,
  boostMinimumCharge: 0.18,
  angularAcceleration: [2.4, 2, 3] as const,
  maxAngularSpeed: [0.9, 0.75, 1.5] as const,
  assistedAngularDamping: 5,
  unassistedAngularDamping: 0.12,
  lateralDamping: 2.2,
  strafeAcceleration: 65,
  strafeMaxSpeed: 65,
  reverseMaxSpeed: 60,
});
