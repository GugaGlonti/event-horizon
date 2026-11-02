import {
  HYPERSPACE_ENTRY,
  HYPERSPACE_EXIT,
  HYPERSPACE_MOTION,
  HYPERSPACE_TIMING,
  type HyperspaceController,
  hyperspaceDepartureDistance,
  smoothRamp,
} from '@/engine/navigation/HyperspaceController';

/** Entry length, width and glow share one uninterrupted growth into the crossing flash. */
export function jumpStretch(jump: HyperspaceController) {
  if (jump.phase === 'ACCELERATING')
    return smoothRamp(0.02, HYPERSPACE_ENTRY.impactStart, jump.progress);
  if (jump.phase === 'HYPERSPACE') return 1;
  // Reveal the same fully lit exposures before contracting them back to ordinary stars.
  if (jump.phase === 'EXITING') {
    const contraction = Math.max(
      0,
      Math.min(
        1,
        (jump.progress - HYPERSPACE_EXIT.revealEnd) /
          (HYPERSPACE_EXIT.settle - HYPERSPACE_EXIT.revealEnd),
      ),
    );
    return (1 - contraction) ** 2;
  }
  return 0;
}

export function jumpKick(jump: HyperspaceController) {
  const age = jumpImpactAge(jump);
  if (age < 0) return 0;
  return (
    smoothRamp(0, 0.1, age) *
    (1 - smoothRamp(0.12, 0.65, age)) *
    (jump.phase === 'EXITING' ? 0.75 : 1)
  );
}

/** Departure follows the surge. Arrival heads reset invisibly beneath the opaque tunnel. */
export function jumpStarTravel(jump: HyperspaceController) {
  if (jump.phase === 'ACCELERATING')
    return (
      jumpStretch(jump) * 0.08 +
      (hyperspaceDepartureDistance(jump.progress) / HYPERSPACE_MOTION.departureDistance) * 0.92
    );
  if (jump.phase === 'HYPERSPACE') return 1;
  return 0;
}

/** Exchange beams and clouds only beneath the white peaks; no star beams remain in the tunnel. */
export function jumpStarVisibility(jump: HyperspaceController) {
  if (jump.phase === 'ACCELERATING') return 1 - smoothRamp(0.98, 1, jump.progress);
  if (jump.phase === 'HYPERSPACE') return 0;
  if (jump.phase === 'EXITING')
    return smoothRamp(HYPERSPACE_EXIT.streaksStart, HYPERSPACE_EXIT.streaksVisible, jump.progress);
  return 1;
}

/** Beam bloom crosses white once at each tunnel boundary, independently of the braking impulse. */
export function jumpExposure(jump: HyperspaceController, reduced = false) {
  if (reduced) return 0;
  if (jump.phase === 'ACCELERATING')
    return smoothRamp(HYPERSPACE_ENTRY.impactStart, 0.99, jump.progress);
  // Carry the entry peak through the phase boundary, then reveal the flowing cloud tunnel.
  if (jump.phase === 'HYPERSPACE') return 1 - smoothRamp(0, 0.42, jump.elapsed);
  if (jump.phase === 'EXITING')
    return (
      smoothRamp(0, HYPERSPACE_EXIT.streaksStart, jump.progress) *
      (1 - smoothRamp(HYPERSPACE_EXIT.streaksVisible, HYPERSPACE_EXIT.flashEnd, jump.progress))
    );
  return 0;
}

/** One crossing impulse drives the lens, recoil and audio; entry decay carries into the tunnel. */
export function jumpImpactAge(jump: HyperspaceController) {
  if (jump.phase === 'ACCELERATING')
    return jump.elapsed - HYPERSPACE_TIMING.ACCELERATING * HYPERSPACE_ENTRY.impactStart;
  if (jump.phase === 'HYPERSPACE')
    return jump.elapsed + HYPERSPACE_TIMING.ACCELERATING * (1 - HYPERSPACE_ENTRY.impactStart);
  if (jump.phase === 'EXITING')
    return jump.elapsed - HYPERSPACE_TIMING.EXITING * HYPERSPACE_EXIT.revealEnd;
  return -1;
}

/** A short damped recoil carries continuously through ignition into the corridor. */
export function jumpRecoil(jump: HyperspaceController) {
  const age = jumpImpactAge(jump);
  if (age < 0) return 0;
  return (
    Math.sin(age * 23) *
    Math.exp(-age * 9) *
    (1 - smoothRamp(0.3, 0.65, age)) *
    (jump.phase === 'EXITING' ? -0.65 : 1)
  );
}

export function jumpRattle(jump: HyperspaceController) {
  const age = jumpImpactAge(jump);
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

/** Brief shared jolts, with at least two seconds of complete rest between seeded events. */
function turbulencePulse(time: number, seed: number) {
  const cell = Math.floor(time / 4.8);
  const start = 0.7 + (noiseCell(cell, seed + 193) + 1) * 0.9;
  const duration = 0.45 + (noiseCell(cell, seed + 389) + 1) * 0.125;
  const age = time - cell * 4.8 - start;
  if (age <= 0 || age >= duration) return 0;
  return Math.sin((Math.PI * age) / duration) ** 2;
}

/** Bounded, occasional hiccups. Never feeds back into flight physics. */
export function jumpTurbulence(jump: HyperspaceController, channel = 0) {
  if (!jump.busy || jump.phase === 'CHARGING') return 0;
  const envelope =
    jump.phase === 'ACCELERATING'
      ? smoothRamp(HYPERSPACE_ENTRY.ignitionStart, 1, jump.progress)
      : jump.phase === 'EXITING'
        ? 1 - smoothRamp(0, HYPERSPACE_EXIT.revealStart, jump.progress)
        : 1;
  const time = Math.max(jump.flightElapsed, jump.journeyElapsed) - HYPERSPACE_TIMING.CHARGING;
  const pulse = turbulencePulse(time, jump.variation);
  const seed = jump.variation + channel * 104729;
  return (
    (softNoise(time * 1.15, seed) * 0.72 + softNoise(time * 3.7, seed + 997) * 0.28) *
    envelope *
    pulse
  );
}
