import { MathUtils, Quaternion, Vector3 } from 'three';
import type { FlightConfig, FlightInput, FlightTelemetry } from './flightTypes';

function approach(current: number, target: number, amount: number) {
  return current + MathUtils.clamp(target - current, -amount, amount);
}

function angularRate(
  current: number,
  input: number,
  limit: number,
  acceleration: number,
  damping: number,
  dt: number,
) {
  return Math.abs(input) > 0.001
    ? approach(current, MathUtils.clamp(input, -1, 1) * limit, acceleration * dt)
    : current * Math.exp(-damping * dt);
}

/** No React, browser, rendering, global store, clock, or randomness dependency. */
export class FlightController {
  private readonly config: FlightConfig;
  private readonly position = new Vector3();
  private readonly velocity = new Vector3();
  private readonly orientation = new Quaternion();
  private readonly angularVelocity = new Vector3();
  private readonly forward = new Vector3();
  private readonly lateral = new Vector3();
  private readonly rotationAxis = new Vector3();
  private readonly rotation = new Quaternion();
  private throttle = 0;
  private boostCharge = 1;
  private boostDelay = 0;
  private boostExhausted = false;
  private boosting = false;
  private assistance = true;
  private distance = 0;

  constructor(config: FlightConfig) {
    this.config = config;
  }

  get speed() {
    return this.velocity.length();
  }
  get enginePower() {
    return this.throttle;
  }
  get isBoosting() {
    return this.boosting;
  }

  setAssistance(enabled: boolean) {
    this.assistance = enabled;
  }

  reset() {
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.orientation.identity();
    this.angularVelocity.set(0, 0, 0);
    this.throttle = 0;
    this.boostCharge = 1;
    this.boostDelay = 0;
    this.boostExhausted = false;
    this.boosting = false;
    this.distance = 0;
  }

  copyTransform(position: Vector3, orientation: Quaternion) {
    position.copy(this.position);
    orientation.copy(this.orientation);
  }

  step(input: Readonly<FlightInput>, dt: number) {
    if (!Number.isFinite(dt) || dt < 0)
      throw new RangeError('Flight dt must be finite and nonnegative.');
    if (dt === 0) return;
    const config = this.config;
    const previousSpeed = this.speed;
    this.throttle = MathUtils.clamp(
      this.throttle + MathUtils.clamp(input.throttle, -1, 1) * config.throttleRate * dt,
      0,
      1,
    );

    if (!input.boost && this.boostCharge >= config.boostMinimumCharge) this.boostExhausted = false;
    this.boosting =
      input.boost &&
      !input.brake &&
      this.throttle > 0 &&
      !this.boostExhausted &&
      this.boostCharge > 0;
    if (this.boosting) {
      this.boostCharge = Math.max(0, this.boostCharge - config.boostDrain * dt);
      this.boostDelay = config.boostRechargeDelay;
      if (this.boostCharge === 0) this.boostExhausted = true;
    } else {
      this.boostDelay = Math.max(0, this.boostDelay - dt);
      if (this.boostDelay === 0)
        this.boostCharge = Math.min(1, this.boostCharge + config.boostRecharge * dt);
    }

    const damping = this.assistance
      ? config.assistedAngularDamping
      : config.unassistedAngularDamping;
    const acceleration = config.angularAcceleration;
    const limit = config.maxAngularSpeed;
    this.angularVelocity.set(
      angularRate(this.angularVelocity.x, input.pitch, limit[0], acceleration[0], damping, dt),
      angularRate(this.angularVelocity.y, -input.yaw, limit[1], acceleration[1], damping, dt),
      angularRate(this.angularVelocity.z, -input.roll, limit[2], acceleration[2], damping, dt),
    );
    const angularSpeed = this.angularVelocity.length();
    if (angularSpeed > 0) {
      this.rotationAxis.copy(this.angularVelocity).divideScalar(angularSpeed);
      this.rotation.setFromAxisAngle(this.rotationAxis, angularSpeed * dt);
      this.orientation.multiply(this.rotation).normalize();
    }

    this.forward.set(0, 0, -1).applyQuaternion(this.orientation);
    const forwardSpeed = this.velocity.dot(this.forward);
    if (this.assistance) {
      this.lateral.copy(this.velocity).addScaledVector(this.forward, -forwardSpeed);
      this.velocity.addScaledVector(this.lateral, Math.expm1(-config.lateralDamping * dt));
    }
    if (input.brake) {
      const speed = this.speed;
      if (speed > 0)
        this.velocity.multiplyScalar(Math.max(0, speed - config.brakeDeceleration * dt) / speed);
    } else {
      const targetSpeed = this.throttle * (this.boosting ? config.boostMaxSpeed : config.maxSpeed);
      const thrust = MathUtils.clamp(
        targetSpeed - forwardSpeed,
        this.assistance ? -config.deceleration * dt : 0,
        (this.boosting ? config.boostAcceleration : config.acceleration) * dt,
      );
      this.velocity.addScaledVector(this.forward, thrust);
    }
    // Boost exit sheds excess speed progressively; normal thrust cannot exceed maxSpeed.
    const speedLimit = this.boosting
      ? config.boostMaxSpeed
      : Math.max(config.maxSpeed, previousSpeed - config.boostDeceleration * dt);
    this.velocity.clampLength(0, speedLimit);
    this.position.addScaledVector(this.velocity, dt);
    this.distance += this.speed * dt;
  }

  getTelemetry(): FlightTelemetry {
    this.forward.set(0, 0, -1).applyQuaternion(this.orientation);
    return {
      speed: this.speed,
      throttle: this.throttle,
      boostCharge: this.boostCharge,
      boostReady: !this.boostExhausted && this.boostCharge > 0,
      boosting: this.boosting,
      assistance: this.assistance,
      distance: this.distance,
      heading: (Math.atan2(this.forward.x, -this.forward.z) * MathUtils.RAD2DEG + 360) % 360,
      pitch: Math.asin(MathUtils.clamp(this.forward.y, -1, 1)) * MathUtils.RAD2DEG,
    };
  }
}
