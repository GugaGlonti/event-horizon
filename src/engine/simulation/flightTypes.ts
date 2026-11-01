/** Metres, seconds, radians. Local forward is -Z, up is +Y, right is +X. */
export interface FlightInput {
  pitch: number;
  yaw: number;
  roll: number;
  /** Requested throttle, 0..1; stored engine power approaches it gradually. */
  throttle: number;
  boost: boolean;
  /** Slows velocity and lowers stored throttle; yields to reverse at zero stored throttle. */
  brake: boolean;
  strafe: number;
  lift: number;
  /** Bounded reverse thrust once requested and stored throttle are both zero. */
  reverse: boolean;
}

export interface FlightConfig {
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly brakeDeceleration: number;
  readonly throttleRate: number;
  readonly boostMaxSpeed: number;
  readonly boostAcceleration: number;
  readonly boostDeceleration: number;
  readonly boostDrain: number;
  readonly boostRecharge: number;
  readonly boostRechargeDelay: number;
  readonly boostMinimumCharge: number;
  readonly angularAcceleration: readonly [number, number, number];
  readonly maxAngularSpeed: readonly [number, number, number];
  readonly assistedAngularDamping: number;
  readonly unassistedAngularDamping: number;
  readonly lateralDamping: number;
  readonly strafeAcceleration: number;
  readonly strafeMaxSpeed: number;
  readonly reverseMaxSpeed: number;
}

/** Scalar snapshots cannot mutate the simulation's vectors or quaternion. */
export interface FlightTelemetry {
  readonly speed: number;
  readonly throttle: number;
  readonly boostCharge: number;
  readonly boostReady: boolean;
  readonly boosting: boolean;
  readonly heading: number;
  readonly pitch: number;
  readonly assistance: boolean;
  readonly distance: number;
}

export function createFlightInput(): FlightInput {
  return {
    pitch: 0,
    yaw: 0,
    roll: 0,
    throttle: 0,
    boost: false,
    brake: false,
    strafe: 0,
    lift: 0,
    reverse: false,
  };
}
