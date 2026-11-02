export type JumpPhase =
  | 'IDLE'
  | 'CHARGING'
  | 'ACCELERATING'
  | 'HYPERSPACE'
  | 'EXITING'
  | 'COOLDOWN';

export const HYPERSPACE_TIMING = Object.freeze({
  CHARGING: 3.2,
  ACCELERATING: 3.4,
  HYPERSPACE: 3.4,
  EXITING: 2.1,
  COOLDOWN: 4,
  preparationTimeout: 12,
  maxFrameTime: 0.1,
});

export const HYPERSPACE_MOTION = Object.freeze({
  departureDistance: 5200,
  arrivalSpeed: 3200,
  exitSpeed: 100,
});
export const EXIT_COAST_DISTANCE =
  HYPERSPACE_TIMING.EXITING *
  (HYPERSPACE_MOTION.exitSpeed +
    (HYPERSPACE_MOTION.arrivalSpeed - HYPERSPACE_MOTION.exitSpeed) / 8);

/** Galactic catalogue coordinates are light years; one more light year adds 0.12 seconds. */
export function hyperspaceDuration(distance: number) {
  if (!Number.isFinite(distance) || distance < 0)
    throw new RangeError('Route distance must be finite and nonnegative.');
  return HYPERSPACE_TIMING.HYPERSPACE + distance * 0.12;
}

export const HYPERSPACE_ENTRY = Object.freeze({
  stretchComplete: 0.36,
  ignitionStart: 0.55,
  tunnelStart: 0.8,
});

export const HYPERSPACE_EXIT = Object.freeze({ revealStart: 0.3, revealEnd: 0.7, settle: 0.72 });
const JOURNEY_PHASES = ['CHARGING', 'ACCELERATING', 'HYPERSPACE', 'EXITING'] as const;

/** Keep the physical surge short while stars have time to stretch before ignition. */
export function entrySurge(progress: number) {
  return Math.max(
    0,
    Math.min(1, (progress - HYPERSPACE_ENTRY.ignitionStart) / (1 - HYPERSPACE_ENTRY.ignitionStart)),
  );
}

