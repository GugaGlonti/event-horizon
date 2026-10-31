import {
  entrySurge,
  HYPERSPACE_ENTRY,
  type HyperspaceController,
  smoothRamp,
} from '@/engine/navigation/HyperspaceController';

/** Shared envelopes keep stars, camera and engine transients on the same threshold. */
export function jumpStretch(jump: HyperspaceController) {
  if (jump.phase === 'ACCELERATING')
    return smoothRamp(0.02, HYPERSPACE_ENTRY.stretchComplete, jump.progress);
  if (jump.phase === 'HYPERSPACE') return 1;
  if (jump.phase === 'EXITING') return 1 - smoothRamp(0.08, 0.4, jump.progress);
  return 0;
}

export function jumpKick(jump: HyperspaceController) {
  if (jump.phase === 'ACCELERATING') return Math.sin(Math.PI * entrySurge(jump.progress));
  if (jump.phase === 'EXITING') return Math.sin(Math.PI * Math.min(1, jump.progress / 0.45)) * 0.55;
  return 0;
}

/** A single outward sweep; no recycled particles or replacement sky during a jump. */
export function jumpStarTravel(jump: HyperspaceController) {
  if (jump.phase === 'ACCELERATING') return entrySurge(jump.progress) ** 3;
  if (jump.phase === 'HYPERSPACE') return 1;
  if (jump.phase === 'EXITING') return 1 - smoothRamp(0.02, 0.4, jump.progress);
  return 0;
}

/** One soft exposure crest as the streaks merge into the opaque cloud corridor. */
export function jumpExposure(jump: HyperspaceController) {
  if (jump.phase !== 'ACCELERATING') return 0;
  return smoothRamp(0.7, 0.87, jump.progress) * (1 - smoothRamp(0.87, 1, jump.progress));
}
