import { MathUtils, Quaternion, Vector3 } from '@/engine/math/linear';
import {
  approachSpeedLimit,
  gearTranslationSpeed,
  surfaceDescentSpeed,
} from '@/engine/planetary/approach';
import { PLANETARY_FLIGHT_CONFIG, type PlanetaryFlightConfig } from '@/engine/planetary/config';
import { tangentFrame } from '@/engine/planetary/coordinates';
import { type PlanetaryEnvironment, SurfaceSample } from '@/engine/planetary/PlanetaryEnvironment';
import { createSurfaceState } from '@/engine/planetary/planetTypes';
import { terrainHeight } from '@/engine/planetary/terrain';
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
  environment: PlanetaryEnvironment | null = null;
  readonly surface = createSurfaceState();
  landingGear = false;
  landingAssist: string | null = null;
  transit = false;
  flightLocked = false;
  impactSpeed = 0;
  landingClearance = true;
  private readonly surfaceSample = new SurfaceSample();
  private readonly motionStart = new Vector3();
  private readonly config: FlightConfig;
  readonly planetaryConfig: Readonly<PlanetaryFlightConfig>;
  private readonly position = new Vector3();
  private readonly velocity = new Vector3();
  private readonly orientation = new Quaternion();
  private readonly angularVelocity = new Vector3();
  private readonly forward = new Vector3();
  private readonly lateral = new Vector3();
  private readonly translation = new Vector3();
  private readonly rotationAxis = new Vector3();
  private readonly rotation = new Quaternion();
  private throttle = 0;
  private boostCharge = 1;
  private boostDelay = 0;
  private boostExhausted = false;
  private boosting = false;
  private assistance = true;
  private distance = 0;

  constructor(
    config: FlightConfig,
    planetaryConfig: Readonly<PlanetaryFlightConfig> = PLANETARY_FLIGHT_CONFIG,
  ) {
    this.config = config;
    this.planetaryConfig = planetaryConfig;
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
    Object.assign(this.surface, createSurfaceState());
    this.landingGear = this.transit = false;
    this.landingAssist = null;
    this.flightLocked = false;
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

  copyTransform(
    position: { set(x: number, y: number, z: number): unknown },
    orientation: { set(x: number, y: number, z: number, w: number): unknown },
  ) {
    position.set(this.position.x, this.position.y, this.position.z);
    orientation.set(this.orientation.x, this.orientation.y, this.orientation.z, this.orientation.w);
  }

  copyVelocity(out: Vector3) {
    return out.copy(this.velocity);
  }

  /** Detached authoritative state for transport/debugging; never sampled at render frequency. */
  snapshot() {
    return {
      position: this.position.toArray(),
      velocity: this.velocity.toArray(),
      orientation: this.orientation.toArray(),
      angularVelocity: this.angularVelocity.toArray(),
      throttle: this.throttle,
      boostCharge: this.boostCharge,
      boostDelay: this.boostDelay,
      boostExhausted: this.boostExhausted,
      boosting: this.boosting,
      assistance: this.assistance,
      distance: this.distance,
      surface: {
        ...this.surface,
        anchor: this.surface.anchor ? ([...this.surface.anchor] as [number, number, number]) : null,
      },
      landingGear: this.landingGear,
      landingAssist: this.landingAssist,
      transit: this.transit,
      flightLocked: this.flightLocked,
    };
  }

  restore(state: ReturnType<FlightController['snapshot']>) {
    this.position.fromArray(state.position);
    this.velocity.fromArray(state.velocity);
    this.orientation.fromArray(state.orientation);
    if (Math.abs(this.orientation.lengthSq() - 1) > 1e-10) this.orientation.normalize();
    this.angularVelocity.fromArray(state.angularVelocity);
    this.throttle = state.throttle;
    this.boostCharge = state.boostCharge;
    this.boostDelay = state.boostDelay;
    this.boostExhausted = state.boostExhausted;
    this.boosting = state.boosting;
    this.assistance = state.assistance;
    this.distance = state.distance;
    Object.assign(this.surface, state.surface);
    this.landingGear = state.landingGear;
    this.landingAssist = state.landingAssist;
    this.transit = state.transit;
    this.flightLocked = state.flightLocked;
  }

  /** Collision solver handoff; never resets engine reserve or orientation. */
  resolveMotion(position: Readonly<Vector3>, velocity: Readonly<Vector3>) {
    this.position.copy(position);
    this.velocity.copy(velocity);
  }

  /** Safe handoff: preserve reserve/assist/distance, optionally retaining bounded forward cruise. */
  relocate(position: Readonly<Vector3>, orientation: Readonly<Quaternion>, forwardSpeed = 0) {
    if (
      ![
        position.x,
        position.y,
        position.z,
        orientation.x,
        orientation.y,
        orientation.z,
        orientation.w,
      ].every(Number.isFinite) ||
      orientation.lengthSq() < 0.001 ||
      !Number.isFinite(forwardSpeed) ||
      forwardSpeed < 0 ||
      forwardSpeed > this.config.maxSpeed
    ) {
      throw new RangeError('Arrival pose must be finite with a nonzero quaternion.');
    }
    this.position.copy(position);
    this.orientation.copy(orientation).normalize();
    this.velocity.set(0, 0, -forwardSpeed).applyQuaternion(this.orientation);
    this.angularVelocity.set(0, 0, 0);
    this.throttle = forwardSpeed / this.config.maxSpeed;
    this.boosting = false;
    Object.assign(this.surface, createSurfaceState());
    this.transit = false;
    this.landingAssist = null;
    this.flightLocked = false;
  }

  lockPose(
    position: Readonly<Vector3>,
    orientation: Readonly<Quaternion>,
    velocity?: Readonly<Vector3>,
  ) {
    this.flightLocked = true;
    this.landingAssist = null;
    this.position.copy(position);
    this.orientation.copy(orientation);
    if (velocity) this.velocity.copy(velocity);
    else this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.throttle = 0;
    this.boosting = false;
  }

  requestTakeoff() {
    if (this.surface.phase !== 'landed') return false;
    this.surface.phase = 'taking-off';
    this.surface.timer = 0;
    return true;
  }

  landingAssistReason(zoneId: string) {
    if (!this.environment) return 'No planetary environment.';
    const sample = this.environment.sample(this.position, this.surfaceSample);
    const zone = sample.body?.landingZones?.find((zone) => zone.id === zoneId);
    if (!sample.body?.landable || !zone) return 'Select a landing zone on this planet.';
    if (this.flightLocked || !['flying', 'approaching'].includes(this.surface.phase))
      return 'Take off or undock before using landing assistance.';
    if (!this.assistance) return 'Enable flight assistance / F.';
    if (!this.landingClearance) return 'Landing area obstructed by traffic.';
    const target = this.environment.world.positions.get(zone.id);
    if (
      !target ||
      this.position.distanceTo(target) >
        Math.hypot(
          this.planetaryConfig.landingAssistAltitude,
          this.planetaryConfig.landingAssistRange,
        )
    )
      return 'Approach the selected landing zone.';
    this.translation.subVectors(target, this.position);
    this.translation.addScaledVector(sample.up, -this.translation.dot(sample.up));
    if (
      sample.altitude > this.planetaryConfig.landingAssistAltitude ||
      this.translation.length() > this.planetaryConfig.landingAssistRange
    )
      return 'Land assist requires altitude below 2.5 km and zone range below 1 km.';
    if (
      this.landingAssist !== zoneId &&
      this.velocity.clone().sub(sample.velocity).length() > this.planetaryConfig.landingAssistSpeed
    )
      return 'Slow below 150 m/s for landing assistance.';
    return null;
  }

  requestLandingAssist(zoneId: string | null) {
    if (zoneId === null) {
      this.landingAssist = null;
      return null;
    }
    const reason = this.landingAssistReason(zoneId);
    if (reason) return reason;
    this.landingAssist = zoneId;
    this.landingGear = true;
    this.transit = false;
    return null;
  }

  private assistedLanding(sample: SurfaceSample, dt: number) {
    const target = this.landingAssist && this.environment?.world.positions.get(this.landingAssist);
    if (!target) return;
    this.translation.subVectors(target, this.position);
    this.translation.addScaledVector(sample.up, -this.translation.dot(sample.up));
    const distance = this.translation.length();
    this.translation.multiplyScalar(0.8).clampLength(0, 60);
    const level = tangentFrame(sample.up);
    this.forward
      .set(0, 0, -1)
      .applyQuaternion(this.orientation)
      .applyQuaternion(level.clone().invert());
    tangentFrame(sample.up, Math.atan2(-this.forward.x, -this.forward.z), level);
    this.orientation.slerp(level, 1 - Math.exp(-2.5 * dt));
    const aligned =
      this.forward.set(0, 1, 0).applyQuaternion(this.orientation).dot(sample.up) > 0.995;
    const speed = surfaceDescentSpeed(sample.altitude - 5, true, this.planetaryConfig);
    const descent = aligned && distance < 10 ? -speed : 0;
    this.translation.add(sample.velocity).addScaledVector(sample.up, descent);
    this.lateral
      .subVectors(this.translation, this.velocity)
      .clampLength(0, this.planetaryConfig.descentAcceleration * dt);
    this.velocity.add(this.lateral);
    this.throttle = 0;
    this.boosting = false;
    this.angularVelocity.set(0, 0, 0);
  }

  private grounded(dt: number) {
    const sample = this.surfaceSample;
    if (!sample.body || !this.surface.anchor) return false;
    if (!['landing', 'landed', 'taking-off'].includes(this.surface.phase)) return false;
    sample.local.fromArray(this.surface.anchor);
    sample.up.copy(sample.local).applyQuaternion(sample.rotation);
    this.position
      .copy(sample.center)
      .addScaledVector(
        sample.up,
        sample.body.radius + terrainHeight(sample.body, sample.local) + 5.05,
      );
    this.throttle = 0;
    this.boosting = false;
    this.angularVelocity.set(0, 0, 0);
    this.surface.timer += dt;
    this.velocity.copy(sample.velocity);
    if (this.surface.orientation)
      this.orientation
        .copy(sample.rotation)
        .multiply(this.rotation.fromArray(this.surface.orientation));
    if (this.surface.phase === 'landing' && this.surface.timer >= 0.8) {
      this.surface.phase = 'landed';
      this.surface.timer = 0;
    }
    if (this.surface.phase === 'taking-off') {
      const powered = Math.max(0, this.surface.timer - 0.7);
      const height = 8 * powered * powered;
      this.position.addScaledVector(sample.up, height);
      this.velocity.addScaledVector(sample.up, 16 * powered);
      if (height > 30) {
        this.surface.phase = 'flying';
        this.surface.anchor = null;
        this.surface.orientation = null;
        this.landingGear = false;
      }
    }
    return true;
  }

  step(input: Readonly<FlightInput>, dt: number) {
    if (!Number.isFinite(dt) || dt < 0)
      throw new RangeError('Flight dt must be finite and nonnegative.');
    if (dt === 0) return;
    this.impactSpeed = 0;
    if (this.flightLocked) return;
    const field = this.environment;
    const sample = this.surfaceSample;
    field?.sample(this.position, sample);
    if (field && this.grounded(dt)) return;
    if (this.landingAssist) {
      const override =
        input.throttle ||
        input.brake ||
        input.boost ||
        input.reverse ||
        Math.abs(input.pitch) +
          Math.abs(input.yaw) +
          Math.abs(input.roll) +
          Math.abs(input.strafe) +
          Math.abs(input.lift) >
          0.001;
      if (override || this.landingAssistReason(this.landingAssist)) this.landingAssist = null;
      else {
        this.motionStart.copy(this.position);
        this.assistedLanding(sample, dt);
        this.finishMotion(field, sample, dt);
        return;
      }
    }
    const surfaceLift = Boolean(
      field && sample.body?.landable && sample.altitude < 60000 && input.lift,
    );
    // Unassisted gravity is not erased by the space controller's automatic engine braking.
    const fallingSpeed =
      field && sample.gravity > 0 && !this.assistance && !input.brake && !surfaceLift
        ? this.velocity.dot(sample.up)
        : 0;
    if (fallingSpeed) this.velocity.addScaledVector(sample.up, -fallingSpeed);
    this.motionStart.copy(this.position);
    const density = field ? sample.density : 0;
    let transitFactor =
      field && this.transit && !this.landingGear
        ? 1 +
          (this.planetaryConfig.transitMultiplier - 1) *
            MathUtils.clamp(
              Math.min(
                sample.transitClearance,
                sample.altitude - (sample.body?.atmosphere?.height ?? 0) - 2000,
              ) / this.planetaryConfig.transitRamp,
              0,
              1,
            )
        : 1;
    const planetaryApproach = Boolean(
      field &&
        sample.body?.landable &&
        sample.altitude < 60000 &&
        this.transit &&
        !this.landingGear,
    );
    if (field && planetaryApproach) {
      this.forward.copy(this.velocity);
      if (this.forward.lengthSq() < 1) this.forward.set(0, 0, -1).applyQuaternion(this.orientation);
      this.forward.normalize();
      const lookahead = Math.max(
        this.planetaryConfig.approachClearance +
          this.planetaryConfig.approachMaxSpeed ** 2 / (2 * this.planetaryConfig.approachBraking),
        this.speed ** 2 / (2 * this.planetaryConfig.approachBraking) + this.speed * 2,
      );
      const clearance = Math.min(
        sample.altitude - 5,
        sample.transitClearance,
        field.flightClearance(this.position, this.forward, lookahead),
      );
      transitFactor =
        approachSpeedLimit(clearance, this.config.maxSpeed, this.planetaryConfig) /
        this.config.maxSpeed;
    }
    const speedFactor = transitFactor * (1 - density * this.planetaryConfig.densitySpeedReduction);
    let surfaceJetSpeed = 0;
    if (field && surfaceLift) {
      const corridor =
        input.lift < 0
          ? field.flightClearance(
              this.position,
              this.rotationAxis.copy(sample.up).negate(),
              this.planetaryConfig.descentMaxSpeed ** 2 /
                (2 * this.planetaryConfig.descentBraking) +
                100,
            )
          : Infinity;
      surfaceJetSpeed = surfaceDescentSpeed(
        Math.min(sample.altitude - 5, corridor),
        this.landingGear,
        this.planetaryConfig,
      );
    }
    const config = this.config;
    const previousSpeed = this.speed;
    const throttleTarget = input.brake ? 0 : MathUtils.clamp(input.throttle, 0, 1);
    this.throttle = approach(this.throttle, throttleTarget, config.throttleRate * dt);

    if (!input.boost && this.boostCharge >= config.boostMinimumCharge) this.boostExhausted = false;
    this.boosting =
      input.boost &&
      !input.brake &&
      throttleTarget > 0 &&
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
    const handling = 1 / (1 + (density * this.speed) / this.planetaryConfig.handlingSpeed);
    const limit = config.maxAngularSpeed;
    this.angularVelocity.set(
      angularRate(
        this.angularVelocity.x,
        input.pitch,
        limit[0] * handling,
        acceleration[0],
        damping,
        dt,
      ),
      angularRate(
        this.angularVelocity.y,
        -input.yaw,
        limit[1] * handling,
        acceleration[1],
        damping,
        dt,
      ),
      angularRate(
        this.angularVelocity.z,
        -input.roll,
        limit[2] * handling,
        acceleration[2],
        damping,
        dt,
      ),
    );
    const angularSpeed = this.angularVelocity.length();
    if (angularSpeed > 0) {
      this.rotationAxis.copy(this.angularVelocity).divideScalar(angularSpeed);
      this.rotation.setFromAxisAngle(this.rotationAxis, angularSpeed * dt);
      this.orientation.multiply(this.rotation).normalize();
    }
    if (
      field &&
      this.assistance &&
      this.landingGear &&
      sample.altitude < 60000 &&
      Math.abs(input.pitch) + Math.abs(input.roll) < 0.001
    ) {
      const level = tangentFrame(sample.up);
      const heading = this.forward
        .set(0, 0, -1)
        .applyQuaternion(this.orientation)
        .applyQuaternion(level.clone().invert());
      tangentFrame(sample.up, Math.atan2(-heading.x, -heading.z), level);
      this.orientation.slerp(level, 1 - Math.exp(-1.6 * dt));
    }

    this.forward.set(0, 0, -1).applyQuaternion(this.orientation);
    const forwardSpeed = this.velocity.dot(this.forward);
    // A held brake/reverse command becomes reverse thrust only after stored power reaches zero.
    const reversing = input.reverse && throttleTarget === 0 && this.throttle === 0;
    const braking = input.brake && !reversing;
    const translating = input.strafe !== 0 || input.lift !== 0 || reversing;
    if (this.assistance && !translating) {
      this.lateral.copy(this.velocity).addScaledVector(this.forward, -forwardSpeed);
      this.velocity.addScaledVector(this.lateral, Math.expm1(-config.lateralDamping * dt));
    }
    if (braking || throttleTarget === 0) {
      // Translation jets can hold a lateral/reverse command while main throttle is released.
      const speed = translating && !braking ? Math.abs(forwardSpeed) : this.speed;
      const deceleration = braking ? config.brakeDeceleration : config.deceleration;
      if (surfaceLift && !braking) {
        if (this.assistance) {
          this.lateral.copy(this.velocity).sub(sample.velocity);
          this.lateral.addScaledVector(sample.up, -this.lateral.dot(sample.up));
          this.velocity.sub(this.lateral.clampLength(0, deceleration * dt));
        }
      } else if (speed > 0) {
        if (translating && !braking)
          this.velocity.addScaledVector(
            this.forward,
            -Math.sign(forwardSpeed) * Math.min(speed, deceleration * dt),
          );
        else this.velocity.multiplyScalar(Math.max(0, speed - deceleration * dt) / speed);
      }
      if (braking) {
        // Braking also sheds stored power so pressing W again starts from the reduced speed.
        this.throttle = Math.min(
          this.throttle,
          Math.max(0, this.velocity.dot(this.forward)) / config.maxSpeed,
        );
      }
    } else {
      const targetSpeed =
        this.throttle * (this.boosting ? config.boostMaxSpeed : config.maxSpeed) * speedFactor;
      const thrust = MathUtils.clamp(
        targetSpeed - forwardSpeed,
        this.assistance
          ? -(planetaryApproach ? this.planetaryConfig.approachBraking : config.deceleration) * dt
          : 0,
        (this.boosting ? config.boostAcceleration : config.acceleration) *
          Math.sqrt(transitFactor) *
          dt,
      );
      this.velocity.addScaledVector(this.forward, thrust);
    }
    // Boost exit sheds excess speed progressively; normal thrust cannot exceed maxSpeed.
    let speedLimit = planetaryApproach
      ? Math.max(
          config.maxSpeed * speedFactor,
          previousSpeed - this.planetaryConfig.approachBraking * dt,
        )
      : (this.boosting
          ? config.boostMaxSpeed
          : Math.max(
              config.maxSpeed,
              previousSpeed / speedFactor - config.boostDeceleration * (this.transit ? 16 : 1) * dt,
            )) * speedFactor;
    if (surfaceLift)
      speedLimit = Math.max(
        speedLimit,
        surfaceJetSpeed,
        previousSpeed - this.planetaryConfig.descentBraking * dt,
      );
    this.velocity.clampLength(0, speedLimit);
    if (!braking) {
      this.translation
        .set(input.strafe, surfaceLift ? 0 : input.lift, 0)
        .clampLength(0, 1)
        .multiplyScalar(
          this.landingGear && field
            ? gearTranslationSpeed(sample.altitude, config.strafeMaxSpeed, this.planetaryConfig)
            : config.strafeMaxSpeed,
        );
      if (reversing) this.translation.z = config.reverseMaxSpeed;
      this.translation.applyQuaternion(this.orientation);
      this.lateral
        .copy(this.velocity)
        .addScaledVector(this.forward, -this.velocity.dot(this.forward));
      if (reversing) this.lateral.copy(this.velocity);
      this.translation.sub(this.lateral).clampLength(0, config.strafeAcceleration * dt);
      if (input.strafe || (!surfaceLift && input.lift) || reversing)
        this.velocity.add(this.translation);
      if (surfaceLift) {
        const radial = this.velocity.dot(sample.up) - sample.velocity.dot(sample.up);
        this.velocity.addScaledVector(
          sample.up,
          MathUtils.clamp(
            input.lift * surfaceJetSpeed - radial,
            -this.planetaryConfig.descentAcceleration * dt,
            this.planetaryConfig.descentAcceleration * dt,
          ),
        );
      }
      this.velocity.clampLength(0, speedLimit);
    }
    if (field && sample.body) {
      if (fallingSpeed) this.velocity.addScaledVector(sample.up, fallingSpeed);
      // Hover assistance cancels most gravity with an explicit residual; disabling it exposes full gravity.
      const compensation = this.assistance ? this.planetaryConfig.gravityCompensation : 0;
      this.velocity.addScaledVector(sample.acceleration, (1 - compensation) * dt);
      this.lateral.copy(this.velocity).sub(sample.velocity);
      this.velocity.addScaledVector(
        this.lateral,
        Math.expm1(-density * this.planetaryConfig.drag * dt),
      );
    }
    this.finishMotion(field, sample, dt);
  }

  private finishMotion(field: PlanetaryEnvironment | null, sample: SurfaceSample, dt: number) {
    this.position.addScaledVector(this.velocity, dt);
    if (field) {
      const hit = field.trace(this.motionStart, this.position, 5);
      if (hit !== null) {
        this.position.lerpVectors(this.motionStart, this.position, hit);
        field.sample(this.position, sample);
        this.lateral.copy(this.velocity).sub(sample.velocity);
        const vertical = this.lateral.dot(sample.normal);
        const horizontal = this.lateral.clone().addScaledVector(sample.normal, -vertical).length();
        const up = new Vector3(0, 1, 0).applyQuaternion(this.orientation);
        const safe =
          sample.body?.landable &&
          this.landingClearance &&
          this.landingGear &&
          Math.abs(vertical) <= this.planetaryConfig.landingVerticalSpeed &&
          horizontal <= this.planetaryConfig.landingGroundSpeed &&
          up.dot(sample.normal) >= 0.96 &&
          sample.up.dot(sample.normal) >= 0.985;
        if (safe) {
          this.landingAssist = null;
          this.surface.phase = 'landing';
          this.surface.bodyId = sample.body?.id ?? null;
          this.surface.timer = 0;
          this.surface.anchor = sample.local.toArray();
          const target = tangentFrame(sample.normal);
          // Retain surface heading while leveling the gear onto the local tangent.
          const forward = new Vector3(0, 0, -1)
            .applyQuaternion(this.orientation)
            .applyQuaternion(target.clone().invert());
          this.orientation.copy(tangentFrame(sample.normal, Math.atan2(-forward.x, -forward.z)));
          this.surface.orientation = sample.rotation
            .clone()
            .invert()
            .multiply(this.orientation)
            .toArray();
          this.grounded(0);
        } else {
          this.landingAssist = null;
          this.impactSpeed = Math.abs(vertical) > 3 ? Math.max(13, Math.abs(vertical)) : 0;
          if (vertical < 0) this.velocity.addScaledVector(sample.normal, -vertical * 1.08);
          this.position.addScaledVector(sample.normal, 0.05);
        }
      } else {
        this.surface.bodyId = sample.body?.id ?? null;
        this.surface.phase = this.landingGear && sample.altitude < 250 ? 'approaching' : 'flying';
      }
    }
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
