import type { AiConfig, ShipConfig } from '@/engine/combat/combatTypes';
import { FLIGHT_CONFIG } from '@/features/flight/config';

export const PLAYER_SHIP: ShipConfig = {
  mass: 12,
  radius: 5,
  flight: FLIGHT_CONFIG,
  defense: { shields: 100, hull: 100, regeneration: 10, regenerationDelay: 4 },
  missile: {
    interval: 1.4,
    damage: 85,
    speed: 320,
    lifetime: 7,
    radius: 0.9,
    aimAssistAngle: 0,
    turnRate: 1.6,
    lockRange: 2200,
    lockAngle: Math.PI / 3,
  },
  laser: {
    interval: 0.14,
    damage: 16,
    speed: 1000,
    lifetime: 2,
    radius: 0.6,
    aimAssistAngle: 0.04,
  },
};
export const ENEMY_SHIP: ShipConfig = {
  missile: PLAYER_SHIP.missile,
  mass: 10,
  radius: 5,
  flight: { ...FLIGHT_CONFIG, maxSpeed: 135, acceleration: 36, maxAngularSpeed: [0.75, 0.7, 1.2] },
  defense: { shields: 45, hull: 55, regeneration: 4, regenerationDelay: 6 },
  laser: { interval: 0.85, damage: 4, speed: 650, lifetime: 2.4, radius: 0.7, aimAssistAngle: 0 },
};
export const PRACTICE_TARGET: ShipConfig = {
  ...ENEMY_SHIP,
  defense: { shields: 30, hull: 50, regeneration: 0, regenerationDelay: 6 },
};
export const AI_CONFIG: AiConfig = {
  detectionRange: 1800,
  disengageRange: 2800,
  attackRange: 950,
  aimTolerance: 0.035,
  evadeDistance: 130,
  evadeDuration: 2.2,
  evadeOnHit: true,
};
export const ENCOUNTER_CONFIG = { enemies: 5, maximumEnemies: 10, asteroids: 8 } as const;

export const WEAPON_CHOICES = [
  { slot: 1, label: 'Gun' },
  { slot: 2, label: 'Missiles' },
] as const;
