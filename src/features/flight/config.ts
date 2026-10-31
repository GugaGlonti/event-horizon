import type { FlightConfig } from '@/engine/simulation/flightTypes';

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
});

export const GAME_CONFIG = {
  fixedStep: 1 / 120,
  maxFrameTime: 0.1,
  maxSteps: 12,
  telemetryInterval: 0.1,
  navigationKeys: { galaxy: 'KeyM', local: 'KeyL', nextTarget: 'KeyT', clearTarget: 'KeyX' },
  input: { mouseSensitivity: 0.003, mouseReturnRate: 2.8 },
  camera: {
    chaseOffset: [0, 3.2, 12] as const,
    narrowScreenAspect: 0.9,
    cockpitOffset: [0, 0.8, -1.8] as const,
    positionDamping: 7,
    rotationDamping: 5,
    fovDamping: 4,
    chaseFov: 62,
    cockpitFov: 78,
    speedFov: 12,
    hyperspaceFov: 28,
    hyperspaceVibration: 0.035,
    near: 0.1,
    far: 65000,
  },
  environment: {
    starRadius: 18000,
    starSize: 9,
  },
} as const;
