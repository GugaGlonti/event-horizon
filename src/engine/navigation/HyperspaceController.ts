export type JumpPhase =
  | 'IDLE'
  | 'CHARGING'
  | 'ACCELERATING'
  | 'HYPERSPACE'
  | 'EXITING'
  | 'COOLDOWN';

export const HYPERSPACE_TIMING = Object.freeze({
  CHARGING: 3.2,
  ACCELERATING: 1.3,
  HYPERSPACE: 3.4,
  EXITING: 1.15,
  COOLDOWN: 4,
  preparationTimeout: 12,
  maxFrameTime: 0.1,
});

export const HYPERSPACE_ENTRY = Object.freeze({
  stretchComplete: 0.48,
  ignitionStart: 0.55,
  tunnelStart: 0.72,
});

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
  prepared = false;
  arrivalReady = false;
  private arrivalWait = 0;
  error: string | null = null;

  get busy() {
    return this.phase !== 'IDLE' && this.phase !== 'COOLDOWN';
  }
  get progress() {
    return this.phase === 'IDLE' ? 0 : Math.min(1, this.elapsed / HYPERSPACE_TIMING[this.phase]);
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
    if (this.phase === 'EXITING') return 1 - smoothRamp(0.08, 0.3, this.progress);
    return 0;
  }

  request(current: string, destination: string | null, validIds: readonly string[]) {
    if (this.phase !== 'IDLE') return false;
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
    this.prepared = false;
    this.arrivalReady = false;
    this.arrivalWait = 0;
    this.error = null;
    return true;
  }

  fail(message: string) {
    this.cancel();
    this.error = message;
  }
  cancel() {
    this.phase = 'IDLE';
    this.elapsed = 0;
    this.destinationId = null;
    this.prepared = false;
    this.arrivalReady = false;
    this.arrivalWait = 0;
    this.error = null;
  }

  advance(delta: number) {
    if (!Number.isFinite(delta) || delta < 0)
      throw new RangeError('Jump delta must be finite and nonnegative.');
    if (this.phase === 'IDLE') return;
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
      this.elapsed + 1e-9 < HYPERSPACE_TIMING[this.phase] ||
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
