export interface EngineSoundInput {
  throttle: number;
  requestedThrottle: number;
  speed: number;
  boosting: boolean;
  boostReserve: number;
  braking: boolean;
  translation: number;
  cockpit: boolean;
  density: number;
  atmosphericSpeed: number;
}

export function createEngineSoundInput(): EngineSoundInput {
  return {
    throttle: 0,
    requestedThrottle: 0,
    speed: 0,
    boosting: false,
    boostReserve: 1,
    braking: false,
    translation: 0,
    cockpit: false,
    density: 0,
    atmosphericSpeed: 0,
  };
}

function bounded(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
function follow(current: number, target: number, dt: number, response: number) {
  return current + (target - current) * (1 - Math.exp(-dt / response));
}

/** Feature adapter accepts ships with or without optional translation axes. */
export function engineTranslationEffort(input: {
  throttle: number;
  strafe?: number;
  lift?: number;
  reverse?: boolean;
}) {
  return Math.max(
    bounded(Math.hypot(input.strafe ?? 0, input.lift ?? 0)),
    input.reverse && input.throttle <= 0 ? 1 : 0,
  );
}

/** Audio-only inertia and edge detection. All outputs are reused; this never affects flight. */
export class EngineSoundModel {
  power = 0;
  boost = 0;
  jets = 0;
  cabin = 0;
  air = 0;
  strain = 0;
  pulse = 1;
  engage = false;
  release = false;
  private elapsed = 0;
  private wasBoosting = false;
  private wasThrusting = false;
  private primed = false;
  private releaseCooldown = 0;

  step(input: Readonly<EngineSoundInput>, delta: number) {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(0.1, delta)) : 0;
    this.engage = false;
    this.release = false;
    if (dt === 0) return;
    this.elapsed += dt;
    this.releaseCooldown = Math.max(0, this.releaseCooldown - dt);
    const thrusting = input.requestedThrottle > 0 && !input.braking;
    const boosting = input.boosting && thrusting;
    const demand = thrusting ? bounded(input.throttle) : 0;
    const braking = input.braking ? bounded(input.speed / 45) : 0;
    this.engage = boosting && !this.wasBoosting;
    this.release =
      this.primed &&
      this.releaseCooldown === 0 &&
      ((this.wasBoosting && !boosting) || (this.wasThrusting && !thrusting && this.power > 0.22));
    if (this.release) this.releaseCooldown = 1.1;
    this.power = follow(this.power, demand, dt, demand > this.power ? 0.22 : 0.48);
    this.boost = follow(this.boost, boosting ? 1 : 0, dt, boosting ? 0.12 : 0.35);
    this.jets = follow(
      this.jets,
      input.braking ? braking : bounded(input.translation) * 0.65,
      dt,
      0.1,
    );
    this.cabin = follow(this.cabin, input.cockpit ? 1 : 0, dt, 0.38);
    this.air = follow(
      this.air,
      Math.sqrt(bounded(input.density)) * bounded(input.atmosphericSpeed / 700),
      dt,
      0.3,
    );
    this.strain = this.boost * (1 - bounded(input.boostReserve)) ** 2;
    this.pulse = 0.96 + Math.sin(this.elapsed * 31) ** 2 * 0.04;
    this.wasBoosting = boosting;
    this.wasThrusting = thrusting;
    this.primed = true;
  }

  reset() {
    this.power = this.boost = this.jets = this.cabin = this.air = this.strain = this.elapsed = 0;
    this.releaseCooldown = 0;
    this.pulse = 1;
    this.engage = this.release = this.wasBoosting = this.wasThrusting = this.primed = false;
  }
}
