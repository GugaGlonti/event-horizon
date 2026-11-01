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
    range: 2240,
    velocityInheritance: 1,
    turnRate: 1.6,
    lockRange: 2200,
    lockAngle: Math.PI / 3,
  },
  railgun: {
    chargeTime: 0.8,
    interval: 1.6,
    damage: 120,
    range: 3500,
    radius: 0.25,
    duration: 0.25,
  },
  flak: {
    interval: 0.75,
    damage: 10,
    speed: 650,
    lifetime: 0.5,
    radius: 0.25,
    aimAssistAngle: 0,
    range: 325,
    velocityInheritance: 1,
    pellets: 12,
    spreadAngle: 0.14,
  },
  laser: {
    interval: 0.14,
    damage: 16,
    speed: 1000,
    lifetime: 2,
    radius: 0.6,
    aimAssistAngle: 0.04,
    range: 2000,
    velocityInheritance: 1,
    hardpoints: [
      [2.65, 0, -6],
      [-2.65, 0, -6],
    ],
    firingMode: 'alternating',
    heat: { perShot: 0.075, coolingRate: 0.14, resumeAt: 0.3 },
  },
};
export const ENEMY_SHIP: ShipConfig = {
  missile: PLAYER_SHIP.missile,
  railgun: PLAYER_SHIP.railgun,
  flak: PLAYER_SHIP.flak,
  mass: 10,
  radius: 5,
  flight: { ...FLIGHT_CONFIG, maxSpeed: 135, acceleration: 36, maxAngularSpeed: [0.75, 0.7, 1.2] },
  defense: { shields: 45, hull: 55, regeneration: 4, regenerationDelay: 6 },
  laser: {
    ...PLAYER_SHIP.laser,
    interval: 0.85,
    damage: 4,
    speed: 650,
    lifetime: 2.4,
    range: 1560,
    radius: 0.7,
    aimAssistAngle: 0,
    heat: { perShot: 0.16, coolingRate: 0.1, resumeAt: 0.3 },
  },
};
export const PRACTICE_TARGET: ShipConfig = {
  ...ENEMY_SHIP,
  defense: { shields: 30, hull: 50, regeneration: 0, regenerationDelay: 6 },
};
export const AI_CONFIG: AiConfig = {
  detectionRange: 1800,
  disengageRange: 2800,
  attackRange: 950,
  preferredDistance: 220,
  aimTolerance: 0.035,
  evadeDistance: 130,
  evadeDuration: 2.2,
  evadeOnHit: true,
  reactionTime: 0.15,
  aimError: 0.012,
  aggressiveness: 0.65,
  maneuverability: 0.85,
  retreatHull: 0.25,
};
export const ENCOUNTER_CONFIG = { enemies: 5, maximumEnemies: 10, asteroids: 8 } as const;

export const WEAPON_CHOICES = [
  { slot: 1, label: 'Gun' },
  { slot: 2, label: 'Missiles' },
  { slot: 3, label: 'Railgun' },
  { slot: 4, label: 'Flak scattergun' },
] as const;
