export { FLIGHT_CONFIG } from '@/engine/simulation/config';

export const GAME_CONFIG = {
  fixedStep: 1 / 120,
  maxFrameTime: 0.1,
  maxSteps: 12,
  telemetryInterval: 0.1,
  navigationKeys: {
    galaxy: 'KeyM',
    local: 'KeyL',
    planetary: 'KeyY',
    nextTarget: 'KeyT',
    clearTarget: 'KeyX',
  },
  planetMarkers: { range: 300_000, limit: 3 },
  input: { mouseSensitivity: 0.003, mouseReturnRate: 2.8 },
  hyperspace: HYPERSPACE_MOTION,
  camera: {
    chaseOffset: [0, 3.8, 15] as const,
    narrowScreenAspect: 0.9,
    cockpitOffset: [0, 0.8, -1.8] as const,
    positionDamping: 7,
    rotationDamping: 5,
    fovDamping: 4,
    chaseFov: 62,
    cockpitFov: 78,
    speedFov: 12,
    hyperspaceFov: 6,
    hyperspaceVibration: 0.018,
    hyperspaceRecoil: { cockpit: 0.16, chase: 0.9 },
    near: 0.1,
    far: 20_000_000,
  },
  environment: {
    starRadius: 18000,
  },
} as const;

import { HYPERSPACE_MOTION } from '@/engine/navigation/HyperspaceController';