export function smoothRamp(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/** Gameplay timing only. No clocks, promises, UI, audio, renderer, or simulation mutation. */
export class HyperspaceController {
  phase: JumpPhase = 'IDLE';
  destinationId: string | null = null;
  elapsed = 0;
  flightElapsed = 0;
  prepared = false;
  arrivalReady = false;
  private arrivalWait = 0;
  distance = 0;
  private sequence = 0;
  variation = 0;
  error: string | null = null;

  get busy() {
    return this.phase !== 'IDLE' && this.phase !== 'COOLDOWN';
  }
  get progress() {
    return this.phase === 'IDLE' ? 0 : Math.min(1, this.elapsed / this.duration(this.phase));
  }
  duration(phase: Exclude<JumpPhase, 'IDLE'>) {
    return phase === 'HYPERSPACE' ? hyperspaceDuration(this.distance) : HYPERSPACE_TIMING[phase];
  }
  get journeyDuration() {
    return (
      HYPERSPACE_TIMING.CHARGING +
      HYPERSPACE_TIMING.ACCELERATING +
      this.duration('HYPERSPACE') +
      HYPERSPACE_TIMING.EXITING
    );
  }
  get journeyElapsed() {
    if (this.phase === 'IDLE') return 0;
    let elapsed = 0;
    for (const phase of JOURNEY_PHASES) {
      if (this.phase === phase) return elapsed + Math.min(this.elapsed, this.duration(phase));
      elapsed += this.duration(phase);
    }
    return elapsed;
  }
  get distanceTraveled() {
    return (
      this.distance *
      (this.phase === 'HYPERSPACE'
        ? this.progress
        : this.phase === 'EXITING' || this.phase === 'COOLDOWN'
          ? 1
          : 0)
    );
  }
  get waiting() {
    return (
      (this.phase === 'HYPERSPACE' && this.progress === 1 && !this.prepared) ||
      (this.phase === 'EXITING' && !this.arrivalReady)
    );
  }
  get intensity() {
    if (this.phase === 'CHARGING') return this.progress * 0.08;
    if (this.phase === 'ACCELERATING')
      return 0.08 + smoothRamp(0, 0.85, entrySurge(this.progress)) * 0.92;
    if (this.phase === 'HYPERSPACE') return 1;
    if (this.phase === 'EXITING') return 1 - smoothRamp(0.08, 0.4, this.progress);
    return 0;
  }
  get coverage() {
    if (this.phase === 'ACCELERATING')
      return smoothRamp(HYPERSPACE_ENTRY.tunnelStart, 1, this.progress);
    if (this.phase === 'HYPERSPACE') return 1;
    if (this.phase === 'EXITING')
      return 1 - smoothRamp(HYPERSPACE_EXIT.revealStart, HYPERSPACE_EXIT.revealEnd, this.progress);
    return 0;
  }

  request(current: string, destination: string | null, validIds: readonly string[], distance = 0) {
    if (this.phase !== 'IDLE') return false;
    hyperspaceDuration(distance);
    if (!destination || destination === current || !validIds.includes(destination)) {
      this.error = !destination
        ? 'Select a destination first.'
        : destination === current
          ? 'You are already in this system.'
          : 'Unknown destination.';
      return false;
    }
    this.phase = 'CHARGING';
    this.destinationId = destination;
    this.elapsed = 0;
    this.flightElapsed = 0;
    this.prepared = false;
    this.arrivalReady = false;
    this.arrivalWait = 0;
    this.error = null;
    this.distance = distance;
    this.sequence += 1;
    this.variation = this.sequence * 7919;
    for (const char of `${current}/${destination}`)
      this.variation = (Math.imul(this.variation, 31) + char.charCodeAt(0)) >>> 0;
    return true;
  }

  fail(message: string) {
    this.cancel();
    this.error = message;
  }
  cancel() {
    this.phase = 'IDLE';
    this.elapsed = 0;
    this.flightElapsed = 0;
    this.destinationId = null;
    this.prepared = false;
    this.arrivalReady = false;
    this.arrivalWait = 0;
    this.error = null;
    this.distance = 0;
  }

  advance(delta: number) {
    if (!Number.isFinite(delta) || delta < 0)
      throw new RangeError('Jump delta must be finite and nonnegative.');
    if (this.phase === 'IDLE') return;
    if (this.busy) this.flightElapsed += Math.min(delta, HYPERSPACE_TIMING.maxFrameTime);
    if (this.phase === 'EXITING' && !this.arrivalReady) {
      this.arrivalWait += Math.min(delta, HYPERSPACE_TIMING.maxFrameTime);
      if (this.arrivalWait >= HYPERSPACE_TIMING.preparationTimeout)
        this.fail('Arrival rendering timed out. Holding safely in the destination system.');
      return;
    }
    // Tab suspension never skips a cinematic or arrival transaction.
    this.elapsed += Math.min(delta, HYPERSPACE_TIMING.maxFrameTime);
    if (
      this.phase === 'HYPERSPACE' &&
      !this.prepared &&
      this.elapsed >= HYPERSPACE_TIMING.preparationTimeout
    ) {
      this.fail('Destination preparation timed out. Your previous system is intact.');
      return;
    }
    if (
      this.elapsed + 1e-9 < this.duration(this.phase) ||
      (this.phase === 'HYPERSPACE' && !this.prepared)
    )
      return;
    const next: Record<Exclude<JumpPhase, 'IDLE'>, JumpPhase> = {
      CHARGING: 'ACCELERATING',
      ACCELERATING: 'HYPERSPACE',
      HYPERSPACE: 'EXITING',
      EXITING: 'COOLDOWN',
      COOLDOWN: 'IDLE',
    };
    this.phase = next[this.phase];
    this.elapsed = 0;
    if (this.phase === 'IDLE') this.destinationId = null;
  }
}
