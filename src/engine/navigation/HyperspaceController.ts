export type JumpPhase =
  | 'IDLE'
  | 'CHARGING'
  | 'ACCELERATING'
  | 'HYPERSPACE'
  | 'EXITING'
  | 'COOLDOWN';

const BEAM_ANIMATION_SECONDS = 3.4;
const EXIT_FLASH_SECONDS = 0.714;

export const HYPERSPACE_TIMING = Object.freeze({
  CHARGING: 3.2,
  ACCELERATING: BEAM_ANIMATION_SECONDS,
  HYPERSPACE: 3.4,
  EXITING: EXIT_FLASH_SECONDS + BEAM_ANIMATION_SECONDS,
  COOLDOWN: 4,
  preparationTimeout: 12,
  maxFrameTime: 0.1,
});

export const HYPERSPACE_MOTION = Object.freeze({
  departureDistance: 1_800_000,
  departureLeadInDistance: 6_000,
  departureExponent: 8,
  arrivalSpeed: 800_000,
  arrivalExponent: 10,
  exitSpeed: 100,
});

/** Galactic catalogue coordinates are light years; one more light year adds 0.12 seconds. */
export function hyperspaceDuration(distance: number) {
  if (!Number.isFinite(distance) || distance < 0)
    throw new RangeError('Route distance must be finite and nonnegative.');
  return HYPERSPACE_TIMING.HYPERSPACE + distance * 0.12;
}

export const HYPERSPACE_ENTRY = Object.freeze({
  ignitionStart: 0.42,
  impactStart: 0.9,
  tunnelStart: 0.94,
});

export const HYPERSPACE_EXIT = Object.freeze({
  // Keep the crossing/reveal in seconds; only the clear star-beam animation grows.
  streaksStart: 0.252 / HYPERSPACE_TIMING.EXITING,
  streaksVisible: 0.336 / HYPERSPACE_TIMING.EXITING,
  flashEnd: EXIT_FLASH_SECONDS / HYPERSPACE_TIMING.EXITING,
  revealStart: 0.504 / HYPERSPACE_TIMING.EXITING,
  revealEnd: 0.882 / HYPERSPACE_TIMING.EXITING,
  settle: 1,
});
export const EXIT_COAST_DISTANCE =
  HYPERSPACE_TIMING.EXITING *
  (HYPERSPACE_MOTION.arrivalSpeed * HYPERSPACE_EXIT.revealEnd +
    HYPERSPACE_MOTION.exitSpeed * (1 - HYPERSPACE_EXIT.revealEnd) +
    ((HYPERSPACE_MOTION.arrivalSpeed - HYPERSPACE_MOTION.exitSpeed) *
      (1 - HYPERSPACE_EXIT.revealEnd)) /
      HYPERSPACE_MOTION.arrivalExponent);
const JOURNEY_PHASES = ['CHARGING', 'ACCELERATING', 'HYPERSPACE', 'EXITING'] as const;

/** Keep the physical surge short while stars have time to stretch before ignition. */
export function entrySurge(progress: number) {
  return Math.max(
    0,
    Math.min(1, (progress - HYPERSPACE_ENTRY.ignitionStart) / (1 - HYPERSPACE_ENTRY.ignitionStart)),
  );
}

/** Strong ease-in: most real-space distance is covered by the final ignition burst. */
export function hyperspaceDepartureDistance(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  return (
    HYPERSPACE_MOTION.departureLeadInDistance * p * p +
    (HYPERSPACE_MOTION.departureDistance - HYPERSPACE_MOTION.departureLeadInDistance) *
      entrySurge(p) ** HYPERSPACE_MOTION.departureExponent
  );
}

/** Keep the incoming coast fast through reveal, then heavily ease out in visible real space. */
export function hyperspaceArrivalDistance(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const braking = Math.max(0, p - HYPERSPACE_EXIT.revealEnd);
  const coast = braking / (1 - HYPERSPACE_EXIT.revealEnd);
  return (
    HYPERSPACE_MOTION.arrivalSpeed *
      HYPERSPACE_TIMING.EXITING *
      Math.min(p, HYPERSPACE_EXIT.revealEnd) +
    HYPERSPACE_MOTION.exitSpeed * HYPERSPACE_TIMING.EXITING * braking +
    ((HYPERSPACE_MOTION.arrivalSpeed - HYPERSPACE_MOTION.exitSpeed) *
      HYPERSPACE_TIMING.EXITING *
      (1 - HYPERSPACE_EXIT.revealEnd) *
      (1 - (1 - coast) ** HYPERSPACE_MOTION.arrivalExponent)) /
      HYPERSPACE_MOTION.arrivalExponent
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
    if (this.phase === 'EXITING')
      return 1 - smoothRamp(HYPERSPACE_EXIT.revealEnd, HYPERSPACE_EXIT.settle, this.progress);
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
