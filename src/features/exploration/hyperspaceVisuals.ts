import {
  entrySurge,
  HYPERSPACE_ENTRY,
  HYPERSPACE_EXIT,
  HYPERSPACE_TIMING,
  type HyperspaceController,
  smoothRamp,
} from '@/engine/navigation/HyperspaceController';

/** Shared envelopes keep stars, camera and engine transients on the same threshold. */
export function jumpStretch(jump: HyperspaceController) {
  if (jump.phase === 'ACCELERATING')
    return smoothRamp(0.02, HYPERSPACE_ENTRY.stretchComplete, jump.progress);
  if (jump.phase === 'HYPERSPACE') return 1;
  if (jump.phase === 'EXITING') return 1 - smoothRamp(0.1, HYPERSPACE_EXIT.settle, jump.progress);
  return 0;
}

export function jumpKick(jump: HyperspaceController) {
  if (jump.phase === 'ACCELERATING') return Math.sin(Math.PI * entrySurge(jump.progress));
  if (jump.phase === 'EXITING') return Math.sin(Math.PI * Math.min(1, jump.progress / 0.45)) * 0.55;
  return 0;
}

/** A single outward sweep; no recycled particles or replacement sky during a jump. */
export function jumpStarTravel(jump: HyperspaceController) {
  if (jump.phase === 'ACCELERATING')
    return smoothRamp(0.02, 0.85, jump.progress) * 0.065 + entrySurge(jump.progress) ** 3 * 0.935;
  if (jump.phase === 'HYPERSPACE') return 1;
  if (jump.phase === 'EXITING') return 1 - smoothRamp(0.04, HYPERSPACE_EXIT.settle, jump.progress);
  return 0;
}

/** One soft exposure crest as the streaks merge into the opaque cloud corridor. */
export function jumpExposure(jump: HyperspaceController) {
  if (jump.phase === 'EXITING')
    return (
      smoothRamp(0.1, HYPERSPACE_EXIT.revealStart, jump.progress) *
      (1 - smoothRamp(HYPERSPACE_EXIT.revealStart, HYPERSPACE_EXIT.settle, jump.progress)) *
      0.3
    );
  if (jump.phase !== 'ACCELERATING') return 0;
  return smoothRamp(0.7, 0.87, jump.progress) * (1 - smoothRamp(0.87, 1, jump.progress));
}

function impactAge(jump: HyperspaceController) {
  if (jump.phase === 'ACCELERATING')
    return jump.elapsed - HYPERSPACE_TIMING.ACCELERATING * HYPERSPACE_ENTRY.ignitionStart;
  if (jump.phase === 'HYPERSPACE')
    return jump.elapsed + HYPERSPACE_TIMING.ACCELERATING * (1 - HYPERSPACE_ENTRY.ignitionStart);
  if (jump.phase === 'EXITING')
    return jump.elapsed - HYPERSPACE_TIMING.EXITING * HYPERSPACE_EXIT.revealStart;
  return -1;
}

/** A short damped recoil carries continuously through ignition into the corridor. */
export function jumpRecoil(jump: HyperspaceController) {
  const age = impactAge(jump);
  if (age < 0) return 0;
  return (
    Math.sin(age * 23) *
    Math.exp(-age * 9) *
    (1 - smoothRamp(0.3, 0.65, age)) *
    (jump.phase === 'EXITING' ? -0.65 : 1)
  );
}

export function jumpRattle(jump: HyperspaceController) {
  const age = impactAge(jump);
  if (age < 0) return 0;
  const envelope = Math.exp(-age * 18) * (1 - Math.exp(-age * 60));
  return (
    (Math.sin(age * 71) + Math.sin(age * 137) * 0.45) * envelope * (1 - smoothRamp(0.3, 0.65, age))
  );
}

function noiseCell(cell: number, seed: number) {
  let n = Math.imul(cell + seed, 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 2147483647.5 - 1;
}

function softNoise(time: number, seed: number) {
  const cell = Math.floor(time);
  const f = smoothRamp(0, 1, time - cell);
  return noiseCell(cell, seed) * (1 - f) + noiseCell(cell + 1, seed) * f;
}

/** Bounded, repeatable per journey, nonperiodic turbulence. Never feeds back into flight physics. */
export function jumpTurbulence(jump: HyperspaceController, channel = 0) {
  if (!jump.busy || jump.phase === 'CHARGING') return 0;
  const envelope =
    jump.phase === 'ACCELERATING'
      ? smoothRamp(0.55, 1, jump.progress)
      : jump.phase === 'EXITING'
        ? 1 - smoothRamp(0, 0.4, jump.progress)
        : 1;
  const time = Math.max(jump.flightElapsed, jump.journeyElapsed) - HYPERSPACE_TIMING.CHARGING;
  const seed = jump.variation + channel * 104729;
  return (
    (softNoise(time * 1.15, seed) * 0.72 + softNoise(time * 3.7, seed + 997) * 0.28) * envelope
  );
}
