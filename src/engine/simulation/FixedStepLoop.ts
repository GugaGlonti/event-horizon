/** A bounded accumulator; discarded suspension time never becomes future catch-up work. */
export class FixedStepLoop {
  private accumulator = 0;
  readonly stepSeconds: number;
  private readonly maxFrameSeconds: number;
  private readonly maxSteps: number;

  constructor(stepSeconds: number, maxFrameSeconds: number, maxSteps: number) {
    if (
      !Number.isFinite(stepSeconds) ||
      !Number.isFinite(maxFrameSeconds) ||
      !(stepSeconds > 0) ||
      !(maxFrameSeconds > 0) ||
      !Number.isInteger(maxSteps) ||
      maxSteps < 1
    ) {
      throw new RangeError('Fixed-step bounds must be positive.');
    }
    this.stepSeconds = stepSeconds;
    this.maxFrameSeconds = maxFrameSeconds;
    this.maxSteps = maxSteps;
  }

  reset() {
    this.accumulator = 0;
  }

  advance(elapsed: number, step: (dt: number) => void): number {
    if (!Number.isFinite(elapsed) || elapsed <= 0) return this.accumulator / this.stepSeconds;
    this.accumulator += Math.min(elapsed, this.maxFrameSeconds);
    let steps = 0;
    while (this.accumulator + Number.EPSILON >= this.stepSeconds && steps < this.maxSteps) {
      step(this.stepSeconds);
      this.accumulator = Math.max(0, this.accumulator - this.stepSeconds);
      steps += 1;
    }
    if (steps === this.maxSteps && this.accumulator >= this.stepSeconds)
      this.accumulator %= this.stepSeconds;
    return this.accumulator / this.stepSeconds;
  }
}
